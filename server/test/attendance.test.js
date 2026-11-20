import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { packageUsage } from '../src/services/packageUsage.js';
import {
  createAdmin, createCustomer, createGroup, createSession, createStudio, insertMakeup, pool, resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Yoklama: yönetici ders başladıktan sonra derse gelmeyen üyeyi "gelmedi" diye işaretler. İlk sürümde yalnızca
// kayıt: seans sayısını değiştirmez. İki modelde de çalışır.
useServer();
after(() => pool.end());
beforeEach(resetDb);

async function setup(membershipModel = 'package') {
  const studio = await createStudio({ membershipModel });
  const group = await createGroup(studio);
  const customer = await createCustomer(studio, group);
  const c = await clientFor(await createAdmin(studio));
  return { studio, group, customer, c };
}

const url = (sessionId, userId) => `/api/admin/sessions/${sessionId}/attendance/${userId}`;
const absentOf = (roster, userId) => roster.attending.find((p) => p.id === userId)?.absent;

describe('attendance', () => {
  test('marks and unmarks a member as absent; the roster shows it', async () => {
    const { group, customer, c } = await setup();
    const session = await createSession(group, -0.5);

    const marked = await c.request('PUT', url(session, customer));
    assert.equal(marked.status, 200);
    assert.equal(absentOf(marked.body, customer), true);
    // İkinci işaret hata vermez (aynı sonuç).
    assert.equal((await c.request('PUT', url(session, customer))).status, 200);
    assert.equal(absentOf((await c.request('GET', `/api/admin/sessions/${session}`)).body, customer), true);

    const unmarked = await c.request('DELETE', url(session, customer));
    assert.equal(unmarked.status, 200);
    assert.equal(absentOf(unmarked.body, customer), false);
    assert.equal((await pool.query('SELECT 1 FROM attendance')).rowCount, 0);
  });

  test('a makeup attendee can be marked too, in a group model studio', async () => {
    const { studio, group, c } = await setup('group');
    const guest = await createCustomer(studio);
    const session = await createSession(group, -2);
    await insertMakeup(guest, session);
    const res = await c.request('PUT', url(session, guest));
    assert.equal(res.status, 200);
    assert.equal(absentOf(res.body, guest), true);
  });

  test('a session that has not started cannot be marked', async () => {
    const { group, customer, c } = await setup();
    const session = await createSession(group, 2);
    const res = await c.request('PUT', url(session, customer));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SESSION_NOT_STARTED');
    assert.equal(absentOf((await c.request('GET', `/api/admin/sessions/${session}`)).body, customer), false);
  });

  test('only people in the session can be marked', async () => {
    const { studio, group, c } = await setup();
    const outsider = await createCustomer(studio);
    const session = await createSession(group, -2);
    const res = await c.request('PUT', url(session, outsider));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'NOT_IN_SESSION');

    const missing = await c.request('PUT', url(session, 999999));
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'CUSTOMER_NOT_FOUND');
  });

  test('a cancelled session cannot be marked', async () => {
    const { group, customer, c } = await setup();
    const session = await createSession(group, -2);
    await pool.query(`UPDATE sessions SET status = 'cancelled' WHERE id = $1`, [session]);
    const res = await c.request('PUT', url(session, customer));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SESSION_CANCELLED');
  });

  // Pınar'ın kararı: gelmeyen de düşer; yoklama yalnızca kayıt.
  test('marking absent does not change the count', async () => {
    const { group, customer, c } = await setup();
    await pool.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, session_count, package_name)
       VALUES ($1, current_date - 10, current_date + 50, 100000, 8, 'Paket')`,
      [customer],
    );
    const session = await createSession(group, -2);
    const before = await packageUsage(customer, pool);
    await c.request('PUT', url(session, customer));
    assert.deepEqual(await packageUsage(customer, pool), before);
    assert.equal(before.packages[0].used, 1);
  });
});
