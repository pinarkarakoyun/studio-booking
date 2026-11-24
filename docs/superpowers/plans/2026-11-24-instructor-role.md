# Eğitmen Rolü ve Ek Ders Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yöneticinin şubeye atadığı ve yetkilerini seçtiği eğitmen rolünü, ders devralmayı ve tek seferlik ek dersi eklemek.

**Architecture:** `/api/admin` uçları ikiye ayrılır: eğitmene açılabilenler yeni `routes/staff.js`'te, her biri açık bir `can(yetki)` koruyucusuyla; geri kalanlar `routes/admin.js`'te ve yalnızca yöneticiye açık (yeni uç varsayılan olarak kapalı). Servisler `admin` yerine `actor` alır; eğitmen için sorgular şubeye göre süzülür, cevaplardan fiyatlar tek bir yardımcıyla çıkarılır. Ek ders gizli, tek seferlik bir gruptur (`groups.kind = 'extra'`).

**Tech Stack:** Node/Express 5, PostgreSQL, `node:test`; React + Vite, CSS modülleri.

**Spec:** `docs/superpowers/specs/2026-11-24-instructor-role-design.md`

**Dallar:** PR 1 `feat/instructor-role` (Görev 1–7), PR 2 `feat/extra-sessions` (Görev 8–11, PR 1 birleştikten sonra `main`'den). Tahmini toplam: ~25–28 saat.

## Global Constraints

- Rol değerleri: `'admin' | 'instructor' | 'customer'`.
- Yetki sütunları ve varsayılanları (`instructor_permissions`): `attendance` true, `cancel_own_sessions` true, `create_extra_sessions` true, `manage_attendees` false, `view_customers` false, `edit_customers` false, `customer_status` false, `memberships` false, `manage_groups` false. `view_customers` false iken `edit_customers`, `customer_status`, `memberships` true olamaz (CHECK).
- Dersin eğitmeni = `COALESCE(sessions.instructor_id, groups.instructor_id)`.
- Yönetici için `actor.branchIds === null` (süzme yok); eğitmen için dizi (boş dizi = hiçbir şey görmez).
- Kapsam dışı kayıt → `404` (kaydın varlığı sızmaz); kapsam içinde yetki yok → `403 FORBIDDEN`.
- Eğitmene giden hiçbir JSON'da `Kurus` ile biten anahtar, `price*`, `fee*`, `amount*`, `payments` bulunmaz.
- Eğitmen yalnızca `role = 'customer'` hesaplara dokunur.
- Ek dersin varsayılan adı `"Ek ders"`. Ek ders geçmişe açılamaz, düzenlenemez (yalnızca iptal).
- Bildirim yok; WhatsApp düğmesi yalnızca `https://wa.me/?text=<encodeURIComponent(metin)>` açar.
- Yönetici davranışı değişmez: mevcut bütün sunucu testleri değişmeden geçer (yalnızca `admin` → `actor` parametre adı gibi zorunlu düzeltmeler).
- Kodda gerçek stüdyo adı yok. Commit, push ve PR Pınar'da; commit ve PR metinlerinde Claude adı ya da `Co-Authored-By` yok. Kullanıcıya görünen metinler Türkçe.

## Review Focus

1. **Şubesi kalmamış eğitmen** (`branchIds = []`, ör. şubesi kapatıldı ya da çıkarıldı): her listede boş sonuç görmeli, `null` gibi davranıp her şeyi görmemeli → Görev 3 testi `empty branch list sees nothing`.
2. **Eğitmen "ayrıldı" yapıldığında açık oturumu**: bir sonraki istekte `401` almalı; şubesi çıkarılınca o şubenin dersleri hemen görünmez olmalı → Görev 6 testleri `leaving revokes sessions`, `removing a branch hides it at once`.
3. **Fiyatın dolaylı sızması** (üye detayı, üyelik dönemleri, paket listesi, hata cevapları): eğitmen cevabının bütün anahtarları derinlemesine taranmalı → Görev 5 testi `no price keys reach an instructor`.
4. **İptal edilmiş, geçmiş günün ya da başka şubenin dersini devralmak**: `409` / `404` dönmeli, sessizce devralınmamalı → Görev 4 testi `take-over only on today's scheduled session in scope`.
5. **Paket üyesi, "diğer şubelerde telafi" kapalıyken başka şubedeki ek derse**: `OTHER_BRANCH` almalı → Görev 10 testi `package member cannot book extra in other branch`.

---

## PR 1 — `feat/instructor-role`

### Task 1 (Görev 1): Veritabanı ve test yardımcıları — ~1 saat

**Files:**
- Create: `server/db/migrations/019_instructors.sql`
- Modify: `server/test/helpers.js` (`resetDb` tablo listesi; yeni yardımcılar)
- Test: `server/test/instructorSchema.test.js`

**Interfaces:**
- Produces (SQL): `users.role` CHECK'e `'instructor'`; `instructor_branches (user_id, branch_id, PRIMARY KEY (user_id, branch_id))`; `instructor_permissions (user_id PRIMARY KEY, <9 boolean sütun, Global Constraints'teki varsayılanlarla>)`; `groups.instructor_id bigint NULL REFERENCES users`; `groups.kind text NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','extra'))`; `sessions.instructor_id bigint NULL REFERENCES users`.
- Produces (test): `createInstructor(studioId, { branchIds = [], permissions = {} } = {}) -> Promise<number>` (kullanıcı + şubeler + yetki satırı); `setGroupInstructor(groupId, userId)`.

- [ ] **Step 1: Testleri yaz** — `instructor role is accepted`, `permission defaults match the spec` (yeni satırın 9 değeri), `view_customers off forbids customer permissions` (`edit_customers = true, view_customers = false` → CHECK hatası), `instructor branch must be in the same studio` (başka stüdyonun şubesi → hata), `group kind defaults to regular`.
- [ ] **Step 2: `npm test -- test/instructorSchema.test.js` → FAIL** (tablo yok).
- [ ] **Step 3: Migration'ı yaz.** Aynı stüdyo kısıtı için 014'teki `groups_branch_same_studio` deseni (bileşik yabancı anahtar ya da tetikleyici — 014 ne kullandıysa aynısı). `resetDb`'ye `instructor_branches, instructor_permissions` ekle. `db/roles/app-role.sql` yeni tablolara uygulama rolünün yetkisini veriyor mu kontrol et; vermiyorsa ekle.
- [ ] **Step 4: Testler PASS; bütün sunucu testleri PASS** (`npm test`).

### Task 2 (Görev 2): Personel yönlendiricisi ve yetki koruyucusu — ~2,5 saat

**Files:**
- Create: `server/src/middleware/staff.js`, `server/src/routes/staff.js`
- Modify: `server/src/services/auth.js` (`findSessionUser`, `publicUser`), `server/src/routes/admin.js` (taşınan uçlar çıkar), `server/src/app.js` (staff yönlendiricisi admin'den **önce** bağlanır)
- Test: `server/test/staffRoutes.test.js`

**Interfaces:**
- Produces:
  - `req.user` (eğitmen için) ek alanlar: `branchIds: number[]`, `permissions: Record<string, boolean>`; yönetici için `branchIds: null`, `permissions: null`.
  - `requireStaff()` — rol `admin` ya da `instructor` değilse 403.
  - `can(permission: string | null)` — yönetici her zaman geçer; eğitmen `permission === null` ise geçer, değilse `req.user.permissions[permission]` true olmalı, yoksa `403 FORBIDDEN`. Fonksiyonun üzerinde `guard = true` işareti (test için).
  - `GET /api/auth/me` eğitmen için `{ user: { ..., role: 'instructor', permissions, branches: [{ id, name }] } }`.
- Staff yönlendiricisine taşınan uçlar ve koruyucuları (Görev 4–5 bunların servislerini kapsamlandırır):

| Uç | `can(...)` |
|---|---|
| `GET /api/admin/today`, `GET /api/admin/day`, `GET /api/admin/sessions/:id` | `null` |
| `PUT/DELETE /api/admin/sessions/:id/attendance/:userId`, `POST /api/admin/sessions/:id/take-over` (Görev 4) | `attendance` |
| `POST /api/admin/sessions/:id/cancel[/preview]` | `cancel_own_sessions` |
| `POST /api/admin/sessions/:id/attendees`, `DELETE .../attendees/:userId` | `manage_attendees` |
| `GET /api/admin/customers`, `GET /api/admin/customers/:id` | `view_customers` |
| `POST /api/admin/customers`, `POST .../:id/reset-password` | `edit_customers` |
| `POST .../:id/freeze`, `.../end-freeze`, `GET .../leave-preview`, `POST .../leave`, `.../change-group` | `customer_status` |
| `POST .../:id/credits`, `GET/POST .../:id/memberships`, `GET /api/admin/packages` | `memberships` |
| `GET/POST /api/admin/groups`, `GET/PUT /api/admin/groups/:id`, `POST .../preview`, `.../close` | `manage_groups` |
| `GET /api/admin/branches` | `null` (grup ve üye formlarındaki şube seçimi için; eğitmene yalnızca kendi şubeleri) |

Geri kalan her şey (`payments`, paket yazma uçları, `settings`, `appearance`, şube yazma uçları, Görev 6'nın `instructors` uçları) `admin.js`'te kalır.

- [ ] **Step 1: Testleri yaz**
  - `every staff route has exactly one guard`: `staff.js` yönlendiricisinin `stack`'indeki her `layer.route` için `route.stack.filter(l => l.handle.guard).length === 1`.
  - `instructor without permissions`: varsayılanları kapalı bir eğitmen (`permissions` hepsi false) için tablodaki her uç (`can(null)` olanlar hariç) `403`.
  - `admin-only routes stay admin-only`: tüm yetkileri açık eğitmen `GET /api/admin/payments`, `GET /api/admin/settings`, `PUT /api/admin/appearance`, `POST /api/admin/packages`, `POST /api/admin/branches` → `403`.
  - `customer gets 403 on staff routes`, `admin behaviour unchanged` (yönetici `GET /api/admin/today` → 200).
  - `me returns permissions and branches for instructor`.
- [ ] **Step 2: FAIL.**
- Not: Görev 2 ile Görev 5 arasında `can(...)` geçen eğitmen henüz süzülmemiş veri görür; bu ara durum yalnızca dalda, PR 1 Görev 5 bitmeden açılmaz.
- [ ] **Step 3: Uygula.** `findSessionUser` eğitmen için şubeleri (`array_agg`, yalnızca açık şubeler) ve yetki satırını aynı sorguda ya da ikinci bir sorguyla yükler; önbellek yok. Taşınan uçların gövdeleri değişmez (servisler Görev 3–5'te). `parseId` ve `*Input` yardımcıları iki dosyada da gerekiyorsa `server/src/routes/params.js`'e taşı.
- [ ] **Step 4: Testler PASS; `npm test` PASS.**

### Task 3 (Görev 3): Kapsam ve fiyat yardımcıları — ~1,5 saat

**Files:**
- Create: `server/src/services/scope.js`
- Test: `server/test/scope.test.js`

**Interfaces:**
- Produces:
  - `branchClause(actor, column: string, params: any[]) -> string` — yönetici için `'TRUE'`; eğitmen için `params`'a `actor.branchIds` ekler, `` `${column} = ANY($n::bigint[])` `` döner.
  - `assertSessionInScope(actor, sessionId, db) -> Promise<{ id, branchId, date, status, instructorId, groupKind }>` — stüdyo dışı ya da şube dışı → `AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404)`.
  - `assertCustomerInScope(actor, customerId, db) -> Promise<void>` — üyenin bugünkü aktif grubunun şubesi; grubu yoksa eğitmen için 404. Rolü `customer` değilse 404.
  - `assertGroupInScope(actor, groupId, db) -> Promise<{ branchId }>` — 404 `GROUP_NOT_FOUND`.
  - `assertBranchInScope(actor, branchId) -> void` — 403 değil 404 `BRANCH_NOT_FOUND`.
  - `redactPrices(value) -> value` — yönetici değilse çağrılır; derin kopya, Global Constraints'teki anahtarları siler.
  - `isInstructor(actor) -> boolean`.
- [ ] **Step 1: Testler** — `admin sees everything`, `instructor limited to own branches`, `empty branch list sees nothing` (Review Focus 1), `other studio's session is 404 even for admin`, `customer without group is out of scope for instructor`, `redactPrices removes nested price keys` (`{ a: { feeKurus: 1, payments: [] }, list: [{ priceKurus: 2, name: 'x' }] }` → `{ a: {}, list: [{ name: 'x' }] }`).
- [ ] **Step 2: FAIL. Step 3: Uygula. Step 4: PASS.**
- [ ] **Step 5: Commit durağı (Pınar)** — Görev 1–3.

```bash
git add server/db/migrations/019_instructors.sql server/src server/test
```

```bash
git commit -m "feat(instructors): role, branches, permissions and staff route guards"
```

### Task 4 (Görev 4): Dersler, devralma ve iptal — ~3 saat

**Files:**
- Modify: `server/src/services/adminSchedule.js`, `server/src/routes/staff.js`, `server/src/routes/admin.js`
- Test: `server/test/instructorSessions.test.js`

**Interfaces:**
- Consumes: Görev 3 yardımcıları.
- Produces:
  - `getToday(actor)`, `getDay(actor, date)`: dersler `branchClause` ile süzülür; her derse `instructor: { id, name } | null` ve `isMine: boolean` (yönetici için hep `false`) ve `kind: 'regular' | 'extra'` eklenir. Özet kartları süzülmüş derslerden hesaplanır.
  - `getSessionRoster(actor, sessionId)`: `assertSessionInScope`; katılımcılarda `phone` yalnızca yönetici ya da `view_customers` ile; cevaba `instructor`, `isMine`, `canTakeOver: boolean` eklenir.
  - `takeOverSession(actor, sessionId) -> roster` — yalnızca eğitmen; ders `scheduled`, tarihi stüdyonun bugünü, eğitmeni zaten kendisi değil. Aksi hâlde `409 TAKE_OVER_NOT_ALLOWED`. `UPDATE sessions SET instructor_id = actor.id`.
  - `setSessionInstructor(actor, sessionId, instructorId | null) -> roster` — yalnızca yönetici (`admin.js`'te `PUT /api/admin/sessions/:id/instructor`); eğitmen o şubeye atanmış olmalı, değilse `400 INVALID_INSTRUCTOR`.
  - `setAbsent`: eğitmen için dersin eğitmeni kendisi olmalı, değilse `403 NOT_YOUR_SESSION`.
  - `cancelSessionByStudio`: eğitmen için aynı `NOT_YOUR_SESSION` kuralı; önizleme dahil.
  - `addToSession`, `removeMakeupFromSession`: `assertSessionInScope` + eklenen üye için `assertCustomerInScope`.
- [ ] **Step 1: Testler** — `instructor sees all sessions of own branches only`, `isMine follows group instructor and override`, `phone hidden without view_customers`, `cannot mark attendance on someone else's session`, `take-over then attendance works`, `take-over only on today's scheduled session in scope` (Review Focus 4: dünün dersi 409, iptal edilmiş 409, başka şube 404), `group instructor unchanged after take-over`, `cancel only own session` (önizleme de), `admin can set session instructor`, `admin today unchanged` (mevcut alanlar aynı).
- [ ] **Step 2: FAIL. Step 3: Uygula. Step 4: PASS; `npm test` PASS.**

### Task 5 (Görev 5): Üyeler, üyelikler ve gruplar kapsamı — ~4 saat

**Files:**
- Modify: `server/src/services/adminCustomers.js`, `adminMemberships.js`, `adminPackages.js`, `adminGroups.js`, `adminBranches.js`, `server/src/routes/staff.js`
- Test: `server/test/instructorCustomers.test.js`, `server/test/instructorGroups.test.js`

**Interfaces:**
- Consumes: Görev 3.
- Produces:
  - `listCustomers(actor)`: eğitmen için yalnızca bugünkü aktif grubu kendi şubelerinde olan `customer`'lar.
  - `getCustomer`, `resetCustomerPassword`, `freezeCustomer`, `endFreeze`, `previewLeave`, `markLeft`, `grantCredits`, `getMemberships`: önce `assertCustomerInScope`. Eğitmene dönen `getCustomer` ve `getMemberships` cevabı `redactPrices`'tan geçer.
  - `createCustomer(actor, input)`: eğitmen için `groupId` zorunlu ve `assertGroupInScope`; yoksa `400 GROUP_REQUIRED`.
  - `changeCustomerGroup`: hem üye hem hedef grup kapsamda.
  - `createMembership(actor, customerId, input)`: eğitmen için stüdyo `group` modelindeyse `403 FORBIDDEN`; gövdede `feeKurus` varsa `400 FEE_NOT_ALLOWED`; ücret paket fiyatından.
  - `listPackages(actor)`: eğitmene `redactPrices` ile.
  - `listAllGroups`, `getGroup`, `createGroup`, `updateGroup`, `closeGroup`, adminCustomers `listGroups`: `branchClause`; eğitmen grubu kapsam dışı bir şubeye koyamaz/taşıyamaz (`404 BRANCH_NOT_FOUND`).
  - `groupInput` yeni alan `instructorId` (yönetici ve `manage_groups`'lu eğitmen): rolü `instructor`, aynı stüdyo, grubun şubesine atanmış olmalı; değilse `400 INVALID_INSTRUCTOR`. `getGroup`/`listAllGroups` cevabında `instructor: { id, name } | null`.
  - `listBranches(actor)`: eğitmen için yalnızca kendi şubeleri.
- [ ] **Step 1: Testler** — `customer list limited to branch`, `other branch customer is 404 on every customer route` (dolaşan tek test), `instructor must put new customer in own branch group`, `cannot reset password of admin or instructor`, `group model: instructor cannot open membership period`, `package model: instructor opens period, fee from package, fee field rejected`, `no price keys reach an instructor` (Review Focus 3: tüm yetkileri açık eğitmenle müşteri detayı, üyelikler, paketler cevapları derin taranır), `groups limited to branch`, `cannot move group to other branch`, `group instructor must belong to branch`, `admin unchanged` (mevcut testler).
- [ ] **Step 2: FAIL. Step 3: Uygula. Step 4: PASS; `npm test` PASS.**
- [ ] **Step 5: Commit durağı (Pınar)** — Görev 4–5.

```bash
git add server/src server/test
```

```bash
git commit -m "feat(instructors): branch-scoped sessions, take-over, customers and groups; prices hidden"
```

### Task 6 (Görev 6): Eğitmen yönetimi API'si — ~2 saat

**Files:**
- Create: `server/src/services/adminInstructors.js`
- Modify: `server/src/routes/admin.js`
- Test: `server/test/adminInstructors.test.js`

**Interfaces:**
- Produces (hepsi yalnızca yönetici):
  - `GET /api/admin/instructors` → `[{ id, fullName, phone, status, branches: [{ id, name }] }]`
  - `POST /api/admin/instructors` `{ fullName, phone, branchIds }` → `201 { instructor, temporaryPassword }` (`createUser` + `tempPassword`; en az bir şube, yoksa `400 BRANCH_REQUIRED`; telefon çakışırsa mevcut üye eklemedeki hata kodu).
  - `GET /api/admin/instructors/:id` → yukarıdaki + `permissions`.
  - `PUT /api/admin/instructors/:id` `{ branchIds?, permissions? }` → güncel kayıt. `permissions` yalnızca bilinen 9 anahtar; `view_customers` false gelirse bağımlı üçü de false yazılır.
  - `POST /api/admin/instructors/:id/reset-password` → `{ temporaryPassword }`.
  - `POST /api/admin/instructors/:id/leave` → `status = 'left'`, `revokeAllSessions`.
- [ ] **Step 1: Testler** — `create instructor with branches and default permissions`, `branch required`, `branch of other studio rejected`, `update permissions applies on next request`, `turning off view_customers turns off dependants`, `removing a branch hides it at once` (Review Focus 2), `leaving revokes sessions` (Review Focus 2: eğitmenin istemcisi sonraki istekte 401), `instructor cannot call instructor routes` (403).
- [ ] **Step 2: FAIL. Step 3: Uygula. Step 4: PASS.**

### Task 7 (Görev 7): İstemci — eğitmen paneli ve Eğitmenler ekranı — ~4,5 saat

**Files:**
- Create: `client/src/admin/InstructorsPage.jsx`, `client/src/admin/InstructorDetailPage.jsx`, `client/src/admin/permissions.js`
- Modify: `client/src/App.jsx` (`role === 'instructor'` da yönetici paneline gider), `client/src/admin/AdminApp.jsx`, `TodayPage.jsx`, `SessionRosterPage.jsx`, `GroupFormPage.jsx`, `GroupsPage.jsx`, `CustomerDetailPage.jsx`, `MembershipCard.jsx`, `NewCustomerPage.jsx`, `README.md`

**Interfaces:**
- Consumes: Görev 2 `me` cevabı; Görev 4–6 uçları.
- Produces: `permissions.js` → `PERMISSION_GROUPS` (5.2 tablosundaki bölüm, anahtar, Türkçe etiket, bağımlılık) ve `visibleTabs(user) -> tab[]`: yönetici bugünkü 5 sekme + **Eğitmenler**; eğitmen Bugün her zaman, Müşteriler `view_customers`, Gruplar `manage_groups`; Ödemeler ve Ayarlar hiç.
- [ ] **Step 1: Ekranlar.**
  - Eğitmenler listesi ve yeni eğitmen formu (ad, telefon, şube hapları), kayıttan sonra mevcut `CredentialsPage` ile geçici şifre.
  - Eğitmen detayı: şubeler, `PERMISSION_GROUPS`'a göre bölümlü anahtarlar ("Üyeleri görmek" kapalıyken bağımlılar pasif), şifre sıfırla, "Ayrıldı" (kırmızı, alttan onay penceresi). Kaydetme toast.
  - Bugün: eğitmen için üstte **Benim derslerim / Bütün dersler** (varsayılan "Benim derslerim", `isMine` ile istemcide süzülür); ders kartında eğitmen adı; yöneticide filtre yok.
  - Ders detayı: "Bu dersi bugün X veriyor"; `canTakeOver` ise yoklama düğmeleri yerine **"Bu dersi ben veriyorum"**; yönetici için eğitmen değiştirme seçimi. İptal düğmesi yalnızca izinliyse.
  - Grup formu: "Eğitmen" seçimi (şubeye atanmış eğitmenler + "Atanmadı").
  - Müşteri detayı ve üyelik kartı: eğitmende ödeme/ücret/kalan borç alanları ve ödeme ekleme hiç çizilmez (sunucu zaten göndermiyor; `undefined` alanlar çökertmemeli). Grup modelinde "Dönem aç" eğitmende görünmez.
- [ ] **Step 2: Tarayıcıda doğrula** (test veritabanında demo: iki şube, iki eğitmen; 375 ve 1280): yönetici eğitmen ekler, yetki değiştirir; eğitmen girişi, ilk şifre değişimi, menü, filtre, devralma, yoklama, iptal; yetkisiz ekranların menüde olmaması; konsolda hata yok. `npm run lint` ve `npm run build` temiz.
- [ ] **Step 3: README** — yol haritasında "Instructor role and panel" işareti PR 2 sonunda; bu görevde kısa "Instructors" bölümü (rol, şube kapsamı, yetkiler, fiyatların gizli olduğu) İngilizce.
- [ ] **Step 4: Commit durağı (Pınar)** — Görev 6–7; sonra bağımsız inceleme ve PR 1.

```bash
git add server client README.md
```

```bash
git commit -m "feat(instructors): instructor management API and panel"
```

---

## PR 2 — `feat/extra-sessions`

### Task 8 (Görev 8): Gizli grupların dışlanması — ~1,5 saat

**Files:**
- Modify: `server/src/services/adminGroups.js`, `adminCustomers.js`, `adminBranches.js`, `sessionGenerator.js`, `server/src/routes/studio.js`, gerekirse `seedDev.js`
- Test: `server/test/extraGroupsHidden.test.js`

**Interfaces:**
- Produces: `kind = 'extra'` gruplar şu yerlerde yok: `listAllGroups`, `getGroup` (404), `updateGroup`/`closeGroup` (404), adminCustomers `listGroups`, `createCustomer`/`changeCustomerGroup` hedef grubu (404), şube kapatma önizlemesindeki grup sayıları, `/api/site` ve `/api/studio` içindeki grup bazlı her şey. `sessionGenerator` zaten `group_days` üzerinden çalışır; testle sabitlenir.
- [ ] **Step 1:** `server/src` içinde `FROM groups` / `JOIN groups` geçen her sorguyu tara (bugün 10 dosya); dersler üzerinden gelenler (Bugün, roster, telafi listesi, `chargeableSessions`) ek dersi **göstermeli**, grup listeleri **göstermemeli**. Her dışlanan yer için bir test yaz (fixture: doğrudan SQL ile `kind = 'extra'` grup + tek ders).
- [ ] **Step 2: FAIL. Step 3: `AND g.kind = 'regular'` ekle. Step 4: PASS; `npm test` PASS.**

### Task 9 (Görev 9): Ek ders açma API'si — ~2 saat

**Files:**
- Create: `server/src/services/adminExtraSessions.js`
- Modify: `server/src/routes/staff.js`
- Test: `server/test/extraSessions.test.js`

**Interfaces:**
- Produces: `POST /api/admin/extra-sessions` (`can('create_extra_sessions')`) → `201 { session }` (Görev 4'teki ders kartı biçiminde).
  - `createExtraSession(actor, { date, startTime, durationMinutes, capacity, branchId, instructorId, title }, { db })`
  - Doğrulama: tarih + saat stüdyo saat diliminde gelecekte (`400 IN_THE_PAST`); süre ve kapasite pozitif tamsayı (gruptaki kurallarla aynı hata kodları); şube açık ve kapsamda; eğitmen açınca `instructorId` yok sayılmaz, gönderildiyse ve kendisi değilse `400 INVALID_INSTRUCTOR`, gönderilmediyse kendisi; yönetici için isteğe bağlı, verilirse şubeye atanmış eğitmen. `title` kırpılır, boşsa `"Ek ders"`, en çok grup adı sınırı kadar.
  - Tek transaction: `groups` (`kind='extra'`, `instructor_id`) + tek `sessions` (`starts_at` stüdyo saat diliminde, `capacity`).
  - İptal: mevcut `POST /api/admin/sessions/:id/cancel`; ek derste telafi kullananların hakları bugünkü iptal kuralıyla döner, paket modelinde kayıt satırları kaldırılır (testle sabitle; gerekiyorsa `cancelSessionByStudio`'ya ek ders dalı).
- [ ] **Step 1: Testler** — `instructor creates extra session assigned to self`, `admin creates with chosen instructor`, `past time rejected`, `other branch rejected`, `default title`, `extra session appears in today with kind extra`, `cancelling extra session returns makeup credits`, `cancelling extra session in package model removes bookings`.
- [ ] **Step 2: FAIL. Step 3: Uygula. Step 4: PASS.**
- [ ] **Step 5: Commit durağı (Pınar)** — Görev 8–9.

```bash
git add server/src server/test
```

```bash
git commit -m "feat(extra-sessions): one-off extra sessions as hidden groups"
```

### Task 10 (Görev 10): Üyenin ek derse kaydı — ~3 saat

**Files:**
- Modify: `server/src/services/booking.js`, `server/src/services/schedule.js`, `server/src/routes/sessions.js`
- Test: `server/test/extraBooking.test.js`

**Interfaces:**
- Produces:
  - Grup modeli: değişiklik yok; ek ders `listBookableSessions`'ta çıkar, `bookMakeup` ve `swapSession` ile alınır (testle sabitle). DTO'ya `kind`.
  - Paket modeli: `bookMakeupInTransaction` hedef `kind = 'extra'` ise `MAKEUP_NOT_AVAILABLE` yerine paket dalına gider: şube kuralı (`assertBranchAllowed`), başlamamış, `is_before_makeup_cutoff`, pencere içinde, dondurulmamış, zaten kayıtlı değil, yer var (`FOR UPDATE` kilidi korunur), **kalan seans − bitmemiş ek ders kayıtları > 0** (`packageUsage` ile; değilse `409 NO_SESSIONS_LEFT`, metin "Paketinde kullanılabilir seans yok."). Kayıt: `INSERT INTO credits (user_id, used_session_id, used_at, expires_at)` — `expires_at` dersin başlangıcından sonra bir değer (kısıt `expires_after_created`).
  - `listExtraSessions(user)` — paket modeli için `GET /api/me/extra-sessions`: pencere içindeki, planlı, şube kuralına uyan ek dersler ve `myStatus`.
  - `cancelMakeup`: paket modelinde ek ders kaydıysa satır **silinir** (forfeit yok); iptal süresi kuralı aynen.
  - Normal derse paket modelinde kayıt bugünkü gibi `MAKEUP_NOT_AVAILABLE`.
- [ ] **Step 1: Testler** — `group model books extra with credit`, `group model without credit cannot book extra`, `package member books extra and it is charged after it ends` (`chargeableSessions` sonucu), `package member with one session left cannot book two extras`, `package member with expired package cannot book`, `package member cannot book extra in other branch` (Review Focus 5), `package member withdraws in time and is not charged`, `late withdrawal is rejected and session is charged`, `regular session still not bookable in package model`, `two members race for last spot` (mevcut eşzamanlılık testi deseni).
- [ ] **Step 2: FAIL. Step 3: Uygula. Step 4: PASS; `npm test` PASS.**

### Task 11 (Görev 11): İstemci — ek ders ekranları — ~3 saat

**Files:**
- Create: `client/src/admin/ExtraSessionSheet.jsx`, `client/src/whatsapp.js`
- Modify: `client/src/admin/TodayPage.jsx`, `SessionRosterPage.jsx`, üye tarafında Derslerim ve telafi seçme sayfaları (`client/src/pages/`), `README.md`

**Interfaces:**
- Produces: `whatsappShareUrl(text: string) -> string` (`https://wa.me/?text=` + `encodeURIComponent`); `extraSessionMessage({ date, startTime, branchName, url }) -> string` — örnek: `"Cumartesi 29 Kasım 10:00'da Konyaaltı şubesinde ek ders açtım. Gelmek isteyenler sistemden yerini ayırsın: https://…"` (tarih biçimi `format.js`'teki yardımcılarla).
- [ ] **Step 1: Ekranlar.**
  - Bugün'de yetkiliye **"+ Ek ders"**: alttan açılan form (tarih, saat, süre, kapasite, şube — tek şubede gizli, eğitmen — yalnızca yönetici, başlık). Kayıttan sonra toast ve **"WhatsApp'ta paylaş"**.
  - Ders kartlarında ve ders detayında "Ek ders" etiketi; detayda WhatsApp düğmesi.
  - Üye, grup modeli: telafi listesinde ek ders etiketi. Paket modeli: Derslerim'de **"Ek dersler"** bölümü (yalnızca liste boş değilse), "Yerimi ayır" / "Vazgeç", hata metinleri sunucudan.
- [ ] **Step 2: Tarayıcıda doğrula** (iki modelde, 375 ve 1280): eğitmen ek ders açar ve paylaşım bağlantısı doğru metinle açılır; üye kaydolur ve vazgeçer; dolu ek ders "Dolu"; konsol temiz. `npm run lint`, `npm run build` temiz.
- [ ] **Step 3: README** — "Extra sessions" kısa bölüm; yol haritasında "Instructor role and panel" işaretlenir.
- [ ] **Step 4: Commit durağı (Pınar)** — Görev 10–11; bağımsız inceleme ve PR 2.

```bash
git add server client README.md
```

```bash
git commit -m "feat(extra-sessions): member booking and extra session screens"
```
