# Üye Deneyimi ve Yönetici İyileştirmeleri: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kayan oturum, biçimli telefon alanı, dersleri öne alan üye ana ekranı ve "Üyeliğim" sayfası, PWA, sadeleşmiş mobil yönetici çubuğu ve renk damlalığı.

**Architecture:** Sunucuda iki değişiklik var: oturum uzatma (`findSessionUser` + `loadUser`) ve manifest/ikon üretimi (`routes/theme.js` yanında). Geri kalan her şey istemcide; yeni API ucu yok.

**Tech Stack:** Express 5, PostgreSQL, `node:test`; React 19 + CSS modülleri.

**Spec:** `docs/superpowers/specs/2026-11-27-member-experience-and-admin-polish-design.md`

**Dallar ve PR'lar:**
- PR 1, `feat/member-experience`: Task 1–4.
- PR 2, `feat/admin-polish`: Task 5–6.

Tahmini toplam: ~8 saat.

## Global Constraints

- Oturum süresi `SESSION_DAYS = 30`. Uzatma, kalan süre 29 günden az olduğunda yapılır (günde en çok bir yazma).
- Telefon görünümü `0 (5xx) xxx xx xx`. Kullanıcı yalnızca 10 rakam yazar. Örnek numara (placeholder) yok.
- CSP değişmez (`style-src 'self'`): satır içi stil ve script yok. Manifest ve ikonlar `'self'`ten gelir.
- Renkler yalnızca tema değişkenlerinden alınır, yeni sabit renk yok.
- Arayüz metinleri Türkçe. Kodda gerçek stüdyo adı yok.
- Commit, push ve PR Pınar'da. Mesajlarda ve PR açıklamalarında Claude adı ya da `Co-Authored-By` olmaz.

## Review Focus

1. **Çerez süresi oturumla birlikte yenilenmeli.** Yenilenmezse 30. gün tarayıcı çerezi siler ve kullanıcı çıkmış olur → Task 1 testi `renewed session sends a fresh cookie`.
2. **Süresi dolmuş oturum uzatılmamalı.** Uzatma yalnızca geçerli oturumda yapılır → Task 1 testi `expired session is not renewed`.
3. **Yapıştırılan `+90 532 123 45 67`** → alanda `0 (532) 123 45 67` görünmeli, başta fazladan `90` kalmamalı → Task 2 birim testi.
4. **Damlalığı desteklemeyen tarayıcı (Safari, telefon)** → düğme hiç görünmemeli, hata da çıkmamalı → Task 6 tarayıcı kontrolü.
5. **Eğitmenin 1–3 sekmesi var.** "Daha fazla" çıkmamalı ve hiçbir sekme kaybolmamalı → Task 5'te `visibleTabs` testi.

---

### Task 1: Kayan oturum (TDD), ~1 saat

**Files:**
- Modify: `server/src/services/auth.js` (`findSessionUser`)
- Modify: `server/src/middleware/auth.js` (`loadUser`)
- Modify: `server/src/routes/auth.js` (`cookieOptions` dışa açılır; tek yerden kullanılsın diye `middleware/auth.js`'e taşınabilir)
- Test: `server/test/auth.test.js`

**Interfaces:**
- Produces: `findSessionUser(token, studioId, { db })` dönen kullanıcıya `renewed: boolean` alanı eklenir. `loadUser`, `req.user.renewed` true ise `res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS gün })` gönderir.

- [ ] **Step 1: Testleri yaz.**
  - `active session is extended to 30 days from now`: `expires_at = now() + 10 gün` olan oturumla `GET /api/auth/me` isteği atılır. İstekten sonra `expires_at` değeri 29 günden fazla olmalı.
  - `renewed session sends a fresh cookie`: aynı istekte `set-cookie` başlığı `sid=` içermeli ve `Max-Age=2592000` olmalı.
  - `fresh session is not rewritten`: `expires_at = now() + 30 gün` ise `set-cookie` gelmez, satır değişmez.
  - `expired session is not renewed`: `expires_at = now() - 1 dakika` ise 401 döner ve satır uzamaz.
- [ ] **Step 2: Çalıştır, kırmızı.** `cd server && npm test -- --test-name-pattern="session"`
- [ ] **Step 3: Uygula.** Sorgu tek SQL ifadesinde yapılır: `UPDATE user_sessions SET expires_at = now() + make_interval(days => $3) WHERE id = $1 AND expires_at < now() + make_interval(days => $3 - 1) RETURNING id`. `findSessionUser` önce kullanıcıyı bulur, sonra bu güncellemeyi çalıştırır. `renewed`, güncellenen satır varsa true olur.
- [ ] **Step 4: Çalıştır, yeşil.** `cd server && npm test` → hepsi PASS.

---

### Task 2: `PhoneField`, ~1,5 saat

**Files:**
- Create: `client/src/components/PhoneField.jsx`, `client/src/phoneInput.js`
- Modify: `client/src/pages/LoginPage.jsx`, `client/src/admin/NewCustomerPage.jsx`, `client/src/admin/NewInstructorPage.jsx`
- Test: `server/test/phoneInput.test.js` (istemcide test çalıştırıcı yok; saf fonksiyon sunucunun `node:test`'iyle sınanır, `../../client/src/phoneInput.js` import edilir)

**Interfaces:**
- Produces:
  - `phoneInput.js`:
    - `export function phoneDigits(raw: string): string`: en fazla 10 rakam döner. Baştaki `90` (yalnızca ardından 10 rakam geliyorsa) ve `0` atılır.
    - `export function formatPhoneDigits(digits: string): string`: `'5321234567'` → `'(532) 123 45 67'`. Eksik girişte kısmi biçim döner: `'532'` → `'(532'`, `'5321'` → `'(532) 1'`.
  - `PhoneField({ label, value, onChange, error, autoFocus })`: `value` ve `onChange` yalnızca rakam dizisi taşır. Bileşen `0` önekini ve biçimi gösterir. Gönderilen değer `'0' + digits` olur; sunucu bunu zaten çözüyor.

- [ ] **Step 1: Birim testleri yaz** (`phoneInput.test.js`):
  - `phoneDigits('+90 532 123 45 67') === '5321234567'`
  - `phoneDigits('0532 123 45 67') === '5321234567'`
  - `phoneDigits('532123456789') === '5321234567'` (fazlası kesilir)
  - `phoneDigits('905') === '905'` (henüz 10 rakam yok, `90` atılmaz)
  - `formatPhoneDigits('5321234567') === '(532) 123 45 67'`, `formatPhoneDigits('') === ''`, `formatPhoneDigits('5321') === '(532) 1'`
- [ ] **Step 2: Çalıştır, kırmızı. Sonra fonksiyonları yaz, yeşil olsun.**
- [ ] **Step 3: Bileşeni yaz ve üç forma bağla.** `TextField` görünümü korunur. `0` öneki, alanın içinde solda sabit bir metin olarak durur. İmleç yazarken sona gider, silerken biçim karakterlerinin üstünden atlar.
- [ ] **Step 4: Tarayıcıda doğrula.** Girişte rakam yazılır, `+90…` yapıştırılır, silinir. Deneme hesabıyla giriş yapılır. Yeni üye formuyla bir üye eklenir. 375 px'te görünüm kontrol edilir.

---

### Task 3: Üye ana ekranı ve Üyeliğim, ~2,5 saat

**Files:**
- Create: `client/src/pages/MyMembershipPage.jsx` (+ `.module.css`), `client/src/pages/MembershipNotice.jsx`
- Modify: `client/src/pages/MySessionsPage.jsx` (kart ana ekrandan çıkar; ad düğmesi Üyeliğim'i açar)
- Modify (gerekirse): `server/src/routes/studio.js` (`/api/studio` yanıtına `paymentReminderDays`) + `server/test/site.test.js`

**Interfaces:**
- Consumes: `/api/me/...` yanıtları (mevcut), `MembershipSummary` (değişmeden Üyeliğim'e taşınır).
- Produces: `MembershipNotice({ membership, packageModel, reminderDays, today, onOpen })`. Spec bölüm 3'teki durumlardan birindeyse tek satırlık bir şerit döner, değilse `null`.

- [ ] **Step 1:** `/api/studio`'da `paymentReminderDays` yoksa önce testi yazılır, sonra yanıta eklenir.
- [ ] **Step 2:** `MySessionsPage`'de kart yerine `MembershipNotice` ve telafi ya da seans satırı gelir. Ad düğmesi `view = 'membership'` durumuna geçer. Ayrı bir adres (router) eklenmez, yönetici panelindeki `view` kalıbı kullanılır.
- [ ] **Step 3:** `MyMembershipPage` yazılır: geri düğmesi, `MembershipSummary`, "Şifre değiştir" (mevcut `ChangePasswordPage` akışına gider), "Çıkış yap".
- [ ] **Step 4: Tarayıcıda doğrula.** İki modelde de (grup ve paket) bakılır: ana ekran dersle başlar, telafi seçici satırdan açılır, uyarı şeridi bitişi yakın bir üyede görünür (veritabanında bitiş tarihini değiştirerek). Üyeliğim'de ödemeler ayara göre görünür ya da görünmez. Çıkış çalışır. 375 px'te görünüm kontrol edilir.

---

### Task 4: PWA, ~1,5 saat

**Files:**
- Modify: `server/src/routes/theme.js` (`GET /brand/manifest.webmanifest`, `GET /brand/icon-:size.png` (192 ve 512), stüdyonun klasöründe yoksa varsayılan ikon)
- Create: `server/assets/icon-192.png`, `server/assets/icon-512.png` (varsayılan, markasız)
- Modify: `client/index.html` (`<link rel="manifest">`, `apple-touch-icon`, `apple-mobile-web-app-*`, `theme-color`)
- Test: `server/test/theme.test.js`

**Interfaces:**
- Produces: `GET /brand/manifest.webmanifest`, `Content-Type: application/manifest+json`, `Cache-Control: no-cache`.

- [ ] **Step 1: Testleri yaz.**
  - `manifest uses the studio's name and colours`: `name === 'Test'`, `start_url === '/giris'`, `display === 'standalone'`. `theme_color` stüdyonun ana rengi, renk girilmemişse varsayılan ana renk.
  - `each studio gets its own manifest`: iki stüdyo iki farklı ad alır.
  - `icon falls back to the default`: marka klasöründe ikon yoksa 200 ve `image/png` döner.
  - `icon size outside 192/512 is 404`.
- [ ] **Step 2: Kırmızı, uygula, yeşil.**
- [ ] **Step 3: Tarayıcıda doğrula.** DevTools → Application → Manifest hatasız olmalı, "Installable" görünmeli. Service worker gerekmediği burada teyit edilir. Gerekirse kararı ledger'a yaz ve Pınar'a sor.
- [ ] **Step 4: PR 1'i hazırla (commit Pınar'da).** `npm test` ve `npm run lint` çalıştırılır, ardından commit komutları verilir.

---

### Task 5: Mobil alt çubuk, ~1,5 saat

**Files:**
- Modify: `client/src/admin/permissions.js` (`mobileTabs(user)` → `{ primary: Tab[], more: Tab[] }`)
- Modify: `client/src/admin/AdminApp.jsx`, `client/src/admin/Admin.module.css`
- Create: `client/src/admin/TabIcon.jsx` (sekme kimliğine göre satır içi SVG)
- Test: `server/test/adminTabs.test.js` (`permissions.js` saf fonksiyonları, `phoneInput` gibi sunucunun test çalıştırıcısıyla)

**Interfaces:**
- Produces: `mobileTabs(user)`: yönetici için `primary = [today, customers, payments, dashboard]`, `more = [groups, instructors, settings]`. Görünen sekme sayısı ≤ 5 ise `more` boş olur ve hepsi `primary`'de durur.

- [ ] **Step 1: Testler.** Yönetici için 4 + 3. Bütün yetkileri açık eğitmen için 3 + 0. Yetkisi olmayan eğitmen için 1 + 0. Masaüstü `visibleTabs` sırası değişmez.
- [ ] **Step 2: Uygula.** "Daha fazla" mevcut `Sheet` bileşeniyle açılır. Pencerede seçilen bölüm açılır ve pencere kapanır. Bu üç bölümden biri açıkken "Daha fazla" seçili görünür.
- [ ] **Step 3: Tarayıcıda doğrula.** 360 ve 375 px'te taşma ve çakışma olmamalı. Yönetici ve eğitmen girişleri ayrı ayrı denenir. Masaüstünde yan menü aynı kalmalı.

---

### Task 6: Renk damlalığı, ~45 dk

**Files:**
- Modify: `client/src/admin/AppearanceSection.jsx` (`ColorField`'a "Ekrandan seç" düğmesi), `client/src/admin/Admin.module.css`

**Interfaces:**
- Produces: `const canPickFromScreen = typeof window !== 'undefined' && 'EyeDropper' in window`. Düğme: `new EyeDropper().open()` → `{ sRGBHex }` → `onChange(sRGBHex)`. `AbortError` sessizce yok sayılır.

- [ ] **Step 1: Uygula.** Destek yoksa bölümün altında tek satırlık bir not çıkar, düğme gösterilmez.
- [ ] **Step 2: Tarayıcıda doğrula.** Chrome'da renk seçilir ve önizleme değişir. Esc ile vazgeçilince değer değişmez. Desteklemeyen ortamda (ör. mobil görünüm) not görünür.
- [ ] **Step 3: PR 2'yi hazırla (commit Pınar'da).** `npm test`, `npm run lint`, commit komutları.
