# Çoklu Stüdyo Temeli: Tasarım

**Tarih:** 6 Kasım 2026
**Durum:** İnceleme bekliyor
**Alt proje:** 1 / 5

## Amaç

Ürün, tek stüdyoya özel bir uygulamadan stüdyolara sunulan bir yazılıma (SaaS) dönüşüyor. Birincil hedef gerçek bir iş kurmak. Bu alt proje, aynı kurulumda birden çok stüdyonun güvenle çalışmasını sağlayan temeli kurar.

**Başarı ölçütleri:**

1. İki stüdyo kendi alt alan adlarından aynı anda çalışır.
2. Aynı telefon numarası iki stüdyoda ayrı hesap olabilir.
3. Bir stüdyonun kullanıcısı başka bir stüdyonun verisine hiçbir API ucundan erişemez ve bu testlerle kanıtlanır.
4. Mevcut müşteri ve yönetici akışları değişmeden çalışır.

## Alınan kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| Ürün modeli | Stüdyolara yazılım | Mevcut kodun doğal devamı; pazar yerine sonradan geçilebilir |
| Hesap modeli | Stüdyo başına ayrı hesap | Hesabı ve şifre sıfırlamayı stüdyo yönetir; ortak hesapta bir stüdyo diğerindeki hesaba erişim açabilirdi |
| Stüdyo adresi | Alt alan adı (`ornek.siteadi.com`) | Adres ürünün parçası; çerez her stüdyonun kendi adresinde kalır |

Bilinen bedel: Birden çok stüdyoya giden üye ya da birden çok stüdyoda çalışan eğitmen birden çok şifre kullanır.

## Alt projeler

1. **Çoklu stüdyo temeli** (bu belge)
2. Eğitmen rolü ve paneli, ek telafi dersi, WhatsApp duyurusu
3. Canlıya çıkış ve pilot (güvenlik, yedekleme, KVKK, sunucu)
4. Panelden içerik ve marka yönetimi
5. Stüdyo açma akışı, abonelik, üst yönetici

## Kapsam dışı

- Eğitmen rolü ve ek dersler (alt proje 2)
- Üretim sunucusu, DNS ve joker HTTPS sertifikası (alt proje 3)
- Panelden site içeriği düzenleme (alt proje 4)
- Stüdyo açma ekranı ve üst yönetici (alt proje 5); stüdyolar şimdilik komut satırından açılır
- Stüdyonun kendi alan adını kullanması
- Tek ortak hesap ve hesap birleştirme

## Veritabanı

Yeni migration: `013_multi_studio.sql`.

**`studios.slug`**

- Stüdyonun alt alan adı. `NOT NULL` ve `UNIQUE`.
- Biçim: küçük harf, rakam ve tire; 3–63 karakter; tireyle başlayıp bitemez. Kural: `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`.
- Ayrılmış adlar kabul edilmez: `www`, `api`, `admin`, `app`, `mail`, `static`, `assets`.
- Biçim ve ayrılmış adlar `CHECK` kısıtıyla veritabanında da uygulanır; hiçbir yol bu kuralları aşamaz.
- Mevcut satırlar `studio-<id>` değeriyle doldurulur, ardından `NOT NULL` uygulanır.

**`users` benzersizlik kuralları**

- `users_phone_unique` kaldırılır, yerine `UNIQUE (studio_id, phone)` gelir.
- `users_email_unique` kaldırılır, yerine `(studio_id, lower(email))` üzerinde benzersiz index gelir.

## Stüdyoyu belirleme

Yeni ortam değişkeni: `BASE_DOMAIN` (geliştirmede `localhost`, üretimde örneğin `siteadi.com`). Tanımlı değilse sunucu açılmaz ve anlaşılır bir hata verir. Kod bir varsayılan alan adı içermez.

Yeni `resolveStudio` ara katmanı `loadUser`'dan önce çalışır ve `req.hostname` değerini sınıflandırır:

| Adres | Sonuç |
|---|---|
| `BASE_DOMAIN` veya `www.BASE_DOMAIN` | `req.hostKind = 'root'`, `req.studio = null` |
| `<etiket>.BASE_DOMAIN`, kayıtlı stüdyo | `req.hostKind = 'studio'`, `req.studio` dolu |
| Diğer her şey (bilinmeyen slug, çok seviyeli alt alan, IP, başka alan adı) | `req.hostKind = 'unknown'`, `req.studio = null` |

Yeni `requireStudio` ara katmanı, `req.studio` yoksa `404 STUDIO_NOT_FOUND` döner. Bilinmeyen bir adres hiçbir zaman başka bir stüdyoya düşmez.

**API uçları:**

| Uç | Davranış |
|---|---|
| `/api/health` | Stüdyo gerektirmez |
| `GET /api/studio` | Kök adreste `200` ve `{ studio: null }`; bilinmeyen adreste `404`; stüdyo adresinde stüdyo bilgisi |
| `/api/site`, giriş, oturum, müşteri ve yönetici uçları | `requireStudio` ile korunur |

## Giriş ve oturum

**Giriş**

- `login` fonksiyonu `studioId` alır. Sorgu: `WHERE studio_id = $1 AND phone = $2`.
- Hatalı deneme sayacının anahtarı stüdyoyu da içerir: `<studioId>:<telefon>`. Böylece bir stüdyodaki denemeler aynı numaranın başka stüdyodaki hesabını kilitlemez.
- `createUser` çakışma kontrolü `ON CONFLICT (studio_id, phone)` olur.

**Oturum**

- `findSessionUser(token, studioId, { db })` biçimine geçer ve sorguya `u.studio_id = $2` eklenir. `studioId` zorunlu bir parametredir; denetimin unutulması bu yolla zorlaşır.
- `loadUser`, `req.studio` yoksa `req.user = null` yapar. Kullanıcının stüdyosu adresteki stüdyoyla eşleşmiyorsa oturum yok sayılır.
- Oturum çerezine `domain` verilmez, bu yüzden çerez alt alan adları arasında paylaşılmaz. Bu davranış testle sabitlenir.

## İçerik ve marka

- `/api/studio` ve `/api/site`, `LIMIT 1` yerine `req.studio` kullanır.
- Marka dosyaları stüdyo klasörlerine ayrılır: `BRAND_DIR/<slug>/`, içerik dosyası `BRAND_DIR/<slug>/site.json`.
- `/brand` adresi isteğin geldiği stüdyonun klasöründen sunulur. Stüdyo yoksa `404` döner. `logo_url` değerleri (`/brand/logo.png`) değişmez.
- Slug biçimi veritabanında sınırlı olduğu için klasör yolu güvenlidir; yine de yalnızca `req.studio.slug` kullanılır, istekten gelen bir değer yol oluşturmaz.

**Koddaki sabit metinler:**

| Yer | Değişiklik |
|---|---|
| `PublicSite.jsx:85` | Şehir ve hedef kitle içermeyen genel bir yedek metin |
| `PublicSite.jsx:213` | Şehir adı içermeyen yer tutucu |
| `PublicSite.jsx:22` ("Kadınlara özel" kartı) | Kartlar `site.json` içindeki isteğe bağlı `highlights` alanından gelir (`{ title, text }` listesi); alan yoksa hedef kitle iddiası içermeyen genel kartlar gösterilir |
| `index.html` başlık ve açıklama | Genel başlık ve açıklama; stüdyo bilgisi gelince sayfa başlığı stüdyo adına güncellenir |

## İstemci

- `/api/studio` yanıtına göre üç durum vardır: stüdyo adresi (bugünkü site ve uygulama), kök adres, bilinmeyen adres.
- **Kök adres:** Sade bir ürün sayfası.
- **Bilinmeyen adres:** "Stüdyo bulunamadı" ekranı.
- Bu iki yeni ekranın içeriği ve görünümü, kodlanmadan önce Pınar'la birlikte belirlenir.

## Araçlar ve geliştirme ortamı

- `create-admin` komutu slug alır: `npm run create-admin -- <slug> "Ad Soyad" "Telefon" ["Stüdyo Adı"]`. Slug varsa o stüdyoya yönetici ekler, yoksa stüdyoyu ayarlarıyla birlikte oluşturur.
- `seedDev` stüdyoyu `demo` slug'ıyla oluşturur.
- Vite proxy ayarı `changeOrigin: false` kullanır, böylece özgün adres Express'e ulaşır.
- `.env.example` dosyasına `BASE_DOMAIN` eklenir.
- README, yerel kullanım için `demo.localhost:5173` adresini ve yeni stüdyo yapısını anlatır.

## Hata davranışı

| Durum | Sonuç |
|---|---|
| `BASE_DOMAIN` tanımsız | Sunucu açılmaz |
| Bilinmeyen adres | `404 STUDIO_NOT_FOUND` |
| Kök adreste stüdyo gerektiren uç | `404 STUDIO_NOT_FOUND` |
| Başka stüdyoya ait oturum çerezi | Giriş yapılmamış sayılır (`401`) |
| Başka stüdyodaki numarayla giriş | Bugünkü genel hata (`INVALID_CREDENTIALS`); numaranın başka yerde kayıtlı olduğu sızmaz |
| Başka stüdyoya ait kayıt kimliği | Kaydın varlığını sızdırmayan yanıt (`404` ya da mevcut yetki hatası) |

## Testler

Test sunucusuna `http://<slug>.localhost:<port>` adresiyle gidilir. Node `fetch`'i özel `Host` başlığını dikkate almıyor, `*.localhost` adresleri ise geliştirme makinesinde çözülüyor (Node 26 ile denendi).

**Mevcut testler:**

- `createStudio` yardımcısı benzersiz bir slug üretir.
- HTTP istemci yardımcıları stüdyonun adresini kullanır.
- Mevcut testler yalnızca bu yardımcılar üzerinden uyarlanır; beklenen davranışları değişmez.

**Yeni testler:**

- **Adres çözümleme:** Kök, stüdyo ve bilinmeyen adres; büyük harfli adres; çok seviyeli alt alan.
- **Kimlik:** Aynı telefon iki stüdyoda ayrı hesap; stüdyo içinde tekrar reddedilir.
- **Giriş:** Doğru stüdyoda başarılı, diğerinde başarısız; bir stüdyodaki kilitlenme diğerini etkilemez.
- **Oturum:** A'nın çerezi B adresinde geçersiz; `Set-Cookie` yanıtında `Domain` yok.
- **Veri ayrımı:** İki stüdyolu kurulumda A yöneticisi ve A üyesi, B'nin üye, grup, ders, üyelik, ödeme ve ayar kayıtlarına erişemez. Test, her korumalı müşteri ve yönetici ucunu kapsar. Bulunan sızıntı bu alt projede düzeltilir.
- **İçerik:** `/api/site` ve `/brand` isteğin geldiği stüdyonun içeriğini döndürür.
- **Migration:** Slug biçimi ve ayrılmış adlar veritabanında reddedilir.

## Bilinen sınırlamalar

- Hatalı giriş sayacı sunucu belleğindedir; birden çok sunucuya geçilirse ortak depoya taşınmalıdır (alt proje 3).
- Üretimde ters vekil sunucunun özgün `Host` başlığını koruması ve yalnızca bilinen adresleri kabul etmesi gerekir (alt proje 3).
- Tanıtım sitesinin bölümleri hâlâ pilates odaklı ve ortak yapıdadır; stüdyoya özel düzenleme alt proje 4'te gelir.
- Bir stüdyonun adresini değiştirmek için ekran yoktur; ayrıca slug değişince eski adres çalışmaz.
