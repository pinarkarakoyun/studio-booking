# Yönetici Analiz Paneli (ilk sürüm) — Tasarım

## Amaç

Yönetici paneline yeni bir **Analiz** sekmesi eklenir. Yönetici bu sekmede stüdyonun ayını tek bakışta görür:
ne kadar kazanıldı, kaç kişi geldi, kaç yeni üye var, kaç ders yapıldı ve dersler ne kadar doluydu. Ayrıca
şu an ilgilenmesi gereken iki liste görür: bir aydır gelmeyenler ve bekleyen ödemeler.

Sekmeyi yalnızca yönetici görür. Eğitmen fiyat görmediği için (instructor-role spec 5.2) sekmeyi hiç görmez,
uç da ona 403 döner.

## Tanımlar

Ay, stüdyonun saat dilimine göre takvim ayıdır (`studios.timezone`).

- **Geldi (ziyaret):** Bir üye, bir derse şu koşullarla gelmiş sayılır: ders iptal edilmemiş (`status = 'scheduled'`),
  başlangıç saati geçmiş (`starts_at <= now()`) ve üye o derstedir. Derste olmak iki şekilde olur: (a) düzenli üye
  olmak, yani o tarihte grupta olmak, dondurulmamış olmak ve bu dersi iptal etmemiş olmak (`session_occupancy` ile
  aynı kural) ya da (b) bu derse telafi yazdırmış olmak. Yoklamada "gelmedi" işaretli olan (`attendance` satırı)
  sayılmaz. Ek dersler de gizli gruplar olduğu için aynı kurala girer.
- **Gelir:** `paid_on` tarihi o ayda olan ödemelerin toplamı (kuruş).
- **Aktif üye:** O ay en az bir kez gelen farklı üye sayısı.
- **Yeni üye:** Hesabı o ay açılan müşteriler (`users.created_at`, stüdyo saatiyle). Not: canlıya geçilen ay mevcut
  üyelerin hepsi "yeni" görünür. Bu bilinçli olarak kabul edildi.
- **Yapılan ders:** O ayın, iptal edilmemiş ve başlangıç saati geçmiş dersleri.
- **Ortalama doluluk:** Yapılan derslerde `gelen / kapasite` oranlarının ortalaması. Hiç ders yoksa `null`.
- **Bir aydır gelmeyen:** Pınar'ın yazdığı `isLapsed` kuralıyla belirlenir (eşik, donmuş üye, hiç gelmemiş üye
  kararları orada). Liste her zaman **bugüne** göre hesaplanır ve seçilen aydan bağımsızdır.
- **Bekleyen ödeme:** Ödemeler sekmesindeki `underpaid` listesi: eksik ödemeli kişi sayısı ve kalan toplam.
  Bu da bugüne göredir.

## Ekran

- Üstte ay değiştirici: `‹ Kasım 2026 ›`. Varsayılan bu aydır, gelecekteki aylara geçilemez.
- Dört kart: Gelir, Aktif üye, Yeni üye, Yapılan ders ve doluluk. Her kartta önceki aya göre fark yazar (↑ / ↓).
  Bu ay seçiliyken altta "ay henüz bitmedi" notu çıkar.
- 12 aylık gelir grafiği (seçilen ay dahil geriye doğru 12 ay). Sütunun üstüne gelince o ayın aktif üye ve ders
  sayısı görünür.
- Bekleyen ödemeler kartı: toplam ve kişi sayısı. Dokununca Ödemeler sekmesi açılır.
- Bir aydır gelmeyenler listesi: ad, şube (çok şubeli stüdyoda), son geliş tarihi ve kaç gün olduğu. Dokununca
  müşteri detayı açılır. En yakın zamanda kopanlar en üstte, çünkü geri kazanması en kolay olanlar onlar.

## Kapsam dışı (sonraki sürüm)

Şube bazında süzme, eğitmen raporu, saat ve gün yoğunluk analizi, iptal oranları, dışa aktarma (Excel/PDF).
