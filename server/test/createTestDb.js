// Testler geliştirme verisine dokunmasın diye ayrı bir veritabanında çalışır (DB_NAME=..._test).
// Bu script o veritabanı yoksa oluşturur; tabloları ardından migrate.js kurar.
import 'dotenv/config';
import pg from 'pg';

const dbName = process.env.DB_NAME;
if (!dbName?.endsWith('_test')) {
  // Yanlışlıkla geliştirme veritabanını test verisiyle silmemek için emniyet kemeri.
  throw new Error(`Refusing to use "${dbName}" as a test database (name must end with _test).`);
}

// CREATE DATABASE, o veritabanının içindeyken çalıştırılamaz; varsayılan "postgres" veritabanına bağlanıyoruz.
const client = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
});

await client.connect();
try {
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rowCount === 0) {
    // Veritabanı adları parametre ($1) olarak verilemez; adı yukarıda kendimiz kontrol ettik.
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database ${dbName}`);
  }
} finally {
  await client.end();
}
