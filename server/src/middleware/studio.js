import pool from '../db/pool.js';
import { AppError } from '../errors.js';

// Slug biçimi: migration 013'teki studios_slug_format kısıtıyla aynı. Burada da denetlenir ki
// "a.b" gibi çok seviyeli ya da geçersiz bir etiket veritabanına hiç sorulmasın.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

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

// Her isteğin başında çalışır; kimseyi engellemez, sadece req.hostKind ve req.studio'yu doldurur.
// Engellemeyi requireStudio yapar. Slug kayıtlı değilse adres "bilinmeyen" sayılır.
export async function resolveStudio(req, res, next) {
  const host = classifyHost(req.hostname, process.env.BASE_DOMAIN);
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
