-- Doluluk hesabı: "Bu derste kaç kişi var, kaç boş yer kaldı?"
-- Doluluk saklanmaz, her sorguda bu view üzerinden hesaplanır (README: "occupancy is calculated").
-- Müşteri ekranı da rezervasyon kontrolü de aynı formülü kullansın diye tek bir yerde tanımlı.

-- "Bu gruptaki üyeler" sorgusu için (view her ders için grubun üyelerini arıyor).
CREATE INDEX group_members_group_idx ON group_members (group_id);

CREATE VIEW session_occupancy AS
SELECT s.id       AS session_id,
       s.status,
       s.capacity,
       regular.count                     AS regular_count,
       makeup.count                      AS makeup_count,
       regular.count + makeup.count      AS booked_count,
       -- Yönetici kapasiteyi sonradan düşürürse negatif olabilir; ekranda 0 gösterilir.
       s.capacity - (regular.count + makeup.count) AS free_spots
FROM sessions s
-- Derse gelecek düzenli üyeler: o tarihte grupta olan, dondurulmamış ve bu dersi iptal etmemiş olanlar.
CROSS JOIN LATERAL (
  -- count() bigint döndürür; pg bigint'i JS'te string'e çevirir ("3"). int'e çeviriyoruz.
  SELECT count(*)::int AS count
  FROM group_members gm
  WHERE gm.group_id = s.group_id
    -- joined_on dahil, left_on hariç: grup değiştiren müşteri eski grubundan left_on günü çıkar,
    -- yeni grubuna aynı gün (joined_on) girer; iki grupta birden sayılmaz.
    AND gm.joined_on <= s.date
    AND (gm.left_on IS NULL OR s.date < gm.left_on)
    -- O tarihi kapsayan bir dondurma varsa sayılmaz (BR-12).
    AND NOT EXISTS (
      SELECT 1 FROM freezes f
      WHERE f.user_id = gm.user_id
        AND daterange(f.starts_on, f.ends_on, '[]') @> s.date
    )
    -- Bu dersi iptal ettiyse sayılmaz.
    -- "Üyeler - iptaller" diye ayrı ayrı saymak yerine iptali üye başına kontrol ediyoruz:
    -- hem iptal edip hem dondurulan bir müşteri böylece iki kez düşülmez.
    AND NOT EXISTS (
      SELECT 1 FROM credits c
      WHERE c.user_id = gm.user_id
        AND c.source_session_id = s.id
    )
) AS regular
-- Bu derse telafi yazdıranlar.
CROSS JOIN LATERAL (
  SELECT count(*)::int AS count
  FROM credits c
  WHERE c.used_session_id = s.id
) AS makeup;
