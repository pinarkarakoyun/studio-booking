# Üye Deneyimi ve Yönetici İyileştirmeleri: Tasarım

Tarih: 2026-11-27. Canlıya çıkıştan (yol haritası 7. adım) önceki son arayüz turu. Kararlar Pınar'ın 27 Kasım
tarihli cevaplarından alındı.

## 1. Kayan oturum süresi

- **Bugünkü durum:** Oturum girişten itibaren 30 gün geçerli ve kullanıldıkça uzamıyor. Her hafta gelen üyeden de
  ayda bir şifre isteniyor.
- **Yeni kural:** Oturum, kullanıldığı her gün 30 gün daha uzar. 30 gün boyunca hiç girmeyen kullanıcıdan şifre
  istenir. Bu kural bütün roller için aynıdır.
- **Uzatma günde en çok bir kez yazılır:** Kalan süre 29 günden azsa `expires_at = now() + 30 gün` yapılır. Böylece
  her istek veritabanına yazmaz.
- **Çerez yenilenir:** Tarayıcıdaki çerezin süresi girişte 30 gün olarak verilir. Sunucu oturumu uzattığında çerezi
  de aynı süreyle yeniden gönderir (`Set-Cookie`). Aksi halde veritabanında açık olan oturumun çerezi tarayıcıda
  silinir.
- **Değişmeyenler:** Çıkış yapmak, şifre değiştirmek ve "ayrıldı" işareti oturumu bugünkü gibi kapatır.

## 2. Telefon alanı

- Ortak bir `PhoneField` bileşeni yazılır: başta silinemeyen `0` durur, kullanıcı yalnızca 10 rakam yazar ve alan
  yazdıkça `0 (532) 123 45 67` biçimini alır. Örnek numara gösterilmez.
- Yapıştırılan `+90…`, `90…` ya da `0…` ile başlayan değer temizlenir, geriye 10 rakam kalır. Rakam olmayan
  karakterler atılır.
- `inputMode="numeric"`, `autoComplete="tel-national"`.
- Kullanıldığı yerler: giriş, yeni üye, yeni eğitmen. Ayarlardaki WhatsApp numarası yabancı numara da olabildiği
  için bugünkü gibi serbest kalır.
- Sunucu değişmez: `normalizePhone` her biçimi zaten kabul ediyor.

## 3. Üye ana ekranı ve "Üyeliğim" sayfası (seçenek A)

- **Ana ekran sırası:** selamlama, varsa uyarı şeridi, sıradaki ders, ek dersler, bu hafta / gelecek hafta /
  daha sonra.
- **Ana ekranda kalan küçük bilgi:**
  - Grup modelinde telafi hakkı varsa: "2 telafi hakkın var · Seç" satırı. Seçince bugünkü telafi seçici açılır.
  - Paket modelinde: "5 seans kaldı" satırı.
- **Uyarı şeridi** yalnızca gerektiğinde çıkar ve tek satırdır. Dokununca Üyeliğim açılır.
  - Üyelik bitişine 7 gün ya da daha az kaldıysa (stüdyonun `payment_reminder_days` ayarı) ya da üyelik bittiyse.
  - Paket bittiyse ya da son günü geçtiyse.
- **Üyeliğim sayfası:** Sağ üstteki ad düğmesi bugün çıkış penceresini açıyor; artık bu sayfayı açar. İçeriği:
  bugünkü `MembershipSummary` kartı (bitiş, paket halkası, ödemeler: stüdyo ayarı açıksa), şifre değiştir, çıkış yap.
- **Yeni uç yok:** Gerekli veri `/api/me/...` uçlarından zaten geliyor. Uyarı için gereken
  `payment_reminder_days` değeri `/api/studio` yanıtında yoksa oraya eklenir.

## 4. PWA (ana ekrana eklenebilir uygulama)

- Her stüdyonun kendi uygulama kimliği olur:
  - `/brand/manifest.webmanifest`, `theme.css` gibi sunucuda stüdyonun verisinden üretilir.
  - İçeriği: `name` (stüdyo adı), `short_name`, `start_url: "/giris"`, `display: "standalone"`, `theme_color` ve
    `background_color` (stüdyonun renklerinden), ikonlar.
- **İkonlar:**
  - `/brand/icon-192.png` ve `/brand/icon-512.png` stüdyonun marka klasöründen gelir.
  - Klasörde yoksa sunucudaki varsayılan ikon döner (sade, markasız). Stüdyo kurulurken Pınar ikonları klasöre koyar.
- **iOS için:** `apple-touch-icon`, `apple-mobile-web-app-capable` ve `apple-mobile-web-app-title` etiketleri
  eklenir. iOS manifestteki ikonu kullanmaz.
- **Service worker yok (ilk sürüm):**
  - Çevrimdışı önbellek yok. Eski ders listesinin önbellekten gösterilmesi gibi hataların riski taşınmaz.
  - Chrome ve Safari ana ekrana eklemek için artık service worker istemiyor. Bu, tarayıcıda doğrulanacak.
- **Kullanım kılavuzu ayrı iş:** Satıştan sonra Pınar ile birlikte hazırlanacak (ana ekrana ekleme, giriş, iptal,
  telafi). Bu tasarımın kapsamında değil.

## 5. Yönetici paneli: telefonda alt çubuk

- Gizli menü yapılmaz. Alt çubuk sadeleşir: **en fazla 5 yer**, her birinde ikon ve altında kısa etiket.
- **Yönetici:** Bugün, Müşteriler, Ödemeler, Analiz, **Daha fazla**.
  - Daha fazla, alttan bir pencere açar: Gruplar, Eğitmenler, Ayarlar.
  - Bu üç bölümden biri açıkken Daha fazla seçili görünür.
- **Eğitmen:** Yetkisine göre 1–3 sekmesi olur. "Daha fazla" çıkmaz, sekmeler doğrudan çubukta durur.
- İkonlar satır içi SVG olarak yazılır (kütüphane eklenmez), renkleri tema değişkenlerinden gelir.
- Masaüstündeki yan menü değişmez.

## 6. Görünüm: ekrandan renk seç (damlalık)

- Görünüm bölümündeki her renk alanının yanına bir "Ekrandan seç" düğmesi gelir. Tarayıcının `EyeDropper`
  özelliğini açar: yönetici stüdyonun web sitesini yan pencerede açıp istediği rengi tıklar, renk alana yazılır.
  Önizleme ve okunurluk denetimi bugünkü gibi çalışır.
- **Tarayıcı desteği:** Yalnızca masaüstü Chrome ve Edge destekliyor. Desteklemeyen tarayıcıda düğme gösterilmez,
  yerine kısa bir not çıkar: "Ekrandan renk seçmek için Chrome ya da Edge kullan."
- Seçimden vazgeçilirse (Esc) hiçbir şey değişmez ve hata gösterilmez.

## Kapsam dışı

Service worker ve çevrimdışı kullanım, bildirimler, kullanım kılavuzu metni, siteden otomatik renk çekme, logodan
renk çıkarma.
