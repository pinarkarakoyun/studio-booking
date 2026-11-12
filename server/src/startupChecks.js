import { existsSync } from 'node:fs';
import path from 'node:path';
import { privacyNotice, readSiteFile } from './routes/studio.js';

// Sunucu açılmadan önce yapılandırmayı kontrol eder. Üretimde güvensiz bir ayar varsa sunucu hiç açılmaz:
// "unutulan bir ayar yüzünden müşteri verisi açıkta kaldı" yerine "sunucu açılmadı, sebebi şu" olsun.
// problems: sunucu açılmaz. warnings: açılır ama konsola yazılır.
export async function checkStartup({ env = process.env, db }) {
  const problems = [];
  const warnings = [];
  const mode = env.NODE_ENV;

  // Ortamı açıkça seçmek zorunlu. Boş bırakılınca geliştirme sanılırdı; o zaman oturum cookie'si
  // "Secure" olmadan, yani HTTP üzerinden de gönderilirdi.
  if (mode !== 'development' && mode !== 'production') {
    problems.push('NODE_ENV "development" ya da "production" olmalı (şu an: ' + (mode ? `"${mode}"` : 'boş') + ').');
    return { problems, warnings };
  }

  const { rows: [role] } = await db.query(
    'SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user',
  );
  const tooPowerful = role.rolsuper || role.rolcreatedb || role.rolcreaterole;

  if (mode === 'development') {
    if (tooPowerful) warnings.push('Veritabanına geniş yetkili bir rolle bağlanılıyor (geliştirmede sorun değil, üretimde açılmaz).');
    return { problems, warnings };
  }

  // --- Üretim ---
  if (tooPowerful) {
    problems.push(
      'Uygulama veritabanına süper kullanıcı (veya rol/veritabanı oluşturabilen) bir rolle bağlanıyor. '
        + 'En az yetkili rolü db/roles/app-role.sql ile oluşturup DB_USER olarak onu kullan.',
    );
  }
  if (env.BCRYPT_COST && !(Number(env.BCRYPT_COST) >= 12)) {
    problems.push('BCRYPT_COST en az 12 olmalı (ya da boş bırak). Düşük değer sadece testler içindir.');
  }
  if (!env.TRUST_PROXY) {
    problems.push(
      'TRUST_PROXY ayarlı değil. Uygulama HTTPS sağlayan bir proxy (Caddy/Nginx) arkasında çalışmalı; '
        + 'proxy aynı makinedeyse TRUST_PROXY=loopback yaz. Yoksa IP sınırları herkesi tek kişi sanar.',
    );
  }
  if (!env.CLIENT_DIR || !existsSync(path.join(path.resolve(env.CLIENT_DIR), 'index.html'))) {
    problems.push('CLIENT_DIR derlenmiş istemci klasörünü göstermeli (ör. ../client/dist; önce "npm run build").');
  }
  if (env.ALLOW_DEMO_SEED) {
    problems.push('ALLOW_DEMO_SEED üretimde tanımlı olmamalı.');
  }
  // KVKK: kişisel veri toplayan bir sistem aydınlatma metni olmadan yayına girmesin.
  if (!privacyNotice((await readSiteFile(env.BRAND_DIR)).privacyNotice)) {
    problems.push(
      'KVKK aydınlatma metni yok: BRAND_DIR/site.json içine "privacyNotice" ekle (şablon: server/site.example.json; '
        + 'metni bir hukukçuya onaylat).',
    );
  }
  return { problems, warnings };
}
