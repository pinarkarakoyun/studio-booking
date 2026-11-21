# Arayüzü Prototipe Çevirme: Tasarım

**Tarih:** 21 Kasım 2026
**Durum:** Onaylandı (Pınar, 21 Kasım 2026)
**Yol haritası:** 4. adım (`docs/superpowers/specs/2026-11-18-roadmap-and-decisions.md`, bölüm 1.4 ve 1.8)

## Amaç

Tua Pilates için claude.ai'de hazırlanan tıklanabilir prototip (üç ekran: web sitesi, üye paneli, yönetici paneli)
Pınar'ın en çok beğendiği tasarım. Bu adımda üye paneli, yönetici paneli ve tanıtım sitesi bu görünüme çevrilir.

- **Ürünün ortak parçası ders takip sistemidir** (iki üyelik modeliyle). Paneller her stüdyoda aynıdır, renkler
  stüdyonun teması ile değişir.
- **Tanıtım sitesi stüdyoya göre yapılır.** Bugünkü site ilk stüdyo için yapılmıştı ve stüdyo istemedi; yerine Tua
  prototipindeki site gelir. Başka bir stüdyo isterse ona göre uyarlanır. "Her stüdyoya uyan site şablonu" amaç
  değildir. Yine de kodda stüdyo adı, şehir, kişi adı olmaz: içerik `site.json`'dan gelir.

Prototip: claude.ai artifact "TUA Pilates – Tıklanabilir Prototip"
(https://claude.ai/artifact/5Yvo1S5WBK6FNEFfiezVW5, slug `24d9c344-b372-4587-b874-809cbccd52de`). Kaynak
dosyaların kopyası repo dışında: `~/Documents/02 Projeler/studio-booking-notes/prototip/` (`Main.dc.html` site,
`Uye.dc.html` üye paneli, `Admin.dc.html` yönetici paneli). İçlerinde gerçek stüdyo adı ve telefon olduğu için
repoya girmez; ölçüler (boşluk, yazı boyutu, köşe) bu dosyalardaki satır içi stillerden alınır. Görsel dil: krem zemin (`#F5F0E6`), zeytin ana renk (`#4B5530`), koyu zeytin (`#2F361D`),
açık kart yüzeyi (`#FBF8F2`), gömük yüzey (`#E8E3D6`), Cormorant Garamond serif başlıklar, DM Sans arayüz
yazısı, 18–24px yuvarlak kartlar, hap (pill) butonlar, en az 44px dokunma alanı, alttan açılan onay pencereleri,
alttan çıkan toast bildirimleri, kısa giriş animasyonları.

## Başarı ölçütleri

1. Bütün panel ekranları ve tanıtım sitesi prototipin görünümünde; telefon (375px) ve masaüstü (1280px) tarayıcıda
   doğrulanmış, hem grup hem paket modelli demoda.
2. Rezervasyon, iptal, telafi, paket, ödeme davranışı hiç değişmez: `cd server && npm test` yeşil, mevcut testler
   aynen geçer.
3. CSS değişkenleri anlamlı adlarda (`--brand`, `--accent`, `--surface` …); eski adlar (`--violet`, `--pink`,
   `--aubergine` …) kodda kalmaz.
4. Paket modelli stüdyonun sitesinde telafi sözü geçmez; modele göre metin gösterilir.
5. `client` lint ve build temiz.

## Alınan kararlar (Pınar)

| Konu | Karar |
|---|---|
| Üye paneli akışı | Bugünkü akış kalır (sabit grup, "Gelemiyorum", telafi). Prototipteki serbest "Rezerve et" / "Program" sekmesi **gelmez**; serbest rezervasyon ileride ayrı bir sunucu adımı |
| Yönetici paneli | Masaüstünde prototipteki koyu yan menü, telefonda bugünkü alt sekme çubuğu |
| Varsayılan renkler | Prototipin krem/zeytin paleti ürünün varsayılanı olur (bugünkü mor/pembe ilk stüdyodan kalmaydı) |
| Tua teması | Repo dışındaki `studio-booking-brands/tua/theme.css` yeni değişken adlarına ve prototip renklerine çevrilir |
| Yazı tipi | Arayüz yazısı Archivo → DM Sans; serif başlık Cormorant Garamond kalır. Sitedeki el yazısı üst başlıklar için Great Vibes (yalnızca site) |
| Tanıtım sitesi | Tua prototipindeki site, içerik `site.json`'dan |
| Site için sunucu | Yalnızca site PR'ında `/api/site` yeni `site.json` alanlarını okur (testli). Ders takip davranışı değişmez |
| Yapım yolu | A: önce değişken katmanı ve ortak bileşenler, sonra ekran ekran |
| Teslim | İki PR: (1) değişkenler + ortak bileşenler + paneller + giriş ekranları, (2) tanıtım sitesi |

## Yaklaşımlar

- **A (seçildi): Önce temel, sonra ekran ekran.** Önce yeni değişken adları tanımlanır ve eski adlar bir eşleme
  tablosuyla bütün CSS'te tek seferde değiştirilir (görünüm neredeyse aynı kalır, kolay kontrol edilir). Sonra
  ortak bileşenler, sonra ekranlar tek tek. Her adım küçük, geri alınabilir; bozulan şeyin hangi adımda bozulduğu
  belli olur. Eksisi: ilk adım mekanik.
- **B: Ekran ekran, değişken adlarını o ekranda değiştirerek.** Sonuç daha erken görünür, ama bir süre eski ve yeni
  adlar yan yana yaşar; Tua'nın `theme.css`'i ikisini de ezmek zorunda kalır.
- **C: CSS'i sıfırdan yazmak.** ~3.000 satır CSS yeniden yazılır, odak halkaları ve telefon kenar boşlukları gibi
  çalışan ayrıntılar kaybolur. Bu adım için fazla riskli.

## Kapsam dışı

- Serbest rezervasyon (gruba bağlı olmayan derse yazılma), prototipteki "Program" sekmesi ve gün seçici
- Prototipteki yönetici "Hatırlat" butonu (bildirim altyapısı yok)
- Ayarlardaki +/− sayaçların yeni davranışı (görünüm olarak kullanılabilir, kaydetme davranışı bugünkü gibi)
- Otomatik renk türetme, panelden renk/logo seçimi (5. adım)
- **Sitede paket fiyat kartları** (prototipteki "Paketler" bölümü): fiyatların nereden geleceği 5. adımda kararlaştırılır
  (yol haritası 1.7). Bu adımda bölüm yok
- Prototipteki "Bu sayfa … için hazırlanmış bir tasarım önerisidir · Demo" şeridi ve "Demo ekranları" bağlantıları
- Gerçek fotoğraflar (yer tutucu alanlar bugünkü gibi `site.json`'daki `photos`'tan dolar)

## Ortak temel (PR 1)

### Değişkenler (`client/src/index.css`)

Yeni adlar, rolüne göre (değerler varsayılan krem/zeytin palet):

| Yeni değişken | Rolü | Varsayılan |
|---|---|---|
| `--brand` | Ana renk: ana buton, seçili sekme, koyu kart | `#4B5530` |
| `--brand-strong` | Koyu bant, yönetici yan menüsü, toast zemini, en koyu başlık | `#2F361D` |
| `--brand-soft` | Seçili açık yüzey (seçili şube düğmesi gibi) | `#DCE0CC` |
| `--on-brand` | Ana renk ve koyu yüzey üstündeki yazı | `#F5F0E6` |
| `--on-brand-soft` | Koyu yüzeyde ikincil yazı | `#E9E6D8` |
| `--accent` | Vurgu: rozet ("en popüler" gibi), dikkat çekilecek küçük yerler | builder seçer (paletle uyumlu, 4.5:1) |
| `--surface` | Sayfa zemini | `#F5F0E6` |
| `--surface-raised` | Kart yüzeyi | `#FBF8F2` |
| `--surface-sunken` | Sekme çubuğu zemini, bilgi kutusu, pasif rozet | `#E8E3D6` |
| `--ink` | Ana yazı | `#2F361D` |
| `--ink-soft` | İkincil yazı | `#5C5A4E` |
| `--ink-faint` | Pasif yazı | builder seçer |
| `--line` | İnce çizgi, kart kenarı | `#C9C6B4` civarı |
| `--danger` / `--on-danger` | İptal, geç iptal butonu | `#8A2E1E` / `#FFFFFF` |

Ayrıca: `--radius-card` (18px), `--radius-panel` (24px, alttan açılan pencere ve büyük kart), `--radius-pill`,
`--tap` (44px, en küçük dokunma alanı), `--font-ui` (DM Sans), `--font-brand` (Cormorant Garamond). Boşluk ve
yazı boyutu ölçekleri bugünkü gibi kalır.

Eski değişkenlerden tabloda karşılığı olmayanlar (`--pink-hover`, `--pink-disabled`, `--alert-text`,
`--switch-off` gibi durum tonları) için builder az sayıda yardımcı ad ekler (ör. `--brand-hover`, `--warning`);
ilke aynı: ad rolü söyler, rengi değil.

**Eski → yeni eşleme** ilk commit'te yazılır ve bütün `*.module.css` dosyalarında uygulanır; o commit'te görünüm
neredeyse değişmez (yalnızca adlar). Yalnızca tanıtım sitesinin kullandığı eski değişkenler (`--ghost-*`,
`--phone-frame`, `--lavender-*` …) site PR'ında site yeniden yazılırken kalkar; PR 1'de geçici olarak
`PublicSite.module.css` içinde yerel değişken olarak kalabilir (builder kararı), ama `index.css`'te eski ad kalmaz.

Tema dosyası (`BRAND_DIR/<slug>/theme.css`) bugünkü gibi `html:root` ile bu değişkenleri ezer. Tua'nın dosyası yeni
adlara ve prototipin renklerine çevrilir (repo dışı, commit'e girmez); bugünkü altın kahve buton rengi bırakılır,
çünkü prototipte yok. Tua'nın renkleri varsayılanla aynı olduğu için temanın gerçekten ezdiği, geçici ve belirgin
renkli bir deneme `theme.css`'iyle doğrulanır (sonra silinir). Demo stüdyosunun `theme.css`'i yok; varsayılan
paletle açılır.

**Kontrast:** Varsayılan palette her yazı/zemin çifti WCAG 4.5:1'i geçer (büyük başlıklar 3:1). Builder çiftleri
kontrol eder; geçmeyen tonu koyulaştırır.

### Yazı tipleri

`@fontsource/dm-sans` eklenir, `@fontsource-variable/archivo` kaldırılır. Cormorant Garamond'un kullanılan
ağırlıkları (500, 600, 700) yüklenir. PR 2'de `@fontsource/great-vibes` eklenir ve `--font-script` değişkeni
tanımlanır (prototipte sitedeki "Kendine Zaman Ayır" gibi el yazısı üst başlıklar; panellerde kullanılmaz). Fontlar bugünkü gibi pakettten gelir (Google Fonts'a istek gitmez: kişisel
veri yurt dışına çıkmaz kuralıyla uyumlu).

### Ortak bileşenler

- **`Toast`** (yeni, `components/Toast.jsx`): ekranın altında koyu zeminli kısa bildirim, `role="status"`, birkaç
  saniye sonra kaybolur; `tone: success | error`. Üye panelindeki mevcut toast buna taşınır. Yönetici panelinde
  **başarı mesajları** ("Kaydedildi", "Ödeme kaydedildi", "Paket eklendi" gibi) toast olur; form doğrulama hataları
  bugünkü gibi alanın yanında kalır. Hangi mesajların toast'a döneceği ekran ekran builder kararı, ilke bu.
- **`Sheet`** (alttan açılan pencere): `<dialog>` yapısı aynen kalır; görünüm prototipteki gibi (24px üst köşeler,
  koyu yarı saydam arka plan, alttan kayarak açılma). Masaüstünde ortada kart olarak açılabilir (builder).
- **`Button`**: hap biçimi, en az 44px (önemli eylemde 48px). Türler: ana (`--brand`), ikincil (çerçeveli),
  tehlike (`--danger` dolu ya da çerçeveli), metin.
- **`TextField`**, **`Monogram`**: yeni renkler ve köşeler.
- **Hareket:** prototipteki kısa giriş animasyonu (fadeUp) ve dokununca küçülme (`scale(.97)`).
  `prefers-reduced-motion: reduce` olduğunda animasyonlar kapanır.

## Üye paneli (PR 1)

Akış bugünkü gibi; yalnızca görünüm değişir.

```
┌──────────────────────────┐
│ Merhaba,          [Ayşe] │  ← sağdaki hap: hesap penceresi (çıkış)
│ Ayşe Yılmaz              │  ← serif
│ ┌──────────────────────┐ │
│ │ (◔ 6)  12 Seans      │ │  ← koyu kart (--brand)
│ │ seans  son gün 14 Ara│ │
│ └──────────────────────┘ │
│ SIRADAKİ DERSİN          │
│ Perşembe 19 Kas · 19:00  │
│            [Gelemiyorum] │
│ Bu hafta                 │
│ ┌ Cum 20 · 09:30   ›  ┐  │  ← yuvarlak kartlar
└──────────────────────────┘
```

- **Üst kısım:** "Merhaba," + serif tam ad; sağda hesap hapı (bugünkü hesap penceresini açar). Stüdyo logosu
  (Monogram) üstte küçük kalır.
- **Koyu üyelik kartı** (`MembershipInfo` yerine):
  - Paket modeli: prototipteki halka (kalan / toplam seans), paket adı, son gün, "N kullanıldı". Paket bittiyse ya da
    süresi geçtiyse halka boş ve bugünkü metin ("Paketindeki 8 seans bitti."). Paketsiz ders varsa bugünkü uyarı
    satırı. Paketi yoksa "Henüz bir paketin yok." (kart yerine sade kutu).
  - Grup modeli: üyelik bitiş tarihi; telafi hakkı varsa sayısı, ilk hakkın son günü ve "Telafi seç" butonu kartın
    içinde (bugünkü ayrı telafi kutusu karta taşınır).
  - Ödeme bilgisi (stüdyo ayarı açıksa): tutar, ödenen, kalan çubuğu ve "Ödemelerim" bugünkü gibi; kartın altında
    açık yüzeyde.
- **Sıradaki ders**, **haftalık liste**, **"Sonraki dersleri göster"**: yuvarlak açık kartlar; saat serif ve büyük
  (prototipteki ders satırı). İptal edilmiş/telafi dersleri bugünkü durum metinleriyle, rozet biçiminde.
- **"Gelemiyorum" penceresi** (`CantComeOptions`): seçenekler büyük kartlar/butonlar. Paket modelinde son iptal
  saatinden sonra iptal edilecekse prototipteki onay penceresi: başlık "Derse N saatten az kaldı", açıklama,
  kırmızı "Yine de iptal et (seans yanar)" ve çerçeveli "Vazgeç, derse geleceğim". Geç iptal ayarı kapalıysa
  (seans yanmıyorsa) bu uyarı çıkmaz, bugünkü metin kalır. N = stüdyonun son iptal saati ayarı; `/api/studio` bunu göndermediği için dersin `startsAt` ile son iptal anı
(`cancelDeadlineAt`) farkından hesaplanır (sunucu değişmez).
- **Telafi seçme ekranı** (`MakeupPickerPage`): gün gün liste prototipin ders satırı biçiminde (saat, ders, boş yer,
  "Bu derse gel" butonu).
- **Toast:** ortak `Toast` bileşeni; metinler bugünkü gibi.
- Şube adı yalnızca çok şubeli stüdyoda (bugünkü kural).

## Giriş ekranları (PR 1)

`LoginPage`, `ChangePasswordPage`, `App.jsx`'teki "Bağlantı kurulamadı", `RootPage`, `StudioNotFound`
(`HostMessage`): krem zemin, ortada serif başlık, yuvarlak kart içinde form, büyük butonlar.

## Yönetici paneli (PR 1)

```
Masaüstü (≥ 900px, builder eşiği ayarlayabilir)     Telefon
┌────────────┬──────────────────────────────┐      ┌──────────────────┐
│ [logo]     │ Cumartesi, 21 Kasım          │      │ Bugün       [Ad] │
│ Stüdyo adı │ Bugün                (serif) │      │ …içerik…         │
│            │ ┌────┐┌────┐┌────┐           │      │                  │
│ • Bugün    │ │ 4  ││ 23 ││ 2  │ istatistik│      │                  │
│   Müşteri. │ └────┘└────┘└────┘           │      ├──────────────────┤
│   Gruplar  │ ┌ ders listesi ┐┌ yoklama ┐  │      │Bugün Müş Grp Öd ⚙│
│   Ödemeler │                              │      └──────────────────┘
│   Ayarlar  │                              │
│ [hesap]    │                              │
└────────────┴──────────────────────────────┘
```

- **Kabuk** (`AdminApp`): masaüstünde koyu (`--brand-strong`) yan menü: stüdyo logosu/adı, beş sekme, altta hesap
  (çıkış). Telefonda bugünkü alt sekme çubuğu, yeni renklerle. Sayfa başlığı serif, üstünde bugünün tarihi.
- **Bugün** (`TodayPage`): üstte 2–3 istatistik kartı (bugünkü ders sayısı, bugünkü toplam katılımcı, gibi);
  **yalnızca bugünkü uç noktaların zaten verdiği veriden** hesaplanır, yeni uç nokta yok. Hangi sayıların
  gösterileceği builder kararı. Ders listesi prototipteki gibi saat (serif) + ders + doluluk kartları.
- **Ders detayı** (`SessionRosterPage`): katılımcı satırları prototipteki yoklama satırı biçiminde (baş harf
  dairesi, ad, paket/durum alt satırı, "Gelmedi" hap butonu). Davranış bugünkü gibi (ders başladıysa "Gelmedi").
  İptal ve kişi ekleme pencereleri yeni `Sheet` görünümünde.
- **Müşteriler** (`CustomersPage`): masaüstünde prototipteki tablo görünümü (ad, paket/üyelik, kalan, son gün,
  durum); telefonda kart listesi. Sütunlar modele göre (grup modelinde "kalan seans" yerine üyelik bitişi), yalnızca
  bugünkü listenin verdiği alanlarla.
- **Müşteri detayı**, **yeni müşteri**, **giriş bilgileri**, **Gruplar**, **grup detayı/formu**, **Ödemeler**:
  yeni kart, buton, form görünümü; düzen ve davranış aynı.
- **Ayarlar** (`SettingsPage`, `BranchesSection`, `PackagesSection`): bölümler yuvarlak kartlarda; paketler
  prototipteki paket kartları biçiminde (tür, ad, fiyat, geçerlilik, aktif üye sayısı yalnızca veri varsa).
  Sayısal ayarlar prototipteki −/+ görünümüyle gösterilebilir; kaydetme bugünkü gibi.
- **Toast:** başarı mesajları ortak `Toast` ile (yukarıdaki ilke).

## Tanıtım sitesi (PR 2)

### Bölümler (prototip sırasıyla)

Her bölüm `site.json`'daki karşılığı varsa görünür; yoksa bölüm hiç çizilmez (demo stüdyosu da düzgün açılır).
Zorunlu olanlar: üst menü, giriş (hero), iletişim/altbilgi.

1. **Üst menü:** logo + stüdyo adı, bölüm bağlantıları (yalnızca görünen bölümler), "Üye Girişi" hapı (`/giris`).
   Telefonda menü açılır/kapanır (bugünkü `SiteNav` davranışı).
2. **Giriş (hero):** küçük el yazısı/üst başlık (`hero.eyebrow`), serif büyük başlık (`tagline`), açıklama
   (`subline`), iki hap: "Sana hangi ders uygun?" (test varsa) ve "WhatsApp'tan yaz". Fotoğraf alanı (`photos[0]`),
   süs yaprak çizimi, "N. yıl" rozeti (`instructor.years` ya da `stats` ilk öğesi; yoksa rozet yok).
3. **Kayan yazı bandı:** ders adları (`courses[].title`) ve şube adları, araya "·". Ayrı alan yok, bunlardan türetilir.
   Hareket azaltma tercihinde durur.
4. **Neden biz** (`reasons`, bugünkü bölüm; Pınar kalmasını istedi): prototipin kart görünümüyle, en fazla 4 kart.
   `site.json`'da yoksa bugünkü genel kartlar gösterilir; **genel kartlar modele göre**: paket modelinde "Telafi
   hakkı" kartı yerine telafi sözü geçmeyen bir kart gelir. Stüdyonun kendi yazdığı kartlar olduğu gibi gösterilir
   (Tua'nın `site.json`'ındaki "Telafi hakkı" kartı, Tua'nın içeriği yazılırken modeline göre düzeltilir).
5. **Dersler** (`courses`): başlık + kart başına ikon yerine sade çizgi süs, ad, kısa metin; bir kart `highlight`
   ile koyu olabilir ve bir bölüme bağlantı verebilir (`link`: bölüm kimliği).
6. **"Sana hangi ders uygun?" testi** (`quiz`): en fazla 5 soru, soru başına en fazla 4 seçenek; her seçenek ya
   sonraki soruya (`next`) ya da bir sonuca (`result`) gider. Sonuçta başlık, metin, "Deneme dersi iste" (WhatsApp)
   ve "Baştan başla". İlerleme noktaları. **Cevaplar yalnızca tarayıcının belleğinde kalır**; hiçbir yere kaydedilmez,
   gönderilmez, WhatsApp mesajına eklenmez (sağlık verisi kuralı: ör. "Şu an hamile misin?" sorusu).
7. **Öne çıkan program** (`spotlight`, prototipteki hamile pilatesi bölümü genelleştirilmiş hali): üst başlık,
   başlık, metin, fotoğraf alanı, sekmeler (en fazla 4); her sekmede küçük üst yazı, başlık, işaretli madde listesi,
   ilerleme çizgisi.
8. **Şubeler:** şube sekmeleri (tek şubede sekme yok). Şube adı ve adresi panelden (bugünkü `branches`);
   rozet, açıklama ve haftalık program `site.json`'daki `branchDetails` listesinden şube adıyla eşleşerek gelir.
   Telefon (`phone`), harita bağlantısı (`mapsUrl`). Program metin olarak yazılır (gün + o günün dersleri); grupların
   veritabanındaki saatlerinden üretilmez (**builder notu: bu bir karar, ileride panelden üretmek düşünülebilir**).
9. **Eğitmen:** fotoğraf, ad, bio, en fazla 3 sayı kartı (`stats`: `{ value, label }`); sayılar ekrana girince
   sayarak artar (hareket azaltmada direkt son değer).
10. **Nasıl işler** ve **Sık sorulanlar** (bugünkü `HowItWorks`, `Faq`): prototipte yok ama ders takip sistemini
   anlatan tek yer oldukları için kalır, yeni görünümle. **Metinler modele göre:** grup modelinde telafi anlatılır;
   paket modelinde telafi sözü geçmez, yerine paket kuralı (geç iptalde seans düşmesi ayara göre) anlatılır.
   Model `/api/studio`'daki `membershipModel`'den, son iptal saati ve geç iptal ayarı da oradan gelir.
11. **Altbilgi:** stüdyo adı, slogan, şubeler, iletişim (telefon, Instagram), KVKK aydınlatma bağlantısı.
12. **Yüzen WhatsApp butonu** (`whatsappPhone` varsa).

Aydınlatma sayfası (`PrivacyPage`) yeni görünümle.

### Sunucu: `/api/site` yeni alanlar

`server/src/routes/studio.js` bugünkü kalıpla yeni alanları okur: her metin `text()` ile, listeler sınırlı uzunlukta
(`slice`), geçersiz öğe atılır, bağlantı alanları yalnızca `https://` ya da sayfa içi kimlik. Yeni alanlar:
`hero.eyebrow`, `courses[]` (`title`, `text`, `highlight`, `link`), `quiz` (`title`, `intro`, `questions[]`,
`results`), `spotlight` (`eyebrow`, `title`, `text`, `tabs[]`), `branchDetails[]` (`branch`, `badge`, `description`,
`schedule[]`: `{ day, classes }`), `stats[]` (`value`, `label`). Kesin JSON biçimi ve sınırlar builder kararı;
`server/site.example.json` güncellenir, testler (`server/test/`) geçersiz ve eksik girdiyi de kapsar.
Bu, ders takip davranışına dokunmaz; mevcut testler aynen geçer.

Tua'nın içeriği (prototipteki metinler) repo dışındaki `studio-booking-brands/tua/site.json`'a yazılır.
Yerel demo (`notes/marka/demo/site.json`) için yalnızca deneme amaçlı birkaç alan eklenebilir.

## Doğrulama

- Her ekran tarayıcıda telefon (375px) ve masaüstü (1280px); **test veritabanında** (`DB_NAME=studio_booking_test`
  ile `server-demo` başlatma yapılandırması geçici eklenir, sonra `.claude/launch.json` geri alınır).
- İki model: demo stüdyosu grup modelinde ve paket modelinde (test veritabanında modeli değiştirerek) gezilir.
- Tema: demo (varsayılan palet) ve geçici deneme teması (ezmenin çalıştığını görmek için) bir kez kontrol edilir.
- Klavye: Tab ile gezilebilir, odak halkası görünür; pencereler Esc ile kapanır.
- `cd server && npm test`, `cd client && npm run lint && npm run build` yeşil.

## Builder'a kalanlar

- Kesin renk tonları (`--accent`, `--ink-faint`, `--line`), kontrast düzeltmeleri
- Masaüstü/telefon eşiği, yan menü genişliği
- Hangi yönetici mesajlarının toast olacağı (ilke yukarıda)
- Bugün istatistik kartlarında hangi sayılar
- `site.json` yeni alanlarının kesin biçimi ve sınırları
- PR 1'de site CSS'inin eski değişkenlerinin geçici olarak nasıl tutulacağı
- Görev sırası ve commit bölümleri (A yaklaşımı ve iki PR çerçevesinde)
