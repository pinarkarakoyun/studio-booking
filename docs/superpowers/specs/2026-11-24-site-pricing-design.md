# Sitede Fiyatlar — Kısa Tasarım

Tarih: 2026-11-24 · Yol haritası 5. adımın ikinci yarısı. Kararlar dosyasındaki 1.7'nin yerine geçer.

## Amaç ve neden
Bazı stüdyolar fiyatlarını sitede gösterir, bazıları göstermez. Sitenin içeriğini (metin, fotoğraf, fiyat)
Pınar aylık bakım hizmeti kapsamında yönetir: stüdyo değişikliği ona söyler, o günceller. Fiyatlar bu yüzden
diğer site içeriği gibi stüdyonun `site.json`'ına yazılır.

## Hedefler / hedef olmayanlar / başarısızlık
- **Hedef:** `site.json`'da isteğe bağlı bir `pricing` bölümü. Varsa sitede "Fiyatlar" bölümü ve menüde bağlantısı
  çıkar; yoksa hiçbir yerde görünmez. Grup ve paket modelinde aynı çalışır.
- **Hedef olmayan:** Fiyatın panelden (paket kataloğundan) gelmesi, panelde "fiyatları göster" anahtarı, online
  satış ya da ödeme.
- **Başarısızlık:** `site.json`'daki bir hata (eksik alan, yanlış tür) sitenin tamamını bozarsa; fiyat bölümü olmayan
  stüdyoda boş bir başlık ya da menü bağlantısı görünürse.

## Yaklaşımlar
| Yol | Artı | Eksi |
|---|---|---|
| **A) `site.json`'da fiyat bölümü** (seçilen) | Pınar'ın bakım modeline uyar; iki modelde çalışır; serbest metin ("Açılışa özel", "EN POPÜLER") | Paneldeki paket fiyatıyla sitedeki fiyat ayrı yerde: güncellerken ikisi birlikte değiştirilmeli |
| B) Fiyat katalogdan, etiketler `site.json`'dan | Panel ve site farklılaşamaz | Yalnızca paket modeli; grup için yine A; iki düzen; paket adı değişince eşleşme kopar |
| C) Panelde anahtar + katalog | Stüdyo kendisi yönetir | Yalnızca paket modeli; Pınar'ın içerik yönetimi yaklaşımına ters |

Pınar A'yı seçti (2026-11-24). İleride bir stüdyo fiyatı kendisi değiştirmek isterse A, B'ye büyütülebilir
(fiyat alanı boşsa katalogdan gelir); A'yı atmayı gerektirmez.

## Tasarım
`site.json`:
```json
"pricing": {
  "eyebrow": "Paketler",
  "title": "Sana uyan paketi seç",
  "note": "Fiyatlara KDV dahildir.",
  "plans": [
    { "name": "8 Seans", "price": "3.200 ₺", "detail": "Haftada 2 ders · 45 gün geçerli" },
    { "name": "12 Seans", "price": "4.200 ₺", "detail": "Haftada 3 ders", "badge": "EN POPÜLER", "highlight": true }
  ]
}
```
- **Sunucu** (`/api/site`, `readPricing`): `name` ve `price` zorunlu (metin, kırpılır); `detail`, `badge` isteğe bağlı;
  `badge` en fazla 20 karakter; `highlight` yalnızca `true` ise. En fazla 4 kart. Geçerli kart kalmazsa bölüm
  `null`. `eyebrow`, `title`, `note` isteğe bağlı metin. Diğer alanlar yanıta girmez. Testli (TDD).
- **Site** (`Pricing.jsx`): Eğitmen bölümünden sonra, "Nasıl işler"den önce. Üst başlık `eyebrow` ya da "Fiyatlar";
  başlık `title` ya da "Sana uyan paketi seç". Kartlar Dersler kartlarının kalıbında: ad, büyük serif fiyat,
  ayrıntı, varsa rozet; `highlight` kart koyu. Her kartta WhatsApp "Bilgi al" bağlantısı; mesaj sabit ve kartın
  adını içermez (ziyaretçinin seçimi hiçbir yere gönderilmez kuralı, Quiz ile aynı). Numara yoksa bağlantı yok.
  `note` kartların altında küçük yazı.
- **Menü:** `visibleSections`'a `fiyatlar` bölümü, etiket `eyebrow` ya da "Fiyatlar".
- **README:** `site.json` tablosuna `pricing` satırı; yol haritasında "Appearance settings" maddesi bu işle tamamlanır
  (logo yükleme ayrı madde olarak "later").
- **İçerik (repo dışı):** Tua'nın `site.json`'ına prototipteki iki paket (8 Seans 3.200 ₺, 12 Seans 4.200 ₺ "EN
  POPÜLER"); fiyatların açılış kampanyasından olduğu ve görüşmede güncelleneceği `_not`'a yazılır. Demo'ya deneme
  kartları.

## Kurucunun kararları (Pınar düzeltebilir)
- Fiyat düz metin (sayı değil): her biçim yazılabilsin.
- Ayrı bir "göster" anahtarı yok: bölümün dosyada olması göstermek demek.
- Bölümün yeri Eğitmen'den sonra (prototipteki sıra); en fazla 4 kart.
- "Bilgi al" mesajı sabit: "Merhaba, paketleriniz hakkında bilgi almak istiyorum."
