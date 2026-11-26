# Yönetici Analiz Paneli Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetici paneline seçilen ayın gelirini, aktif/yeni üyesini, yapılan ders ve doluluğunu, 12 aylık gelir eğilimini, bekleyen ödemeleri ve bir aydır gelmeyenleri gösteren bir "Analiz" sekmesi eklemek.

**Architecture:** Sunucuda tek uç: `GET /api/admin/dashboard?month=YYYY-MM` (yalnızca yönetici). Hesap `services/adminDashboard.js`'te yapılır. "Kim hangi derse geldi" kuralı tek bir SQL parçasında (`visitsCte`) tanımlanır ve aylık sayılarla son geliş tarihinde aynı parça kullanılır. "Bir aydır gelmeyen" kuralı saf bir JS fonksiyonudur (`isLapsed`) ve onu Pınar yazar. İstemcide `DashboardPage.jsx` grafik kütüphanesi kullanmadan, CSS ile çizilir.

**Tech Stack:** Express 5, PostgreSQL (`pg`), `node:test`; React 19 + CSS modülleri.

**Spec:** `docs/superpowers/specs/2026-11-26-admin-dashboard-design.md`

**Dal:** `feat/admin-dashboard` (`main`'den). Tahmini toplam: ~3–4 saat.

## Global Constraints

- Para her yerde kuruş cinsinden tamsayı (`...Kurus`). Ekranda `formatMoney` kullanılır.
- Ay sınırları stüdyonun saat dilimine göre (`studios.timezone`). `sessions.date` ve `payments.paid_on` zaten yerel takvim günü. `users.created_at` için `AT TIME ZONE st.timezone` kullanılır.
- `month` parametresi `YYYY-MM` biçiminde, `01`–`12` arası olmalı ve stüdyonun bu ayından sonra olamaz. Aksi halde `400 INVALID_MONTH` döner, mesajı "Ay geçersiz.". Parametre verilmezse bu ay kullanılır.
- Uç `routes/admin.js`'e eklenir (yalnızca yönetici). Eğitmen 403, müşteri 403 alır. Sekme `visibleTabs`'ta eğitmene hiç gösterilmez.
- Başka stüdyonun hiçbir verisi sayılara girmez (her sorguda `studio_id = $1`).
- Arayüz metinleri Türkçe. Sekme etiketi "Analiz". Kodda gerçek stüdyo adı geçmez.
- Commit, push ve PR Pınar'dadır. Mesajlarda Claude adı ya da `Co-Authored-By` olmaz.

## Review Focus

1. **Yoklamada "gelmedi" işaretli üye** aktif üye ve doluluk sayısına girmemeli → Task 1 testi `absent, cancelled, frozen and future do not count as visits`.
2. **Ayın 1'i gece yarısı / saat dilimi kayması** (UTC'de önceki ay, İstanbul'da bu ay olan ödeme ya da hesap) doğru aya düşmeli → Task 1 testi `new members use the studio's local month`.
3. **Hiç dersi ya da ödemesi olmayan ay** (stüdyonun ilk ayı) hata vermemeli: sayılar 0, doluluk `null`, eğilimde 12 satır → Task 2 testi `empty studio returns zeros and twelve trend months`.
4. **Gelecek ay ya da bozuk `month`** (`2026-13`, `abc`, `2027-01`) 400 dönmeli → Task 1 testi `invalid or future month is rejected`.
5. **Ayrılmış üye** "bir aydır gelmeyenler" listesinde görünmemeli ama geçmiş aylardaki aktif üye sayısında kalmalı → Task 3 testi `left customers are not lapsed but still count in past months`.

---

### Task 1: Ziyaret kuralı ve aylık sayılar (TDD) — ~1,5 saat

**Files:**
- Create: `server/src/services/adminDashboard.js`
- Modify: `server/src/routes/admin.js` (yeni uç, "Ödemeler" bölümünden sonra `// --- Analiz` başlığıyla)
- Test: `server/test/adminDashboard.test.js`

**Interfaces:**
- Produces:
  - `export async function getDashboard(admin, { month } = {}, { db = pool } = {})`: bu görevde dönen nesne `{ month: 'YYYY-MM', isCurrentMonth: boolean, revenue: { kurus, previousKurus }, activeMembers: { count, previous }, newMembers: { count, previous }, sessions: { held, previousHeld, avgOccupancy, previousAvgOccupancy } }`. Doluluk 0–1 arası sayı ya da `null`, tüm sayılar JS `number`.
  - `function visitsCte(fromParam, toParam)`: modül içi. `$1 = studio_id` varsayar ve `visits(session_id, user_id, date)` adında bir CTE metni döner. Verilen tarih aralığı (iki uç dahil) içindeki geçmiş, iptal edilmemiş derslerde gelen her üye bir satırdır. Task 2 ve 3 de bunu kullanır.
  - `GET /api/admin/dashboard?month=YYYY-MM` → `getDashboard` sonucunu JSON olarak döner.

- [ ] **Step 1: Testleri yaz.** Testler **geçen ayı** sorgular (`?month=<geçen ay>`). Böylece dersler kesinlikle geçmişte kalır ve ayın ilk günü sorunu çıkmaz. Dosyanın başına iki yardımcı eklenir:
  - `pastMonth(offset)`: stüdyo saatine göre `'YYYY-MM'` döner (`-1` = geçen ay).
  - `sessionOn(groupId, date, { capacity, status } = {})`: o gün yerel saatle 09:00'da bir ders ekler ve `id` döner.

  Testler (`describe('admin dashboard')`):
  - `revenue sums payments of the month and the month before`: geçen ay 1500 ₺ + 500 ₺, iki ay önce 300 ₺, başka stüdyoda 999 ₺ → `revenue.kurus === 200000`, `revenue.previousKurus === 30000`.
  - `active members counts distinct visitors`: 3 kişilik bir grup ve geçen ay 2 ders. A ikisine de gelir, B birine gelir, C'nin satırı yoktur (gruba sonradan katılmıştır) → `activeMembers.count === 2`.
  - `absent, cancelled, frozen and future do not count as visits`: geçen ayın dersinde D yoklamada `attendance` ile işaretli, E `insertCancellation` yapmış, F o tarihte `freezes` ile dondurulmuş, G başka gruptan `insertMakeup` ile gelmiş. Ayrıca `status = 'cancelled'` olan bir derste H vardır → yalnızca G ve D/E/F'nin dışındaki düzenli üyeler sayılır. Ayrıca `sessions.held`, iptal edilen dersi saymaz.
  - `occupancy averages came / capacity per session`: kapasitesi 4 olan iki ders: birine 2 kişi, diğerine 1 kişi gelir → `sessions.held === 2`, `avgOccupancy === 0.375`. Önceki ayda ders yok → `previousAvgOccupancy === null`.
  - `new members use the studio's local month`: bir müşterinin `created_at` değeri geçen ayın 1'i 00:30 İstanbul saatidir (UTC'de bir önceki ay) → geçen ayda sayılır. Admin ve eğitmen hesapları sayılmaz.
  - `invalid or future month is rejected`: `2026-13`, `abc` ve bir sonraki ay için 400 ve `INVALID_MONTH` döner. Parametresiz istek 200 döner ve `isCurrentMonth === true` olur.
  - `only admins`: `createInstructor` ile açılan, tüm yetkileri açık eğitmen 403 alır.

- [ ] **Step 2: Testleri çalıştır, kırmızı olduklarını gör.**
  Run: `cd server && npm test -- --test-name-pattern="admin dashboard"`
  Expected: FAIL (404 / `getDashboard` yok).

- [ ] **Step 3: `visitsCte` ve `getDashboard`'u yaz.** Ziyaret kuralı `adminSchedule.js`'teki roster sorgusuyla aynı olmalı. Tek fark, `attendance` satırı olanlar çıkarılır:

  ```sql
  visits AS (
    SELECT s.id AS session_id, gm.user_id, s.date
    FROM sessions s
    JOIN groups g ON g.id = s.group_id AND g.studio_id = $1
    JOIN group_members gm ON gm.group_id = s.group_id
                         AND gm.joined_on <= s.date AND (gm.left_on IS NULL OR s.date < gm.left_on)
    WHERE s.status = 'scheduled' AND s.starts_at <= now() AND s.date BETWEEN ${from} AND ${to}
      AND NOT EXISTS (SELECT 1 FROM freezes f WHERE f.user_id = gm.user_id
                      AND daterange(f.starts_on, f.ends_on, '[]') @> s.date)
      AND NOT EXISTS (SELECT 1 FROM credits c WHERE c.user_id = gm.user_id AND c.source_session_id = s.id)
    UNION
    SELECT s.id, c.user_id, s.date
    FROM credits c
    JOIN sessions s ON s.id = c.used_session_id
    JOIN groups g ON g.id = s.group_id AND g.studio_id = $1
    WHERE s.status = 'scheduled' AND s.starts_at <= now() AND s.date BETWEEN ${from} AND ${to}
  ),
  came AS (
    SELECT v.* FROM visits v
    WHERE NOT EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = v.session_id AND a.user_id = v.user_id)
  )
  ```

  `getDashboard` önce stüdyonun bugününü ve saat dilimini okur, ardından `month`'u doğrular. Seçilen ayın ve önceki ayın sınırları SQL'de `date_trunc('month', ...)` ile hesaplanır. Her metrik iki ay için tek sorguda `GROUP BY` ile alınır. `count` ve `sum` sonuçları `::int` ya da `::bigint` olarak çevrilir, sonra `Number()` ile sayıya dönüştürülür (pg, bigint'i string döner). Doluluk için önce ders başına `count(came) / capacity` hesaplanır, ardından ortalaması alınır. Gelinmeyen dersler de `LEFT JOIN` ile 0 olarak ortalamaya girer.

- [ ] **Step 4: Uç ekle.** `routes/admin.js`: `router.get('/api/admin/dashboard', ...)` → `res.json(await getDashboard(req.user, { month: req.query.month }))`.

- [ ] **Step 5: Testleri çalıştır, yeşil olduklarını gör.**
  Run: `cd server && npm test`
  Expected: tüm testler PASS (eski testler dahil).

- [ ] **Step 6: Commit (Pınar).** `feat(dashboard): monthly revenue, members and sessions endpoint`

---

### Task 2: 12 aylık eğilim ve bekleyen ödemeler (TDD) — ~45 dk

**Files:**
- Modify: `server/src/services/adminDashboard.js`
- Test: `server/test/adminDashboard.test.js`

**Interfaces:**
- Consumes: `visitsCte` (Task 1), `getPaymentOverview(admin, { db })` (`adminMemberships.js`, `underpaid[].remainingKurus` ve `customerId`).
- Produces: `getDashboard` sonucuna iki alan eklenir:
  - `trend: [{ month: 'YYYY-MM', revenueKurus, activeMembers, sessionsHeld }]`: tam 12 satır, en eskiden seçilen aya doğru sıralı.
  - `pendingPayments: { customerCount, totalKurus }`: bugüne göre hesaplanır.

- [ ] **Step 1: Testleri yaz.**
  - `trend has twelve months ending at the selected month`: geçen ay sorgulanır. 12 satır gelir, son satırın `month` alanı geçen ay, ilkininki 11 ay öncesidir. Geçen aya girilen 1000 ₺ son satırın `revenueKurus` değerinde ve 1 ziyaret de `activeMembers === 1` olarak görünür.
  - `empty studio returns zeros and twelve trend months`: verisi olmayan stüdyoda tüm sayılar 0, doluluk `null`, `trend.length === 12` ve her satır sıfırdır.
  - `pending payments sum the remaining amounts`: biri 4500 ₺ ücret / 1500 ₺ ödeme, diğeri 1000 ₺ / 0 ödeme olan iki üye → `{ customerCount: 2, totalKurus: 400000 }`. Aynı kişinin iki eksik dönemi olursa `customerCount` yine 1'dir.

- [ ] **Step 2: Çalıştır, kırmızı.** `cd server && npm test -- --test-name-pattern="admin dashboard"`

- [ ] **Step 3: Uygula.** Ay listesi `generate_series(date_trunc('month', $sel) - interval '11 months', date_trunc('month', $sel), interval '1 month')` ile kurulur. Gelir, ziyaret ve ders sayıları bu listeye `LEFT JOIN` yapılır, böylece boş aylar da 0 olarak gelir. Bekleyen ödeme için `getPaymentOverview` çağrılır ve sonucundaki `underpaid` toplanır. Kural kopyalanmaz.

- [ ] **Step 4: Çalıştır, yeşil.** `cd server && npm test`

- [ ] **Step 5: Commit (Pınar).** `feat(dashboard): twelve-month trend and pending payments`

---

### Task 3: Bir aydır gelmeyenler (kural Pınar'da) — ~45 dk

**Files:**
- Create: `server/src/services/lapsedRule.js` (saf fonksiyon, veritabanı yok)
- Modify: `server/src/services/adminDashboard.js`
- Test: `server/test/lapsedRule.test.js`, `server/test/adminDashboard.test.js`

**Interfaces:**
- Produces:
  - `export const LAPSED_AFTER_DAYS`: eşik gün sayısı.
  - `export function isLapsed({ lastVisitOn, joinedOn, isFrozenToday, today })`: dönüş `boolean`. `lastVisitOn` hiç gelmediyse `null` olur. `joinedOn` hesabın açıldığı yerel gündür. Tarihler `'YYYY-MM-DD'` metnidir.
  - `getDashboard` sonucuna `lapsed: [{ customerId, fullName, branchName, lastVisitOn, daysSince }]` eklenir ve liste `daysSince` küçükten büyüğe sıralanır. `daysSince`, hiç gelmemişse `joinedOn`'dan itibaren sayılır.

- [ ] **Step 1: İskeleti Claude hazırlar.** `lapsedRule.js` dosyası imza, açıklama ve `TODO(Pınar)` ile oluşturulur. `adminDashboard.js` her aktif müşteri (`status <> 'left'`) için tek bir sorguyla `lastVisitOn` (tüm zamanların `came` CTE'sinden `max(date)`), `joinedOn`, `isFrozenToday` ve şube adını (bugünkü grubu, `getPaymentOverview`'daki LEFT JOIN kalıbı) getirir, sonra listeyi `isLapsed` ile süzer.

- [ ] **Step 2: Pınar `isLapsed`'i yazar (5–10 satır).** Verilecek kararlar:
  - Eşik kaç gün? (Konuşmada "bir ay" dendi: 30 mu, 28 mi?)
  - **Donmuş üye** listeye girsin mi? (Tatildeki üyeyi aramak yersiz olabilir.)
  - **Hiç gelmemiş üye:** hesabı açıldıktan sonra eşik kadar süre geçtiyse listeye girsin mi, yoksa ayrı bir durum mu?

- [ ] **Step 3: Kurala göre testleri birlikte yaz.**
  - `lapsedRule.test.js`: eşiğin bir gün öncesi `false`, eşik günü ve sonrası Pınar'ın kararına göre. Donmuş ve hiç gelmemiş üye için de birer test.
  - `adminDashboard.test.js` → `left customers are not lapsed but still count in past months`: geçen ay gelmiş, sonra `status = 'left'` olmuş bir üye `lapsed`'te yoktur ama geçen ayın `activeMembers` sayısında vardır.
  - `lapsed list is sorted by most recently lapsed first`.

- [ ] **Step 4: Çalıştır, yeşil.** `cd server && npm test`

- [ ] **Step 5: Commit (Pınar).** `feat(dashboard): members who stopped coming`

---

### Task 4: Analiz sekmesi (istemci) — ~1 saat

**Files:**
- Create: `client/src/admin/DashboardPage.jsx`, `client/src/admin/Dashboard.module.css`
- Modify: `client/src/admin/permissions.js` (`ALL_TABS`'a `{ id: 'dashboard', label: 'Analiz' }`, Bugün'den hemen sonra; eğitmen `allowed` kümesine eklenmez)
- Modify: `client/src/admin/AdminApp.jsx` (`tab === 'dashboard'` dalı; `onOpenCustomer={openCustomer}`, `onOpenPayments={() => setTab('payments')}`)
- Modify: `client/src/format.js` (`formatMonth('2026-11') → 'Kasım 2026'`, `formatMonthShort('2026-11') → 'Kas'`)

**Interfaces:**
- Consumes: `GET /api/admin/dashboard?month=` (Task 1–3 yanıt biçimi), `formatMoney`, `formatDateDayMonth`.
- Produces: `export default function DashboardPage({ studio, onOpenCustomer, onOpenPayments })`.

- [ ] **Step 1: Grafik işine başlamadan `dataviz` skill'ini oku.** Renkler mevcut tema değişkenlerinden (`--accent` vb., `Admin.module.css`) alınır, yeni renk eklenmez.
- [ ] **Step 2: Sayfayı yaz.** Ay değiştiricinin "›" düğmesi `isCurrentMonth` iken pasif olur. Kartlar, spec'teki "Ekran" bölümündeki sırayla dizilir. Fark etiketi şöyle: `previous === 0` ise fark gösterilmez, değilse `↑ %12` ya da `↓ %5` yazar. Eğilim grafiği flex sütunlarla çizilir; yükseklik `revenueKurus / max` oranıdır, hepsi 0 ise sütunlar düz bir çizgi olur. Her sütunda `title` ve `aria-label` ile ay, gelir, aktif üye ve ders sayısı yazar. Listeler, `PaymentsPage`'deki `Section` görünümüyle uyumlu olur.
- [ ] **Step 3: Lint.** Run: `cd client && npm run lint` → Expected: hata yok.
- [ ] **Step 4: Tarayıcıda doğrula.** `npm run seed:dev` ve `npm run seed:payments` ile verisi olan stüdyoda yönetici olarak giriş yapılır. Analiz sekmesi açılır, ay geri ve ileri değiştirilir, gelmeyenlerden birine dokununca müşteri detayı, bekleyen ödemelere dokununca Ödemeler açılır. Mobil (375 px) ve masaüstünde ekran görüntüsü alınır. Eğitmen girişinde sekmenin görünmediği kontrol edilir. Konsolda hata olmamalı.
- [ ] **Step 5: Commit (Pınar).** `feat(dashboard): admin analytics tab`
