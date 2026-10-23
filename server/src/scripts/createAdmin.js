// İlk yönetici hesabını oluşturur. Kayıt ekranı olmadığı (BR-18) ve hesapları yönetici açtığı için
// "ilk yöneticiyi kim açacak?" sorusunun cevabı bu script.
//
// Kullanım: npm run create-admin -- "Ad Soyad" "0532 123 45 67" ["Stüdyo Adı"]
//
// Şifreyi komut satırından almıyoruz (terminal geçmişinde kalırdı). Script rastgele bir geçici şifre
// üretip ekrana yazar; yönetici ilk girişte kendi şifresini belirlemek zorundadır.
import { randomBytes } from 'node:crypto';
import pool from '../db/pool.js';
import { createUser } from '../services/auth.js';

const [fullName, phone, studioName = 'Stüdyo'] = process.argv.slice(2);
if (!fullName || !phone) {
  console.error('Kullanım: npm run create-admin -- "Ad Soyad" "0532 123 45 67" ["Stüdyo Adı"]');
  process.exit(1);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Şimdilik tek stüdyo: varsa onu kullan, yoksa ayarlarıyla birlikte oluştur.
  let { rows: [studio] } = await client.query('SELECT id FROM studios ORDER BY id LIMIT 1');
  if (!studio) {
    ({ rows: [studio] } = await client.query('INSERT INTO studios (name) VALUES ($1) RETURNING id', [studioName]));
    // Ayarların hepsi varsayılan değerleriyle başlar; yönetici sonra panelden değiştirir.
    await client.query('INSERT INTO studio_settings (studio_id) VALUES ($1)', [studio.id]);
    console.log(`Stüdyo oluşturuldu: ${studioName}`);
  }

  // base64url: harf, rakam, - ve _; 12 bayt -> 16 karakter.
  const temporaryPassword = randomBytes(12).toString('base64url');
  await createUser(
    { studioId: studio.id, role: 'admin', fullName, phone, temporaryPassword },
    { db: client },
  );
  await client.query('COMMIT');

  console.log(`Yönetici oluşturuldu: ${fullName}`);
  console.log(`Geçici şifre: ${temporaryPassword}`);
  console.log('İlk girişte yeni şifre belirlemeniz istenecek.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error(err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
