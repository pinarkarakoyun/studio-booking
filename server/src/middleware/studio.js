import pool from '../db/pool.js';
import { AppError } from '../errors.js';
// Slug biçimi burada da denetlenir ki "a.b" gibi çok seviyeli ya da geçersiz bir etiket veritabanına hiç sorulmasın.
import { SLUG_PATTERN } from '../slug.js';

// İsteğin adresini (hostname) sınıflandırır. baseDomain: ürünün ana alan adı (ör. "siteadi.com").
//   siteadi.com, www.siteadi.com -> { kind: 'root' }               (ürün sayfası)
//   ornek.siteadi.com           -> { kind: 'studio', slug: 'ornek' } (stüdyo; kayıtlı mı, ona resolveStudio bakar)
//   diğer her şey               -> { kind: 'unknown' }              (IP, başka alan adı, a.b.siteadi.com...)
// Alan adları büyük/küçük harf duyarsızdır; karşılaştırma küçük harfle yapılır.
export function classifyHost(hostname, baseDomain) {
  const host = String(hostname ?? '').toLowerCase();
  const base = String(baseDomain ?? '').toLowerCase();
  if (!host || !base) return { kind: 'unknown' };
  if (host === base || host === `www.${base}`) return { kind: 'root' };

  const suffix = `.${base}`;
  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length);
    if (SLUG_PATTERN.test(label)) return { kind: 'studio', slug: label };
  }
  return { kind: 'unknown' };
}

// Host başlığından (ör. "ornek.siteadi.com:5173") alan adını çıkarır: port atılır. IPv6 adresi köşeli parantez
// içinde gelir ("[::1]:3000"); parantezdeki iki noktalar port sanılmasın diye ayrı ele alınır.
export function hostnameFromHeader(value) {
  const host = String(value ?? '');
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  const colon = host.indexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

// Her isteğin başında çalışır; kimseyi engellemez, sadece req.hostKind ve req.studio'yu doldurur.
// Engellemeyi requireStudio yapar. Slug kayıtlı değilse adres "bilinmeyen" sayılır.
// Adres her zaman Host başlığından okunur, req.hostname'den değil: proxy'ye güvenildiğinde (TRUST_PROXY)
// Express X-Forwarded-Host'u tercih eder ve bazı proxy'ler (ör. Nginx) bu başlığı istemciden olduğu gibi geçirir.
// Host'u ise proxy kendi denetler; önündeki proxy özgün Host'u korumalıdır (Caddy varsayılan, Nginx: proxy_set_header Host $host).
export async function resolveStudio(req, res, next) {
  const host = classifyHost(hostnameFromHeader(req.get('host')), process.env.BASE_DOMAIN);
  req.hostKind = host.kind;
  req.studio = null;

  if (host.kind === 'studio') {
    const { rows: [studio] } = await pool.query('SELECT id, slug FROM studios WHERE slug = $1', [host.slug]);
    if (studio) req.studio = studio;
    else req.hostKind = 'unknown';
  }
  next();
}

// Stüdyo gerektiren uçlar için: stüdyo yoksa (kök ya da bilinmeyen adres) 404.
// Bu sayede hiçbir sorgu "ilk stüdyo" gibi bir varsayıma düşmez.
export function requireStudio(req, res, next) {
  if (!req.studio) {
    throw new AppError('STUDIO_NOT_FOUND', 'Stüdyo bulunamadı.', 404);
  }
  next();
}
