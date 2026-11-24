import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import adminRouter from '../src/routes/admin.js';
import sessionsRouter from '../src/routes/sessions.js';
import staffRouter from '../src/routes/staff.js';
import { createUser, resetLoginAttempts } from '../src/services/auth.js';
import {
  createAdmin, createBranch, createCustomer, createGroup, createSession, createSessionToday, createStudio,
  grantCredit, insertMakeup, pool, resetDb,
} from './helpers.js';
import { client, clientFor, useServer } from './http.js';

// Veri ayrımı kanıtı: A stüdyosunun yöneticisi ve üyesi, B stüdyosunun kayıtlarını hiçbir uçtan
// göremez ve değiştiremez. B'nin bütün metinleri "B-GIZLI" içerir; bir yanıtta bu ifade görünürse sızıntı var.
// Spec'e göre başka stüdyonun kimliği kaydın varlığını sızdırmayan bir yanıt alır. Bunu en sıkı biçimde ölçüyoruz:
// B'nin kaydına verilen yanıt, hiç var olmayan bir kayda verilen yanıtla birebir aynı olmalı (durum kodu ve gövde).
useServer();
after(() => pool.end());
beforeEach(async () => {
  await resetDb();
  resetLoginAttempts();
});

const SECRET = 'B-GIZLI';

// Stüdyonun saatine göre bugünden n gün sonrası ("YYYY-MM-DD").
async function day(n = 0) {
  const { rows: [row] } = await pool.query(
    `SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`,
    [n],
  );
  return row.d;
}

// Bir stüdyoyu bütün kayıt türleriyle kurar: yönetici, gruplu üye, telafiye gelen misafir, grup,
// bugünkü ve ileri tarihli dersler, telafi hakkı, üyelik dönemi ve ödeme.
async function buildStudio(slug, label) {
  const studio = await createStudio({ slug });
  await pool.query('UPDATE studios SET name = $2 WHERE id = $1', [studio, `${label}-Stüdyo`]);
  const group = await createGroup(studio);
  await pool.query('UPDATE groups SET name = $2 WHERE id = $1', [group, `${label}-Grup`]);
  await pool.query('INSERT INTO group_days (group_id, weekday) SELECT $1, d FROM generate_series(1, 7) d', [group]);

  const admin = await createAdmin(studio);
  const customer = await createCustomer(studio, group);
  const guest = await createCustomer(studio);
  await pool.query(`UPDATE users SET full_name = $2 || '-' || role || '-' || id WHERE id = ANY($1)`, [[admin, customer, guest], label]);

  const todaySession = await createSessionToday(group, '23:00');
  const session = await createSession(group, 48);
  const laterSession = await createSession(group, 96);
  // Başlamış (dünkü) ders: yoklama yalnızca başlamış derste alınır.
  const pastSession = await createSession(group, -26);
  await insertMakeup(guest, session);
  await grantCredit(customer);
  await pool.query('UPDATE credits SET note = $2 WHERE user_id = $1', [customer, `${label}-not`]);

  const { rows: [membership] } = await pool.query(
    `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, note)
     VALUES ($1, $2, $3, 100000, $4) RETURNING id`,
    [customer, await day(-10), await day(20), `${label}-üyelik`],
  );
  const { rows: [payment] } = await pool.query(
    `INSERT INTO payments (membership_id, amount_kurus, paid_on, method, note)
     VALUES ($1, 50000, $2, 'cash', $3) RETURNING id`,
    [membership.id, await day(-5), `${label}-ödeme`],
  );
  return {
    studio, group, admin, customer, guest, todaySession, session, laterSession, pastSession,
    membership: membership.id, payment: payment.id,
    // İkinci şube (grubu yok): kapatma isteği "açık grup var" yüzünden değil, başka stüdyonun olduğu için reddedilmeli.
    branch: await createBranch(studio, { name: `${label}-Şube`, address: `${label}-adres` }),
  };
}

async function twoStudios() {
  const A = await buildStudio('test-1', 'A-ACIK');
  const B = await buildStudio('ikinci', SECRET);
  return { A, B, adminA: await clientFor(A.admin), customerA: await clientFor(A.customer) };
}

// Seans paketi modelindeki iki stüdyo: paket uçları yalnızca bu modelde açık. Grup modelindeki A, B'nin paketini
// zaten göremezdi (uç kapalı); bu yüzden A da paket modelinde olmalı ki "başka stüdyonun kaydı" gerçekten sınansın.
async function twoPackageStudios() {
  const studios = await twoStudios();
  for (const [S, label] of [[studios.A, 'A-ACIK'], [studios.B, SECRET]]) {
    await pool.query(`UPDATE studio_settings SET membership_model = 'package' WHERE studio_id = $1`, [S.studio]);
    const { rows: [pkg] } = await pool.query(
      `INSERT INTO packages (studio_id, name, session_count, price_kurus, validity_days)
       VALUES ($1, $2, 8, 240000, 45) RETURNING id`,
      [S.studio, `${label}-Paket`],
    );
    S.package = pkg.id;
  }
  return studios;
}

// Bütün tabloların içeriği: istekten önce ve sonra karşılaştırılır. Bir şey değiştiyse reddedilen istek
// bile iz bırakmış demektir. user_sessions dahil: şifre sıfırlama oturumları kapatır.
const TABLES = [
  'studios', 'studio_settings', 'users', 'groups', 'group_days', 'group_members',
  'sessions', 'credits', 'freezes', 'memberships', 'payments', 'user_sessions', 'packages', 'attendance',
];
async function snapshot() {
  const parts = {};
  for (const table of TABLES) {
    const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY 1, 2`);
    parts[table] = rows;
  }
  return JSON.stringify(parts);
}

// Hiç var olmayan kimlikler: "B'nin kaydı" ile "olmayan kayıt" yanıtlarını karşılaştırmak için B'nin yerine geçer.
const MISSING = {
  session: 999001, laterSession: 999002, todaySession: 999003, customer: 999004,
  guest: 999005, group: 999006, membership: 999007, payment: 999008, branch: 999009,
  package: 999010, pastSession: 999011,
};

// Başka stüdyonun kaydına yapılan isteğin dört koşulu: istemci hatası (4xx, 500 değil), yanıt olmayan kayıtla
// aynı (varlık sızmaz), gizli metin yok, hiçbir tablo değişmedi.
async function assertRejectedWithoutTrace(c, method, [path, body], [missingPath, missingBody]) {
  const before = await snapshot();
  const res = await c.request(method, path, body);
  const missing = await c.request(method, missingPath, missingBody);
  const label = `${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`;
  assert.ok(res.status >= 400 && res.status < 500, label);
  // Ret sebebi "bulunamadı" olmalı. Geçersiz gövde yüzünden (ör. hatalı tarih) reddedilseydi B'nin kaydı da
  // olmayan kayıt da aynı hatayı alırdı ve test stüdyo denetimini hiç sınamamış olurdu.
  assert.match(res.body?.error?.code ?? '', /_NOT_FOUND$/, label);
  assert.deepEqual({ status: res.status, body: res.body }, { status: missing.status, body: missing.body }, `${label}: olmayan kayıttan farklı`);
  assert.doesNotMatch(JSON.stringify(res.body ?? null), new RegExp(SECRET), label);
  assert.equal(await snapshot(), before, `${label}: veri değişti`);
}

// --- 1) Kimlik içeren uçlar ---------------------------------------------------------------------
// Her satır: yöntem, Express'teki yol (eksiksizlik testi için), B'nin kimlikleriyle gerçek adres ve gövde.
// Gövdeler geçerli: istek "geçersiz veri" yüzünden değil, kayıt başka stüdyonun olduğu için reddedilmeli.
const ADMIN_MATRIX = [
  ['GET', '/api/admin/sessions/:id', async (B) => [`/api/admin/sessions/${B.session}`]],
  ['POST', '/api/admin/sessions/:id/attendees', async (B) => [`/api/admin/sessions/${B.session}/attendees`, { userId: B.customer, confirmFull: true }]],
  ['DELETE', '/api/admin/sessions/:id/attendees/:userId', async (B) => [`/api/admin/sessions/${B.session}/attendees/${B.guest}`]],
  ['PUT', '/api/admin/sessions/:id/attendance/:userId', async (B) => [`/api/admin/sessions/${B.pastSession}/attendance/${B.customer}`, {}]],
  ['DELETE', '/api/admin/sessions/:id/attendance/:userId', async (B) => [`/api/admin/sessions/${B.pastSession}/attendance/${B.customer}`]],
  ['POST', '/api/admin/sessions/:id/cancel/preview', async (B) => [`/api/admin/sessions/${B.session}/cancel/preview`, {}]],
  ['POST', '/api/admin/sessions/:id/cancel', async (B) => [`/api/admin/sessions/${B.session}/cancel`, { reason: 'deneme' }]],
  ['POST', '/api/admin/sessions/:id/take-over', async (B) => [`/api/admin/sessions/${B.todaySession}/take-over`, {}]],
  ['PUT', '/api/admin/sessions/:id/instructor', async (B) => [`/api/admin/sessions/${B.session}/instructor`, { instructorId: null }]],
  ['GET', '/api/admin/customers/:id', async (B) => [`/api/admin/customers/${B.customer}`]],
  ['POST', '/api/admin/customers/:id/reset-password', async (B) => [`/api/admin/customers/${B.customer}/reset-password`, {}]],
  ['POST', '/api/admin/customers/:id/freeze', async (B) => [`/api/admin/customers/${B.customer}/freeze`, { startsOn: await day(1) }]],
  ['POST', '/api/admin/customers/:id/credits', async (B) => [`/api/admin/customers/${B.customer}/credits`, { count: 1, expiresOn: await day(10), note: 'x' }]],
  ['POST', '/api/admin/customers/:id/end-freeze', async (B) => [`/api/admin/customers/${B.customer}/end-freeze`, {}]],
  ['GET', '/api/admin/customers/:id/leave-preview', async (B) => [`/api/admin/customers/${B.customer}/leave-preview`]],
  ['POST', '/api/admin/customers/:id/leave', async (B) => [`/api/admin/customers/${B.customer}/leave`, {}]],
  ['POST', '/api/admin/customers/:id/change-group', async (B) => [`/api/admin/customers/${B.customer}/change-group`, { groupId: B.group, effectiveFrom: await day(7), confirmFull: true }]],
  ['GET', '/api/admin/groups/:id', async (B) => [`/api/admin/groups/${B.group}`]],
  ['PUT', '/api/admin/groups/:id', async (B) => [`/api/admin/groups/${B.group}`, groupBody(await day(7))]],
  ['POST', '/api/admin/groups/:id/preview', async (B) => [`/api/admin/groups/${B.group}/preview`, groupBody(await day(7))]],
  ['POST', '/api/admin/groups/:id/close', async (B) => [`/api/admin/groups/${B.group}/close`, {}]],
  ['GET', '/api/admin/customers/:id/memberships', async (B) => [`/api/admin/customers/${B.customer}/memberships`]],
  ['POST', '/api/admin/customers/:id/memberships', async (B) => [`/api/admin/customers/${B.customer}/memberships`, { startsOn: await day(60), endsOn: await day(90), feeKurus: 100000 }]],
  ['POST', '/api/admin/memberships/:id/payments', async (B) => [`/api/admin/memberships/${B.membership}/payments`, { amountKurus: 1000, paidOn: await day(0), method: 'cash' }]],
  ['DELETE', '/api/admin/payments/:id', async (B) => [`/api/admin/payments/${B.payment}`]],
  ['PUT', '/api/admin/branches/:id', async (B) => [`/api/admin/branches/${B.branch}`, { name: 'Yeni ad', address: 'x' }]],
  ['POST', '/api/admin/branches/:id/close', async (B) => [`/api/admin/branches/${B.branch}/close`, {}]],
  ['POST', '/api/admin/branches/:id/reopen', async (B) => [`/api/admin/branches/${B.branch}/reopen`, {}]],
];

// Paket modeline özel uçlar: twoPackageStudios ile kurulur.
const PACKAGE_BODY = { name: 'Yeni ad', sessionCount: 10, priceKurus: 100000, validityDays: 30 };
const PACKAGE_MATRIX = [
  ['PUT', '/api/admin/packages/:id', async (B) => [`/api/admin/packages/${B.package}`, PACKAGE_BODY]],
  ['POST', '/api/admin/packages/:id/close', async (B) => [`/api/admin/packages/${B.package}/close`, {}]],
  ['POST', '/api/admin/packages/:id/reopen', async (B) => [`/api/admin/packages/${B.package}/reopen`, {}]],
];

const CUSTOMER_MATRIX = [
  ['POST', '/api/sessions/:id/cancel', async (B) => [`/api/sessions/${B.session}/cancel`, {}]],
  ['POST', '/api/sessions/:id/undo-cancel', async (B) => [`/api/sessions/${B.session}/undo-cancel`, {}]],
  ['POST', '/api/sessions/:id/swap', async (B, A) => [`/api/sessions/${B.session}/swap`, { toSessionId: A.laterSession }]],
  ['PUT', '/api/sessions/:id/makeup', async (B) => [`/api/sessions/${B.laterSession}/makeup`, {}]],
  ['DELETE', '/api/sessions/:id/makeup', async (B) => [`/api/sessions/${B.session}/makeup`, {}]],
];

function groupBody(effectiveFrom) {
  return { name: 'Yeni ad', weekdays: [1, 2, 3, 4, 5, 6, 7], startTime: '10:00', durationMinutes: 50, capacity: 8, effectiveFrom };
}

describe('admin of A cannot reach B records by id', () => {
  for (const [method, route, build] of ADMIN_MATRIX) {
    test(`${method} ${route}`, async () => {
      const { A, B, adminA } = await twoStudios();
      await assertRejectedWithoutTrace(adminA, method, await build(B, A), await build(MISSING, A));
    });
  }
});

describe('package-model admin of A cannot reach B records by id', () => {
  for (const [method, route, build] of PACKAGE_MATRIX) {
    test(`${method} ${route}`, async () => {
      const { A, B, adminA } = await twoPackageStudios();
      await assertRejectedWithoutTrace(adminA, method, await build(B, A), await build(MISSING, A));
    });
  }
});

describe('customer of A cannot reach B sessions by id', () => {
  for (const [method, route, build] of CUSTOMER_MATRIX) {
    test(`${method} ${route}`, async () => {
      const { A, B, customerA } = await twoStudios();
      // Telafi için hakkı olsun: reddin sebebi "hakkın yok" değil, dersin başka stüdyoda olması olmalı.
      await grantCredit(A.customer);
      await assertRejectedWithoutTrace(customerA, method, await build(B, A), await build(MISSING, A));
    });
  }
});

// --- 2) Gövdeyle gelen kimlikler ----------------------------------------------------------------
// Adres A'nın kaydı, ama gövdedeki kimlik B'nin. Reddedilmeli ve hiçbir veri değişmemeli.
describe('ids in the request body cannot point to another studio', () => {
  test("adding B's customer to A's session", async () => {
    const { A, B, adminA } = await twoStudios();
    const url = `/api/admin/sessions/${A.session}/attendees`;
    await assertRejectedWithoutTrace(adminA, 'POST',
      [url, { userId: B.customer, confirmFull: true }], [url, { userId: MISSING.customer, confirmFull: true }]);
  });

  test("moving A's customer into B's group", async () => {
    const { A, B, adminA } = await twoStudios();
    const url = `/api/admin/customers/${A.customer}/change-group`;
    const body = (groupId) => ({ groupId, effectiveFrom: '', confirmFull: true });
    const effectiveFrom = await day(7);
    await assertRejectedWithoutTrace(adminA, 'POST',
      [url, { ...body(B.group), effectiveFrom }], [url, { ...body(MISSING.group), effectiveFrom }]);
  });

  test("creating a customer in B's group", async () => {
    const { B, adminA } = await twoStudios();
    const body = { fullName: 'Yeni Üye', phone: '0533 444 55 66', startsOn: await day(0), confirmFull: true };
    await assertRejectedWithoutTrace(adminA, 'POST',
      ['/api/admin/customers', { ...body, groupId: B.group }], ['/api/admin/customers', { ...body, groupId: MISSING.group }]);
  });

  test("moving A's group into B's branch", async () => {
    const { A, B, adminA } = await twoStudios();
    const url = `/api/admin/groups/${A.group}`;
    const effectiveFrom = await day(7);
    await assertRejectedWithoutTrace(adminA, 'PUT',
      [url, { ...groupBody(effectiveFrom), branchId: B.branch }], [url, { ...groupBody(effectiveFrom), branchId: MISSING.branch }]);
  });

  test("creating a group in B's branch", async () => {
    const { B, adminA } = await twoStudios();
    const body = groupBody(await day(7));
    await assertRejectedWithoutTrace(adminA, 'POST',
      ['/api/admin/groups', { ...body, branchId: B.branch }], ['/api/admin/groups', { ...body, branchId: MISSING.branch }]);
  });

  test("marking B's customer absent in A's session", async () => {
    const { A, B, adminA } = await twoStudios();
    for (const method of ['PUT', 'DELETE']) {
      await assertRejectedWithoutTrace(adminA, method,
        [`/api/admin/sessions/${A.pastSession}/attendance/${B.customer}`, {}],
        [`/api/admin/sessions/${A.pastSession}/attendance/${MISSING.customer}`, {}]);
    }
  });

  test("selling B's package to A's customer", async () => {
    const { A, B, adminA } = await twoPackageStudios();
    const url = `/api/admin/customers/${A.guest}/memberships`;
    const startsOn = await day(60);
    await assertRejectedWithoutTrace(adminA, 'POST',
      [url, { packageId: B.package, startsOn }], [url, { packageId: MISSING.package, startsOn }]);
  });

  // Paket modelinde müşteri kimliği de denetlenmeli (matristeki satır grup modelinin gövdesini sınar).
  test("selling A's package to B's customer", async () => {
    const { A, B, adminA } = await twoPackageStudios();
    const body = { packageId: A.package, startsOn: await day(60) };
    await assertRejectedWithoutTrace(adminA, 'POST',
      [`/api/admin/customers/${B.guest}/memberships`, body], [`/api/admin/customers/${MISSING.guest}/memberships`, body]);
  });

  test("customer swaps into B's session", async () => {
    const { A, B, customerA } = await twoStudios();
    const url = `/api/sessions/${A.laterSession}/swap`;
    await assertRejectedWithoutTrace(customerA, 'POST',
      [url, { toSessionId: B.laterSession }], [url, { toSessionId: MISSING.laterSession }]);
  });
});

// --- 3) Liste uçları ----------------------------------------------------------------------------
describe('lists only contain the own studio', () => {
  test('admin lists', async () => {
    const { B, adminA } = await twoStudios();
    for (const path of [
      '/api/admin/today', `/api/admin/day?date=${await day(2)}`, `/api/admin/day?date=${await day(4)}`,
      '/api/admin/customers', '/api/admin/groups', '/api/admin/payments', '/api/admin/settings', '/api/admin/branches',
    ]) {
      const res = await adminA.request('GET', path);
      assert.equal(res.status, 200, path);
      assert.doesNotMatch(JSON.stringify(res.body), new RegExp(SECRET), path);
      const ids = (res.body.sessions ?? []).map((s) => s.id);
      for (const id of [B.todaySession, B.session, B.laterSession]) assert.ok(!ids.includes(id), `${path}: B dersi ${id}`);
    }
  });

  test('package-model admin lists', async () => {
    const { adminA } = await twoPackageStudios();
    const res = await adminA.request('GET', '/api/admin/packages');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.packages.map((p) => p.name), ['A-ACIK-Paket']);
    assert.doesNotMatch(JSON.stringify(res.body), new RegExp(SECRET));
  });

  test('customer lists', async () => {
    const { B, customerA } = await twoStudios();
    for (const path of ['/api/sessions', '/api/me/sessions', '/api/me/credits', '/api/me/membership']) {
      const res = await customerA.request('GET', path);
      assert.equal(res.status, 200, path);
      assert.doesNotMatch(JSON.stringify(res.body), new RegExp(SECRET), path);
      const ids = (res.body.sessions ?? []).map((s) => s.id);
      for (const id of [B.todaySession, B.session, B.laterSession]) assert.ok(!ids.includes(id), `${path}: B dersi ${id}`);
    }
  });
});

// --- 4) Aynı numara iki stüdyoda: şifre sıfırlama ------------------------------------------------
describe('password reset', () => {
  test('password reset in A does not touch the same number in B', async () => {
    const a = await createStudio();
    const b = await createStudio({ slug: 'ikinci' });
    const adminA = await clientFor(await createAdmin(a));
    const phone = '0532 111 22 33';
    const userA = await createUser({ studioId: a, role: 'customer', fullName: 'A', phone, temporaryPassword: 'sifre-a-1234' });
    await createUser({ studioId: b, role: 'customer', fullName: 'B', phone, temporaryPassword: 'sifre-b-1234' });

    const bClient = client(null, { host: 'ikinci.localhost' });
    assert.equal((await bClient.request('POST', '/api/auth/login', { phone, password: 'sifre-b-1234' })).status, 200);

    const reset = await adminA.request('POST', `/api/admin/customers/${userA}/reset-password`, {});
    assert.equal(reset.status, 200);

    // B'nin açık oturumu sürüyor ve eski şifresi hâlâ geçerli.
    assert.equal((await bClient.request('GET', '/api/auth/me')).status, 200);
    const relogin = await client(null, { host: 'ikinci.localhost' }).request('POST', '/api/auth/login', { phone, password: 'sifre-b-1234' });
    assert.equal(relogin.status, 200);
  });
});

// --- 5) Yeni uçların unutulmaması ---------------------------------------------------------------
// Router'daki ":id" içeren her uç yukarıdaki tablolarda olmalı. Yeni bir uç eklenip tabloya eklenmezse bu test
// başarısız olur: veri ayrımı kanıtı kendiliğinden eksik kalmaz.
function idRoutes(router) {
  return router.stack
    .filter((layer) => layer.route && layer.route.path.includes(':'))
    .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`))
    .sort();
}

test('every id route is in the matrix', () => {
  const inMatrix = (matrix) => matrix.map(([method, route]) => `${method} ${route}`).sort();
  // Yönetici uçları iki yönlendiricide: yalnızca yöneticiye açık olanlar ve eğitmene de açılabilenler.
  const adminIdRoutes = [...idRoutes(adminRouter), ...idRoutes(staffRouter)].sort();
  assert.deepEqual(adminIdRoutes, inMatrix([...ADMIN_MATRIX, ...PACKAGE_MATRIX]));
  assert.deepEqual(idRoutes(sessionsRouter), inMatrix(CUSTOMER_MATRIX));
});
