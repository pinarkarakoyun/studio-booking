import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin,
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  grantCredit,
  insertMakeup,
  occupancy,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

async function setup({ capacity = 3 } = {}) {
  const studio = await createStudio();
  const c = await clientFor(await createAdmin(studio));
  const group = await createGroup(studio, { capacity });
  const otherGroup = await createGroup(studio);
  const sessionId = await createSession(group, 48);
  return { studio, c, group, otherGroup, sessionId };
}

const add = (c, sessionId, userId, extra = {}) =>
  c.request('POST', `/api/admin/sessions/${sessionId}/attendees`, { userId, ...extra });

const creditsOf = async (userId) =>
  (await pool.query('SELECT used_session_id, note FROM credits WHERE user_id = $1 ORDER BY id', [userId])).rows;

describe('admin adds a person to a session', () => {
  test("a customer with a credit uses it; without one, an 'added by admin' record is made", async () => {
    const { studio, c, otherGroup, sessionId } = await setup();
    const withCredit = await createCustomer(studio, otherGroup);
    await grantCredit(withCredit);
    const without = await createCustomer(studio, otherGroup);

    assert.deepEqual((await add(c, sessionId, withCredit)).body, { usedCredit: true });
    assert.deepEqual((await add(c, sessionId, without)).body, { usedCredit: false });

    assert.deepEqual(await creditsOf(withCredit), [{ used_session_id: sessionId, note: null }]);
    assert.deepEqual(await creditsOf(without), [{ used_session_id: sessionId, note: 'Yönetici ekledi' }]);
    assert.equal((await occupancy(sessionId)).booked_count, 2);

    const roster = (await c.request('GET', `/api/admin/sessions/${sessionId}`)).body;
    const added = roster.attending.find((p) => p.id === without);
    assert.equal(added.state, 'makeup');
    assert.equal(added.creditState, 'added');
  });

  test('a full session warns first, then adds after confirmation', async () => {
    const { studio, c, group, otherGroup, sessionId } = await setup({ capacity: 1 });
    await createCustomer(studio, group);
    const guest = await createCustomer(studio, otherGroup);
    const warned = await add(c, sessionId, guest);
    assert.equal(warned.status, 409);
    assert.equal(warned.body.error.code, 'SESSION_FULL');
    assert.equal((await creditsOf(guest)).length, 0);
    assert.equal((await add(c, sessionId, guest, { confirmFull: true })).status, 201);
  });

  test("rejects the group's own member, someone already coming, a customer who left", async () => {
    const { studio, c, group, otherGroup, sessionId } = await setup();
    const member = await createCustomer(studio, group);
    assert.equal((await add(c, sessionId, member)).body.error.code, 'ALREADY_MEMBER');
    const guest = await createCustomer(studio, otherGroup);
    await insertMakeup(guest, sessionId);
    assert.equal((await add(c, sessionId, guest)).body.error.code, 'ALREADY_IN_SESSION');
    const left = await createCustomer(studio);
    await pool.query(`UPDATE users SET status = 'left' WHERE id = $1`, [left]);
    assert.equal((await add(c, sessionId, left)).body.error.code, 'CUSTOMER_LEFT');
  });

  test('rejects a cancelled or ended session and another studio', async () => {
    const { studio, c, group, otherGroup, sessionId } = await setup();
    const guest = await createCustomer(studio, otherGroup);
    const ended = await createSession(group, -2);
    assert.equal((await add(c, ended, guest)).body.error.code, 'SESSION_ENDED');
    await c.request('POST', `/api/admin/sessions/${sessionId}/cancel`, {});
    assert.equal((await add(c, sessionId, guest)).body.error.code, 'SESSION_CANCELLED');

    const other = await clientFor(await createAdmin(await createStudio()));
    const fresh = await createSession(group, 72);
    assert.equal((await add(other, fresh, guest)).status, 404);
  });
});

describe('admin removes a make-up guest', () => {
  test('the credit comes back; an added-by-admin record is deleted', async () => {
    const { studio, c, otherGroup, sessionId } = await setup();
    const withCredit = await createCustomer(studio, otherGroup);
    await grantCredit(withCredit);
    const without = await createCustomer(studio, otherGroup);
    await add(c, sessionId, withCredit);
    await add(c, sessionId, without);

    const r1 = await c.request('DELETE', `/api/admin/sessions/${sessionId}/attendees/${withCredit}`);
    assert.deepEqual(r1.body, { refundedCredit: true });
    assert.deepEqual(await creditsOf(withCredit), [{ used_session_id: null, note: null }]);

    const r2 = await c.request('DELETE', `/api/admin/sessions/${sessionId}/attendees/${without}`);
    assert.deepEqual(r2.body, { refundedCredit: false });
    assert.equal((await creditsOf(without)).length, 0);

    assert.equal((await c.request('DELETE', `/api/admin/sessions/${sessionId}/attendees/${without}`)).status, 404);
  });
});
