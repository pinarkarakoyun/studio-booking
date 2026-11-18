// Stüdyo adresi (slug) kuralları: tek kaynak. Aynı kurallar veritabanında da CHECK kısıtı olarak var
// (migration 013: studios_slug_format, studios_slug_not_reserved); ikisi değişirse birlikte değişmeli.

// Küçük harf, rakam ve tire; 3-63 karakter (alan adı etiketi sınırı); tireyle başlayıp bitemez.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

// Ürünün kendi adresleri: hiçbir stüdyoya verilemez (www.siteadi.com, api.siteadi.com...).
export const RESERVED_SLUGS = ['www', 'api', 'admin', 'app', 'mail', 'static', 'assets'];

// Slug geçerliyse null, değilse kullanıcıya gösterilecek Türkçe açıklama.
export function slugProblem(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    return 'Stüdyo adresi küçük harf, rakam ve tireden oluşmalı; 3-63 karakter olmalı ve tireyle başlayıp bitmemeli (ör. ornek-pilates).';
  }
  if (RESERVED_SLUGS.includes(slug)) {
    return `"${slug}" ayrılmış bir ad, stüdyo adresi olarak kullanılamaz.`;
  }
  return null;
}
