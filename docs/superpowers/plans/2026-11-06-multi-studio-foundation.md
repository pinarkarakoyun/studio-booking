# Çoklu Stüdyo Temeli: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aynı kurulumda birden çok stüdyonun kendi alt alan adından, birbirinin verisine erişemeden çalışmasını sağlamak.

**Architecture:** İstekteki adres `req.studio` değerine çözülür. Giriş ve oturum bu stüdyoyla sınırlanır, böylece mevcut `req.user.studio_id` denetimleri doğru stüdyoya bağlı kalır. Veri ayrımı, iki stüdyolu testlerle uç uç kanıtlanır.

**Tech Stack:** Node.js, Express 5, PostgreSQL (`pg`, numaralı SQL migration), React 19 (Vite), Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-06-multi-studio-foundation-design.md`

## Global Constraints

- Slug kuralı: `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$`
- Ayrılmış slug'lar: `www`, `api`, `admin`, `app`, `mail`, `static`, `assets`
- Stüdyo gerektiren uçta stüdyo yoksa: `404`, kod `STUDIO_NOT_FOUND`
- Bilinmeyen adres hiçbir zaman başka bir stüdyoya düşmez; `LIMIT 1` ile stüdyo seçimi kalmaz.
- Oturum çerezine `domain` verilmez.
- Kod içinde varsayılan alan adı, gerçek stüdyo adı veya şehir yazılmaz.
- Kod yorumları ve kullanıcı metinleri Türkçe, mevcut dosyaların biçimine uygun.
- **Commit'leri Pınar yapar.** Her görevin sonunda çalıştırılmaz, mesaj önerilir.
- **Tasarım kararları Pınar'a sorulur.** Görev 6'daki onay adımı atlanmaz.
- Her görevden sonra özel günlüğe kayıt eklenir: repo dışındaki not klasöründe `PROJE_GUNLUGU.md` (repoya girmez).

**Testleri çalıştırmak (PostgreSQL açık olmalı, `docker compose up -d`):**

- Tümü: `cd server && npm test`
- Tek dosya: `cd server && npm run pretest && DB_NAME=studio_booking_test BASE_DOMAIN=localhost BCRYPT_COST=4 node --test test/<dosya>.test.js`

## Review Focus

- Sonunda nokta olan adres (`ornek.localhost.`): `unknown` sayılır, sunucu hata vermez. Test: Görev 2.
- Aynı numara iki stüdyodayken A yöneticisinin şifre sıfırlaması: B'deki hesabın şifresi ve oturumları değişmez. Test: Görev 4.
- `create-admin` komutuna geçersiz slug verilmesi (`Ornek`, `admin`): ham veritabanı hatası yerine anlaşılır mesaj. Doğrulama: Görev 5.
- API yanıt vermezken uygulamanın açılması: "Stüdyo bulunamadı" gösterilmez. Doğrulama: Görev 6.
- Kök adreste `/giris` açılması: giriş formu yerine kök sayfa gösterilir, çünkü giriş için stüdyo gerekir. Doğrulama: Görev 6.

---

### Görev 1: Veritabanı

**Files:**
- Create: `server/db/migrations/013_multi_studio.sql`
- Modify: `server/src/services/auth.js:208`, `server/test/helpers.js:20-44`
- Test: `server/test/multiStudio.test.js`

**Interfaces:**
- Produces: `studios.slug`; `UNIQUE (studio_id, phone)`; `createStudio(settings = {})` ayrıca `settings.slug` kabul eder ve varsayılan slug'ı `test-<sıradaki id>` üretir. İlk stüdyo `test-1` olur (`resetDb` kimlikleri sıfırlar).

- [ ] **Adım 1: Başarısız testleri yaz**

`describe('multi-studio schema')` altında:
- `same phone can exist in two studios`: Aynı telefonla iki stüdyoda `createUser` ikisi de id döner.
- `same phone in one studio is still rejected`: `auth.test.js:192-195` içindeki mevcut davranış korunur.
- `same email is allowed across studios, rejected within one`: Doğrudan SQL ile.
- `slug rules are enforced by the database`: `Ornek`, `ab`, `-ornek`, `ornek-`, `www`, `admin` için `INSERT` hata verir; `ornek-pilates` geçer.
- `slug is unique`: İkinci `ornek` hata verir.

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Tek dosya komutu. Beklenen: `slug` sütunu bulunamadı hatası.

- [ ] **Adım 3: Migration'ı yaz**

Sırayla: `slug` sütununu `NULL` olabilir ekle; mevcut satırları `'studio-' || id` ile doldur; `NOT NULL` ve `UNIQUE` uygula; Global Constraints'teki biçim ve ayrılmış adlar için `CHECK` ekle; `users_phone_unique` kısıtını kaldırıp `UNIQUE (studio_id, phone)` ekle; `users_email_unique` index'ini kaldırıp `(studio_id, lower(email))` üzerinde benzersiz index oluştur.

- [ ] **Adım 4: Kodu uyarla**

`createUser` içinde `ON CONFLICT (studio_id, phone) DO NOTHING`. `createStudio` yardımcısında slug: `settings.slug ?? 'test-' + (mevcut stüdyo sayısı + 1)`.

- [ ] **Adım 5: Doğrula**

`cd server && npm test`. Beklenen: yeni testler ve mevcut testlerin tümü geçer.

- [ ] **Adım 6: Commit mesajı öner:** `feat(db): add studio slugs and scope user identity to a studio`

---

### Görev 2: Adresten stüdyo belirleme

**Files:**
- Create: `server/src/middleware/studio.js`
- Modify: `server/src/app.js`, `server/src/routes/studio.js`, `server/test/http.js`, `server/test/site.test.js`, `server/package.json:15`, `server/.env.example`
- Test: `server/test/studioHost.test.js`

**Interfaces:**
- Produces:
  - `classifyHost(hostname: string, baseDomain: string) -> { kind: 'root' } | { kind: 'studio', slug: string } | { kind: 'unknown' }`
  - `resolveStudio` ara katmanı: `req.hostKind` (`'root' | 'studio' | 'unknown'`) ve `req.studio` (`{ id, slug }` ya da `null`). Slug kayıtlı değilse `hostKind` `'unknown'` olur.
  - `requireStudio` ara katmanı: `req.studio` yoksa `AppError('STUDIO_NOT_FOUND', 'Stüdyo bulunamadı.', 404)`.
  - Test istemcisi: `client(cookie = null, { host = 'test-1.localhost' } = {})`. `clientFor(userId)` kullanıcının slug'ını veritabanından okuyup doğru adresi kullanır.

- [ ] **Adım 1: Başarısız testleri yaz**

`classifyHost` için, `baseDomain` `siteadi.com` iken:

| Girdi | Beklenen |
|---|---|
| `siteadi.com`, `www.siteadi.com`, `SITEADI.com` | `root` |
| `ornek.siteadi.com`, `ORNEK.siteadi.com` | `studio`, slug `ornek` |
| `a.b.siteadi.com` | `unknown` |
| `ornek.siteadi.com.` | `unknown` |
| `sahte-siteadi.com`, `ornek.baska.com`, `127.0.0.1` | `unknown` |

HTTP testleri:
- `root host`: `GET /api/studio` için `200`, `{ studio: null }`; `GET /api/site` için `404 STUDIO_NOT_FOUND`.
- `unknown slug`: `yok.localhost` için `/api/studio` ve `/api/site` `404`; ilk stüdyonun verisi dönmez.
- `each host gets its own studio`: Adları farklı iki stüdyonun `/api/studio` ve `/api/site` yanıtları kendi adını taşır.
- `health works on any host`: `localhost` ve `yok.localhost` üzerinde `/api/health` `200`.
- `createApp fails without BASE_DOMAIN`: Değişken silinince `assert.throws(() => createApp(), /BASE_DOMAIN/)`; sonra geri yüklenir.
- `brand files are per studio`: Geçici `BRAND_DIR/<slug>/logo.png` dosyaları; her adres kendi dosyasını alır, A adresinden B'nin dosya adı `404` döner; kök adreste `/brand/logo.png` `404`.
- `site.json is per studio`: `BRAND_DIR/<slug>/site.json` içindeki metin yalnızca o stüdyonun `/api/site` yanıtında çıkar.

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Beklenen: `middleware/studio.js` bulunamadı hatası.

- [ ] **Adım 3: `classifyHost`, `resolveStudio` ve `requireStudio` fonksiyonlarını yaz**

`resolveStudio`, `process.env.BASE_DOMAIN` ve `req.hostname` kullanır; sorgu `SELECT id, slug FROM studios WHERE slug = $1`.

- [ ] **Adım 4: `app.js` sırasını kur**

`createApp` başında `BASE_DOMAIN` yoksa `Error` fırlatır. Sıra: `express.json`, `cookieParser`, `resolveStudio`, `loadUser`, `/brand`, `healthRouter`, `studioRouter`, `requireStudio`, `authRouter`, `sessionsRouter`, `adminRouter`.

`/brand`: `BRAND_DIR` yoksa ya da `req.studio` yoksa `404`; varsa `express.static(path.join(BRAND_DIR, req.studio.slug), { maxAge: '1d', fallthrough: false })`. Klasör yolu istek başına hesaplanır.

- [ ] **Adım 5: `routes/studio.js` dosyasını güncelle**

- `/api/studio`: `hostKind` `unknown` ise `STUDIO_NOT_FOUND`; `root` ise `{ studio: null }`; aksi halde `WHERE st.id = $1` ile `req.studio.id`.
- `/api/site`: Önüne `requireStudio`; aynı `WHERE`; `readSiteFile(req.studio.slug)` dosyayı `BRAND_DIR/<slug>/site.json` yolundan okur.
- Dosya başındaki "şimdilik tek stüdyo" yorumu kaldırılır.

- [ ] **Adım 6: Test altyapısını güncelle**

`http.js`: İstekler `http://${host}:${port}` adresine gider; `getBaseUrl(host = 'test-1.localhost')` da aynı adresi döner (`auth.test.js:202` bunu kullanıyor). `package.json` test komutuna `BASE_DOMAIN=localhost` eklenir. `site.test.js` dosya yollarını `BRAND_DIR/test-1/` yapısına geçirir. `server/.env.example` dosyasına açıklamasıyla `BASE_DOMAIN=localhost` eklenir, `BRAND_DIR` açıklaması yeni yapıyı anlatır.

- [ ] **Adım 7: Doğrula**

`cd server && npm test`. Beklenen: tümü geçer.

- [ ] **Adım 8: Commit mesajı öner:** `feat(server): resolve the studio from the request host`

---

### Görev 3: Giriş ve oturumu stüdyoyla sınırlama

**Files:**
- Modify: `server/src/services/auth.js:92-106,123-158`, `server/src/middleware/auth.js:9-13`, `server/src/routes/auth.js:28-32`, `server/test/adminCustomers.test.js:95`
- Test: `server/test/multiStudio.test.js`

**Interfaces:**
- Consumes: Görev 2'deki `req.studio`, test istemcisi `host` seçeneği.
- Produces:
  - `login({ studioId, phone, password }, { db } = {})`
  - `findSessionUser(token, studioId, { db } = {})`; `studioId` boşsa `null` döner.

- [ ] **Adım 1: Başarısız testleri yaz**

İki stüdyo, aynı numarada iki kullanıcı, farklı şifreler:
- `login uses the account of the current studio`: Her adres kendi şifresiyle kendi kullanıcısını açar; `me` doğru kişiyi döner.
- `login with the other studio's password fails`: `401 INVALID_CREDENTIALS`; yanıt, kayıtlı olmayan numarayla aynıdır.
- `number registered only in the other studio fails the same way`: Aynı kod ve mesaj.
- `failed attempts are counted per studio`: A'da hesap kilitlenecek kadar yanlış deneme sonrasında B'de doğru şifreyle giriş başarılı.
- `session cookie of A is ignored on B`: A'nın çerezi B adresinde `/api/auth/me` için `401`; A adresinde `200`.
- `session cookie is ignored on the root host`: Kök adreste `/api/auth/me` `404 STUDIO_NOT_FOUND`.
- `session cookie has no Domain attribute`: `assert.doesNotMatch(res.setCookie, /domain=/i)`.

- [ ] **Adım 2: Testin başarısız olduğunu gör**

Beklenen: `session cookie of A is ignored on B` ve giriş testleri başarısız.

- [ ] **Adım 3: Servisleri güncelle**

- `findSessionUser` sorgusuna `AND u.studio_id = $2`.
- `login` sorgusu `WHERE studio_id = $1 AND phone = $2`; `attemptKey`, `` `${studioId}:${normalized ?? String(phone)}` ``.
- `loadUser`: `findSessionUser(req.sessionToken, req.studio?.id)`.
- Giriş rotası `studioId: req.studio.id` geçirir.
- `adminCustomers.test.js:95` yeni imzayı kullanır.

- [ ] **Adım 4: Doğrula**

`cd server && npm test`. Beklenen: tümü geçer.

- [ ] **Adım 5: Commit mesajı öner:** `feat(auth): scope login and sessions to the current studio`

---

### Görev 4: Veri ayrımı kanıtı

**Files:**
- Create: `server/test/studioIsolation.test.js`
- Modify: Testlerin ortaya çıkardığı sızıntıya göre `server/src/services/*.js`

**Interfaces:**
- Consumes: `clientFor`, `createStudio`, `createGroup`, `createSession`, `createAdmin`.

Kurulum: Stüdyo A ve B; her birinde yönetici, üye, grup, ders, üyelik dönemi ve ödeme. B'nin kayıtları ayırt edici adlar taşır (`B-GIZLI-...`).

- [ ] **Adım 1: Kimlik içeren uçlar için tablo testi yaz**

A yöneticisi B'nin kimlikleriyle `routes/admin.js` içindeki `:id` içeren her ucu, A üyesi `routes/sessions.js` içindeki her `:id` ucunu çağırır. Her satır için:
- Durum `400` ya da üstü, `500` değil.
- Yanıt gövdesi `B-GIZLI` içermez.
- B'nin kayıtları değişmez: İstekten önce ve sonra `users`, `groups`, `sessions`, `credits`, `freezes`, `memberships`, `payments` tablolarının B'ye ait satırları birebir aynıdır.

- [ ] **Adım 2: Gövdeyle gelen kimlikleri test et**

- A'nın dersine B'nin üyesini eklemek (`POST /api/admin/sessions/:id/attendees`)
- A'nın üyesini B'nin grubuna taşımak (`change-group`)
- B'nin grubuyla yeni üye açmak (`POST /api/admin/customers`)
- Üyenin `swap` hedefi olarak B'nin dersini vermesi

Her biri reddedilir ve hiçbir veri değişmez.

- [ ] **Adım 3: Liste uçlarını test et**

`today`, `day`, `customers`, `groups`, `payments`, `settings`, `/api/sessions` ve `/api/me/*` yanıtları `B-GIZLI` içermez.

- [ ] **Adım 4: Şifre sıfırlama testini yaz**

`password reset in A does not touch the same number in B`: Aynı numara iki stüdyoda; A yöneticisi kendi üyesinin şifresini sıfırlar. B hesabı eski şifresiyle girer ve açık oturumu çalışmaya devam eder.

- [ ] **Adım 5: Yeni uçların unutulmasını önleyen testi yaz**

`every id route is in the matrix`: `adminRouter.stack` ve `sessionsRouter.stack` katmanlarından `:id` içeren `yöntem + yol` listesi çıkarılır ve tablodaki listeyle `assert.deepEqual` ile karşılaştırılır. Yeni bir uç eklenince bu test başarısız olur.

- [ ] **Adım 6: Çalıştır ve sonucu kaydet**

Tek dosya komutu. Başarısız her satır gerçek bir sızıntıdır. Tek tek Pınar'a bildirilir ve günlüğe yazılır.

- [ ] **Adım 7: Bulunan sızıntıları düzelt**

Düzeltme, ilgili servis sorgusuna `studio_id` koşulu eklemektir. Testi gevşetmek çözüm değildir. Sızıntı yoksa bu adım atlanır ve bu sonuç raporlanır.

- [ ] **Adım 8: Doğrula**

`cd server && npm test`. Beklenen: tümü geçer.

- [ ] **Adım 9: Commit mesajı öner:** `test: prove data isolation between studios across all endpoints`

---

### Görev 5: Araçlar ve geliştirme ortamı

**Files:**
- Modify: `server/src/scripts/createAdmin.js`, `server/src/scripts/seedDev.js:46`, `client/vite.config.js`, `README.md`

**Interfaces:**
- Produces: `npm run create-admin -- <slug> "Ad Soyad" "Telefon" ["Stüdyo Adı"]`; demo stüdyosunun adresi `demo.localhost:5173`.

- [ ] **Adım 1: `createAdmin.js` dosyasını güncelle**

Slug ile `SELECT id FROM studios WHERE slug = $1`; yoksa stüdyo ve ayar satırı oluşturulur, adres ekrana yazılır. Slug, veritabanından önce Global Constraints kurallarıyla denetlenir.

- [ ] **Adım 2: `seedDev.js` dosyasını güncelle**

`INSERT INTO studios (name, slug, whatsapp_phone)` ile slug `demo`. Bitiş mesajı `http://demo.localhost:5173/` adresini yazar.

- [ ] **Adım 3: Vite proxy'yi güncelle**

`/api` ve `/brand` için `{ target: 'http://localhost:3000', changeOrigin: false }`.

- [ ] **Adım 4: README'yi güncelle**

Kurulum adımları (`server/.env` içinde `BASE_DOMAIN=localhost`, `demo.localhost:5173`), "Studio branding" bölümündeki `BRAND_DIR/<slug>/` yapısı, "Key design decisions" bölümüne alt alan adı ve stüdyo başına hesap kararı. "Not in the first version" listesinden çoklu stüdyo ifadesi düzeltilir; kod olmayan yetenekler listeye eklenmez.

- [ ] **Adım 5: Yerel ortamı Pınar'la güncelle**

Repo dışındaki değişiklikler, Pınar'ın onayıyla: `server/.env` içine `BASE_DOMAIN=localhost`; `npm run migrate`; `marka/` içeriğini `marka/demo/` altına taşımak.

- [ ] **Adım 6: Doğrula**

```bash
cd server && npm run create-admin -- Ornek "Deneme" "05320000000"
```

Beklenen: Slug kuralını anlatan mesaj; stüdyo veya kullanıcı oluşmaz. `admin` slug'ı için de aynı sonuç. Geçerli slug'la ise bu komut yalnızca geçici bir veritabanında ya da sonradan temizlenecek biçimde denenir.

Sonra `cd server && npm test` tamamen geçer ve `npm run dev` ile sunucu açılır.

- [ ] **Adım 7: Commit mesajı öner:** `chore: update scripts, dev proxy and docs for multi-studio`

---

### Görev 6: İstemci

**Files:**
- Create: `client/src/HostGate.jsx`, `client/src/site/RootPage.jsx`, `client/src/site/StudioNotFound.jsx`
- Modify: `client/src/main.jsx`, `client/src/site/PublicSite.jsx:21-26,85,213`, `client/index.html:6-7`, `server/src/routes/studio.js`, `server/site.example.json`
- Test: `server/test/site.test.js`

**Interfaces:**
- Consumes: `GET /api/studio` (`200 { studio }`, `200 { studio: null }`, `404`).
- Produces: `/api/site` yanıtında `highlights: Array<{ title: string, text: string }>`; `<HostGate>` üç durumu ayırır.

- [ ] **Adım 1: `highlights` için başarısız test yaz**

`site.test.js`: Anahtar listesine `highlights` eklenir; dosya yokken `[]`. Geçerli öğeler döner, başlığı ya da metni eksik öğeler atılır.

- [ ] **Adım 2: Testin başarısız olduğunu gör, sonra alanı `/api/site` yanıtına ekle**

`site.example.json` dosyasına örnek `highlights` eklenir. `npm test` geçer.

- [ ] **Adım 3: Sabit metinleri değiştir**

| Yer | Yeni değer |
|---|---|
| `PublicSite.jsx:85` yedek metin | `Küçük gruplarla pilates` |
| `PublicSite.jsx:213` yer tutucu | `Adres buraya gelecek` |
| `REASONS` birinci kart | `{ title: 'Rahat ortam', text: 'Rahat ve güvenli bir ortam.' }` |
| Kart kaynağı | `site.highlights` doluysa onlar, boşsa `REASONS` |
| `index.html` başlık | `Pilates Rezervasyon` |
| `index.html` açıklama | `Küçük gruplarla pilates: derslerini telefonundan gör, gelemezsen telafiye gel.` |
| `PublicSite` yüklenince | `document.title = site.studioName` (doluysa) |

- [ ] **Adım 4: İki yeni ekranı Pınar'a sor**

**Kod yazmadan önce** kök sayfa ve "Stüdyo bulunamadı" ekranı için 2-3 yön gösterilir. Metinler ve görünüm Pınar'ın seçimiyle belirlenir, karar günlüğe yazılır. Yanıt gelmeden sonraki adıma geçilmez.

- [ ] **Adım 5: `HostGate.jsx` ve iki ekranı yaz**

`HostGate`, açılışta `/api/studio` isteğini bir kez yapar: `404` ise `StudioNotFound`; `{ studio: null }` ise `RootPage`; stüdyo varsa mevcut `isApp` kararı (`App` ya da `PublicSite`). Ağ hatası ya da `5xx` durumunda "bulunamadı" göstermez, mevcut `isApp` kararına düşer. `main.jsx`, `App` ve `PublicSite` kararını `HostGate` içine taşır.

- [ ] **Adım 6: Tarayıcıda doğrula**

`demo.localhost:5173` ve ikinci bir deneme stüdyosuyla, telefon (375px) ve masaüstü (1280px) genişliklerinde:
- `/` kendi stüdyosunun sitesini, `/giris` kendi giriş ekranını açar.
- `demo` adresinde giriş sonrası ikinci stüdyonun adresinde oturum görünmez.
- `yok.localhost:5173` "Stüdyo bulunamadı" gösterir.
- `localhost:5173/` ve `localhost:5173/giris` kök sayfayı gösterir.
- Sunucu kapalıyken `demo.localhost:5173` "Stüdyo bulunamadı" göstermez.
- Vite, `.localhost` adreslerini engellemez.
- Konsolda hata yoktur.

- [ ] **Adım 7: Son doğrulama**

`cd client && npm run lint && npm run build`, `cd server && npm test`. Beklenen: tümü temiz.

- [ ] **Adım 8: Commit mesajı öner:** `feat(client): handle root and unknown hosts and remove studio-specific text`

---

## Bitiş ölçütleri

- Spec'teki dört başarı ölçütü testlerle ve tarayıcıda doğrulanmıştır.
- `grep -rn "LIMIT 1" server/src/routes/studio.js` sonuç vermez ve `server/src/scripts/createAdmin.js` ilk stüdyoyu seçmez.
- `grep -rn -i -E "antalya|muratpaşa" client/src client/index.html` sonuç vermez.
- Bütün dalı kapsayan bağımsız bir kod incelemesi yapılmış, bulguları çözülmüştür.
- Günlük güncellenmiş, README gerçek durumu anlatıyordur.
