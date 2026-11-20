-- Paket modelinde bir iptalin seans düşürüp düşürmediği iptal anında karar verilir ve burada saklanır.
-- Böylece yönetici sonradan "Geç iptalde seans yansın" ayarını ya da son iptal saatini değiştirirse geçmiş
-- iptaller yeniden hesaplanmaz.
--   true:  geç iptal ve ayar açıktı -> ders paketten düşer
--   false: zamanında iptal ya da geç iptal ama ayar kapalıydı -> düşmez
--   NULL:  paket iptali değil (grup modeli, stüdyo iptali, elle verilen hak)
ALTER TABLE credits ADD COLUMN charges_session boolean;
