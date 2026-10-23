// .env, pool.js yüklenmeden önce okunmalı (index.js'teki gibi).
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from './pool.js';

// ES modüllerde __dirname yok; dosyanın kendi konumundan hesaplıyoruz.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../../db/migrations');

async function migrate() {
  // Pool'dan tek bir bağlantı alıyoruz: transaction'ın tüm sorguları aynı bağlantıda çalışmalı.
  const client = await pool.connect();
  try {
    // Hangi dosyaların uygulandığını veritabanının kendisinde tutuyoruz.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.filename));

    // Dosya adları 001_, 002_ diye başladığı için alfabetik sıra = uygulama sırası.
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      // Her dosya kendi transaction'ında: yarıda hata olursa hiçbir değişiklik kalmaz.
      // (PostgreSQL'de CREATE TABLE gibi DDL komutları da transaction içinde geri alınabilir.)
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
    }

    console.log('Migrations up to date.');
  } finally {
    client.release();
    // Script bitince açık bağlantılar kapanmazsa Node süreci sonlanmaz.
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
