# Eğitmen Rolü ve Ek Ders — Tasarım

Tarih: 2026-11-24 · Yol haritası 6. adım.
İlgili kararlar: `2026-11-18-roadmap-and-decisions.md` bölüm 1.6; proje günlüğünde 6 Kasım kararları
(stüdyo başına hesap, eğitmen kendi derslerini görür, ek ders).

## 1. Amaç ve neden

Ürün birden çok stüdyoya satılıyor; stüdyo sahibi ile derse giren kişi her zaman aynı değil. Örnek: Tua
Pilates'in iki şubesi, bir yöneticisi var. Yönetici iki şubenin bütün üyeleriyle uğraşamaz; işi şubedeki
eğitmene devretmek ister. Bu adımda:

- Yönetici ile üyenin yanına üçüncü rol gelir: **eğitmen**. Yönetici eğitmeni üye ekler gibi ekler ve
  ona hangi işleri yapabileceğini tek tek seçer.
- Eğitmen bir ya da birkaç **şubeye** atanır; yetkileri yalnızca o şubelerde geçerlidir.
- Eğitmen ya da yönetici haftalık programın dışında tek seferlik **ek ders** açabilir. Duyuruyu eğitmen
  WhatsApp'tan kendisi yapar; gelmek isteyen sistemden yerini ayırır.

Kim kullanır: stüdyo yöneticisi (eğitmen ekler, yetki verir), eğitmen (çoğunlukla telefondan, dersler
arasında), üye (ek derse kayıt).

## 2. Hedefler, hedef olmayanlar, başarısızlık sayılacaklar

**Hedefler**
- Yönetici panelinde **Eğitmenler** bölümü: eğitmen ekleme (ad, telefon, geçici şifre), şube atama,
  yetki anahtarları, şifre sıfırlama, "ayrıldı" işaretleme.
- Eğitmen aynı yönetici panelini kullanır; menüde ve ekranlarda yalnızca yetkisi olan bölümler görünür.
- Grupların bir eğitmeni olur (grup formunda seçilir, boş bırakılabilir).
- Ders ekranında **Benim derslerim / Bütün dersler** filtresi.
- Yerine derse giren eğitmen yoklamayı alır; o günkü dersin eğitmeni o kişi olarak kaydedilir.
- Ek ders: açma formu, üyelerin kaydı (grup modelinde telafi hakkıyla, paket modelinde paketten),
  "WhatsApp'ta paylaş" düğmesi.
- Eğitmen hiçbir ekranda ve hiçbir API cevabında fiyat, ücret, ödeme tutarı görmez.

**Hedef olmayanlar**
- Bildirim (e-posta, SMS, WhatsApp gönderimi). Sistem kimseye mesaj göndermez; WhatsApp düğmesi yalnızca
  hazır metinle WhatsApp'ı açar, "Gönder"e kişi basar.
- Eğitmen hakediş/ders sayısı raporu (veri ileride bunu mümkün kılacak şekilde tutulur, ekranı yok).
- Birden çok stüdyoda tek eğitmen hesabı (6 Kasım kararı: stüdyo başına ayrı hesap).
- Özel ders / eğitmenin müsaitlik takvimi.
- Eğitmenin başka eğitmenin dersini iptal etmesi (yönetici yapar).
- Ek dersin hakkı olmayanlara açılması ya da ayrıca ücretlendirilmesi.

**Başarısızlık sayılacaklar (çalışsa bile)**
- Eğitmenin yetkisi olmayan bir işi **API'ye elle istek göndererek** yapabilmesi (düğmeyi gizlemek yetki
  değildir).
- Eğitmenin atanmadığı bir şubenin üyesini, ya da yetkisi yokken herhangi bir üyenin telefonunu görmesi.
- Eğitmene giden herhangi bir JSON cevabında tutar alanı bulunması (ekranda görünmese bile).
- Ek dersin (gizli grubun) Gruplar listesinde, yeni üye formundaki grup seçiminde, grup değiştirmede ya da
  tanıtım sitesinde görünmesi.
- Bugünkü yönetici davranışının değişmesi (yönetici için her şey bugünkü gibi çalışmalı; mevcut testler
  geçmeli).
- Yeni bir yönetici ucu eklendiğinde, yetki tablosuna yazılmadığı hâlde eğitmene açık olması.

## 3. Kısıtlar ve bugünkü kod

- Rol bugün `users.role IN ('admin','customer')`; `requireRole` tek rol alıyor.
  `server/src/routes/admin.js` başında `router.use('/api/admin', requireAuth(), requireRole('admin'))`.
- Yönetici servisleri ilk parametre olarak `admin` nesnesini alır, stüdyoyu ondan bulur
  (`server/src/services/admin*.js`).
- Dersin süresi, kapasitesi ve şubesi gruptan gelir (`sessions.group_id` zorunlu, `UNIQUE (group_id, date)`).
  Dersleri `sessionGenerator.js` `group_days` üzerinden üretir.
- Doluluk: grubun aktif üyeleri − iptal edenler + `credits.used_session_id = ders` olanlar.
- Grup modelinde telafi `booking.js` `bookMakeupInTransaction`; paket modelinde bugün bu fonksiyon
  `MAKEUP_NOT_AVAILABLE` ile reddediyor.
- Paket modelinde seans düşmesi `packageUsage.js` `chargeableSessions`: üyenin grubunun dersi **ya da**
  `credits.used_session_id` ile eklendiği ders, bittiyse düşer. Yöneticinin "derse kişi ekle"si bu satırı
  oluşturur.
- Giriş telefon + şifre ile (`auth.js` `login`), hesaplar stüdyo başına.
- Bir üyenin şubesi, o tarihteki aktif grubunun şubesidir (`assertBranchAllowed` ile aynı kural).
- Sunucu testleri gerçek PostgreSQL üzerinde (`server/test/`); her davranış değişikliği önce kırmızı test.

## 4. Yaklaşımlar

**Yetkiler için**
- **A) Yönetici uçlarını yetki tablosu ve şube süzmesiyle eğitmene açmak — seçildi.** Tek kod yolu;
  yöneticiye eklenen özellik eğitmen tarafında da hazır. Riski (bir sorguda süzmeyi unutmak) "yazılmayan
  uç yalnızca yöneticiye açık" kuralı ve yetki matrisi testiyle karşılanır.
- B) Ayrı `/api/instructor` uçları ve ayrı panel. Yönetici koduna dokunmaz ama Pınar "özelliklerin çoğu
  eğitmene açılabilsin" dediği için yönetici kodunun büyük kısmı ikinci kez yazılır ve zamanla ayrışır.
- PostgreSQL satır düzeyi güvenliği (RLS) elendi: her istekte bağlantıya kullanıcı bağlamı taşımak bugünkü
  havuz yapısını değiştirir, bu adım için büyük.

**Ek ders için**
- **X) Gizli, tek seferlik grup (`groups.kind = 'extra'`) — seçildi.** Süre, kapasite, şube bugünkü gibi
  gruptan okunur; doluluk, telafi ve "yerine şuna gel" kodları büyük ölçüde değişmeden çalışır.
- Y) `sessions.group_id` boş olabilen ders. Model daha temiz ama dersleri grupla birleştiren her sorgu değişir.

## 5. Tasarım

### 5.1 Veri modeli (yeni migration'lar, numaralar 019'dan başlar)

- `users.role` CHECK'ine `'instructor'` eklenir. Eğitmen de `users` tablosunda; giriş, geçici şifre,
  şifre değiştirme, `status` (`active` / `left`) üye ile aynı mekanizma.
- `instructor_branches (user_id, branch_id)`: eğitmenin şubeleri. Birincil anahtar ikilisi. Kullanıcı ile
  şube aynı stüdyoda olmalı (014'teki `groups_branch_same_studio` gibi bir kısıtla). En az bir şube
  zorunluluğu servis katmanında.
- `instructor_permissions`: eğitmen başına bir satır, her yetki ayrı `boolean` sütun (`studio_settings`
  ile aynı "tipli sütun" yaklaşımı). Sütunlar ve varsayılanlar 5.2'deki tabloda. CHECK: `view_customers`
  false iken diğer üye yetkileri true olamaz.
- `groups.instructor_id` (boş olabilir): grubun asıl eğitmeni. Rolü `instructor` olan, aynı stüdyodaki bir
  kullanıcı olmalı (servis kontrolü).
- `groups.kind text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','extra'))`.
- `sessions.instructor_id` (boş olabilir): o günkü dersi veren kişi. Boşsa grubun eğitmeni geçerlidir.
  **Dersin eğitmeni = `COALESCE(sessions.instructor_id, groups.instructor_id)`.**
- Ek dersin isteğe bağlı başlığı grubun `name` alanında tutulur; boşsa "Ek ders".

### 5.2 Yetkiler

Yönetici her eğitmen için anahtarları seçer. Hepsi eğitmenin şubeleriyle sınırlıdır.

| Bölüm | Yetki (sütun adı önerisi) | Varsayılan | Kapsadığı uçlar |
|---|---|---|---|
| Dersler | Yoklama almak, gerekirse dersi devralarak (`attendance`) | açık | yoklama işaretleme/geri alma, "Bu dersi ben veriyorum" |
| | Kendi dersini iptal etmek (`cancel_own_sessions`) | açık | ders iptali (önizleme dahil), yalnızca eğitmeni kendisi olan ders |
| | Ek ders açmak (`create_extra_sessions`) | açık | ek ders oluşturma |
| | Derse elle üye eklemek / çıkarmak (`manage_attendees`) | kapalı | derse kişi ekle / telafiyi çıkar |
| Üyeler | Üyeleri ve telefonlarını görmek (`view_customers`) | kapalı | müşteri listesi ve detayı |
| | Yeni üye eklemek, şifresini sıfırlamak (`edit_customers`) | kapalı | müşteri ekleme, şifre sıfırlama (bugün üye bilgisi düzenleme ucu yok; eklenirse bu yetkiye bağlanır) |
| | Dondurmak, ayrıldı işaretlemek, grubunu değiştirmek (`customer_status`) | kapalı | dondurma, dondurmayı bitirme, ayrılma, grup değiştirme |
| | Paket tanımlamak, telafi hakkı vermek (`memberships`) | kapalı | paket modelinde üyelik dönemi oluşturma (ücret paketten), kredi verme. Grup modelinde dönem açmak yöneticide kalır (Pınar'ın kararı: ücret elle yazılıyor, eğitmen fiyat görmez) |
| Gruplar | Grup açmak, düzenlemek, kapatmak (`manage_groups`) | kapalı | grup uçları |

Herkese (her eğitmene) açık olan, yetki gerektirmeyen: şubelerindeki derslerin listesi (Bugün / gün
gezintisi) ve ders detayındaki katılımcı **adları**. Yoklama için ad gerekir; telefon `view_customers`
olmadan cevapta yer almaz.

Hiçbir zaman eğitmene açılmayan: ödemeler (liste, ekleme, silme), paket tanımları (ekleme/düzenleme;
listesi yalnızca `memberships` yetkisiyle, fiyatsız), sistem ayarları, görünüm ayarları, şube açma/kapatma,
eğitmen yönetimi, başka şubelerin verisi.

### 5.3 Yetkinin uygulanması (sunucu)

- `requireRole('admin')` yerine `/api/admin` için "personel" kontrolü: yönetici ya da eğitmen.
- **Yetki tablosu**: her `/api/admin` ucu için, eğitmene açıksa hangi yetkiyi istediği tek bir yerde
  yazılır. Tabloda olmayan uç **yalnızca yöneticiye** açıktır (varsayılan kapalı).
- Servisler `admin` yerine bir **işlemi yapan kişi** (`actor`) alır: `{ id, studio_id, role, branchIds,
  permissions }`. Yönetici için `branchIds = null` (süzme yok). Eğitmen için sorgular `branch_id = ANY(...)`
  ile süzülür. Kapsam dışı bir kaydın id'si istenirse cevap **404** (kaydın varlığı sızdırılmaz), yetki
  yoksa **403**.
- Kapsam kuralları:
  - Ders: grubunun şubesi eğitmenin şubelerinden biri.
  - Üye: o günkü aktif grubunun şubesi eğitmenin şubelerinden biri. Grubu olmayan üye eğitmene görünmez.
  - Eğitmenin eklediği yeni üye, eğitmenin şubelerindeki bir gruba konmak zorunda.
  - Grup: şubesi eğitmenin şubelerinden biri; eğitmen grubu başka bir şubeye taşıyamaz.
  - Eğitmen yalnızca `customer` rolündeki hesaplara dokunabilir (başka eğitmenin ya da yöneticinin şifresi
    sıfırlanamaz).
- **Fiyat temizliği**: eğitmene giden cevaplardan tutar alanlarını (`amountKurus`, `feeKurus`,
  `priceKurus`, `remainingKurus`, ödeme listeleri ve toplamları vb.) çıkaran tek bir yardımcı; üye detayı,
  üyelik dönemleri ve paket listesi bunu kullanır. Eğitmen üyelik dönemi oluştururken ücret alanı
  gönderemez (gönderirse yok sayılmaz, 400 döner); ücret paketin fiyatından gelir, indirim yalnızca
  yöneticide. Grup modelinde eğitmenin dönem açma isteği 403.
- **Yetki matrisi testi**: `admin.js`'teki bütün uçlar tek tek dolaşılır; yetkisiz eğitmenin 403/404 aldığı,
  yetkili eğitmenin yalnızca kendi şubesinde başarılı olduğu, yöneticinin davranışının değişmediği
  kanıtlanır. Yeni eklenen ve tabloya yazılmayan bir uç bu testte "yalnızca yönetici" olarak görünmelidir.
- Oturumdaki kullanıcı nesnesi (`findSessionUser`) eğitmen için şubeleri ve yetkileri de yükler; yönetici
  yetkileri değiştirince bir sonraki istekte geçerli olur (önbellek yok).
- `GET /api/me` (ya da mevcut eşdeğeri) eğitmen için rol, şube adları ve yetkileri döndürür; istemci menüyü
  buna göre kurar. Bu yalnızca kolaylık; asıl karar sunucuda.

### 5.4 Dersler ve devralma

- Ders listesi (Bugün, gün gezintisi): eğitmen şubelerinin bütün dersleri; her dersin eğitmen adı görünür.
  Üstte **Benim derslerim / Bütün dersler** filtresi; eğitmen için varsayılan "Benim derslerim". Yönetici
  için filtre yok (ya da "Bütün dersler" sabit) — kurucunun kararı.
- **Devralma (Pınar'ın kararı: açık düğme)**: yoklama tablosu yalnızca "gelmedi" işaretlerini tuttuğu için
  devralma yoklamaya bağlanmaz. `attendance` yetkili eğitmen, şubesindeki ve eğitmeni kendisi olmayan bir
  dersin detayında, dersin günü **"Bu dersi ben veriyorum"** düğmesini görür; basınca
  `sessions.instructor_id` o eğitmen olur. Grubun eğitmeni değişmez. Ders detayında "Bu dersi bugün X
  veriyor" görünür.
- Eğitmen yoklamayı yalnızca eğitmeni kendisi olan (devraldığı dahil) derste alır; başka eğitmenin dersinde
  yoklama düğmeleri yerine devralma düğmesi görünür (kurucunun kararı: kayıt her zaman tutarlı kalsın).
- Yönetici ders detayından o günkü eğitmeni elle değiştirebilir (devralmanın düzeltmesi için).
- İptal: `cancel_own_sessions` yalnızca dersin eğitmeni (devralınmış dahil) kendisiyse. İptalin sonuçları
  (telafi hakkı, paket) bugünkü `cancelSessionByStudio` ile aynı; sebep seçimi bugünkü gibi.

### 5.5 Ek ders

- Açan: yönetici her zaman; eğitmen `create_extra_sessions` ile, yalnızca kendi şubelerinde.
- Form: tarih, başlangıç saati, süre, kapasite, şube, eğitmen (eğitmen açınca kendisi, değiştiremez),
  isteğe bağlı başlık.
- Kayıt: bir `groups` satırı (`kind = 'extra'`, `group_days` yok, üyesi yok) ve tek bir `sessions` satırı
  aynı transaction'da. `sessionGenerator` `group_days` olmadığı için bu gruba ders üretmez (testle
  sabitlenir).
- Geçmiş bir zamana ek ders açılamaz.
- Gizli grup şu yerlerde **görünmez**: Gruplar listesi ve detayı, yeni üye formundaki grup seçimi, grup
  değiştirme, tanıtım sitesi, üye sayısı/doluluk özetleri gibi grup bazlı listeler. Ders listelerinde
  görünür ve "Ek ders" etiketi taşır.
- Ek ders düzenlenemez; yanlış açıldıysa iptal edilir (bugünkü ders iptali). Kayıtlı varsa sonuçları
  iptaldeki gibi.

**Üyenin kaydı**
- Grup modeli: ek ders bugünkü telafi listesinde çıkar ve telafi akışıyla alınır (telafi hakkı ya da
  "bu ders yerine şuna gel"). Süre, aylık telafi sınırı ve şube kuralları aynen geçerli. Hakkı olmayan
  kayıt olamaz.
- Paket modeli: yeni bir kayıt yolu. Üye yalnızca **ek dersleri** listeleyen bir ekran/bölüm görür ve kayıt
  olur. Kayıt, `credits` tablosunda kaynağı boş, `used_session_id` = ek ders olan bir satır oluşturur
  (yöneticinin "derse kişi ekle"siyle aynı iz); ders bitince `chargeableSessions` onu paketten düşer.
  Şartlar: dersin şubesi kurallara uyuyor, üye dondurulmuş değil, ders başlamamış ve rezervasyon
  penceresinde, yer var, üyenin **o gün geçerli ve kalan seansı 0'dan büyük** bir paketi var. Normal
  (ek olmayan) derslere paket modelinde kendi kendine kayıt bugünkü gibi kapalı kalır.
- Kayıttan vazgeçme: bugünkü telafiden vazgeçme kuralı (`cancelMakeup`) iki modelde de geçerli: iptal
  süresi geçtiyse vazgeçilemez. Paket modelinde süresinde vazgeçen üyenin satırı kaldırılır, paketten
  düşmez. Süre geçtikten sonra satır kalır; üye gelmese de ders bitince paketten düşer (haber vermeden
  gelmemek avantajlı olmamalı kararıyla aynı).
- Kalan seans kontrolü (kurucunun kararı olarak işaretli): `packageUsage` yalnızca bitmiş dersleri sayar.
  Bir seansı kalan üyenin birden çok ek derse yazılmasını önlemek için kayıtta şu koşul aranır: kalan seans
  − üyenin henüz bitmemiş ek ders kayıtları > 0. Normal grup dersleri bu hesaba katılmaz.
- Kapasite ve aynı anda son yer: bugünkü `FOR UPDATE` kilidiyle aynı.

**WhatsApp'ta paylaş**
- Ek ders açılınca ve ders detayında bir düğme: `https://wa.me/?text=...` adresini hazır metinle açar.
  Örnek metin: "Cumartesi 29 Kasım 10:00'da Konyaaltı şubesinde ek ders açtım. Gelmek isteyenler
  sistemden yerini ayırsın: <stüdyo adresi>". Metin sunucuya gönderilmez, kayıt tutulmaz.

### 5.6 Ekranlar

- **Yönetici → Eğitmenler** (yeni menü öğesi, yalnızca yönetici): liste (ad, telefon, şubeler, durum);
  yeni eğitmen formu (ad, telefon, şubeler; kaydedince geçici şifre ekranı, bugünkü üye ekleme gibi);
  eğitmen detayı (şubeler, yetki anahtarları 5.2 tablosundaki gruplarla, şifre sıfırla, ayrıldı).
  "Üyeleri görmek" kapalıyken alttaki üye yetkileri pasif görünür.
- **Grup formu**: "Eğitmen" seçimi (o şubeye atanmış eğitmenler + boş).
- **Bugün / gün**: filtre, ders kartında eğitmen adı ve ek ders etiketi; "+ Ek ders" düğmesi (yetkiliye).
- **Ders detayı**: o günkü eğitmen, yoklama, (yetkiliye) iptal ve WhatsApp düğmesi.
- **Eğitmenin menüsü**: Bugün her zaman; Müşteriler `view_customers` ile; Gruplar `manage_groups` ile;
  Ödemeler ve Ayarlar hiç yok. Hesap/şifre değiştirme bugünkü gibi.
- **Üye (paket modeli)**: Derslerim'de "Ek dersler" bölümü, yalnızca açık ek ders varsa görünür.
- Görünüm 4. adımın bileşenleriyle (toast, alttan açılan pencere, telefonda alt çubuk).

## 6. Kurucuya bırakılanlar

- Yetki tablosunun kodda tam biçimi, `actor` nesnesinin nasıl kurulduğu, servis imzalarının geçişi.
- Migration'ların bölünmesi ve sırası; mevcut demo/Tua verisi için geçiş (yeni sütunlar boş/varsayılan).
- Gizli grubun dışlanacağı sorguların tam listesi (5.5'teki liste asgari; kod taranarak tamamlanır, her
  biri için test).
- Yönetici için Bugün filtresinin gösterilip gösterilmeyeceği.
- Ekranların ayrıntılı yerleşimi; mesaj metinleri (Türkçe, bugünkü üslupla).
- Uygulama, en az iki PR'a bölünebilir: (1) rol, şubeler, yetkiler, Eğitmenler ekranı, dersler/devralma;
  (2) ek ders ve paket modelinde ek ders kaydı.
