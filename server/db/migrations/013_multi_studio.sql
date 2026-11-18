-- Çoklu stüdyo temeli: her stüdyonun bir adresi (slug) olur ve hesaplar stüdyoya göre ayrılır.
-- Tasarım: docs/superpowers/specs/2026-11-06-multi-studio-foundation-design.md

-- ---------------------------------------------------------------------------
-- 1) studios.slug: stüdyonun alt alan adı (ornek.siteadi.com -> "ornek").
-- ---------------------------------------------------------------------------
-- Önce boş olabilir ekliyoruz: mevcut satırlar var, NOT NULL hemen eklenirse migration hata verir.
ALTER TABLE studios ADD COLUMN slug text;

-- Mevcut stüdyolara geçici bir adres: "studio-1" gibi. Gerçek adres sonradan elle verilir.
UPDATE studios SET slug = 'studio-' || id;

ALTER TABLE studios ALTER COLUMN slug SET NOT NULL;
ALTER TABLE studios ADD CONSTRAINT studios_slug_unique UNIQUE (slug);

-- Biçim ve ayrılmış adlar veritabanında da denetlenir: uygulama kodu, komut satırı aracı ya da elle
-- yazılan SQL bu kuralları aşamaz. Slug ileride klasör yolunda (BRAND_DIR/<slug>/) da kullanılacak;
-- bu kısıt sayesinde ".." ya da "/" gibi karakterler hiçbir zaman içeri giremez.
-- İki ayrı kısıt: hata mesajındaki kısıt adı hangi kuralın bozulduğunu söyler.
-- Biçim: küçük harf, rakam ve tire; 3-63 karakter (DNS etiketi sınırı); tireyle başlayıp bitemez.
-- Regex başta ve sonda bir karakter ister, ortadaki {1,61} ile toplam 3-63 olur.
ALTER TABLE studios ADD CONSTRAINT studios_slug_format
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$');

-- Ayrılmış adlar: ürünün kendi adresleri (www.siteadi.com, api.siteadi.com...) bir stüdyoya verilemez.
ALTER TABLE studios ADD CONSTRAINT studios_slug_not_reserved
  CHECK (slug NOT IN ('www', 'api', 'admin', 'app', 'mail', 'static', 'assets'));


-- ---------------------------------------------------------------------------
-- 2) Hesaplar stüdyoya göre ayrılır: aynı telefon/e-posta iki stüdyoda ayrı hesap olabilir.
-- ---------------------------------------------------------------------------
-- Telefon artık "stüdyo içinde" benzersiz. createUser'daki ON CONFLICT (studio_id, phone) bu kısıta dayanır.
ALTER TABLE users DROP CONSTRAINT users_phone_unique;
ALTER TABLE users ADD CONSTRAINT users_studio_phone_unique UNIQUE (studio_id, phone);

-- E-posta da stüdyo içinde benzersiz, büyük/küçük harf duyarsız. lower(email) bir ifade olduğu için
-- kısıt (CONSTRAINT) değil benzersiz index kullanılır. NULL e-postalar yine birbirine çakışmaz.
DROP INDEX users_email_unique;
CREATE UNIQUE INDEX users_studio_email_unique ON users (studio_id, lower(email));
