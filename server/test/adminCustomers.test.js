import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { login, resetLoginAttempts } from '../src/services/auth.js';
import {
  createAdmin,
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  grantCredit,
  occupancy,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(async () => {
  await resetDb();
  resetLoginAttempts();
});

const today = async () =>
  (await pool.query(`SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date AS d`)).rows[0].d;

async function setup({ capacity = 3 } = {}) {
  const studio = await createStudio();
  const admin = await createAdmin(studio);
  const group = await createGroup(studio, { capacity });
  return { studio, group, c: await clientFor(admin) };
}

describe('access', () => {
  test('customers cannot use the admin customer endpoints', async () => {
    const studio = await createStudio();
    const customer = await createCustomer(studio);
    const res = await (await clientFor(customer)).request('GET', '/api/admin/customers');
    assert.equal(res.status, 403);
  });

  test("another studio's customer is not found", async () => {
    const { c } = await setup();
    const other = await createCustomer(await createStudio());
    assert.equal((await c.request('GET', `/api/admin/customers/${other}`)).status, 404);
    assert.equal((await c.request('POST', `/api/admin/customers/${other}/leave`)).status, 404);
  });
});

describe('list and detail', () => {
  test('lists customers with group, freeze and credits, sorted in Turkish order', async () => {
    const { studio, group, c } = await setup();
    const sule = await createCustomer(studio, group);
    const selin = await createCustomer(studio, group);
    await pool.query(`UPDATE users SET full_name = 'Şule' WHERE id = $1`, [sule]);
    await pool.query(`UPDATE users SET full_name = 'Selin' WHERE id = $1`, [selin]);
    await pool.query(`INSERT INTO freezes (user_id, starts_on) VALUES ($1, $2)`, [sule, await today()]);
    await grantCredit(selin);

    const { body } = await c.request('GET', '/api/admin/customers');

    assert.deepEqual(body.customers.map((x) => x.fullName), ['Selin', 'Şule']);
    assert.equal(body.customers[0].unusedCredits, 1);
    assert.equal(body.customers[0].group.id, group);
    assert.equal(body.customers[1].freeze.active, true);
  });

  test('detail includes credits and the next session', async () => {
    const { studio, group, c } = await setup();
    const customer = await createCustomer(studio, group);
    const session = await createSession(group, 48);
    await grantCredit(customer);

    const { body } = await c.request('GET', `/api/admin/customers/${customer}`);

    assert.equal(body.customer.credits.length, 1);
    assert.equal(body.customer.nextSession.id, session);
  });
});

describe('create', () => {
  test('creates a customer in a group and returns a readable temporary password that works once', async () => {
    const { group, c } = await setup();

    const res = await c.request('POST', '/api/admin/customers', {
      fullName: '  Nazlı   Güneş ', phone: '0533 444 55 66', groupId: group, startsOn: await today(),
    });

    assert.equal(res.status, 201);
    assert.match(res.body.temporaryPassword, /^[a-z]+-[a-z]+-\d{2}$/);
    const { body } = await c.request('GET', `/api/admin/customers/${res.body.customerId}`);
    assert.equal(body.customer.fullName, 'Nazlı Güneş');
    assert.equal(body.customer.group.id, group);

    const loggedIn = await login({ phone: '+905334445566', password: res.body.temporaryPassword });
    assert.equal(loggedIn.user.must_change_password, true);
  });

  test('warns when the group is full, and adds anyway after confirmation', async () => {
    const { studio, group, c } = await setup({ capacity: 1 });
    await createCustomer(studio, group);
    const body = { fullName: 'Yeni Üye', phone: '0533 444 55 66', groupId: group, startsOn: await today() };

    const warned = await c.request('POST', '/api/admin/customers', body);
    assert.equal(warned.status, 409);
    assert.equal(warned.body.error.code, 'GROUP_FULL');

    const confirmed = await c.request('POST', '/api/admin/customers', { ...body, confirmFull: true });
    assert.equal(confirmed.status, 201);
  });

  test('rejects a phone that is already registered and a group of another studio', async () => {
    const { studio, group, c } = await setup();
    const existing = await createCustomer(studio, group);
    const { rows: [{ phone }] } = await pool.query('SELECT phone FROM users WHERE id = $1', [existing]);
    const otherGroup = await createGroup(await createStudio());

    const taken = await c.request('POST', '/api/admin/customers', {
      fullName: 'X Y', phone, groupId: group, startsOn: await today(),
    });
    const foreign = await c.request('POST', '/api/admin/customers', {
      fullName: 'X Y', phone: '0533 444 55 67', groupId: otherGroup, startsOn: await today(),
    });

    assert.equal(taken.body.error.code, 'PHONE_TAKEN');
    assert.equal(foreign.status, 404);
  });
});

describe('reset password', () => {
  test('gives a new temporary password and logs the customer out everywhere', async () => {
    const { studio, group, c } = await setup();
    const customer = await createCustomer(studio, group);
    const customerClient = await clientFor(customer);
    assert.equal((await customerClient.request('GET', '/api/me/sessions')).status, 200);

    const res = await c.request('POST', `/api/admin/customers/${customer}/reset-password`);

    assert.match(res.body.temporaryPassword, /^[a-z]+-[a-z]+-\d{2}$/);
    assert.equal((await customerClient.request('GET', '/api/me/sessions')).status, 401);
  });
});

describe('freeze', () => {
  test('freezes, rejects an overlapping freeze, and ends the freeze', async () => {
    const { studio, group, c } = await setup();
    const customer = await createCustomer(studio, group);
    const start = await today();

    assert.equal((await c.request('POST', `/api/admin/customers/${customer}/freeze`, { startsOn: start })).status, 204);
    const overlap = await c.request('POST', `/api/admin/customers/${customer}/freeze`, { startsOn: start });
    assert.equal(overlap.body.error.code, 'FREEZE_OVERLAP');

    const ended = await c.request('POST', `/api/admin/customers/${customer}/end-freeze`);
    assert.equal(ended.status, 200);
    const { body } = await c.request('GET', `/api/admin/customers/${customer}`);
    assert.equal(body.customer.freeze, null);
  });

  test('warns when the group is over capacity after the freeze ends', async () => {
    const { studio, group, c } = await setup({ capacity: 1 });
    const frozen = await createCustomer(studio, group);
    await c.request('POST', `/api/admin/customers/${frozen}/freeze`, { startsOn: await today() });
    await createCustomer(studio, group); // dondurma sırasında yeri başkası aldı

    const { body } = await c.request('POST', `/api/admin/customers/${frozen}/end-freeze`);
    assert.equal(body.groupOverCapacity, true);
  });

  test('rejects an end date before the start date', async () => {
    const { studio, group, c } = await setup();
    const customer = await createCustomer(studio, group);
    const res = await c.request('POST', `/api/admin/customers/${customer}/freeze`, {
      startsOn: '2026-12-10', endsOn: '2026-12-01',
    });
    assert.equal(res.body.error.code, 'INVALID_DATE');
  });
});

describe('leave', () => {
  test('previews and then releases future make-ups, closes the group membership and logs out', async () => {
    const { studio, group, c } = await setup();
    const customer = await createCustomer(studio, group);
    const otherGroup = await createGroup(studio);
    const makeupSession = await createSession(otherGroup, 48);
    const regularSession = await createSession(group, 72);
    await pool.query(
      `INSERT INTO credits (user_id, used_session_id, used_at, expires_at) VALUES ($1, $2, now(), now() + interval '30 days')`,
      [customer, makeupSession],
    );
    const customerClient = await clientFor(customer);

    const preview = await c.request('GET', `/api/admin/customers/${customer}/leave-preview`);
    assert.equal(preview.body.futureMakeups, 1);

    assert.equal((await c.request('POST', `/api/admin/customers/${customer}/leave`)).status, 204);

    assert.equal((await occupancy(makeupSession)).makeup_count, 0);
    assert.equal((await occupancy(regularSession)).regular_count, 0);
    assert.equal((await customerClient.request('GET', '/api/me/sessions')).status, 401);
    const { body } = await c.request('GET', `/api/admin/customers/${customer}`);
    assert.equal(body.customer.status, 'left');
    assert.equal(body.customer.group, null);
  });
});

describe('groups', () => {
  test('lists groups with member counts (frozen members do not take a spot)', async () => {
    const { studio, group, c } = await setup();
    await createCustomer(studio, group);
    const frozen = await createCustomer(studio, group);
    await pool.query(`INSERT INTO freezes (user_id, starts_on) VALUES ($1, $2)`, [frozen, await today()]);

    const { body } = await c.request('GET', '/api/admin/groups');
    assert.deepEqual(body.groups.map((g) => [g.id, g.memberCount, g.capacity]), [[group, 1, 3]]);
  });
});

describe('granting make-up credits', () => {
  const plusDays = async (n) =>
    (await pool.query(`SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`, [n])).rows[0].d;

  test('granted credits show for the customer and can be used for a make-up', async () => {
    const { studio, group, c } = await setup();
    const customerId = await createCustomer(studio, group);
    const res = await c.request('POST', `/api/admin/customers/${customerId}/credits`, {
      count: 2, expiresOn: await plusDays(10), note: '26 Ekim, hastalık',
    });
    assert.equal(res.status, 204);

    const detail = await c.request('GET', `/api/admin/customers/${customerId}`);
    assert.equal(detail.body.customer.credits.length, 2);
    const { rows: [row] } = await pool.query('SELECT note, source_session_id FROM credits WHERE user_id = $1 LIMIT 1', [customerId]);
    assert.deepEqual(row, { note: '26 Ekim, hastalık', source_session_id: null });

    const me = await clientFor(customerId);
    assert.equal((await me.request('GET', '/api/me/credits')).body.credits.length, 2);
    const otherGroup = await createGroup(studio);
    const sessionId = await createSession(otherGroup, 48);
    assert.equal((await me.request('PUT', `/api/sessions/${sessionId}/makeup`)).status, 200);
    assert.equal((await me.request('GET', '/api/me/credits')).body.credits.length, 1);
  });

  test('a credit lasts until the end of the chosen day', async () => {
    const { studio, c } = await setup();
    const customerId = await createCustomer(studio);
    await c.request('POST', `/api/admin/customers/${customerId}/credits`, { count: 1, expiresOn: await plusDays(0) });
    const { rows: [row] } = await pool.query(
      `SELECT (expires_at AT TIME ZONE 'Europe/Istanbul')::text AS local FROM credits WHERE user_id = $1`,
      [customerId],
    );
    assert.equal(row.local, `${await plusDays(0)} 23:59:59`);
  });

  test('rejects a bad count, a past date and a date more than a year ahead', async () => {
    const { studio, c } = await setup();
    const customerId = await createCustomer(studio);
    const url = `/api/admin/customers/${customerId}/credits`;
    assert.equal((await c.request('POST', url, { count: 0, expiresOn: await plusDays(5) })).body.error.code, 'INVALID_COUNT');
    assert.equal((await c.request('POST', url, { count: 6, expiresOn: await plusDays(5) })).body.error.code, 'INVALID_COUNT');
    assert.equal((await c.request('POST', url, { count: 1, expiresOn: await plusDays(-1) })).body.error.code, 'INVALID_DATE');
    assert.equal((await c.request('POST', url, { count: 1, expiresOn: await plusDays(400) })).body.error.code, 'INVALID_DATE');
    const { rows: [n] } = await pool.query('SELECT COUNT(*)::int AS n FROM credits WHERE user_id = $1', [customerId]);
    assert.equal(n.n, 0);
  });

  test('no credits for a customer who left or for another studio', async () => {
    const { studio, c } = await setup();
    const left = await createCustomer(studio);
    await pool.query(`UPDATE users SET status = 'left' WHERE id = $1`, [left]);
    const body = { count: 1, expiresOn: await plusDays(5) };
    assert.equal((await c.request('POST', `/api/admin/customers/${left}/credits`, body)).status, 409);
    const other = await createCustomer(await createStudio());
    assert.equal((await c.request('POST', `/api/admin/customers/${other}/credits`, body)).status, 404);
  });
});
