-- Seans paketleri: stüdyo kurulurken iki üyelik modelinden biri seçilir.
--   group:   grup + telafi (bugüne kadarki tek model)
--   package: üye "12 seanslık paket" gibi bir paket alır; gelinen (ya da hakkı yanan) her ders paketten düşer.
-- Tasarım: docs/superpowers/specs/2026-11-20-session-packages-design.md

-- ---------------------------------------------------------------------------
-- 1) Stüdyo ayarları
-- ---------------------------------------------------------------------------
-- Model kurulumda seçilir, yönetici panelden değiştiremez. Mevcut bütün stüdyolar "group" olur.
ALTER TABLE studio_settings
  ADD COLUMN membership_model text NOT NULL DEFAULT 'group'
    CONSTRAINT studio_settings_membership_model CHECK (membership_model IN ('group', 'package')),
  -- Paket modelinde: iptal süresi geçtikten sonra iptal edilen seans paketten düşsün mü?
  ADD COLUMN late_cancel_burns_session boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2) packages: stüdyonun sattığı paketler (katalog)
-- ---------------------------------------------------------------------------
CREATE TABLE packages (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  studio_id     bigint NOT NULL REFERENCES studios (id),
  name          text NOT NULL
    CONSTRAINT packages_name_length CHECK (char_length(name) BETWEEN 2 AND 60),
  session_count integer NOT NULL
    CONSTRAINT packages_session_count_range CHECK (session_count BETWEEN 1 AND 200),
  -- Para kuruş cinsinden tamsayı (009'daki ücretlerle aynı).
  price_kurus   bigint NOT NULL
    CONSTRAINT packages_price_non_negative CHECK (price_kurus >= 0),
  validity_days integer NOT NULL
    CONSTRAINT packages_validity_days_range CHECK (validity_days BETWEEN 1 AND 365),
  -- Paket silinmez, kapatılır: kapalı paket yeni satışta görünmez. Satılmış paketin adı ve seans sayısı
  -- döneme kopyalandığı için katalogdaki değişiklik eski satışları etkilemez.
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX packages_studio_idx ON packages (studio_id);

-- ---------------------------------------------------------------------------
-- 3) memberships: bir dönem paket de olabilir
-- ---------------------------------------------------------------------------
-- session_count doluysa bu dönem bir pakettir; ends_on paketin geçerlilik bitişidir.
-- Çakışma kuralı (memberships_no_overlap) paketlerde de geçerli: bir üyenin aynı anda tek paketi olur.
ALTER TABLE memberships
  ADD COLUMN session_count integer
    CONSTRAINT memberships_session_count_positive CHECK (session_count > 0),
  -- Satış anındaki paket adı (kopya).
  ADD COLUMN package_name text;

-- ---------------------------------------------------------------------------
-- 4) attendance: yoklama. Yalnızca "gelmedi" işaretleri saklanır; satır yoksa üye "geldi" sayılır.
-- ---------------------------------------------------------------------------
CREATE TABLE attendance (
  -- Ders kaldırılırsa (adminGroups.removeSession) yoklaması da gider: olmayan dersin yoklaması anlamsız.
  session_id bigint NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  user_id    bigint NOT NULL REFERENCES users (id),
  marked_at  timestamptz NOT NULL DEFAULT now(),
  -- İşareti koyan yönetici.
  marked_by  bigint NOT NULL REFERENCES users (id),
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX attendance_user_idx ON attendance (user_id);
