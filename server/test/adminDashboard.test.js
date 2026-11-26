import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin, createCustomer, createGroup, createInstructor, createStudio, insertCancellation, insertMakeup, pool, resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

// Stüdyonun saatine göre ay ("2026-10"): 0 = bu ay, -1 = geçen ay.
// Testler geçen ayı sorgular: o ayın dersleri kesinlikle geçmişte kalır, ayın ilk günü sorunu çıkmaz.
async function pastMonth(offset) {
  const { rows: [row] } = await pool.query(
    `SELECT to_char(date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') + $1::int * interval '1 month', 'YYYY-MM') AS m`,
    [offset],
  );
  return row.m;
}

// Ayın N. günü ("2026-10-05").
const dayOf = (month, n) => `${month}-${String(n).padStart(2, '0')}`;

// O gün yerel saatle 09:00'da başlayan bir ders.
async function sessionOn(groupId, date, { capacity, status = 'scheduled' } = {}) {
  const { rows: [session] } = await pool.query(
    `
    INSERT INTO sessions (group_id, date, starts_at, capacity, status)
    SELECT g.id, $2::date, ($2::date + time '09:00') AT TIME ZONE st.timezone, COALESCE($3, g.capacity), $4
    FROM groups g JOIN studios st ON st.id = g.studio_id
    WHERE g.id = $1
    RETURNING id
    `,
    [groupId, date, capacity ?? null, status],
  );
  return session.id;
}

// Müşteriyi o tarihten itibaren gruba ekler (createCustomer'ın "30 gün önce" varsayılanı geçen ayı kapsamayabilir).
async function member(studio, groupId, joinedOn) {
  const id = await createCustomer(studio);
  await pool.query('INSERT INTO group_members (group_id, user_id, joined_on) VALUES ($1, $2, $3)', [groupId, id, joinedOn]);
  return id;
}

async function pay(customerId, paidOn, amountKurus) {
  const { rows: [m] } = await pool.query(
    `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus) VALUES ($1, $2, $2::date + 30, $3) RETURNING id`,
    [customerId, paidOn, amountKurus],
  );
  await pool.query(
    `INSERT INTO payments (membership_id, amount_kurus, paid_on, method) VALUES ($1, $2, $3, 'cash')`,
    [m.id, amountKurus, paidOn],
  );
}

async function setup() {
  const studio = await createStudio();
  const c = await clientFor(await createAdmin(studio));
  return { studio, c };
}

async function dashboard(c, month) {
  const res = await c.request('GET', `/api/admin/dashboard?month=${month}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

describe('admin dashboard', () => {
  test('revenue sums payments of the month and the month before', async () => {
    const { studio, c } = await setup();
    const last = await pastMonth(-1);
    const before = await pastMonth(-2);
    // Aynı kişinin dönemleri çakışamaz: her ödeme için ayrı müşteri.
    await pay(await createCustomer(studio), dayOf(last, 3), 150000);
    await pay(await createCustomer(studio), dayOf(last, 20), 50000);
    await pay(await createCustomer(studio), dayOf(before, 10), 30000);
    const other = await createStudio();
    await pay(await createCustomer(other), dayOf(last, 5), 99900);

    const d = await dashboard(c, last);
    assert.equal(d.month, last);
    assert.equal(d.isCurrentMonth, false);
    assert.deepEqual(d.revenue, { kurus: 200000, previousKurus: 30000 });
  });

  test('active members counts distinct visitors', async () => {
    const { studio, c } = await setup();
    const last = await pastMonth(-1);
    const group = await createGroup(studio, { capacity: 5 });
    await member(studio, group, dayOf(last, 1));
    await member(studio, group, dayOf(last, 1));
    await sessionOn(group, dayOf(last, 5));
    const second = await sessionOn(group, dayOf(last, 12));
    // Üçüncü üye iki dersten sonra katılır: hiçbirine gelmiş sayılmaz.
    await member(studio, group, dayOf(last, 13));
    // İkinci üye ikinci dersi iptal eder: yine de ilk derse geldiği için aktiftir.
    const { rows: [{ id: secondMember }] } = await pool.query(
      `SELECT user_id AS id FROM group_members WHERE group_id = $1 ORDER BY id OFFSET 1 LIMIT 1`, [group],
    );
    await insertCancellation(secondMember, second);

    const d = await dashboard(c, last);
    assert.deepEqual(d.activeMembers, { count: 2, previous: 0 });
  });

  test('absent, cancelled, frozen and future do not count as visits', async () => {
    const { studio, c } = await setup();
    const last = await pastMonth(-1);
    const admin = (await pool.query(`SELECT id FROM users WHERE role = 'admin' AND studio_id = $1`, [studio])).rows[0].id;
    const group = await createGroup(studio, { capacity: 10 });
    const otherGroup = await createGroup(studio, { capacity: 10 });
    const session = await sessionOn(group, dayOf(last, 10));

    await member(studio, group, dayOf(last, 1)); // geldi
    const absent = await member(studio, group, dayOf(last, 1));
    await pool.query('INSERT INTO attendance (session_id, user_id, marked_by) VALUES ($1, $2, $3)', [session, absent, admin]);
    const cancelled = await member(studio, group, dayOf(last, 1));
    await insertCancellation(cancelled, session);
    const frozen = await member(studio, group, dayOf(last, 1));
    await pool.query('INSERT INTO freezes (user_id, starts_on, ends_on) VALUES ($1, $2, $3)', [frozen, dayOf(last, 8), dayOf(last, 15)]);
    const makeup = await member(studio, otherGroup, dayOf(last, 1));
    await insertMakeup(makeup, session);

    // Stüdyonun iptal ettiği ders: üyesi gelmiş sayılmaz, ders de "yapılan" sayılmaz.
    const cancelledGroup = await createGroup(studio, { capacity: 10 });
    await member(studio, cancelledGroup, dayOf(last, 1));
    await sessionOn(cancelledGroup, dayOf(last, 11), { status: 'cancelled' });

    // Gelecekteki ders (bu ay sorgulanmıyor ama gelecekteki ders geçmiş aya da sızmamalı): bu ay, yarın.
    const futureGroup = await createGroup(studio, { capacity: 10 });
    await member(studio, futureGroup, dayOf(last, 1));
    const { rows: [{ tomorrow }] } = await pool.query(
      `SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + 1)::text AS tomorrow`,
    );
    await sessionOn(futureGroup, tomorrow);

    const d = await dashboard(c, last);
    // Gelen: ilk üye ve telafiyle gelen.
    assert.equal(d.activeMembers.count, 2);
    assert.equal(d.sessions.held, 1);

    const now = await dashboard(c, await pastMonth(0));
    assert.equal(now.activeMembers.count, 0);
  });

  test('occupancy averages came / capacity per session', async () => {
    const { studio, c } = await setup();
    const last = await pastMonth(-1);
    const a = await createGroup(studio, { capacity: 4 });
    const b = await createGroup(studio, { capacity: 4 });
    await member(studio, a, dayOf(last, 1));
    await member(studio, a, dayOf(last, 1));
    await member(studio, b, dayOf(last, 1));
    await sessionOn(a, dayOf(last, 6));
    await sessionOn(b, dayOf(last, 7));

    const d = await dashboard(c, last);
    assert.deepEqual(d.sessions, { held: 2, previousHeld: 0, avgOccupancy: 0.375, previousAvgOccupancy: null });
  });

  test("new members use the studio's local month", async () => {
    const { studio, c } = await setup();
    const last = await pastMonth(-1);
    const early = await createCustomer(studio);
    // Ayın 1'i 00:30 İstanbul = önceki ayın son günü 21:30 UTC.
    await pool.query(
      `UPDATE users SET created_at = ($2::date + time '00:30') AT TIME ZONE 'Europe/Istanbul' WHERE id = $1`,
      [early, dayOf(last, 1)],
    );
    const old = await createCustomer(studio);
    await pool.query(
      `UPDATE users SET created_at = ($2::date + time '12:00') AT TIME ZONE 'Europe/Istanbul' WHERE id = $1`,
      [old, dayOf(await pastMonth(-2), 15)],
    );
    // Yönetici ve eğitmen hesapları üye değildir.
    await pool.query(
      `UPDATE users SET created_at = ($2::date + time '12:00') AT TIME ZONE 'Europe/Istanbul' WHERE studio_id = $1 AND role <> 'customer'`,
      [studio, dayOf(last, 10)],
    );
    const instructor = await createInstructor(studio);
    await pool.query(
      `UPDATE users SET created_at = ($2::date + time '12:00') AT TIME ZONE 'Europe/Istanbul' WHERE id = $1`,
      [instructor, dayOf(last, 10)],
    );

    const d = await dashboard(c, last);
    assert.deepEqual(d.newMembers, { count: 1, previous: 1 });
  });

  test('invalid or future month is rejected', async () => {
    const { c } = await setup();
    for (const month of ['2026-13', 'abc', '2026-1', await pastMonth(1)]) {
      const res = await c.request('GET', `/api/admin/dashboard?month=${month}`);
      assert.equal(res.status, 400, month);
      assert.equal(res.body.error.code, 'INVALID_MONTH');
    }
    const res = await c.request('GET', '/api/admin/dashboard');
    assert.equal(res.status, 200);
    assert.equal(res.body.month, await pastMonth(0));
    assert.equal(res.body.isCurrentMonth, true);
  });

  test('trend has twelve months ending at the selected month', async () => {
    const { studio, c } = await setup();
    const last = await pastMonth(-1);
    const group = await createGroup(studio);
    const customer = await member(studio, group, dayOf(last, 1));
    await sessionOn(group, dayOf(last, 4));
    await pay(customer, dayOf(last, 2), 100000);

    const d = await dashboard(c, last);
    assert.equal(d.trend.length, 12);
    assert.equal(d.trend[11].month, last);
    assert.equal(d.trend[0].month, await pastMonth(-12));
    assert.deepEqual(d.trend[11], { month: last, revenueKurus: 100000, activeMembers: 1, sessionsHeld: 1 });
    assert.deepEqual(d.trend[10], { month: await pastMonth(-2), revenueKurus: 0, activeMembers: 0, sessionsHeld: 0 });
  });

  test('empty studio returns zeros and twelve trend months', async () => {
    const { c } = await setup();
    const d = await dashboard(c, await pastMonth(-1));
    assert.deepEqual(d.revenue, { kurus: 0, previousKurus: 0 });
    assert.deepEqual(d.activeMembers, { count: 0, previous: 0 });
    assert.deepEqual(d.newMembers, { count: 0, previous: 0 });
    assert.deepEqual(d.sessions, { held: 0, previousHeld: 0, avgOccupancy: null, previousAvgOccupancy: null });
    assert.equal(d.trend.length, 12);
    assert.ok(d.trend.every((t) => t.revenueKurus === 0 && t.activeMembers === 0 && t.sessionsHeld === 0));
    assert.deepEqual(d.pendingPayments, { customerCount: 0, totalKurus: 0 });
  });

  test('pending payments sum the remaining amounts', async () => {
    const { studio, c } = await setup();
    const last = await pastMonth(-1);
    const a = await createCustomer(studio);
    const { rows: [m1] } = await pool.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus) VALUES ($1, $2, $2::date + 10, 450000) RETURNING id`,
      [a, dayOf(last, 1)],
    );
    await pool.query(`INSERT INTO payments (membership_id, amount_kurus, paid_on, method) VALUES ($1, 150000, $2, 'cash')`, [m1.id, dayOf(last, 1)]);
    // Aynı kişinin ikinci eksik dönemi: kişi sayısı yine 1.
    await pool.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus) VALUES ($1, $2, $2::date + 5, 20000)`,
      [a, dayOf(last, 15)],
    );
    const b = await createCustomer(studio);
    await pool.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus) VALUES ($1, $2, $2::date + 10, 100000)`,
      [b, dayOf(last, 1)],
    );

    const d = await dashboard(c, last);
    assert.deepEqual(d.pendingPayments, { customerCount: 2, totalKurus: 420000 });
  });

  test('left customers are not lapsed but still count in past months', async () => {
    const { studio, c } = await setup();
    const before = await pastMonth(-2);
    const group = await createGroup(studio);
    const stays = await member(studio, group, dayOf(before, 1));
    const leaves = await member(studio, group, dayOf(before, 1));
    await sessionOn(group, dayOf(before, 5));
    await pool.query(`UPDATE users SET status = 'left' WHERE id = $1`, [leaves]);

    const d = await dashboard(c, before);
    assert.equal(d.activeMembers.count, 2);
    assert.deepEqual(d.lapsed.map((l) => l.customerId), [stays]);
    assert.equal(d.lapsed[0].lastVisitOn, dayOf(before, 5));
  });

  test('lapsed list is sorted by most recently lapsed first', async () => {
    const { studio, c } = await setup();
    const before = await pastMonth(-2);
    const older = await pastMonth(-4);
    const a = await createGroup(studio);
    const b = await createGroup(studio);
    const long = await member(studio, a, dayOf(older, 1));
    const recent = await member(studio, b, dayOf(older, 1));
    await sessionOn(a, dayOf(older, 5));
    await sessionOn(b, dayOf(before, 5));
    // Bugün de gelmiş biri listede olmamalı.
    const g = await createGroup(studio);
    await member(studio, g, dayOf(older, 1));
    await sessionOn(g, (await pool.query(`SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date::text AS d`)).rows[0].d, {});
    await pool.query(`UPDATE sessions SET starts_at = now() - interval '1 minute' WHERE group_id = $1`, [g]);

    const d = await dashboard(c, await pastMonth(0));
    assert.deepEqual(d.lapsed.map((l) => l.customerId), [recent, long]);
    assert.ok(d.lapsed[0].daysSince < d.lapsed[1].daysSince);
  });

  test('only admins', async () => {
    const studio = await createStudio();
    const all = {
      attendance: true, cancel_own_sessions: true, create_extra_sessions: true, manage_attendees: true,
      view_customers: true, edit_customers: true, customer_status: true, memberships: true, manage_groups: true,
    };
    const instructor = await clientFor(await createInstructor(studio, { permissions: all }));
    assert.equal((await instructor.request('GET', '/api/admin/dashboard')).status, 403);
    const customer = await clientFor(await createCustomer(studio));
    assert.equal((await customer.request('GET', '/api/admin/dashboard')).status, 403);
  });
});
