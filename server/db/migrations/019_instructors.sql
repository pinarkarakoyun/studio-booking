-- Eğitmen rolü: yöneticinin eklediği, şubelere atanan ve yetkileri tek tek seçilen hesap.
-- Ek ders için gruplara "tür" ve derslere "o günkü eğitmen" sütunları.
-- Tasarım: docs/superpowers/specs/2026-11-24-instructor-role-design.md

-- ---------------------------------------------------------------------------
-- 1) Rol
-- ---------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'instructor', 'customer'));

-- Aşağıdaki birleşik yabancı anahtar için: (id, studio_id) çifti benzersiz olmalı (14'teki şubelerle aynı yol).
ALTER TABLE users ADD CONSTRAINT users_id_studio_unique UNIQUE (id, studio_id);

-- ---------------------------------------------------------------------------
-- 2) Eğitmenin şubeleri
-- ---------------------------------------------------------------------------
-- studio_id iki yabancı anahtarı birbirine bağlar: kullanıcı da şube de AYNI stüdyoda olmak zorunda.
-- Rolün 'instructor' olması servis katmanında denetlenir (CHECK başka tabloya bakamaz).
CREATE TABLE instructor_branches (
  user_id   bigint NOT NULL,
  branch_id bigint NOT NULL,
  studio_id bigint NOT NULL,
  PRIMARY KEY (user_id, branch_id),
  CONSTRAINT instructor_branches_user_same_studio
    FOREIGN KEY (user_id, studio_id) REFERENCES users (id, studio_id),
  CONSTRAINT instructor_branches_branch_same_studio
    FOREIGN KEY (branch_id, studio_id) REFERENCES branches (id, studio_id)
);

CREATE INDEX instructor_branches_branch_idx ON instructor_branches (branch_id);

-- ---------------------------------------------------------------------------
-- 3) Yetkiler: eğitmen başına bir satır, her yetki ayrı sütun (studio_settings gibi tipli sütunlar).
-- ---------------------------------------------------------------------------
CREATE TABLE instructor_permissions (
  user_id               bigint PRIMARY KEY REFERENCES users (id),
  -- Dersler
  attendance            boolean NOT NULL DEFAULT true,
  cancel_own_sessions   boolean NOT NULL DEFAULT true,
  create_extra_sessions boolean NOT NULL DEFAULT true,
  manage_attendees      boolean NOT NULL DEFAULT false,
  -- Üyeler (eğitmenin şubelerindeki)
  view_customers        boolean NOT NULL DEFAULT false,
  edit_customers        boolean NOT NULL DEFAULT false,
  customer_status       boolean NOT NULL DEFAULT false,
  memberships           boolean NOT NULL DEFAULT false,
  -- Gruplar
  manage_groups         boolean NOT NULL DEFAULT false,

  -- Üyeleri görmeyen eğitmen onları düzenleyemez. Sütunlar NOT NULL olduğu için NULL tuzağı yok.
  CONSTRAINT instructor_permissions_customer_dependency
    CHECK (view_customers OR NOT (edit_customers OR customer_status OR memberships))
);

-- ---------------------------------------------------------------------------
-- 4) Grubun eğitmeni ve türü; dersin o günkü eğitmeni
-- ---------------------------------------------------------------------------
-- Boş = atanmamış. Dersin eğitmeni = COALESCE(sessions.instructor_id, groups.instructor_id).
ALTER TABLE groups ADD COLUMN instructor_id bigint REFERENCES users (id);

-- 'extra' = tek seferlik ek ders: haftalık günü ve üyesi olmayan, grup listelerinde görünmeyen grup.
ALTER TABLE groups ADD COLUMN kind text NOT NULL DEFAULT 'regular'
  CONSTRAINT groups_kind_check CHECK (kind IN ('regular', 'extra'));

-- Yerine derse giren eğitmen ("Bu dersi ben veriyorum"). Boşsa grubun eğitmeni geçerli.
ALTER TABLE sessions ADD COLUMN instructor_id bigint REFERENCES users (id);
