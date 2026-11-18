# Çok Stüdyolu Ürün: Yol Haritası ve Kararlar

**Tarih:** 18 Kasım 2026
**Durum:** Onaylandı (Pınar)
**İlgili belgeler:**
- `docs/superpowers/specs/2026-11-06-multi-studio-foundation-design.md` (tenant temeli tasarımı)
- `docs/superpowers/plans/2026-11-06-multi-studio-foundation.md` (tenant temeli uygulama planı)

> **Not:** 6 Kasım tasarımındaki "Alt projeler" listesi (5 alt proje) bu belgedeki yol haritasıyla
> **güncellenmiştir**. Sıra ve kapsam için bu belge geçerlidir. 6 Kasım belgesinin geri kalanı
> (tenant temeli kararları) aynen geçerlidir.

## 1. Kararlar

### 1.1 Tenant (çok stüdyo)
- 6 Kasım tasarımı aynen geçerli: alt alan adı (`ornek.siteadi.com`), stüdyo başına ayrı hesap,
  bilinmeyen adres hiçbir stüdyoya düşmez (fail closed), veri ayrımı testlerle kanıtlanır.
- Genel yapı tüm stüdyolarda aynıdır. Stüdyoyu kişiselleştiren şeyler: renkler, logo, içerik (`site.json`), ayarlar.

### 1.2 Üyelik modeli: iki model de desteklenir
- **Grup + telafi** (bugünkü model) ve **seans paketi** (ör. 8 seans / 12 seans, kalan seans sayacı,
  paket geçerlilik süresi, geç iptalde seans yanması).
- Her stüdyonun bir "üyelik modeli" ayarı vardır. Bu ayar **kurulumda seçilir**, stüdyo yöneticisi
  değiştiremez (kullanım sırasında değişirse eski kayıtlar bozulur).
- Telafi ayarları yalnızca grup modelinde, paket ayarları yalnızca paket modelinde görünür.

### 1.3 Şubeler
- Bir stüdyonun birden çok şubesi olabilir (stüdyo → şubeler). Gruplar ve dersler bir şubeye bağlanır.
- Tek şubeli stüdyoda şube seçimi arayüzde görünmez.

### 1.4 Renkler ve logo
- Stüdyonun web sitesinden 2-3 renk kodu alınır, yönetim panelindeki "Görünüm" ayarına yazılır:
  **ana renk** ve **vurgu rengi** (gerekirse bir zemin rengi).
- Logo yalnızca PNG/WebP, en fazla 1 MB. SVG kabul edilmez (içinde kod taşıyabilir).
- Paneldeki diğer tonlar (açık zemin, çizgi, hover, koyu bant vb.) bu renklerden **otomatik türetilir**
  (CSS `color-mix()` ile). Bugünkü `theme.css`'teki ~30 değişkenin elle girilmesi kalkar.
- Kontrast kontrolü: buton yazısı okunmuyorsa (WCAG 4.5:1 altı) panel uyarı verir; yazı rengi
  (beyaz/koyu) otomatik seçilir.
- Renkler hem yönetici panelinde hem üye panelinde uygulanır.
- Bugünkü CSS değişken adları (`--violet`, `--pink` vb.) ilk stüdyonun renklerinden kalmadır; arayüz
  yenilenirken anlamlı adlara geçilir (`--brand`, `--accent`, `--surface` vb.).

### 1.5 Ayarlar
- İlk stüdyonun panelindeki **mevcut ayarların hiçbiri silinmez ya da değiştirilmez.**
- Eklenecekler: üyelik modeli (yalnızca kurulumda), paketler (ad, seans sayısı, fiyat, geçerlilik günü),
  geç iptalde seans yansın mı, şubeler, görünüm (renkler + logo), eğitmen yetkileri.
- Kapasite global ayar **olmaz**; bugünkü gibi her grubun kendi kapasitesi kalır.

### 1.6 Eğitmen rolü (sonraki aşama)
- Eğitmen yalnızca kendi derslerini ve katılımcılarını görür (6 Kasım kararı).
- Yoklama alır, kendi dersini iptal eder (sebep seçer; üyelere bildirim gider, seanslar iade edilir,
  yönetici bilgilendirilir).
- Üye, paket, ödeme ve ayar ekranları eğitmene kapalıdır. Yetkiler (ders iptali, yoklama, not ekleme)
  yönetici panelinden açılıp kapatılır.

### 1.7 Fiyatlar (karar bekliyor, 5. adımda verilecek)
- **Öneri (C):** Fiyatlar paketler tablosundan gelir; yönetici panelden değiştirir, site otomatik
  güncellenir (tek doğru kaynak). "Fiyatları sitede göster" anahtarı olur. Site metinleri ve fotoğrafları
  `site.json`'da kalır.
- **Alternatif (A):** Fiyat yalnızca `site.json`'dan değiştirilir.

### 1.8 Arayüz
- Üye ve yönetici panelleri, hazırlanan prototipin görünümüne çevrilir (krem zemin, serif başlıklar,
  yuvarlak kartlar, büyük dokunma alanları, toast bildirimleri, alttan açılan onay pencereleri).
- 4. adıma kadar arayüzde görsel değişiklik yapılmaz.

## 2. Yol haritası

Sıra bilerek böyledir: önce veritabanı ve backend, en son arayüz.

| Sıra | İş | Not |
|---|---|---|
| 0 | Commit edilmemiş değişiklikleri netleştir | Güvenlik düzeltmeleri (dinlenen adres, `TRUST_PROXY`, tablo sahibi rol) |
| 1 | **Tenant temeli** | Mevcut plan, Görev 1–6. Yalnızca backend + iki yeni istemci ekranı |
| 2 | Şubeler | Önce brainstorm → spec → plan |
| 3 | Seans paketi modeli + üyelik modeli ayarı | Önce brainstorm → spec → plan |
| 4 | Arayüzü prototipe çevirme | Yalnızca frontend |
| 5 | Görünüm ayarları (renk + logo) + fiyatların siteye bağlanması | Fiyat kararı bu adımda verilir |
| 6 | Eğitmen rolü ve paneli | 6 Kasım listesindeki alt proje 2 |
| 7 | Canlıya çıkış | Sunucu, `*.siteadi.com` DNS + HTTPS, KVKK. Kişisel veriler yurt dışına çıkmaz |

Her yeni alt proje için süreç: brainstorm → tasarım belgesi (spec) → onay → uygulama planı → uygulama.

### 6 Kasım listesiyle karşılaştırma

| 6 Kasım alt projesi | Yeni yeri |
|---|---|
| 1. Çoklu stüdyo temeli | 1 |
| 2. Eğitmen rolü ve paneli, ek telafi dersi, WhatsApp duyurusu | 6 (ek ders ve duyuru bu adımın kapsamında yeniden değerlendirilir) |
| 3. Canlıya çıkış ve pilot | 7 |
| 4. Panelden içerik ve marka yönetimi | 5 (renk + logo + fiyat); site metinleri `site.json`'da kalır |
| 5. Stüdyo açma akışı, abonelik, üst yönetici | Bu yol haritasında yok; stüdyolar komut satırından açılmaya devam eder |
| — | Yeni: 2 (şubeler), 3 (seans paketi), 4 (arayüz) |

## 3. Kod durumuyla ilgili notlar (18 Kasım)

- `logo_url` ve `brand_color` sütunları `studio_settings`'te değil, `studios` tablosundadır
  (migration `002`). `brand_color` bugün tek renk ve `#RRGGBB` biçiminde kısıtlı.
- `studio_id` sütunu doğrudan yalnızca `users`, `groups` ve `studio_settings` tablolarında var. `sessions`,
  `group_members`, `credits`, `freezes`, `memberships`, `payments` stüdyoya grup ya da kullanıcı üzerinden
  bağlanır. Veri ayrımı testi (tenant planı, Görev 4) bu dolaylı bağları da kapsar.
- Tema bugün tek bir `BRAND_DIR/theme.css` dosyasından gelir; tenant temeliyle marka dosyaları
  `BRAND_DIR/<slug>/` klasörlerine ayrılır, otomatik renk türetme 5. adımdadır.
