import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createUser } from '../src/services/auth.js';
import {
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  grantCredit,
  pool,
  resetDb,
} from './helpers.js';
import { client, clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

// Pzt-benzeri düzenli ders + başka gruptan bir telafi dersi + o grubu dolduran bir üye.
async function setup({ makeupCapacity = 2 } = {}) {
  const studio = await createStudio();
  const myGroup = await createGroup(studio);
  const otherGroup = await createGroup(studio, { capacity: makeupCapacity });
  const regular = await createSession(myGroup, 72);
  const makeup = await createSession(otherGroup, 24);
  await createCustomer(studio, otherGroup);
  const userId = await createCustomer(studio, myGroup);
  return { studio, regular, makeup, userId, c: await clientFor(userId) };
}

const statusOf = (sessions, id) => sessions.find((s) => s.id === id)?.myStatus;

describe('access', () => {
  test('requires login', async () => {
    for (const [method, path] of [
      ['GET', '/api/me/sessions'], ['GET', '/api/sessions'], ['POST', '/api/sessions/1/cancel'],
    ]) {
      assert.equal((await client().request(method, path)).status, 401, path);
    }
  });

  test('admins are not customers', async () => {
    const studio = await createStudio();
    const adminId = await createUser({
      studioId: studio, role: 'admin', fullName: 'Y', phone: '05320000099', temporaryPassword: 'gecici-sifre-1',
    });
    await pool.query('UPDATE users SET must_change_password = false WHERE id = $1', [adminId]);

    const res = await (await clientFor(adminId)).request('GET', '/api/me/sessions');
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  test('a user with a temporary password is sent to change it first', async () => {
    const { userId } = await setup();
    await pool.query('UPDATE users SET must_change_password = true WHERE id = $1', [userId]);

    const res = await (await clientFor(userId)).request('GET', '/api/me/sessions');
    assert.equal(res.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  test('a non-numeric id is a 404, not a server error', async () => {
    const { c } = await setup();
    const res = await c.request('POST', '/api/sessions/abc/cancel');
    assert.equal(res.status, 404);
  });
});

describe('reading', () => {
  test('my sessions show my regular class with occupancy and deadlines', async () => {
    const { c, regular, makeup } = await setup();

    const { body } = await c.request('GET', '/api/me/sessions');

    assert.deepEqual(body.sessions.map((s) => s.id), [regular]); // telafi dersi benim değil
    const [session] = body.sessions;
    assert.equal(session.myStatus, 'attending');
    assert.equal(session.bookedCount, 1);
    assert.equal(session.freeSpots, 2);
    assert.match(session.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(new Date(session.cancelDeadlineAt) < new Date(session.startsAt));
    assert.ok(makeup);
  });

  test('bookable sessions include other groups with free spots', async () => {
    const { c, makeup } = await setup({ makeupCapacity: 1 });

    const { body } = await c.request('GET', '/api/sessions');
    const other = body.sessions.find((s) => s.id === makeup);

    assert.equal(other.myStatus, null);
    assert.equal(other.freeSpots, 0); // diğer grubun tek yeri dolu
  });

  test('sessions from another studio are never listed', async () => {
    const { c } = await setup();
    const otherStudio = await createStudio();
    const foreign = await createSession(await createGroup(otherStudio), 24);

    const { body } = await c.request('GET', '/api/sessions');
    assert.equal(body.sessions.some((s) => s.id === foreign), false);
  });
});

describe('actions', () => {
  test('cancel -> status becomes cancelled and a credit appears', async () => {
    const { c, regular } = await setup();

    const res = await c.request('POST', `/api/sessions/${regular}/cancel`);
    assert.equal(res.status, 200);

    assert.equal(statusOf((await c.request('GET', '/api/me/sessions')).body.sessions, regular), 'cancelled');
    const { body } = await c.request('GET', '/api/me/credits');
    assert.equal(body.credits.length, 1);
    assert.equal(body.credits[0].sourceDate !== null, true);
  });

  test('undo cancel -> back to attending, credit gone', async () => {
    const { c, regular } = await setup();
    await c.request('POST', `/api/sessions/${regular}/cancel`);

    assert.equal((await c.request('POST', `/api/sessions/${regular}/undo-cancel`)).status, 204);

    assert.equal(statusOf((await c.request('GET', '/api/me/sessions')).body.sessions, regular), 'attending');
    assert.equal((await c.request('GET', '/api/me/credits')).body.credits.length, 0);
  });

  test('swap -> regular cancelled, make-up booked', async () => {
    const { c, regular, makeup } = await setup();

    const res = await c.request('POST', `/api/sessions/${regular}/swap`, { toSessionId: makeup });
    assert.equal(res.status, 200);

    const { sessions } = (await c.request('GET', '/api/me/sessions')).body;
    assert.equal(statusOf(sessions, regular), 'cancelled');
    assert.equal(statusOf(sessions, makeup), 'makeup');
  });

  test('book and drop a make-up with PUT / DELETE', async () => {
    const { c, userId, makeup } = await setup();
    await grantCredit(userId);

    assert.equal((await c.request('PUT', `/api/sessions/${makeup}/makeup`)).status, 200);
    assert.equal(statusOf((await c.request('GET', '/api/me/sessions')).body.sessions, makeup), 'makeup');

    const drop = await c.request('DELETE', `/api/sessions/${makeup}/makeup`);
    assert.deepEqual(drop.body, { refunded: true });
    assert.equal(statusOf((await c.request('GET', '/api/me/sessions')).body.sessions, makeup), undefined);
  });

  test('business rule errors come back as 409 with a code and a Turkish message', async () => {
    const { c, userId, makeup } = await setup({ makeupCapacity: 1 });
    await grantCredit(userId);

    const res = await c.request('PUT', `/api/sessions/${makeup}/makeup`);

    assert.equal(res.status, 409);
    assert.deepEqual(res.body, { error: { code: 'SESSION_FULL', message: 'Bu derste boş yer yok.' } });
  });

  test('a session of another studio looks like it does not exist', async () => {
    const { c, userId } = await setup();
    await grantCredit(userId);
    const otherStudio = await createStudio();
    const foreign = await createSession(await createGroup(otherStudio), 24);

    const res = await c.request('PUT', `/api/sessions/${foreign}/makeup`);
    assert.equal(res.body.error.code, 'SESSION_NOT_FOUND');
  });
});
