// Bir stüdyoya yönetici hesabı açar; stüdyo yoksa önce stüdyoyu oluşturur. Kayıt ekranı olmadığı (BR-18) ve
// hesapları yönetici açtığı için "ilk yöneticiyi kim açacak?" sorusunun cevabı bu script.
//
// Kullanım: npm run create-admin -- <slug> "Ad Soyad" "0532 123 45 67" ["Stüdyo Adı"]
//   slug: stüdyonun adresi (ornek -> ornek.BASE_DOMAIN). Bu slug'la stüdyo varsa yönetici ona eklenir,
//   yoksa stüdyo ayarlarıyla birlikte oluşturulur (Stüdyo Adı yalnızca o durumda kullanılır).
//
// Şifreyi komut satırından almıyoruz (terminal geçmişinde kalırdı). Script rastgele bir geçici şifre
// üretip ekrana yazar; yönetici ilk girişte kendi şifresini belirlemek zorundadır.
import { randomBytes } from 'node:crypto';
import pool from '../db/pool.js';
import { createUser } from '../services/auth.js';
import { slugProblem } from '../slug.js';

const USAGE = 'Kullanım: npm run create-admin -- <slug> "Ad Soyad" "0532 123 45 67" ["Stüdyo Adı"]';
const [slug, fullName, phone, studioName = 'Stüdyo'] = process.argv.slice(2);

if (!slug || !fullName || !phone) {
  console.error(USAGE);
  process.exit(1);
}
// Veritabanından önce: ham "violates check constraint" hatası yerine kuralı anlatan bir mesaj.
const problem = slugProblem(slug);
if (problem) {
  console.error(problem);
  console.error(USAGE);
  process.exit(1);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');

  let { rows: [studio] } = await client.query('SELECT id, name FROM studios WHERE slug = $1', [slug]);
  if (studio) {
    console.log(`Mevcut stüdyoya ekleniyor: ${studio.name}`);
  } else {
    ({ rows: [studio] } = await client.query(
      'INSERT INTO studios (name, slug) VALUES ($1, $2) RETURNING id, name',
      [studioName, slug],
    ));
    // Ayarların hepsi varsayılan değerleriyle başlar; yönetici sonra panelden değiştirir.
    await client.query('INSERT INTO studio_settings (studio_id) VALUES ($1)', [studio.id]);
    console.log(`Stüdyo oluşturuldu: ${studio.name}`);
  }

  // base64url: harf, rakam, - ve _; 12 bayt -> 16 karakter.
  const temporaryPassword = randomBytes(12).toString('base64url');
  await createUser(
    { studioId: studio.id, role: 'admin', fullName, phone, temporaryPassword },
    { db: client },
  );
  await client.query('COMMIT');

  console.log(`Yönetici oluşturuldu: ${fullName}`);
  console.log(`Adres: ${slug}.${process.env.BASE_DOMAIN || '<BASE_DOMAIN>'}`);
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
