-- Görünüm ayarı: stüdyonun ana rengi (brand_color, migration 002'den beri var) ve vurgu rengi. İkisinden bütün
-- tema tonları türetilir ve /brand/theme.css olarak sunulur (server/src/theme/palette.js). NULL = varsayılan.
ALTER TABLE studios
  ADD COLUMN accent_color text
    CONSTRAINT studios_accent_color_hex CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$');

-- brand_color bugüne kadar hiçbir ekranda kullanılmadı, ama demo betiği bazı stüdyolara değer yazmış olabilir.
-- Sıfırlanmazsa bu stüdyolar yeni tema yayına girdiği anda sessizce başka renge geçer. Değer hiç görünmediği için
-- sıfırlamak görünür hiçbir şeyi kaybettirmez (spec: 2026-11-24-appearance-settings-design.md, 5.1).
UPDATE studios SET brand_color = NULL;
