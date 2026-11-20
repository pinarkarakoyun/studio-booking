-- Şubeler: bir stüdyonun birden çok şubesi olabilir, her grup bir şubeye aittir.
-- Bir dersin şubesi her zaman grubundan okunur (derslere ayrıca şube yazılmaz).
-- Tasarım: docs/superpowers/specs/2026-11-19-branches-design.md

-- ---------------------------------------------------------------------------
-- 1) branches
-- ---------------------------------------------------------------------------
CREATE TABLE branches (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  studio_id  bigint NOT NULL REFERENCES studios (id),
  name       text NOT NULL
    CONSTRAINT branches_name_length CHECK (char_length(name) BETWEEN 2 AND 60),
  -- Sitede "Bize ulaş" bölümünde gösterilir; boşsa site.json'daki adrese dönülür.
  address    text
    CONSTRAINT branches_address_length CHECK (char_length(address) <= 300),
  -- Yalnızca https bağlantısı: "javascript:" gibi değerler sitede bağlantı olarak hiç gösterilemesin.
  maps_url   text
    CONSTRAINT branches_maps_url_https CHECK (maps_url ~ '^https://'),
  -- Şube silinmez, kapatılır: geçmiş derslerin şubesi kaybolmasın.
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Aşağıdaki birleşik yabancı anahtar için gerekli: (id, studio_id) çifti benzersiz olmalı.
  CONSTRAINT branches_id_studio_unique UNIQUE (id, studio_id)
);

-- Aynı stüdyoda aynı ad iki kez olamaz ("Merkez" ile "merkez" aynı sayılır; kapalı şubeler dahil).
CREATE UNIQUE INDEX branches_studio_name_unique ON branches (studio_id, lower(name));

-- Her mevcut stüdyoya bir şube: tek şubeli stüdyoda arayüzde görünmez.
INSERT INTO branches (studio_id, name) SELECT id, 'Merkez' FROM studios;

-- ---------------------------------------------------------------------------
-- 2) groups.branch_id: önce boş ekle, doldur, sonra zorunlu yap (013'teki slug ile aynı sıra).
-- ---------------------------------------------------------------------------
ALTER TABLE groups ADD COLUMN branch_id bigint;

UPDATE groups g SET branch_id = b.id FROM branches b WHERE b.studio_id = g.studio_id;

ALTER TABLE groups ALTER COLUMN branch_id SET NOT NULL;

-- Birleşik yabancı anahtar: (branch_id, studio_id) çifti branches'ta olmalı. Böylece bir grup başka bir
-- stüdyonun şubesine bağlanamaz; uygulama kodu ya da elle yazılan SQL bu kuralı aşamaz.
ALTER TABLE groups ADD CONSTRAINT groups_branch_same_studio
  FOREIGN KEY (branch_id, studio_id) REFERENCES branches (id, studio_id);

CREATE INDEX groups_branch_idx ON groups (branch_id);

-- ---------------------------------------------------------------------------
-- 3) Telafide diğer şubeler: açık = bugünkü davranış (bütün dersler listelenir).
-- ---------------------------------------------------------------------------
ALTER TABLE studio_settings ADD COLUMN makeup_other_branches boolean NOT NULL DEFAULT true;
