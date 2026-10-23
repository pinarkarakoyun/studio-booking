import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createAdmin, createCustomer, createStudio, pool, resetDb } from './helpers.js';
import { clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

// Stüdyonun saatine göre bugün + N gün ("2026-10-30")
async function day(n) {
  const { rows: [row] } = await pool.query(
    `SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`,
    [n],
  );
  return row.d;
}

async function setup() {
  const studio = await createStudio();
  const c = await clientFor(await createAdmin(studio));
  const customerId = await createCustomer(studio);
  return { studio, c, customerId };
}

async function openMembership(c, customerId, from, to, feeKurus = 450000) {
  return c.request('POST', `/api/admin/customers/${customerId}/memberships`, {
    startsOn: await day(from), endsOn: await day(to), feeKurus,
  });
}

describe('memberships', () => {
  test('payments add up; paid and remaining are calculated, the next period is suggested', async () => {
    const { c, customerId } = await setup();
    const created = await openMembership(c, customerId, -10, 20);
    assert.equal(created.status, 201);
    const id = created.body.membership.id;

    const pay = await c.request('POST', `/api/admin/memberships/${id}/payments`, {
      amountKurus: 150000, paidOn: await day(-10), method: 'transfer',
    });
    assert.equal(pay.status, 201);
    assert.equal(pay.body.membership.paidKurus, 150000);
    assert.equal(pay.body.membership.remainingKurus, 300000);
    assert.equal(pay.body.membership.status, 'active');

    const res = await c.request('GET', `/api/admin/customers/${customerId}/memberships`);
    assert.equal(res.body.memberships.length, 1);
    assert.equal(res.body.memberships[0].payments.length, 1);
    assert.equal(res.body.suggestedStartsOn, await day(21));
  });

  test('frozen days extend the period, and the extended end counts for overlaps', async () => {
    const { c, customerId } = await setup();
    await openMembership(c, customerId, -10, 20);
    await pool.query('INSERT INTO freezes (user_id, starts_on, ends_on) VALUES ($1, $2, $3)', [
      customerId, await day(0), await day(6),
    ]);

    const res = await c.request('GET', `/api/admin/customers/${customerId}/memberships`);
    assert.equal(res.body.memberships[0].freezeDays, 7);
    assert.equal(res.body.memberships[0].endsOn, await day(27));
    assert.equal(res.body.suggestedStartsOn, await day(28));

    const overlapping = await openMembership(c, customerId, 21, 50);
    assert.equal(overlapping.status, 409);
    assert.equal(overlapping.body.error.code, 'MEMBERSHIP_OVERLAP');
    assert.equal((await openMembership(c, customerId, 28, 58)).status, 201);
  });

  test('a payment larger than what is left is rejected; deleting a payment brings the debt back', async () => {
    const { c, customerId } = await setup();
    const id = (await openMembership(c, customerId, 0, 30, 100000)).body.membership.id;
    const paidOn = await day(0);

    const tooMuch = await c.request('POST', `/api/admin/memberships/${id}/payments`, { amountKurus: 100001, paidOn, method: 'cash' });
    assert.equal(tooMuch.status, 409);
    assert.equal(tooMuch.body.error.code, 'PAYMENT_EXCEEDS_FEE');

    const full = await c.request('POST', `/api/admin/memberships/${id}/payments`, { amountKurus: 100000, paidOn, method: 'cash' });
    assert.equal(full.body.membership.remainingKurus, 0);

    const paymentId = full.body.membership.payments[0].id;
    const removed = await c.request('DELETE', `/api/admin/payments/${paymentId}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.membership.remainingKurus, 100000);
  });

  test('rejects invalid input', async () => {
    const { c, customerId } = await setup();
    const backwards = await openMembership(c, customerId, 10, 5);
    assert.equal(backwards.body.error.code, 'INVALID_DATE');
    const id = (await openMembership(c, customerId, 0, 30)).body.membership.id;
    const badMethod = await c.request('POST', `/api/admin/memberships/${id}/payments`, {
      amountKurus: 1000, paidOn: await day(0), method: 'crypto',
    });
    assert.equal(badMethod.body.error.code, 'INVALID_METHOD');
  });

  test('a customer who left cannot get a new period', async () => {
    const { c, customerId } = await setup();
    await pool.query(`UPDATE users SET status = 'left' WHERE id = $1`, [customerId]);
    const res = await openMembership(c, customerId, 0, 30);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CUSTOMER_LEFT');
  });

  test("another studio's customer, period and payment are not found", async () => {
    const { c, customerId } = await setup();
    const id = (await openMembership(c, customerId, 0, 30)).body.membership.id;
    const pay = await c.request('POST', `/api/admin/memberships/${id}/payments`, { amountKurus: 1000, paidOn: await day(0), method: 'card' });
    const paymentId = pay.body.membership.payments[0].id;

    const other = await clientFor(await createAdmin(await createStudio()));
    assert.equal((await other.request('GET', `/api/admin/customers/${customerId}/memberships`)).status, 404);
    assert.equal((await other.request('POST', `/api/admin/memberships/${id}/payments`, { amountKurus: 1000, paidOn: await day(0), method: 'card' })).status, 404);
    assert.equal((await other.request('DELETE', `/api/admin/payments/${paymentId}`)).status, 404);
  });
});

describe('payments overview', () => {
  test('sorts customers into expired, ending soon, underpaid and no period', async () => {
    const studio = await createStudio();
    const c = await clientFor(await createAdmin(studio));
    const expired = await createCustomer(studio);
    const endingSoon = await createCustomer(studio);
    const renewed = await createCustomer(studio);
    const fine = await createCustomer(studio);
    const none = await createCustomer(studio);
    const gone = await createCustomer(studio);
    await pool.query(`UPDATE users SET full_name = 'Ayrılan', status = 'left' WHERE id = $1`, [gone]);

    await openMembership(c, expired, -40, -3, 100000);
    const soonId = (await openMembership(c, endingSoon, -25, 5, 100000)).body.membership.id;
    await c.request('POST', `/api/admin/memberships/${soonId}/payments`, { amountKurus: 100000, paidOn: await day(0), method: 'cash' });
    await openMembership(c, renewed, -25, 2, 0);
    await openMembership(c, renewed, 3, 33, 0);
    await openMembership(c, fine, -5, 25, 0);

    const { body } = await c.request('GET', '/api/admin/payments');
    assert.deepEqual(body.expired.map((r) => [r.customerId, r.daysAgo]), [[expired, 3]]);
    assert.deepEqual(body.endingSoon.map((r) => [r.customerId, r.daysLeft]), [[endingSoon, 5]]);
    assert.deepEqual(body.underpaid.map((r) => [r.customerId, r.remainingKurus]), [[expired, 100000]]);
    assert.deepEqual(body.noMembership.map((r) => r.customerId), [none]);
    assert.deepEqual(body.thisMonth, { count: 1, totalKurus: 100000 });
  });

  test('"ending soon" follows the reminder setting', async () => {
    const { c, customerId } = await setup();
    await openMembership(c, customerId, -20, 10, 0);
    assert.equal((await c.request('GET', '/api/admin/payments')).body.endingSoon.length, 0);

    const { body: { settings } } = await c.request('GET', '/api/admin/settings');
    await c.request('PUT', '/api/admin/settings', { ...settings, paymentReminderDays: 10 });
    assert.equal((await c.request('GET', '/api/admin/payments')).body.endingSoon.length, 1);
  });

  test("another studio's customers are not in the overview", async () => {
    const { c, customerId } = await setup();
    await openMembership(c, customerId, -40, -3);
    const other = await clientFor(await createAdmin(await createStudio()));
    const { body } = await other.request('GET', '/api/admin/payments');
    assert.equal(body.expired.length + body.underpaid.length + body.noMembership.length, 0);
  });
});
