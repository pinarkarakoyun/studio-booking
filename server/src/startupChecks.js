import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_HOST, isLoopbackHost, trustProxyError } from './network.js';
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

  // owns_objects: rol tabloların (ya da veritabanının) sahibi mi? Sahip rol süper kullanıcı olmasa da tabloları
  // silebilir (DROP) ve yapısını değiştirebilir. Uygulama bu rolle bağlanırsa en az yetki ilkesi sessizce bozulur:
  // tablolar migration'ları çalıştıran rolündür, uygulamanın rolü yalnızca okuyup yazar (db/roles/app-role.sql).
  const { rows: [role] } = await db.query(
    `
    SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole,
           EXISTS (
             SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relowner = r.oid
           )
           OR EXISTS (
             SELECT 1 FROM pg_database d WHERE d.datname = current_database() AND d.datdba = r.oid
           ) AS owns_objects
    FROM pg_roles r
    WHERE r.rolname = current_user
    `,
  );
  const tooPowerful = role.rolsuper || role.rolcreatedb || role.rolcreaterole;

  if (mode === 'development') {
    if (tooPowerful || role.owns_objects) {
      warnings.push('Veritabanına geniş yetkili ya da tabloların sahibi olan bir rolle bağlanılıyor (geliştirmede sorun değil, üretimde açılmaz).');
    }
    return { problems, warnings };
  }

  // --- Üretim ---
  if (tooPowerful) {
    problems.push(
      'Uygulama veritabanına süper kullanıcı (veya rol/veritabanı oluşturabilen) bir rolle bağlanıyor. '
        + 'En az yetkili rolü db/roles/app-role.sql ile oluşturup DB_USER olarak onu kullan.',
    );
  }
  if (role.owns_objects) {
    problems.push(
      'Uygulama veritabanına tabloların sahibi olan rolle bağlanıyor; bu rol tabloları silebilir. '
        + 'Sahip rol yalnızca migration için (DB_OWNER_USER); uygulama db/roles/app-role.sql ile oluşturulan rolle bağlanmalı.',
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
  } else if (trustProxyError(env.TRUST_PROXY)) {
    problems.push(
      `TRUST_PROXY değeri geçersiz ("${env.TRUST_PROXY}"). "true" ya da "*" herkese güvenmek demek ve IP sınırlarını işe yaramaz yapar; `
        + 'proxy aynı makinedeyse "loopback", değilse proxy\'nin adresini (ör. 10.0.0.5) ya da önündeki proxy sayısını (ör. 1) yaz.',
    );
  } else if (/^\d+$/.test(env.TRUST_PROXY) && !isLoopbackHost(env.HOST || DEFAULT_HOST)) {
    // Sayı "önümdeki ilk bağlantı her kimse proxy'dir" demek. Sunucu tüm ağı dinliyorsa ve port dışarıdan erişilebilirse,
    // biri doğrudan bağlanıp sahte X-Forwarded-For ile her istekte farklı IP'den geliyormuş gibi görünebilir.
    // Platform barındırmasında port dışarıya kapalı olabilir; kod bunu göremez, o yüzden engel değil uyarı.
    warnings.push(
      `TRUST_PROXY=${env.TRUST_PROXY} ve sunucu tüm ağı dinliyor (HOST=${env.HOST}). Port ${env.PORT || 3000} dışarıdan erişilebilirse `
        + 'sahte X-Forwarded-For başlığıyla IP sınırları aşılır. Proxy aynı makinedeyse HOST\'u boş bırak ve TRUST_PROXY=loopback yaz; '
        + 'değilse portun yalnızca proxy\'ye açık olduğundan emin ol.',
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
