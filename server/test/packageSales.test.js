import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createAdmin, createCustomer, createStudio, pool, resetDb } from './helpers.js';
import { clientFor, useServer } from './http.js';

// Paket satışı: paket modelinde üyelik dönemi katalogdaki bir paketten açılır. Seans sayısı, ad, fiyat ve
// bitiş tarihi (başlangıç + geçerlilik - 1) döneme kopyalanır.
useServer();
after(() => pool.end());
beforeEach(resetDb);

async function day(n) {
  const { rows: [row] } = await pool.query(
    `SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`,
    [n],
  );
  return row.d;
}

const TWELVE = { name: '12 seans', sessionCount: 12, priceKurus: 240000, validityDays: 60 };

async function setup(membershipModel = 'package') {
  const studio = await createStudio({ membershipModel });
  const c = await clientFor(await createAdmin(studio));
  const customerId = await createCustomer(studio);
  let packageId = null;
  if (membershipModel === 'package') {
    ({ body: { packageId } } = await c.request('POST', '/api/admin/packages', TWELVE));
  }
  return { studio, c, customerId, packageId };
}

const sell = (c, customerId, body) => c.request('POST', `/api/admin/customers/${customerId}/memberships`, body);

describe('package sales', () => {
  test('sells a package and copies count, name, price and end date', async () => {
    const { c, customerId, packageId } = await setup();
    const res = await sell(c, customerId, { packageId, startsOn: await day(0) });
    assert.equal(res.status, 201);
    const m = res.body.membership;
    assert.equal(m.sessionCount, 12);
    assert.equal(m.packageName, '12 seans');
    assert.equal(m.feeKurus, 240000);
    assert.equal(m.startsOn, await day(0));
    assert.equal(m.endsOn, await day(59));
    assert.equal(m.remainingKurus, 240000);
  });

  test('feeKurus overrides the catalog price', async () => {
    const { c, customerId, packageId } = await setup();
    const res = await sell(c, customerId, { packageId, startsOn: await day(0), feeKurus: 200000, note: 'indirim' });
    assert.equal(res.status, 201);
    assert.equal(res.body.membership.feeKurus, 200000);
    assert.equal(res.body.membership.note, 'indirim');

    const bad = await sell(c, customerId, { packageId, startsOn: await day(90), feeKurus: -5 });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_AMOUNT');
  });

  test('catalog changes do not touch sold packages', async () => {
    const { c, customerId, packageId } = await setup();
    await sell(c, customerId, { packageId, startsOn: await day(0) });
    await c.request('PUT', `/api/admin/packages/${packageId}`, { name: 'Yeni ad', sessionCount: 10, priceKurus: 999900, validityDays: 30 });

    const { body } = await c.request('GET', `/api/admin/customers/${customerId}/memberships`);
    const [m] = body.memberships;
    assert.deepEqual([m.packageName, m.sessionCount, m.feeKurus, m.endsOn], ['12 seans', 12, 240000, await day(59)]);
  });

  test('a closed package cannot be sold', async () => {
    const { c, customerId, packageId } = await setup();
    await c.request('POST', `/api/admin/packages/${packageId}/close`, {});
    const res = await sell(c, customerId, { packageId, startsOn: await day(0) });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'PACKAGE_CLOSED');
    assert.equal((await pool.query('SELECT 1 FROM memberships')).rowCount, 0);
  });

  // Mevcut dönemin bitişi dondurmayla uzamışsa yeni paket uzamış bitişten sonra başlamalı.
  test('a package overlapping the current one is refused', async () => {
    const { c, customerId, packageId } = await setup();
    assert.equal((await sell(c, customerId, { packageId, startsOn: await day(-10) })).status, 201); // bitiş: gün 49
    await pool.query('INSERT INTO freezes (user_id, starts_on, ends_on) VALUES ($1, $2, $3)', [customerId, await day(-5), await day(-1)]);

    for (const start of [0, 49, 54]) {
      const res = await sell(c, customerId, { packageId, startsOn: await day(start) });
      assert.equal(res.status, 409, `gün ${start}`);
      assert.equal(res.body.error.code, 'MEMBERSHIP_OVERLAP', `gün ${start}`);
    }
    assert.equal((await sell(c, customerId, { packageId, startsOn: await day(55) })).status, 201);
  });

  test('package model needs a package; unknown package and bad input', async () => {
    const { c, customerId, packageId } = await setup();
    for (const [body, status, code] of [
      [{ startsOn: await day(0), endsOn: await day(30), feeKurus: 100000 }, 400, 'PACKAGE_REQUIRED'],
      [{ packageId: 999999, startsOn: await day(0) }, 404, 'PACKAGE_NOT_FOUND'],
      [{ packageId: 'abc', startsOn: await day(0) }, 404, 'PACKAGE_NOT_FOUND'],
      [{ packageId, startsOn: 'dün' }, 400, 'INVALID_DATE'],
    ]) {
      const res = await sell(c, customerId, body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.body.error.code, code, JSON.stringify(body));
    }
  });

  test('group model keeps the period body', async () => {
    const { c, customerId } = await setup('group');
    const res = await sell(c, customerId, { startsOn: await day(0), endsOn: await day(30), feeKurus: 100000 });
    assert.equal(res.status, 201);
    assert.equal(res.body.membership.sessionCount, null);
    assert.equal(res.body.membership.packageName, null);

    const withPackage = await sell(c, customerId, { packageId: 1, startsOn: await day(40) });
    assert.equal(withPackage.status, 400);
    assert.equal(withPackage.body.error.code, 'NOT_AVAILABLE_FOR_MODEL');
  });

  test('payments attach to a package like to a period', async () => {
    const { c, customerId, packageId } = await setup();
    const { body: { membership } } = await sell(c, customerId, { packageId, startsOn: await day(0) });
    const pay = await c.request('POST', `/api/admin/memberships/${membership.id}/payments`, {
      amountKurus: 100000, paidOn: await day(0), method: 'cash',
    });
    assert.equal(pay.status, 201);
    assert.equal(pay.body.membership.paidKurus, 100000);
    assert.equal(pay.body.membership.remainingKurus, 140000);
    assert.equal(pay.body.membership.packageName, '12 seans');
  });
});
