# Görünüm Ayarları (Renkler) — Tasarım

Tarih: 2026-11-24 · Yol haritası 5. adımın ilk yarısı (fiyatlar ayrı bir tasarımda ele alınacak).
İlgili kararlar: `2026-11-18-roadmap-and-decisions.md` bölüm 1.4 ve 1.5.

## 1. Amaç ve neden

Bugün her stüdyonun renkleri, marka klasöründeki `theme.css` dosyasına elle yazılan 13–20 CSS
değişkeniyle veriliyor. Her yeni stüdyo için bunu elle yapmak yavaş, hataya açık ve okunurluk
kontrolü yapılmıyor. Bu adımda yönetici panelinde bir **Görünüm** bölümü olacak: yalnızca **ana renk** ve
**vurgu rengi** girilir, diğer bütün tonlar bu iki renkten otomatik türetilir ve okunurluk denetlenir.

Kim kullanır: yeni stüdyoyu kurarken Pınar (o stüdyonun yönetici hesabıyla; sistemde ayrı bir "süper
yönetici" yok), sonradan stüdyo sahibi. Renkler seyrek değişir; ekran sade olmalı.

## 2. Hedefler, hedef olmayanlar, başarısızlık sayılacaklar

**Hedefler**
- Ayarlar sayfasında "Görünüm" kartı: ana renk ve vurgu rengi (hex), küçük önizleme, okunurluk uyarısı,
  "Varsayılana dön", "Kaydet".
- Renkler üye paneli, yönetici paneli ve tanıtım sitesinde geçerli (hepsi `client/src/index.css`'teki rol
  değişkenlerini kullanıyor; ekranlara tek tek dokunulmaz).
- Sayfa ilk anından stüdyonun rengiyle açılır (varsayılan renklerin bir an görünüp değişmesi yok).
- Renk girilmemiş stüdyo bugünkü krem/zeytin varsayılan paletiyle aynen görünür.
- Tema dosyası olmayan stüdyoda bugün konsolda çıkan `/brand/theme.css` 404 / MIME hatası kalkar.

**Hedef olmayanlar (bu adımda yok)**
- Panelden logo yükleme. Logo bugünkü gibi marka klasöründe kalır (`studios.logo_url`). Yükleme altyapısı
  7. adımda (canlıya çıkış, depolama) birlikte düşünülecek.
- Yazı tipi, köşe yuvarlaklığı, zemin rengi seçimi; karanlık mod.
- Fiyatların siteye bağlanması (ayrı tasarım).

**Başarısızlık sayılacaklar (çalışsa bile)**
- Bir stüdyonun rengi başka bir stüdyonun sayfasına sızması.
- Kaydedilen rengin önbellek yüzünden saatlerce görünmemesi.
- Okunurluk denetimi yüzünden kaydetmenin engellenmesi (uyarı verir, engellemez).
- Varsayılan paletli stüdyolarda (bugünkü demo ve Tua) görünümün değişmesi.
- Kullanıcının girdiği bir değerin CSS'e süzülmeden yazılması (CSS enjeksiyonu).

## 3. Kısıtlar

- Güvenlik başlıkları `style-src 'self'`: satır içi `<style>` ve `style=""` ile tema verilemez. Tema bir CSS
  dosyası olarak gelmeli.
- `client/index.html` `<link rel="stylesheet" href="/brand/theme.css">` satırıyla temayı zaten en başta istiyor;
  dosya `html:root` seçicisini kullanmalı (uygulama CSS'i sonra yüklense de geçerli kalsın).
- `/brand` bugün `express.static` ile marka klasöründen ve `maxAge: '1d'` ile sunuluyor (`server/src/app.js`).
  Üretilen tema bu önbellek kuralına tabi olmamalı.
- Stüdyo isteğin adresinden bulunur (`resolveStudio`); tema yalnızca o stüdyonun verisinden üretilir.
- Okunurluk eşiği WCAG AA: normal yazı için 4.5:1 (README'deki "UI conventions" ile aynı).
- Projede kural mantığı sunucuda ve önce testi yazılarak geliştirilir (TDD).

## 4. Yaklaşımlar

| Yol | Nasıl | Artı | Eksi |
|---|---|---|---|
| **A) Sunucu `theme.css`'i veritabanından üretir** (seçilen) | İki renk veritabanında; `/brand/theme.css` isteğinde sunucu bütün tonları hex olarak hesaplar ve CSS döner | İlk anda doğru renk; hesap tek yerde, birim testli; CSP ile uyumlu; 404 hatası kalkar | Önbellek ayarı dikkat ister |
| B) Sunucu iki rengi yazar, tonları CSS `color-mix()` hesaplar | Kısa CSS, tarayıcı hesaplar | Sunucuda az kod | Yazı rengini okunurluğa göre CSS seçemez, hesap ikiye bölünür; eski tarayıcı desteği |
| C) İstemci `/api/studio`'dan renkleri alıp JS ile uygular | Dosya üretimi yok | Basit sunucu | Her açılışta renk bir an değişir; hesap sunucu testlerinin dışında |

**Pınar A'yı seçti** (2026-11-24): sayfa ilk anından doğru renkle açılıyor, hesap tek yerde ve test
edilebilir, güvenlik başlıklarıyla çakışmıyor.

## 5. Kararlaştırılan tasarım

### 5.1 Veri
- `studios.brand_color` sütunu zaten var (`^#[0-9A-Fa-f]{6}$` CHECK'li, bugün kullanılmıyor): **ana renk**.
- Yeni migration (018): `studios.accent_color text` aynı CHECK ile: **vurgu rengi**.
- Aynı migration mevcut bütün satırlarda `brand_color`'ı `NULL` yapar. Sebep: sütun bugün hiçbir ekranda
  kullanılmıyor ama demo betiği bazı stüdyolara değer yazmış olabilir (ör. Tua'nın demo dosyasında
  `"brandColor": "#5b5a2e"`). Sıfırlanmazsa bu stüdyolar yeni tema yayına girdiği anda sessizce başka renge
  geçer. Sıfırlamak görünür hiçbir şeyi kaybettirmez. *(Kurucu kararı, builder check sonrası.)*
- `seedDev.js` / `DEMO_SEED_FILE`: `studio.brandColor` almaya devam eder, `studio.accentColor` da eklenir;
  demo dosyasında bilerek verilen renk uygulanır.
- İkisi de `NULL` olabilir. `NULL` = o renk için varsayılan. "Varsayılana dön" ikisini `NULL` yapar.
- Renkler küçük harfli hex olarak saklanır (biçim tek olsun).

### 5.2 Renk hesabı (sunucu, saf modül)
- Yeni modül (ör. `server/src/theme/palette.js`): girdi `{ brand, accent }` (hex ya da null), çıktı
  `{ vars: { '--brand': '#…', … }, warnings: [...] }`. Veritabanına ve Express'e bağlı değil; birim testli.
- Türetilen değişkenler (`client/src/index.css`'teki rol adları):
  - Ana renkten: `--brand`, `--brand-strong` (koyusu: koyu bantlar, yan menü, `--ink` ile aynı aile),
    `--brand-soft` (açığı), `--on-brand` ve `--on-brand-soft` (ana renk / koyu yüzey üstündeki yazı).
  - Vurgudan: `--accent`, `--accent-text` (açık zeminde okunacak kadar koyu), `--accent-hover`,
    `--accent-disabled`.
  - Zeminler ana renge çok hafif tonlanır: `--surface`, `--surface-raised`, `--surface-sunken`, `--line`,
    `--line-strong`, ve yazılar `--ink`, `--ink-soft`, `--ink-faint` (ana rengin çok koyu / gri tonları).
  - Sabit kalanlar (türetilmez): `--danger`, `--on-danger`, `--warning`, `--control-off`, yazı tipleri, boşluklar,
    yarıçaplar.
- Okunurluk kuralları (hepsi 4.5:1, `--ink-faint` hariç; o README'deki gibi ikincil yazı içindir):
  - `--on-brand` beyaza yakın krem ya da koyu tondan **hangisi `--brand` üzerinde daha okunursa** o seçilir.
    İkisi de 4.5:1'e ulaşamıyorsa daha iyisi seçilir ve uyarı eklenir.
  - `--on-brand` `--brand-strong` üzerinde de okunur olmalı.
  - `--accent-text`, `--surface` ve `--surface-raised` üzerinde 4.5:1'i geçene kadar koyulaştırılır;
    vurgu çok açıksa uyarı eklenir ("Vurgu rengi açık zeminde zor okunur; yazılarda koyusu kullanılacak").
  - `--ink` ve `--ink-soft`, üç zemin üzerinde 4.5:1'i geçmeli (zemin tonlaması bunu bozmayacak kadar hafif).
- Uyarılar Türkçe, kullanıcıya gösterilecek kısa cümlelerdir. Uyarı kaydetmeyi engellemez.

### 5.3 Üretilen tema dosyası
- `GET /brand/theme.css` artık dosyadan değil, isteğin stüdyosunun renklerinden üretilir. Bu yol, `/brand`
  static middleware'inden **önce** tanımlanır; marka klasöründeki elle yazılmış `theme.css` artık okunmaz.
- İki renk de `NULL` ise: boş (yalnızca yorum içeren) geçerli bir CSS döner, `200`, `Content-Type: text/css`.
  Varsayılan renkler `index.css`'ten gelir. (Konsoldaki 404/MIME hatası böylece kalkar.)
- Stüdyo bulunamadıysa (kök adres, bilinmeyen stüdyo) de boş CSS döner, `200`.
- Çıktı yalnızca 5.2'deki sabit değişken adlarını ve hesaplanmış `#rrggbb` değerlerini içerir; veritabanındaki
  metin olduğu gibi CSS'e yazılmaz.
- Önbellek: tarayıcı her açılışta sunucuya sorar ama değişmediyse dosyayı yeniden indirmez
  (`Cache-Control: no-cache` + `ETag`; ETag renklerden ve palet algoritmasının sürüm numarasından türetilir,
böylece ton hesabı ileride değişirse tarayıcılar yeni tonları alır). Kaydedilen renk bir sonraki sayfa
  açılışında görünür.

### 5.4 Yönetici API'si
- Renkler okuma ve kaydetme: yalnızca yönetici. Mevcut `GET/PUT /api/admin/settings` yanıtına
  `brandColor` ve `accentColor` eklenir **ya da** ayrı `GET/PUT /api/admin/appearance` açılır (bkz. 6).
- Kaydetme doğrulaması: her alan `null` ya da `#rrggbb` (büyük/küçük harf kabul, küçük harfe çevrilir);
  değilse `400 INVALID_COLOR`. Kaydetme yanıtı, kaydedilen renklerin uyarılarını da döner.
- Önizleme: `POST /api/admin/appearance/preview` `{ brandColor, accentColor }` alır, veritabanına yazmadan
  5.2'nin çıktısını (`vars`, `warnings`) döner. Hesap tek yerde kalsın diye istemci renk hesaplamaz.

### 5.5 Panel ekranı
Ayarlar sayfasında, mevcut "Stüdyo" kartının yanında yeni **Görünüm** kartı (diğer kartlarla aynı düzen):

```
Görünüm
Ana renk     [■] [#4b5530]
Vurgu rengi  [■] [#826330]

Önizleme   ┌──────────────┐  [ Birincil buton ]  Vurgu yazısı
           │ Koyu kart    │
           └──────────────┘
⚠ Bu renkte buton yazısı zor okunur; yazı rengi otomatik seçildi.

Logo marka klasöründen gelir.            [Varsayılana dön]  [Kaydet]
```

- Her renk için tarayıcının renk seçicisi (`<input type="color">`) ve yanında hex metin kutusu; ikisi
  birbirini günceller. Boş kutu = varsayılan.
- Önizleme kutusu, önizleme isteğinden gelen değişkenleri yalnızca kendi içinde uygular (CSSOM ile
  `element.style.setProperty`; CSP bunu engellemez). Değer değiştikçe kısa bir gecikmeyle istek atılır.
- Kaydedince başarı toast'u: "Renkler kaydedildi. Sayfayı yenileyince her ekranda görünür." Panelin kendisi
  de yenilemeden yeni renge geçebilir (kapsam: kurucunun kararı, bkz. 6).
- "Varsayılana dön" bir onay penceresiyle iki rengi `null` yapar.

### 5.6 Mevcut stüdyolar
- Demo ve Tua bugün varsayılan paletle görünüyor (Tua'nın `theme.css`'i varsayılanla aynı); migration 018'den
  sonra renkleri `NULL`, görünüm değişmez.
- Marka klasörlerindeki `theme.css` dosyaları artık kullanılmaz; silinmeleri Pınar'a bırakılır (repo dışında).
  Bugün var olan tek dosya Tua'nınki ve yalnızca varsayılan renkleri tekrar ediyor (yazı tipi ya da yarıçap
  vermiyor), yani okunmaması bir şey kaybettirmez.
- README'deki "Studio branding" ve "UI conventions" bölümleri yeni düzene göre güncellenir (`theme.css` artık
  panelden üretiliyor).

## 6. Kurucuya bırakılanlar
- Ton türetme algoritmasının ayrıntısı (HSL / OKLCH, karışım oranları), 5.2'deki okunurluk kuralları ve
  "varsayılan renk girilince sonuç varsayılan palete çok yakın olmalı" ilkesi korunarak.
- API'nin mevcut ayarlar ucuna mı yoksa ayrı `/api/admin/appearance` ucuna mı ekleneceği.
- Önizleme isteğinin gecikme süresi ve hız sınırı.
- Kaydettikten sonra panelin sayfa yenilemeden yeni renge geçip geçmeyeceği.
- Test dağılımı: palet modülü için birim testleri; tema ucu, doğrulama, stüdyolar arası ayrım ve önbellek
  başlıkları için API testleri.
