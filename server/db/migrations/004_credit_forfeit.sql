-- Telafi iptal edilince hakkın ne olacağına stüdyo karar verir
-- (studio_settings.refund_credit_on_makeup_cancel). Ayar kapalıysa hak "yanar":
-- yer açılır ama kredi bir daha kullanılamaz. Bunu tutmak için bir zaman damgası ekliyoruz.

ALTER TABLE credits ADD COLUMN forfeited_at timestamptz;

-- Yanmış bir kredi aynı anda bir derste kullanılıyor olamaz.
ALTER TABLE credits ADD CONSTRAINT credits_forfeited_not_used
  CHECK (forfeited_at IS NULL OR used_session_id IS NULL);
