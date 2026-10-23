-- Stüdyodan stüdyoya değişen rezervasyon kuralları yönetici ayarı oluyor.
-- Varsayılanlar bugüne kadarki davranışla aynı; mevcut stüdyolar için hiçbir şey değişmez.

ALTER TABLE studio_settings
  -- Müşteri iptal ettiği derse "gelebiliyorum" diyerek geri dönebilir mi? (BR-28)
  ADD COLUMN allow_undo_cancel boolean NOT NULL DEFAULT true,
  -- Telafi, kaçırılan dersten ÖNCEKİ bir derse yapılabilir mi? (BR-26, Cuma -> Cumartesi örneği)
  -- false ise telafi dersi kaçırılan dersten sonra olmalı.
  ADD COLUMN allow_makeup_before_missed boolean NOT NULL DEFAULT true,
  -- Derse kaç dakika kalana kadar telafi alınabilir (0 = ders başlayana kadar).
  ADD COLUMN makeup_booking_cutoff_minutes integer NOT NULL DEFAULT 0
    CONSTRAINT studio_settings_makeup_cutoff_non_negative CHECK (makeup_booking_cutoff_minutes >= 0);
