-- Üye Derslerim'de kendi ödeme bilgisini (dönem ücreti, ödenen, kalan, ödemeleri) görsün mü?
-- Varsayılan kapalı: mevcut davranış (sadece bitiş tarihi) korunur; stüdyo isterse açar (25 Ekim 2026 kararı).
ALTER TABLE studio_settings ADD COLUMN show_payments_to_customers boolean NOT NULL DEFAULT false;
