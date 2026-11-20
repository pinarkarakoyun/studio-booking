import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { countActiveBranches } from '../src/services/adminBranches.js';
import {
  createAdmin, createBranch, createCustomer, createGroup, createStudio, pool, resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Yönetici şubeleri panelden yönetir: ekler, düzenler, kapatır, yeniden açar.
useServer();
after(() => pool.end());
beforeEach(resetDb);

async function setup() {
  const studio = await createStudio();
  const c = await clientFor(await createAdmin(studio));
  return { studio, c };
}

const list = async (c) => (await c.request('GET', '/api/admin/branches')).body.branches;
const openCount = (branches) => branches.filter((b) => b.isActive).length;

describe('branch management', () => {
  test('lists branches with their active group count', async () => {
    const { studio, c } = await setup();
    const b = await createBranch(studio, { name: 'Kuzey', address: 'Örnek Mah. 1' });
    await createGroup(studio);
    await createGroup(studio, { branchId: b });
    await createGroup(studio, { branchId: b });
    await pool.query('UPDATE groups SET is_active = false WHERE id = (SELECT max(id) FROM groups)');

    const branches = await list(c);
    assert.deepEqual(branches.map((x) => [x.name, x.activeGroupCount, x.isActive]), [['Merkez', 1, true], ['Kuzey', 1, true]]);
    assert.equal(branches[1].address, 'Örnek Mah. 1');
    assert.equal(branches[1].mapsUrl, null);
  });

  test('creates a branch and trims spaces; rejects a 1-letter name and an http maps url', async () => {
    const { c } = await setup();
    const created = await c.request('POST', '/api/admin/branches', { name: '  Kuzey   Şube ', address: ' Örnek Mah. ', mapsUrl: 'https://maps.example.com/x' });
    assert.equal(created.status, 201);
    assert.ok(created.body.branchId);
    const kuzey = (await list(c)).find((x) => x.id === created.body.branchId);
    assert.deepEqual([kuzey.name, kuzey.address, kuzey.mapsUrl], ['Kuzey Şube', 'Örnek Mah.', 'https://maps.example.com/x']);

    const short = await c.request('POST', '/api/admin/branches', { name: 'K' });
    assert.equal(short.status, 400);
    assert.equal(short.body.error.code, 'INVALID_BRANCH_NAME');
    const http = await c.request('POST', '/api/admin/branches', { name: 'Güney', mapsUrl: 'http://maps.example.com/x' });
    assert.equal(http.status, 400);
    assert.equal(http.body.error.code, 'INVALID_MAPS_URL');
  });

  test('rejects a duplicate name ignoring case', async () => {
    const { c } = await setup();
    const res = await c.request('POST', '/api/admin/branches', { name: 'merkez' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'BRANCH_NAME_TAKEN');
  });

  test('rejects a duplicate name that differs only in Turkish I/ı case', async () => {
    const { c } = await setup();
    assert.equal((await c.request('POST', '/api/admin/branches', { name: 'Kızılay' })).status, 201);
    const res = await c.request('POST', '/api/admin/branches', { name: 'KIZILAY' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'BRANCH_NAME_TAKEN');
  });

  test('updates name, address and maps url; empty strings clear the optional fields', async () => {
    const { studio, c } = await setup();
    const b = await createBranch(studio, { name: 'Kuzey', address: 'Eski' });
    const res = await c.request('PUT', `/api/admin/branches/${b}`, { name: 'Kuzey Şubesi', address: '', mapsUrl: '' });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.branch.name, res.body.branch.address, res.body.branch.mapsUrl], ['Kuzey Şubesi', null, null]);
  });

  test('closing a branch with open groups fails and lists the group names', async () => {
    const { studio, c } = await setup();
    const b = await createBranch(studio, { name: 'Kuzey' });
    const group = await createGroup(studio, { branchId: b });
    await pool.query("UPDATE groups SET name = 'Sabah grubu' WHERE id = $1", [group]);

    const res = await c.request('POST', `/api/admin/branches/${b}/close`, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'BRANCH_HAS_GROUPS');
    assert.match(res.body.error.message, /Sabah grubu/);
    assert.equal(openCount(await list(c)), 2);
  });

  test('the last open branch cannot be closed', async () => {
    const { studio, c } = await setup();
    const [merkez] = await list(c);
    const res = await c.request('POST', `/api/admin/branches/${merkez.id}/close`, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LAST_BRANCH');
    assert.equal(await countActiveBranches(studio, pool), 1);
  });

  // Review Focus: şubenin son açık grubu kapatılınca şube kapanabilir, sonra yeniden açılabilir.
  test('close then reopen updates the open branch count', async () => {
    const { studio, c } = await setup();
    const b = await createBranch(studio, { name: 'Kuzey' });
    const group = await createGroup(studio, { branchId: b });
    await pool.query('UPDATE groups SET is_active = false WHERE id = $1', [group]);

    assert.equal((await c.request('POST', `/api/admin/branches/${b}/close`, {})).status, 200);
    assert.equal(openCount(await list(c)), 1);
    assert.equal(await countActiveBranches(studio, pool), 1);

    assert.equal((await c.request('POST', `/api/admin/branches/${b}/reopen`, {})).status, 200);
    assert.equal(openCount(await list(c)), 2);
    assert.equal(await countActiveBranches(studio, pool), 2);
  });

  test("another studio's branch is not found", async () => {
    const { c } = await setup();
    const other = await createStudio();
    const b = await createBranch(other, { name: 'Kuzey' });
    for (const [method, path, body] of [
      ['PUT', `/api/admin/branches/${b}`, { name: 'X Şube' }],
      ['POST', `/api/admin/branches/${b}/close`, {}],
      ['POST', `/api/admin/branches/${b}/reopen`, {}],
    ]) {
      const res = await c.request(method, path, body);
      assert.equal(res.status, 404, path);
      assert.equal(res.body.error.code, 'BRANCH_NOT_FOUND', path);
    }
  });

  test('customers cannot reach branch endpoints', async () => {
    const { studio } = await setup();
    const customer = await clientFor(await createCustomer(studio));
    assert.equal((await customer.request('GET', '/api/admin/branches')).status, 403);
  });
});
