import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin,
  createCustomer,
  createGroup,
  createSession,
  createSessionToday,
  createStudio,
  insertCancellation,
  insertMakeup,
  pool,
  resetDb,
} from './helpers.js';
import { client, clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

// Bugün 19:00'da 3 kişilik bir ders: 3 düzenli üyeden biri iptal etti, biri dondurulmuş,
// başka gruptan biri telafiye geliyor.
async function setupToday() {
  const studio = await createStudio();
  const admin = await createAdmin(studio);
  const group = await createGroup(studio, { capacity: 3 });
  const otherGroup = await createGroup(studio);
  const session = await createSessionToday(group, '19:00');

  const attending = await createCustomer(studio, group);
  const cancelled = await createCustomer(studio, group);
  const frozen = await createCustomer(studio, group);
  const makeup = await createCustomer(studio, otherGroup);
  await pool.query(`UPDATE users SET full_name = 'Ayşe' WHERE id = $1`, [attending]);
  await pool.query(`UPDATE users SET full_name = 'Derya' WHERE id = $1`, [cancelled]);
  await pool.query(`UPDATE users SET full_name = 'Zeynep' WHERE id = $1`, [frozen]);
  await pool.query(`UPDATE users SET full_name = 'Şule' WHERE id = $1`, [makeup]);

  await insertCancellation(cancelled, session);
  await pool.query(`INSERT INTO freezes (user_id, starts_on) VALUES ($1, current_date - 1)`, [frozen]);
  await insertMakeup(makeup, session);

  return { studio, session, c: await clientFor(admin) };
}

describe('access', () => {
  test('requires login and the admin role', async () => {
    assert.equal((await client().request('GET', '/api/admin/today')).status, 401);

    const studio = await createStudio();
    const customer = await createCustomer(studio);
    const res = await (await clientFor(customer)).request('GET', '/api/admin/today');
    assert.equal(res.status, 403);
  });
});

describe('today', () => {
  test("lists today's sessions with occupancy, make-ups and cancellations", async () => {
    const { c, session } = await setupToday();

    const { body } = await c.request('GET', '/api/admin/today');

    const today = body.sessions.find((s) => s.id === session);
    assert.ok(today);
    assert.equal(today.capacity, 3);
    assert.equal(today.bookedCount, 2); // Ayşe + Şule (telafi)
    assert.equal(today.makeupCount, 1);
    assert.equal(today.cancelledCount, 1);
    assert.match(body.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof body.tomorrow.sessionCount, 'number');
  });

  test('alerts list full sessions this week and cancellations from the last 24 hours', async () => {
    const studio = await createStudio();
    const admin = await createAdmin(studio);
    const fullGroup = await createGroup(studio, { capacity: 1 });
    const full = await createSession(fullGroup, 30);
    await createCustomer(studio, fullGroup);
    const group = await createGroup(studio);
    const later = await createSession(group, 48);
    const canceller = await createCustomer(studio, group);
    await insertCancellation(canceller, later);

    const { body } = await (await clientFor(admin)).request('GET', '/api/admin/today');

    assert.deepEqual(body.alerts.fullSessions.map((s) => s.id), [full]);
    assert.equal(body.alerts.recentCancellations.length, 1);
    assert.equal(body.alerts.recentCancellations[0].sessionId, later);
  });

  test("another studio's sessions never appear", async () => {
    const { c } = await setupToday();
    const otherStudio = await createStudio();
    const foreign = await createSessionToday(await createGroup(otherStudio), '10:00');

    const { body } = await c.request('GET', '/api/admin/today');
    assert.equal(body.sessions.some((s) => s.id === foreign), false);
  });
});

describe('session roster', () => {
  test('splits people into coming and not coming, with the reason', async () => {
    const { c, session } = await setupToday();

    const { body } = await c.request('GET', `/api/admin/sessions/${session}`);

    assert.deepEqual(
      body.attending.map((p) => [p.fullName, p.state]),
      [['Ayşe', 'regular'], ['Şule', 'makeup']], // Türkçe alfabe sırası: Ş, S'den sonra
    );
    assert.deepEqual(
      body.notAttending.map((p) => [p.fullName, p.state, p.creditState]),
      [['Derya', 'cancelled', 'unused'], ['Zeynep', 'frozen', null]],
    );
    assert.equal(body.session.freeSpots, 1);
  });

  test("a session of another studio is not found", async () => {
    const { c } = await setupToday();
    const otherStudio = await createStudio();
    const foreign = await createSessionToday(await createGroup(otherStudio), '10:00');

    assert.equal((await c.request('GET', `/api/admin/sessions/${foreign}`)).status, 404);
    assert.equal((await c.request('GET', '/api/admin/sessions/abc')).status, 404);
  });
});

describe('another day', () => {
  test("lists the chosen day's sessions, only for this studio", async () => {
    const studio = await createStudio();
    const c = await clientFor(await createAdmin(studio));
    const group = await createGroup(studio);
    const session = await createSession(group, 24 * 5);
    const otherGroup = await createGroup(await createStudio());
    await createSession(otherGroup, 24 * 5);
    const { rows: [s] } = await pool.query('SELECT date::text AS date FROM sessions WHERE id = $1', [session]);

    const res = await c.request('GET', `/api/admin/day?date=${s.date}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.date, s.date);
    assert.deepEqual(res.body.sessions.map((x) => x.id), [session]);
  });

  test('rejects an invalid date', async () => {
    const c = await clientFor(await createAdmin(await createStudio()));
    assert.equal((await c.request('GET', '/api/admin/day?date=2026-13-45')).body.error.code, 'INVALID_DATE');
    assert.equal((await c.request('GET', '/api/admin/day')).status, 400);
  });
});
