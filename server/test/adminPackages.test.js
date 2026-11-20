import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createAdmin, createStudio, pool, resetDb } from './helpers.js';
import { clientFor, useServer } from './http.js';

// Paket kataloğu: yalnızca seans paketi modelindeki stüdyoda. Yönetici paket ekler, düzenler, kapatır, açar.
useServer();
after(() => pool.end());
beforeEach(resetDb);

async function setup(membershipModel = 'package') {
  const studio = await createStudio({ membershipModel });
  const c = await clientFor(await createAdmin(studio));
  return { studio, c };
}

const EIGHT = { name: '8 seans', sessionCount: 8, priceKurus: 240000, validityDays: 45 };
const list = async (c) => (await c.request('GET', '/api/admin/packages')).body.packages;

describe('package catalog', () => {
  test('group model studio cannot reach packages', async () => {
    const { c } = await setup('group');
    for (const [method, path, body] of [
      ['GET', '/api/admin/packages'],
      ['POST', '/api/admin/packages', EIGHT],
      ['PUT', '/api/admin/packages/1', EIGHT],
      ['POST', '/api/admin/packages/1/close', {}],
      ['POST', '/api/admin/packages/1/reopen', {}],
    ]) {
      const res = await c.request(method, path, body);
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.body.error.code, 'NOT_AVAILABLE_FOR_MODEL', `${method} ${path}`);
    }
    const { rows } = await pool.query('SELECT 1 FROM packages');
    assert.equal(rows.length, 0);
  });

  test('creates, lists, updates a package', async () => {
    const { c } = await setup();
    const created = await c.request('POST', '/api/admin/packages', { ...EIGHT, name: '  8   seans ' });
    assert.equal(created.status, 201);
    assert.ok(created.body.packageId);

    await c.request('POST', '/api/admin/packages', { name: '12 seans', sessionCount: 12, priceKurus: 330000, validityDays: 60 });
    assert.deepEqual(await list(c), [
      { id: created.body.packageId, name: '8 seans', sessionCount: 8, priceKurus: 240000, validityDays: 45, isActive: true },
      { id: created.body.packageId + 1, name: '12 seans', sessionCount: 12, priceKurus: 330000, validityDays: 60, isActive: true },
    ]);

    const updated = await c.request('PUT', `/api/admin/packages/${created.body.packageId}`, { ...EIGHT, priceKurus: 250000, validityDays: 50 });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.package, {
      id: created.body.packageId, name: '8 seans', sessionCount: 8, priceKurus: 250000, validityDays: 50, isActive: true,
    });
  });

  test('validation codes', async () => {
    const { c } = await setup();
    for (const [body, code] of [
      [{ ...EIGHT, name: 'A' }, 'INVALID_PACKAGE_NAME'],
      [{ ...EIGHT, name: 'x'.repeat(61) }, 'INVALID_PACKAGE_NAME'],
      [{ ...EIGHT, name: undefined }, 'INVALID_PACKAGE_NAME'],
      [{ ...EIGHT, sessionCount: 0 }, 'INVALID_SESSION_COUNT'],
      [{ ...EIGHT, sessionCount: 201 }, 'INVALID_SESSION_COUNT'],
      [{ ...EIGHT, sessionCount: 2.5 }, 'INVALID_SESSION_COUNT'],
      [{ ...EIGHT, sessionCount: '8' }, 'INVALID_SESSION_COUNT'],
      [{ ...EIGHT, priceKurus: -1 }, 'INVALID_PRICE'],
      [{ ...EIGHT, priceKurus: 10.5 }, 'INVALID_PRICE'],
      [{ ...EIGHT, priceKurus: null }, 'INVALID_PRICE'],
      [{ ...EIGHT, validityDays: 0 }, 'INVALID_VALIDITY_DAYS'],
      [{ ...EIGHT, validityDays: 366 }, 'INVALID_VALIDITY_DAYS'],
    ]) {
      const res = await c.request('POST', '/api/admin/packages', body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, code, JSON.stringify(body));
    }
    assert.deepEqual(await list(c), []);

    // Ücretsiz paket (0 TL) geçerli.
    assert.equal((await c.request('POST', '/api/admin/packages', { ...EIGHT, priceKurus: 0 })).status, 201);
  });

  test('close and reopen', async () => {
    const { c } = await setup();
    const { body: { packageId } } = await c.request('POST', '/api/admin/packages', EIGHT);

    const closed = await c.request('POST', `/api/admin/packages/${packageId}/close`, {});
    assert.equal(closed.status, 200);
    assert.deepEqual(closed.body.packages.map((p) => p.isActive), [false]);

    const reopened = await c.request('POST', `/api/admin/packages/${packageId}/reopen`, {});
    assert.equal(reopened.status, 200);
    assert.deepEqual(reopened.body.packages.map((p) => p.isActive), [true]);
  });

  test("another studio's package is not found", async () => {
    const { c } = await setup();
    const other = await setup();
    const { body: { packageId } } = await other.c.request('POST', '/api/admin/packages', EIGHT);

    for (const [method, path, body] of [
      ['PUT', `/api/admin/packages/${packageId}`, { ...EIGHT, name: 'Ele geçti' }],
      ['POST', `/api/admin/packages/${packageId}/close`, {}],
      ['POST', `/api/admin/packages/abc/close`, {}],
    ]) {
      const res = await c.request(method, path, body);
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.body.error.code, 'PACKAGE_NOT_FOUND', `${method} ${path}`);
    }
    assert.deepEqual(await list(c), []);
    assert.deepEqual((await list(other.c)).map((p) => [p.name, p.isActive]), [['8 seans', true]]);
  });
});
