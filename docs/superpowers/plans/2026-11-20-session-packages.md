# Seans Paketi ve Üyelik Modeli: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stüdyo açılırken "grup + telafi" ya da "seans paketi" modeli seçilebilsin; paketli stüdyoda yönetici paket satsın, kalan seans yoklama alınmasa da doğru düşsün, üye kalan seansını görsün.

**Architecture:** Paket, mevcut `memberships` döneminin bir türü (`session_count` doluysa). Kalan seans saklanmaz; yeni bir hesap modülü düşen seansları zaman sırasıyla paketlere dağıtır. Paket modelinde iptal yine bir `credits` satırıdır ama telafiye kullanılamaz (`forfeited_at` dolu), böylece `session_occupancy` değişmez.

**Tech Stack:** Node.js, Express 5, PostgreSQL (`pg`, numaralı SQL migration), React 19 (Vite), Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-20-session-packages-design.md`

## Global Constraints

- `membership_model`: `'group'` (varsayılan, mevcut bütün stüdyolar) ya da `'package'`. Panelden değiştirilemez.
- `late_cancel_burns_session` varsayılan `true`; yalnızca paket modelinde görünür ve etkili.
- Paket kataloğu: ad 2–60 karakter, `session_count` 1–200, `price_kurus` ≥ 0, `validity_days` 1–365; silinmez, kapatılır.
- Paket satışında `session_count`, `package_name`, `fee_kurus` kopyalanır; `ends_on = starts_on + validity_days - 1`.
- Yoklama yalnızca kayıttır: "gelmedi" işareti seans sayısını değiştirmez.
- Hata kodları: `NOT_AVAILABLE_FOR_MODEL` (404), `MAKEUP_NOT_AVAILABLE` (409), `PACKAGE_CLOSED` (400), `PACKAGE_NOT_FOUND` (404), `PACKAGE_REQUIRED` (400), `SESSION_NOT_STARTED` (409), `INVALID_PACKAGE_NAME` / `INVALID_SESSION_COUNT` / `INVALID_VALIDITY_DAYS` / `INVALID_AMOUNT` (400).
- Grup modelindeki stüdyolarda davranış hiç değişmez.
- Görsel yenileme yok; mevcut bileşenler. Kod yorumları ve kullanıcı metinleri Türkçe; koda gerçek stüdyo adı yazılmaz.
- **Commit'leri Pınar yapar.** Her görevin sonunda commit mesajı önerilir; ortak yazar (`Co-Authored-By`) ya da araç imzası satırı yok.
- Her görevden sonra günlük kaydı: `~/Documents/02 Projeler/studio-booking-notes/PROJE_GUNLUGU.md`.

**Testleri çalıştırmak:** `cd server && npm test`; tek dosya: `cd server && npm run pretest && DB_NAME=studio_booking_test BASE_DOMAIN=localhost BCRYPT_COST=4 node --test test/<dosya>.test.js`; istemci: `cd client && npm run lint && npm run build`.

## Review Focus

- Paketi ders günü başlayan üye: o günkü ders yeni pakete yazılır (başlangıç ≤ ders tarihi). Test: Task 4 (`a session on the package start day counts for that package`).
- Ders sürerken (başlamış, bitmemiş) kalan seans: henüz düşmez. Test: Task 4 (`a session in progress is not counted yet`).
- Paket satışı mevcut bir dönemle çakışırsa (dondurmayla uzamış bitiş dahil): bugünkü `MEMBERSHIP_OVERLAP` davranışı. Test: Task 3 (`a package overlapping the current one is refused`).
- Paket modelinde "İptali geri al" ders başladıktan sonra: reddedilir, seans düşmüş kalır. Test: Task 5 (`undo after the start is refused in package model`).
- Yöneticinin derse elle eklediği üye (paket modeli): o ders bir seans düşürür. Test: Task 4 (`an admin-added session counts`).

---

### Task 1: Veritabanı ve model ayarı

**Files:**
- Create: `server/db/migrations/016_session_packages.sql`
- Modify: `server/test/helpers.js` (`createStudio` `membershipModel` alır; `resetDb` `packages`, `attendance`), `server/src/scripts/createAdmin.js` (`--model paket`), `server/src/scripts/seedDev.js` (`membershipModel`, `packages`)
- Test: `server/test/packagesSchema.test.js`

**Interfaces:**
- Produces: `studio_settings.membership_model`, `studio_settings.late_cancel_burns_session`; tablo `packages`; `memberships.session_count`, `memberships.package_name`; tablo `attendance (session_id, user_id, marked_at, marked_by)`; `createStudio({ membershipModel = 'group' })`.

- [ ] **Step 1: Başarısız testleri yaz:** `existing studios are group model`, `membership_model accepts only group and package` (`'x'` → `23514`), `package rules are enforced` (`session_count` 0, `validity_days` 400 → `23514`), `memberships.session_count must be positive`, `attendance is unique per session and user` (`23505`).
- [ ] **Step 2: Kırmızıyı gör** (`column "membership_model" does not exist`).
- [ ] **Step 3: Migration'ı yaz** (spec "Veritabanı" bölümü; `attendance.session_id` ve `user_id` yabancı anahtar, birincil anahtar ikisi birlikte).
- [ ] **Step 4: Yolları uyarla.** `createAdmin`: argümanlarda `--model paket` varsa yeni stüdyonun `studio_settings.membership_model = 'package'`; mevcut stüdyoda yok sayılır ve bunu yazar. `seedDev`: demo dosyası `membershipModel` ve `packages: [{ name, sessionCount, priceKurus, validityDays }]` verebilir.
- [ ] **Step 5: Doğrula:** `npm test` tümü geçer.
- [ ] **Step 6: Commit mesajı:** `feat(db): membership model setting, package catalog and attendance tables`

---

### Task 2: Paket kataloğu (sunucu)

**Files:**
- Create: `server/src/services/adminPackages.js`
- Modify: `server/src/routes/admin.js`, `server/test/studioIsolation.test.js`
- Test: `server/test/adminPackages.test.js`

**Interfaces:**
- Produces: `membershipModelOf(studioId, db) -> 'group' | 'package'`; `assertModel(studioId, model, db)` (değilse `NOT_AVAILABLE_FOR_MODEL`); `listPackages(admin)`, `createPackage(admin, { name, sessionCount, priceKurus, validityDays })`, `updatePackage(admin, id, input)`, `closePackage(admin, id)`, `reopenPackage(admin, id)`; uçlar `GET/POST /api/admin/packages`, `PUT /api/admin/packages/:id`, `POST /api/admin/packages/:id/close|reopen`. DTO: `{ id, name, sessionCount, priceKurus, validityDays, isActive }`.

- [ ] **Step 1: Başarısız testler:** `group model studio cannot reach packages` (404 `NOT_AVAILABLE_FOR_MODEL`), `creates, lists, updates a package`, `validation codes` (her `INVALID_*`), `close and reopen`, `another studio's package is not found`.
- [ ] **Step 2: Kırmızıyı gör.**
- [ ] **Step 3: Uygula** (`adminBranches.js` deseni).
- [ ] **Step 4: Veri ayrımı:** B stüdyosunu `buildStudio`'da paket modeline geçirmek yerine matris satırları için B'ye paket modeli + `B-GIZLI-Paket` olan ayrı bir kurulum yardımcısı; dört `:id` ucu matrise; `/api/admin/packages` liste testine.
- [ ] **Step 5: Doğrula:** `npm test` (`every id route is in the matrix` dahil).
- [ ] **Step 6: Commit mesajı:** `feat(admin): package catalog for package-model studios`

---

### Task 3: Paket satışı

**Files:**
- Modify: `server/src/services/adminMemberships.js` (`createMembership`, `MEMBERSHIP_SELECT`, `toDto`), `server/src/routes/admin.js` (memberships gövdesi)
- Test: `server/test/packageSales.test.js`

**Interfaces:**
- Consumes: `membershipModelOf`, paket kataloğu.
- Produces: paket modelinde `POST /api/admin/customers/:id/memberships` gövdesi `{ packageId, startsOn, feeKurus?, note? }`; grup modelinde bugünkü gövde (paket modelinde süreye bağlı gövde `400 PACKAGE_REQUIRED`, grup modelinde `packageId` `400 NOT_AVAILABLE_FOR_MODEL`). Dönem DTO'suna `sessionCount`, `packageName` (süreye bağlı dönemde `null`).

- [ ] **Step 1: Başarısız testler:** `sells a package and copies count, name, price and end date` (12 seans, 2400 ₺, 60 gün → `endsOn = startsOn + 59`), `feeKurus overrides the catalog price`, `catalog changes do not touch sold packages`, `a closed package cannot be sold` (`PACKAGE_CLOSED`), `a package overlapping the current one is refused` (Review Focus), `group model keeps the period body`, `payments attach to a package like to a period`.
- [ ] **Step 2: Kırmızıyı gör.**
- [ ] **Step 3: Uygula.**
- [ ] **Step 4: Veri ayrımı:** gövdede başka stüdyonun `packageId`'si → `PACKAGE_NOT_FOUND`, iz yok.
- [ ] **Step 5: Doğrula:** `npm test`.
- [ ] **Step 6: Commit mesajı:** `feat(memberships): sell packages as membership periods`

---

### Task 4: Seans kullanımı ve yoklama

**Files:**
- Create: `server/src/services/packageUsage.js`
- Modify: `server/src/services/adminSchedule.js` (`getSessionRoster`: `absent`), `server/src/routes/admin.js`
- Test: `server/test/packageUsage.test.js`, `server/test/attendance.test.js`

**Interfaces:**
- Produces:
  - `chargeableSessions(userId, db) -> [{ sessionId, date, startsAt }]`: spec "Seansın düşmesi" kurallarıyla, zaman sırasıyla.
  - `packageUsage(userId, db) -> { packages: [{ membershipId, used, remaining, burned }], unpackaged: number }`: spec "Seansların paketlere dağılımı" kuralıyla.
  - Uçlar: `PUT /api/admin/sessions/:id/attendance/:userId` (gelmedi), `DELETE` (kaldır); ders başlamadıysa `409 SESSION_NOT_STARTED`. Roster üyelerinde `absent: boolean`.

- [ ] **Step 1: Başarısız testler (packageUsage):** her spec tablo satırı ayrı test (`attended counts`, `unmarked counts`, `no-show counts`, `early cancel does not count`, `late cancel follows the setting` açık/kapalı, `studio-cancelled does not count`, `frozen does not count`); `a session in progress is not counted yet` (Review Focus); `a session on the package start day counts for that package` (Review Focus); `an admin-added session counts` (Review Focus); `two packages fill in order`; `remaining sessions burn after the end date`; `sessions without a package go to the next package first`.
- [ ] **Step 2: Başarısız testler (attendance):** işaretle/kaldır, ders başlamadan `SESSION_NOT_STARTED`, `absent` roster'da, `marking absent does not change the count`; matrise iki yeni `:id` ucu.
- [ ] **Step 3: Kırmızıyı gör.**
- [ ] **Step 4: Uygula.** Dağılım JavaScript'te (`packageUsage`), ders listesi tek SQL sorgusuyla.
- [ ] **Step 5: Doğrula:** `npm test`.
- [ ] **Step 6: Commit mesajı:** `feat: compute package usage and record attendance`

---

### Task 5: İptal kuralları ve yanıtlar (paket modeli)

**Files:**
- Modify: `server/src/services/booking.js` (`cancelSession`, `undoCancel`, `bookMakeupInTransaction`), `server/src/services/adminMemberships.js` (`getMemberships`, `getMyMembership`, `getPaymentOverview`), `server/src/services/adminSettings.js`, `server/src/routes/studio.js`
- Test: `server/test/packageBooking.test.js`, `server/test/packageResponses.test.js`

**Interfaces:**
- Consumes: `packageUsage`, `membershipModelOf`.
- Produces: paket modelinde iptal ders başlayana kadar; `credits.forfeited_at` dolu; iptal yanıtında `late: boolean`; telafi/swap `409 MAKEUP_NOT_AVAILABLE`; `undoCancel` ders başlayana kadar. Dönem DTO'larında `used`, `remaining`, `burned`; `/api/me/membership` pakette `remaining`, `endsOn`, `unpackaged`; Ödemeler'de `packageFinished: [{ customerId, fullName, branchName, unpackaged }]`; ayarlarda `membershipModel` (salt okunur), `lateCancelBurnsSession`; `/api/studio`'da `membershipModel`.

- [ ] **Step 1: Başarısız testler:** `package model allows a late cancel and marks it late`, `a package cancel is not a usable make-up credit`, `make-up and swap are refused in package model`, `undo after the start is refused in package model` (Review Focus), `group model cancel rules are unchanged`; yanıtlar: `memberships show used and remaining`, `my membership shows remaining and unpackaged`, `payments list packageFinished`, `settings show the model and save lateCancelBurnsSession`, `membershipModel cannot be changed through settings`, `/api/studio returns membershipModel`.
- [ ] **Step 2: Kırmızıyı gör.**
- [ ] **Step 3: Uygula.**
- [ ] **Step 4: Doğrula:** `npm test` (grup modeli testlerinin hepsi aynen geçer).
- [ ] **Step 5: Commit mesajı:** `feat(booking): package-model cancellations and package info in responses`

---

### Task 6: Yönetici paneli

**Files:**
- Create: `client/src/admin/PackagesSection.jsx`
- Modify: `client/src/admin/SettingsPage.jsx`, `client/src/admin/MembershipCard.jsx`, `client/src/admin/CustomerDetailPage.jsx`, `client/src/admin/PaymentsPage.jsx`, `client/src/admin/SessionRosterPage.jsx`

**Interfaces:**
- Consumes: Task 2–5 uçları; `studio.membershipModel`.

- [ ] **Step 1:** Ayarlar: "Üyelik modeli: Grup + telafi / Seans paketi" (yazı). Paket modelinde `PackagesSection` (BranchesSection deseni) ve "Geç iptalde seans yansın"; telafi bölümü gizli.
- [ ] **Step 2:** Müşteri detayı: paket modelinde `MembershipCard` "Paket ekle" (katalogdan seç, başlangıç, isteğe bağlı fiyat), her pakette "7 / 12 kaldı · son tarih"; "Telafi hakkı ver" gizli.
- [ ] **Step 3:** Ödemeler: "Paketi bitti" bölümü (paketsiz ders sayısıyla). Ders detayı: ders başladıysa her üyede "Gelmedi" anahtarı (iki modelde de).
- [ ] **Step 4: Doğrula:** lint + build; tarayıcıda (test veritabanı, paketli demo ve grup demosu) telefon ve masaüstü.
- [ ] **Step 5: Commit mesajı:** `feat(admin): packages section, package sales and attendance`

---

### Task 7: Üye ekranları ve belgeler

**Files:**
- Modify: `client/src/pages/MySessionsPage.jsx` (`MembershipInfo`, iptal akışı), `README.md`

- [ ] **Step 1:** Paket modelinde "Paketin: 12 seans · 7 kaldı · son tarih 15 Ocak" (paketsiz ders varsa onu da yaz); geç iptalde "Bu seans düşecek" uyarısı (ayar açıksa); "Telafi seç" ve telafi hakkı metinleri gizli; iptal sonrası mesaj telafi hakkından söz etmez.
- [ ] **Step 2:** README: iki üyelik modeli ve paket kuralları; `create-admin --model paket`.
- [ ] **Step 3: Doğrula:** `npm test`, lint, build; tarayıcıda paketli demo üyesi ve grup demosu üyesi. Konsolda yeni hata yok.
- [ ] **Step 4: Commit mesajı:** `feat: package info for members and docs for membership models`

---

## Bitiş ölçütleri

- Spec'teki beş başarı ölçütü testlerle ve tarayıcıda doğrulanmış.
- Grup modelindeki stüdyonun bütün eski testleri değişmeden geçiyor.
- GitHub Actions yeşil; bağımsız inceleme yapılmış, önemli bulgular düzeltilmiş.
- Günlük güncel; README gerçek durumu anlatıyor.
