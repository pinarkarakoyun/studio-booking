import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import staffRouter from '../src/routes/staff.js';
import { PERMISSION_KEYS } from '../src/services/instructorPermissions.js';
import { createAdmin, createBranch, createCustomer, createInstructor, createStudio, defaultBranchId, pool, resetDb } from './helpers.js';
import { clientFor, useServer } from './http.js';

// Personel uçları: hangi uç kime açık? Kapsam (şube süzmesi) Görev 3–5'in testlerinde.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const ALL_OFF = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false]));
const ALL_ON = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));

// Eğitmene yetkiyle açılan uçlar. Koruyucu gövdeden önce çalıştığı için id'lerin var olması gerekmez.
const PERMISSIONED = [
  ['PUT', '/api/admin/sessions/1/attendance/1'],
  ['DELETE', '/api/admin/sessions/1/attendance/1'],
  ['POST', '/api/admin/sessions/1/take-over'],
  ['POST', '/api/admin/sessions/1/cancel/preview'],
  ['POST', '/api/admin/sessions/1/cancel'],
  ['POST', '/api/admin/sessions/1/attendees'],
  ['DELETE', '/api/admin/sessions/1/attendees/1'],
  ['GET', '/api/admin/customers'],
  ['GET', '/api/admin/customers/1'],
  ['POST', '/api/admin/customers'],
  ['POST', '/api/admin/customers/1/reset-password'],
  ['POST', '/api/admin/customers/1/freeze'],
  ['POST', '/api/admin/customers/1/end-freeze'],
  ['GET', '/api/admin/customers/1/leave-preview'],
  ['POST', '/api/admin/customers/1/leave'],
  ['POST', '/api/admin/customers/1/change-group'],
  ['POST', '/api/admin/customers/1/credits'],
  ['GET', '/api/admin/customers/1/memberships'],
  ['POST', '/api/admin/customers/1/memberships'],
  ['GET', '/api/admin/packages'],
  ['GET', '/api/admin/groups'],
  ['POST', '/api/admin/groups'],
  ['GET', '/api/admin/groups/1'],
  ['PUT', '/api/admin/groups/1'],
  ['POST', '/api/admin/groups/1/preview'],
  ['POST', '/api/admin/groups/1/close'],
];

// Bütün yetkiler açık olsa bile eğitmene kapalı kalanlar.
const ADMIN_ONLY = [
  ['PUT', '/api/admin/sessions/1/instructor'],
  ['GET', '/api/admin/payments'],
  ['POST', '/api/admin/memberships/1/payments'],
  ['DELETE', '/api/admin/payments/1'],
  ['POST', '/api/admin/packages'],
  ['PUT', '/api/admin/packages/1'],
  ['POST', '/api/admin/packages/1/close'],
  ['POST', '/api/admin/packages/1/reopen'],
  ['GET', '/api/admin/settings'],
  ['PUT', '/api/admin/settings'],
  ['GET', '/api/admin/appearance'],
  ['PUT', '/api/admin/appearance'],
  ['POST', '/api/admin/appearance/preview'],
  ['POST', '/api/admin/branches'],
  ['PUT', '/api/admin/branches/1'],
  ['POST', '/api/admin/branches/1/close'],
  ['POST', '/api/admin/branches/1/reopen'],
];

// fetch GET/HEAD isteklerinde gövdeye izin vermez.
const send = (c, method, path) => c.request(method, path, method === 'GET' ? undefined : {});

async function instructorClient(permissions) {
  const studio = await createStudio();
  const id = await createInstructor(studio, { branchIds: [await defaultBranchId(studio)], permissions });
  return { studio, c: await clientFor(id) };
}

describe('staff routes', () => {
  test('every staff route has exactly one guard', () => {
    const routes = staffRouter.stack.filter((layer) => layer.route);
    assert.ok(routes.length >= PERMISSIONED.length);
    for (const { route } of routes) {
      const guards = route.stack.filter((l) => l.handle.guard === true);
      assert.equal(guards.length, 1, `${Object.keys(route.methods)} ${route.path}`);
    }
  });

  test('instructor without permissions gets 403 on permissioned routes', async () => {
    const { c } = await instructorClient(ALL_OFF);
    for (const [method, path] of PERMISSIONED) {
      const res = await send(c, method, path);
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  test('instructor without permissions can still see the day', async () => {
    const { c } = await instructorClient(ALL_OFF);
    assert.equal((await c.request('GET', '/api/admin/today')).status, 200);
    assert.equal((await c.request('GET', '/api/admin/branches')).status, 200);
  });

  test('admin-only routes stay admin-only', async () => {
    const { c } = await instructorClient(ALL_ON);
    for (const [method, path] of ADMIN_ONLY) {
      const res = await send(c, method, path);
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  test('an instructor permission opens its route', async () => {
    const { c } = await instructorClient({ view_customers: true });
    assert.equal((await c.request('GET', '/api/admin/customers')).status, 200);
    assert.equal((await c.request('GET', '/api/admin/groups')).status, 403);
  });

  test('group list opens with customer permissions too (forms need it), group detail does not', async () => {
    for (const permissions of [{ view_customers: true, edit_customers: true }, { view_customers: true, customer_status: true }]) {
      const { c } = await instructorClient(permissions);
      assert.equal((await c.request('GET', '/api/admin/groups')).status, 200, JSON.stringify(permissions));
      assert.equal((await c.request('GET', '/api/admin/groups/1')).status, 403);
    }
    const { c } = await instructorClient({ view_customers: true });
    assert.equal((await c.request('GET', '/api/admin/groups')).status, 403);
  });

  test('customer gets 403 on staff routes', async () => {
    const studio = await createStudio();
    const c = await clientFor(await createCustomer(studio));
    assert.equal((await c.request('GET', '/api/admin/today')).status, 403);
    assert.equal((await c.request('GET', '/api/admin/customers')).status, 403);
  });

  test('admin behaviour unchanged', async () => {
    const studio = await createStudio();
    const c = await clientFor(await createAdmin(studio));
    assert.equal((await c.request('GET', '/api/admin/today')).status, 200);
    assert.equal((await c.request('GET', '/api/admin/customers')).status, 200);
    assert.equal((await c.request('GET', '/api/admin/settings')).status, 200);
  });

  test('me returns permissions and branches for instructor', async () => {
    const studio = await createStudio();
    const second = await createBranch(studio, { name: 'Kuzey' });
    await createBranch(studio, { name: 'Kapalı', isActive: false });
    const closed = (await pool.query(`SELECT id FROM branches WHERE name = 'Kapalı'`)).rows[0].id;
    const id = await createInstructor(studio, { branchIds: [second, closed], permissions: { manage_groups: true } });
    const res = await (await clientFor(id)).request('GET', '/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'instructor');
    // Kapalı şube eğitmenin şubesi sayılmaz.
    assert.deepEqual(res.body.user.branches, [{ id: second, name: 'Kuzey' }]);
    assert.equal(res.body.user.permissions.manage_groups, true);
    assert.equal(res.body.user.permissions.view_customers, false);
    assert.deepEqual(Object.keys(res.body.user.permissions).sort(), [...PERMISSION_KEYS].sort());
  });

  test('me for admin has no permissions field', async () => {
    const studio = await createStudio();
    const res = await (await clientFor(await createAdmin(studio))).request('GET', '/api/auth/me');
    assert.equal(res.body.user.role, 'admin');
    assert.equal(res.body.user.permissions, undefined);
  });
});
