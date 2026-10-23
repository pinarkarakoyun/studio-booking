-- 001'de iş kurallarıyla çelişen noktaları düzeltir (bkz. BR-11, BR-13, BR-19, BR-20, ayarlar 2.6).
-- 001 zaten uygulandığı için onu değiştirmiyoruz; farkları bu dosya ALTER ile ekliyor.

-- ---------------------------------------------------------------------------
-- 1) Giriş telefon + şifre ile (BR-19). E-posta artık isteğe bağlı.
-- ---------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
-- users_email_unique index'i kalıyor: NULL'lar birbirinden farklı sayıldığı için
-- e-postası olmayan birden fazla müşteri sorun çıkarmaz, olanlar yine benzersiz kalır.

ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
-- Telefon tek bir biçimde saklanır (uluslararası E.164: +905321234567).
-- "0532 123 45 67" ile "+90 532 123 4567" aynı kişi; biçimi uygulama normalleştirir,
-- veritabanı da normalleşmemiş bir değerin içeri girmesini engeller.
ALTER TABLE users ADD CONSTRAINT users_phone_e164
  CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);

-- ---------------------------------------------------------------------------
-- 2) İlk şifre geçici (BR-20, BR-21).
-- ---------------------------------------------------------------------------
-- Yönetici hesap açtığında veya şifre sıfırladığında true olur; müşteri yeni şifresini
-- belirleyince false yapılır. Varsayılan true: yeni hesap her zaman geçici şifreyle başlar.
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 3) Dondurma tarihli bir dönem (BR-10, BR-11, BR-12, BR-13).
-- ---------------------------------------------------------------------------
-- "Dondurulmuş mu?" artık bir durum değil, tarih sorusu: "Bu tarihte açık bir dondurma var mı?"
-- Bu sayede ileri tarihli dondurma (ör. "önümüzdeki Pazartesi'den itibaren") ve
-- "dondurma dönemindeki derslerden hak doğmaz" kuralı tarihe göre hesaplanabilir.
-- Aynı bilgiyi status = 'frozen' olarak da tutarsak iki kaynak birbirini tutmayabilir;
-- bu yüzden 'frozen' durumunu kaldırıp tek kaynak olarak bu tabloyu kullanıyoruz.
ALTER TABLE users DROP CONSTRAINT users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'left'));

-- Tamsayı / tarih gibi sıradan sütunları EXCLUDE kısıtında "=" ile kullanabilmek için gerekli.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE freezes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users (id),
  starts_on  date NOT NULL,
  -- NULL = bitiş tarihi belirsiz (yönetici elle çözene kadar sürer).
  ends_on    date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT freezes_valid_range
    CHECK (ends_on IS NULL OR ends_on >= starts_on),
  -- Aynı müşterinin iki dondurma dönemi çakışamaz.
  -- daterange(..., '[]') iki ucu da dahil eden aralık; ends_on NULL ise aralık sonsuza uzanır,
  -- böylece "açık" bir dondurma varken ikinci bir dondurma da otomatik olarak engellenir.
  -- UNIQUE bunu yapamaz: o sadece "aynı değer" arar, EXCLUDE ise "çakışan aralık" arar.
  CONSTRAINT freezes_no_overlap
    EXCLUDE USING gist (user_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
);

-- ---------------------------------------------------------------------------
-- 4) Eksik yönetici ayarları (2.6, BR-17).
-- ---------------------------------------------------------------------------
ALTER TABLE studio_settings
  -- Müşteri telafiden vazgeçerse hakkı geri gelsin mi?
  ADD COLUMN refund_credit_on_makeup_cancel boolean NOT NULL DEFAULT true,
  -- Ayda en fazla kaç telafi; NULL = sınır yok (bu ayar isteğe bağlı).
  ADD COLUMN max_makeups_per_month integer
    CONSTRAINT studio_settings_max_makeups_positive CHECK (max_makeups_per_month > 0);

-- Stüdyonun kimliği (görünüm) studios'ta, işleyiş kuralları studio_settings'te.
ALTER TABLE studios
  ADD COLUMN logo_url      text,
  ADD COLUMN brand_color   text
    CONSTRAINT studios_brand_color_hex CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Serbest metin (ör. "Hafta içi 08:00-21:00, Cumartesi 10:00-14:00"); sadece gösterim için.
  ADD COLUMN working_hours text;
