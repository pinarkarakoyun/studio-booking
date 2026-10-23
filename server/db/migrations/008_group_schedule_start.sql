-- Grubun güncel programının (günler + saat) hangi tarihten itibaren geçerli olduğu.
-- Dersler 6 hafta önceden üretildiği için program değişikliği "seçilen tarihten itibaren" uygulanır:
-- o tarihten önceki dersler eski programla zaten üretilmiş durumda. Ders üretici bu tarihten önceki
-- günlere yeni programa göre ders eklemez (yoksa "pazartesiden itibaren salı da olsun" denince
-- bu haftanın salısı da oluşurdu). NULL = program grubun başından beri aynı.
ALTER TABLE groups ADD COLUMN schedule_starts_on date;
