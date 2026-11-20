// Bir stüdyoya yönetici hesabı açar; stüdyo yoksa önce stüdyoyu oluşturur. Kayıt ekranı olmadığı (BR-18) ve
// hesapları yönetici açtığı için "ilk yöneticiyi kim açacak?" sorusunun cevabı bu script.
//
// Kullanım: npm run create-admin -- <slug> "Ad Soyad" "0532 123 45 67" ["Stüdyo Adı"] [--model paket]
//   --model paket: yeni stüdyo seans paketi modeliyle açılır (verilmezse grup + telafi). Model sonradan
//   panelden değiştirilemez; mevcut bir stüdyoya yönetici eklerken bu seçenek yok sayılır.
//   slug: stüdyonun adresi (ornek -> ornek.BASE_DOMAIN). Bu slug'la stüdyo varsa yönetici ona eklenir,
//   yoksa stüdyo ayarlarıyla birlikte oluşturulur (Stüdyo Adı yalnızca o durumda kullanılır).
//
// Şifreyi komut satırından almıyoruz (terminal geçmişinde kalırdı). Script rastgele bir geçici şifre
// üretip ekrana yazar; yönetici ilk girişte kendi şifresini belirlemek zorundadır.
import { randomBytes } from 'node:crypto';
import pool from '../db/pool.js';
import { openFirstBranch } from '../services/adminBranches.js';
import { createUser } from '../services/auth.js';
import { slugProblem } from '../slug.js';
import { studioPrivacyProblem } from '../startupChecks.js';

const USAGE = 'Kullanım: npm run create-admin -- <slug> "Ad Soyad" "0532 123 45 67" ["Stüdyo Adı"] [--model paket]';
const MODELS = { grup: 'group', paket: 'package' };

// "--model X" çiftini ayıklar, geri kalanlar sırayla slug, ad, telefon, stüdyo adı olur.
const args = process.argv.slice(2);
const modelIndex = args.indexOf('--model');
const modelArg = modelIndex === -1 ? 'grup' : args[modelIndex + 1];
if (modelIndex !== -1) args.splice(modelIndex, 2);
const membershipModel = MODELS[modelArg];
const [slug, fullName, phone, studioName = 'Stüdyo'] = args;

if (!membershipModel) {
  console.error('--model yalnızca "grup" ya da "paket" olabilir.');
  console.error(USAGE);
  process.exit(1);
}
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
    if (modelIndex !== -1) console.log('Not: --model yok sayıldı; mevcut stüdyonun üyelik modeli değişmez.');
  } else {
    ({ rows: [studio] } = await client.query(
      'INSERT INTO studios (name, slug) VALUES ($1, $2) RETURNING id, name',
      [studioName, slug],
    ));
    // Ayarların hepsi varsayılan değerleriyle başlar; yönetici sonra panelden değiştirir.
    await client.query(
      'INSERT INTO studio_settings (studio_id, membership_model) VALUES ($1, $2)',
      [studio.id, membershipModel],
    );
    // Her stüdyo bir şubeyle açılır; yönetici sonra panelden yeni şube ekleyebilir.
    await openFirstBranch(studio.id, client);
    console.log(`Stüdyo oluşturuldu: ${studio.name} (${membershipModel === 'package' ? 'seans paketi' : 'grup + telafi'})`);
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

  // KVKK: açılış kontrolü yalnızca sunucu başlarken çalışır. Sunucu açıkken açılan stüdyo, aydınlatma metni
  // olmadan bir sonraki yeniden başlatmaya kadar yayında kalmasın diye burada hemen uyarıyoruz.
  const privacy = await studioPrivacyProblem(slug, process.env.BRAND_DIR);
  if (privacy) {
    console.warn(`\nUyarı: ${privacy}`);
    console.warn('Üretimde sunucu bu metin olmadan yeniden açılmaz; stüdyonun sitesini yayına almadan önce ekle.');
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error(err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
