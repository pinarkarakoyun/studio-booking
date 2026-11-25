import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { chargeableSessions } from '../src/services/packageUsage.js';
import {
  createAdmin,
  createBranch,
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  defaultBranchId,
  grantCredit,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Üyenin ek derse kaydı. Grup modelinde telafi akışıyla (hak ya da "yerine şuna gel"); paket modelinde
// paketinden bir seans düşecek şekilde.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const day = async (n) =>
  (await pool.query(`SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`, [n])).rows[0].d;

async function setup({ membershipModel = 'package', capacity = 6 } = {}) {
  const studio = await createStudio({ membershipModel });
  const a = await defaultBranchId(studio);
  const b = await createBranch(studio, { name: 'Kuzey' });
  const admin = await clientFor(await createAdmin(studio));
  const extra = async ({ branchId = a, cap = capacity } = {}) =>
    (await admin.request('POST', '/api/admin/extra-sessions', {
      date: await day(3), startTime: '10:00', durationMinutes: 50, capacity: cap, branchId,
    })).body.session.id;
  const group = await createGroup(studio, { branchId: a });
  return { studio, a, b, admin, extra, group };
}

// Paket dönemi: verilen seans sayısı, başlangıç ve bitiş günleri bugüne göre.
async function givePackage(userId, { sessions = 8, from = -5, to = 30 } = {}) {
  await pool.query(
    `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, session_count, package_name)
     VALUES ($1, current_date + $2::int, current_date + $3::int, 100000, $4, 'Paket')`,
    [userId, from, to, sessions],
  );
}

const book = (c, id) => c.request('PUT', `/api/sessions/${id}/makeup`);
const withdraw = (c, id) => c.request('DELETE', `/api/sessions/${id}/makeup`);
const finish = (id) =>
  pool.query(`UPDATE sessions SET starts_at = now() - interval '2 hours', date = current_date WHERE id = $1`, [id]);

describe('booking an extra session', () => {
  test('group model books extra with credit', async () => {
    const s = await setup({ membershipModel: 'group' });
    const id = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    await grantCredit(member);
    assert.equal((await book(await clientFor(member), id)).status, 200);
  });

  test('group model without credit cannot book extra', async () => {
    const s = await setup({ membershipModel: 'group' });
    const id = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    const res = await book(await clientFor(member), id);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NO_CREDIT');
  });

  test('package member books extra and it is charged after it ends', async () => {
    const s = await setup();
    const id = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member);
    assert.equal((await book(await clientFor(member), id)).status, 200);
    await finish(id);
    const charged = await chargeableSessions(member, pool);
    assert.deepEqual(charged.map((c) => c.sessionId), [id]);
  });

  test('package member with one session left cannot book two extras', async () => {
    const s = await setup();
    const first = await s.extra();
    const second = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member, { sessions: 1 });
    const c = await clientFor(member);
    assert.equal((await book(c, first)).status, 200);
    const res = await book(c, second);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NO_SESSIONS_LEFT');
  });

  test('package member with expired or no package cannot book', async () => {
    const s = await setup();
    const id = await s.extra();
    const expired = await createCustomer(s.studio, s.group);
    await givePackage(expired, { from: -40, to: -1 });
    const none = await createCustomer(s.studio, s.group);
    for (const member of [expired, none]) {
      const res = await book(await clientFor(member), id);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'NO_SESSIONS_LEFT');
    }
  });

  test('package member cannot book extra in other branch', async () => {
    const s = await setup();
    await pool.query('UPDATE studio_settings SET makeup_other_branches = false WHERE studio_id = $1', [s.studio]);
    const id = await s.extra({ branchId: s.b });
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member);
    const res = await book(await clientFor(member), id);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'OTHER_BRANCH');
  });

  test('package member withdraws in time and is not charged', async () => {
    const s = await setup();
    const id = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member);
    const c = await clientFor(member);
    await book(c, id);
    assert.equal((await withdraw(c, id)).status, 200);
    const { rows } = await pool.query('SELECT 1 FROM credits WHERE user_id = $1', [member]);
    assert.equal(rows.length, 0);
    await finish(id);
    assert.deepEqual(await chargeableSessions(member, pool), []);
  });

  test('late withdrawal is rejected and session is charged', async () => {
    const s = await setup();
    const id = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member);
    const c = await clientFor(member);
    await book(c, id);
    // İptal süresi 2 saat (createStudio varsayılanı); ders bir saat sonra.
    await pool.query(`UPDATE sessions SET starts_at = now() + interval '1 hour' WHERE id = $1`, [id]);
    const res = await withdraw(c, id);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CANCELLATION_DEADLINE_PASSED');
    await finish(id);
    assert.deepEqual((await chargeableSessions(member, pool)).map((x) => x.sessionId), [id]);
  });

  test('regular session still not bookable in package model', async () => {
    const s = await setup();
    const other = await createGroup(s.studio, { branchId: s.a });
    const regular = await createSession(other, 48);
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member);
    const res = await book(await clientFor(member), regular);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'MAKEUP_NOT_AVAILABLE');
  });

  test('two members race for the last spot', async () => {
    const s = await setup({ capacity: 1 });
    const id = await s.extra({ cap: 1 });
    const members = [await createCustomer(s.studio, s.group), await createCustomer(s.studio, s.group)];
    for (const m of members) await givePackage(m);
    const clients = await Promise.all(members.map((m) => clientFor(m)));
    const results = await Promise.all(clients.map((c) => book(c, id)));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(results.find((r) => r.status === 409).body.error.code, 'SESSION_FULL');
  });

  // İnceleme: aynı üyenin iki ayrı ek derse eşzamanlı kaydı paketi aşmasın (iki farklı ders satırı kilitlenir).
  test('one session left: concurrent bookings of two extras do not overdraw', async () => {
    const s = await setup();
    const first = await s.extra();
    const second = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member, { sessions: 1 });
    const [c1, c2] = [await clientFor(member), await clientFor(member)];
    const results = await Promise.all([book(c1, first), book(c2, second)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(results.find((r) => r.status === 409).body.error.code, 'NO_SESSIONS_LEFT');
  });

  // İnceleme: paket üyesini ek dersten çıkarmak sahipsiz bir "telafi hakkı" bırakmasın.
  test('removing a package member from an extra leaves no credit behind', async () => {
    const s = await setup();
    const id = await s.extra();
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member);
    await book(await clientFor(member), id);
    const res = await s.admin.request('DELETE', `/api/admin/sessions/${id}/attendees/${member}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.refundedCredit, false);
    const { rows } = await pool.query('SELECT 1 FROM credits WHERE user_id = $1', [member]);
    assert.equal(rows.length, 0);
  });

  test('extra sessions list for package members', async () => {
    const s = await setup();
    const id = await s.extra();
    await s.extra({ branchId: s.b });
    await pool.query('UPDATE studio_settings SET makeup_other_branches = false WHERE studio_id = $1', [s.studio]);
    const member = await createCustomer(s.studio, s.group);
    await givePackage(member);
    const c = await clientFor(member);
    let res = await c.request('GET', '/api/me/extra-sessions');
    assert.equal(res.status, 200);
    // Yalnızca kendi şubesindeki ek ders (diğer şubelerde telafi kapalı).
    assert.deepEqual(res.body.sessions.map((x) => x.id), [id]);
    assert.equal(res.body.sessions[0].kind, 'extra');
    assert.equal(res.body.sessions[0].myStatus, null);
    await book(c, id);
    res = await c.request('GET', '/api/me/extra-sessions');
    assert.equal(res.body.sessions[0].myStatus, 'makeup');
  });
});
