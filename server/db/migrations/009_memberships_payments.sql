-- Ödeme takibi (BR-31…BR-37). Sistem para almaz; yönetici elden / havaleyle aldığı ödemeleri kaydeder.

-- Üyelik dönemi: süreye göre (1 ay, 3 ay…). ends_on dondurmasız bitiş; dondurulan günler kadar uzama
-- (BR-36) saklanmaz, freezes tablosundan hesaplanır (bilgi tek yerde).
CREATE TABLE memberships (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users (id),
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  -- Para kuruş cinsinden tamsayı: ondalıklı sayılarda yuvarlama hatası olmaz (0.1 + 0.2 ≠ 0.3).
  fee_kurus  bigint NOT NULL CHECK (fee_kurus >= 0),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_valid_range CHECK (ends_on >= starts_on),
  -- Aynı müşterinin iki dönemi çakışamaz (BR-33).
  CONSTRAINT memberships_no_overlap
    EXCLUDE USING gist (user_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&)
);

-- Bir döneme birden fazla ödeme girilebilir: taksit / kısmi ödeme (BR-34).
-- "Ödendi / eksik" durumu saklanmaz, ödemelerin toplamı ile ücret karşılaştırılarak hesaplanır.
CREATE TABLE payments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  membership_id bigint NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
  amount_kurus  bigint NOT NULL CHECK (amount_kurus > 0),
  paid_on       date NOT NULL,
  method        text NOT NULL CHECK (method IN ('cash', 'transfer', 'card')),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_membership_idx ON payments (membership_id);

-- Bitişe kaç gün kala "yaklaşıyor" listesine girer.
ALTER TABLE studio_settings
  ADD COLUMN payment_reminder_days integer NOT NULL DEFAULT 7
    CONSTRAINT studio_settings_payment_reminder_range CHECK (payment_reminder_days BETWEEN 0 AND 60);
