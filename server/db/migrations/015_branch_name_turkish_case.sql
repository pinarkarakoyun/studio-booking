-- Şube adı benzersizliği Türkçe büyük/küçük harfe uygun olsun.
-- 014'teki index lower(name) kullanıyordu. Veritabanının harf kuralı (ör. en_US) "I"yı "i" yapar, Türkçede ise
-- "I"nın küçüğü "ı", "İ"nin küçüğü "i"dir. Bu yüzden "Kızılay" ile "KIZILAY" farklı ad sanılıyor, ikisi de
-- kaydedilebiliyordu. Önce translate ile I -> ı ve İ -> i yapılır, sonra lower() kalan harfleri küçültür.
-- (İ'yi lower()'a bırakmak olmaz: bazı harf kurallarında "i" + birleşik nokta olur, "i" ile eşleşmez.)
DROP INDEX branches_studio_name_unique;
CREATE UNIQUE INDEX branches_studio_name_unique ON branches (studio_id, lower(translate(name, 'Iİ', 'ıi')));
