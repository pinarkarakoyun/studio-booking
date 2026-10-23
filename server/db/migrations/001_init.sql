-- İlk şema. Kimlikler için "GENERATED ALWAYS AS IDENTITY" kullanıyoruz:
-- SERIAL'ın modern, standart SQL karşılığı; elle id yazılmasını da engeller.
-- Silme yok (soft delete): yabancı anahtarlar varsayılan davranışta (RESTRICT) kalıyor,
-- yani geçmişi olan bir kayıt yanlışlıkla silinemez.

-- Stüdyo: şimdilik tek satır, ama her tablo buna bağlı -> ileride çoklu stüdyo mümkün.
CREATE TABLE studios (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  -- Ders saatleri bu saat dilimine göre yorumlanır (iptal süresi hesabı için önemli).
  timezone   text NOT NULL DEFAULT 'Europe/Istanbul',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- İş kuralları: kod içinde sabit değil, admin tarafından değiştirilebilir.
-- key/value yerine tipli sütunlar: CHECK ile geçersiz değerler veritabanında engellenir.
CREATE TABLE studio_settings (
  studio_id                   bigint PRIMARY KEY REFERENCES studios (id),
  credit_validity_days        integer NOT NULL DEFAULT 30 CHECK (credit_validity_days > 0),
  cancellation_deadline_hours integer NOT NULL DEFAULT 2  CHECK (cancellation_deadline_hours >= 0),
  -- Müşteri en fazla kaç gün sonrasına telafi rezervasyonu yapabilir.
  booking_window_days         integer NOT NULL DEFAULT 14 CHECK (booking_window_days > 0)
);

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  studio_id     bigint NOT NULL REFERENCES studios (id),
  role          text NOT NULL CHECK (role IN ('admin', 'customer')),
  full_name     text NOT NULL,
  email         text NOT NULL,
  phone         text,
  password_hash text NOT NULL,
  -- Soft delete: müşteri silinmez, durumu değişir.
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'left')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- E-posta büyük/küçük harf duyarsız benzersiz: "Ayse@x.com" ile "ayse@x.com" aynı kişi.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- Grup: haftalık şablon (ör. Pzt-Çar-Cum 09:00).
CREATE TABLE groups (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  studio_id        bigint NOT NULL REFERENCES studios (id),
  name             text NOT NULL,
  -- Dersin yerel saati; tarihle birleşip sessions.starts_at olur.
  start_time       time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  capacity         integer NOT NULL CHECK (capacity > 0),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Grubun hangi günlerde toplandığı. ISO numaralandırma: 1 = Pazartesi ... 7 = Pazar
-- (PostgreSQL'de EXTRACT(ISODOW FROM date) ile aynı).
CREATE TABLE group_days (
  group_id bigint   NOT NULL REFERENCES groups (id),
  weekday  smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  PRIMARY KEY (group_id, weekday)
);

-- Üyelik geçmişi: grup değiştiren müşterinin eski kaydı kapanır (left_on), yenisi açılır.
CREATE TABLE group_members (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id  bigint NOT NULL REFERENCES groups (id),
  user_id   bigint NOT NULL REFERENCES users (id),
  joined_on date   NOT NULL DEFAULT current_date,
  left_on   date,
  CHECK (left_on IS NULL OR left_on >= joined_on)
);

-- Bir müşterinin aynı anda yalnızca bir düzenli grubu olabilir.
-- Kısmi (partial) index: benzersizlik sadece açık üyelikler (left_on IS NULL) arasında aranır.
CREATE UNIQUE INDEX group_members_one_active_group
  ON group_members (user_id) WHERE left_on IS NULL;

-- Session: bir grubun belirli bir tarihteki dersi. Önceden üretilir (ileriye dönük pencere).
-- Rezervasyonda bu satır FOR UPDATE ile kilitlenir -> aynı anda son yeri iki kişi alamaz.
CREATE TABLE sessions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id   bigint NOT NULL REFERENCES groups (id),
  date       date NOT NULL,
  -- Mutlak zaman: iptal süresi kontrolü "starts_at - now()" ile yapılır.
  starts_at  timestamptz NOT NULL,
  -- Üretim anında gruptan kopyalanır; tek bir dersin kapasitesi ayrıca değiştirilebilir.
  capacity   integer NOT NULL CHECK (capacity > 0),
  -- Tek bir dersi iptal etmek için (ör. bayram); grup şablonu etkilenmez.
  status     text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Üretim fonksiyonu idempotent olsun diye: ON CONFLICT (group_id, date) DO NOTHING.
  UNIQUE (group_id, date)
);

-- Telafi kredisi. Tek tablo hem iptali hem telafiyi taşır:
--   iptal  -> source_session_id dolu bir kredi oluşur
--   telafi -> used_session_id doldurulur
--   telafiden vazgeçme -> used_session_id tekrar NULL (kredi geri döner)
-- Doluluk = aktif üyeler - (source_session_id = ders) + (used_session_id = ders)
CREATE TABLE credits (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           bigint NOT NULL REFERENCES users (id),
  -- İptal edilen ders; admin elle kredi verdiyse NULL.
  source_session_id bigint REFERENCES sessions (id),
  -- Telafi yapılan ders; kredi henüz kullanılmadıysa NULL.
  used_session_id   bigint REFERENCES sessions (id),
  -- Oluşturulurken ayarlardan hesaplanıp sabitlenir; kural sonradan değişse de etkilenmez.
  expires_at        timestamptz NOT NULL,
  used_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Kredi, iptal edildiği dersin kendisinde kullanılamaz.
  -- Sütunlardan biri NULL ise ifade NULL olur ve CHECK geçer (elle verilen / kullanılmamış kredi).
  CONSTRAINT credits_not_same_session
    CHECK (source_session_id <> used_session_id),
  -- Kullanılan ders ile kullanım zamanı birlikte dolu ya da birlikte boş olmalı.
  CONSTRAINT credits_used_fields_together
    CHECK ((used_session_id IS NULL) = (used_at IS NULL)),
  CONSTRAINT credits_expires_after_created
    CHECK (expires_at > created_at),
  -- Aynı dersi iki kez iptal edip iki kredi alınamaz.
  -- NULL'lar birbirinden farklı sayıldığı için elle verilen krediler bu kısıta takılmaz.
  CONSTRAINT credits_one_per_cancelled_session
    UNIQUE (user_id, source_session_id),
  -- Aynı derse iki krediyle iki kez telafi yazdırılamaz.
  CONSTRAINT credits_one_per_makeup_session
    UNIQUE (user_id, used_session_id)
);

-- Doluluk hesabı için: "bu dersin iptalleri / telafileri".
-- "Bu müşterinin kredileri" için ayrı index gerekmez: yukarıdaki UNIQUE kısıtları
-- (user_id, ...) ile başlayan indexler oluşturur ve user_id sorgularında kullanılır.
CREATE INDEX credits_source_session_idx ON credits (source_session_id);
CREATE INDEX credits_used_session_idx   ON credits (used_session_id);
