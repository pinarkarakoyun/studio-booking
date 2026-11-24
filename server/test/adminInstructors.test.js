import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin,
  createBranch,
  createCustomer,
  createGroup,
  createInstructor,
  createSessionToday,
  createStudio,
  defaultBranchId,
  pool,
  resetDb,
} from './helpers.js';
import { client, clientFor, useServer } from './http.js';

// Yönetici eğitmen ekler, şubelerini ve yetkilerini seçer, şifresini sıfırlar, "ayrıldı" işaretler.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const DEFAULTS = {
  attendance: true, cancel_own_sessions: true, create_extra_sessions: true, manage_attendees: false,
  view_customers: false, edit_customers: false, customer_status: false, memberships: false, manage_groups: false,
};

async function setup() {
  const studio = await createStudio();
  const a = await defaultBranchId(studio);
  const b = await createBranch(studio, { name: 'Kuzey' });
  return { studio, a, b, admin: await clientFor(await createAdmin(studio)) };
}

const create = (c, body) => c.request('POST', '/api/admin/instructors', body);
const body = (branchIds, extra = {}) => ({ fullName: 'Ayşe Hoca', phone: '0532 111 22 33', branchIds, ...extra });

describe('admin instructors', () => {
  test('create instructor with branches and default permissions', async () => {
    const s = await setup();
    const res = await create(s.admin, body([s.b]));
    assert.equal(res.status, 201);
    assert.ok(res.body.temporaryPassword);
    const { instructor } = res.body;
    assert.equal(instructor.fullName, 'Ayşe Hoca');
    assert.equal(instructor.status, 'active');
    assert.deepEqual(instructor.branches, [{ id: s.b, name: 'Kuzey' }]);
    const detail = await s.admin.request('GET', `/api/admin/instructors/${instructor.id}`);
    assert.deepEqual(detail.body.instructor.permissions, DEFAULTS);
    // Geçici şifreyle giriş yapılır; ilk girişte şifre değişimi istenir.
    const login = await client().request('POST', '/api/auth/login', { phone: '0532 111 22 33', password: res.body.temporaryPassword });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'instructor');
    assert.equal(login.body.user.mustChangePassword, true);
  });

  test('branch required', async () => {
    const s = await setup();
    for (const branchIds of [[], undefined]) {
      const res = await create(s.admin, body(branchIds));
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'BRANCH_REQUIRED');
    }
  });

  test('branch of other studio or closed branch rejected', async () => {
    const s = await setup();
    const other = await createStudio();
    const closed = await createBranch(s.studio, { name: 'Kapalı', isActive: false });
    const foreign = await create(s.admin, body([await defaultBranchId(other)]));
    assert.equal(foreign.status, 404);
    assert.equal(foreign.body.error.code, 'BRANCH_NOT_FOUND');
    // Grup formundaki gibi: kapalı şube seçilemez.
    const closedRes = await create(s.admin, body([closed]));
    assert.equal(closedRes.status, 400);
    assert.equal(closedRes.body.error.code, 'BRANCH_CLOSED');
  });

  test('phone already used in the studio', async () => {
    const s = await setup();
    assert.equal((await create(s.admin, body([s.a]))).status, 201);
    const again = await create(s.admin, body([s.a], { fullName: 'Başka' }));
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'PHONE_TAKEN');
  });

  test('list shows only instructors', async () => {
    const s = await setup();
    await createCustomer(s.studio);
    const id = await createInstructor(s.studio, { branchIds: [s.a, s.b], fullName: 'Zeynep' });
    const res = await s.admin.request('GET', '/api/admin/instructors');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.instructors.map((i) => i.id), [id]);
    assert.equal(res.body.instructors[0].branches.length, 2);
  });

  test('update permissions applies on next request', async () => {
    const s = await setup();
    const id = await createInstructor(s.studio, { branchIds: [s.a] });
    const teacher = await clientFor(id);
    assert.equal((await teacher.request('GET', '/api/admin/customers')).status, 403);
    const res = await s.admin.request('PUT', `/api/admin/instructors/${id}`, { permissions: { view_customers: true } });
    assert.equal(res.status, 200);
    assert.equal(res.body.instructor.permissions.view_customers, true);
    // Gönderilmeyen yetkiler aynı kalır.
    assert.equal(res.body.instructor.permissions.attendance, true);
    assert.equal((await teacher.request('GET', '/api/admin/customers')).status, 200);
  });

  test('turning off view_customers turns off dependants', async () => {
    const s = await setup();
    const id = await createInstructor(s.studio, {
      branchIds: [s.a], permissions: { view_customers: true, edit_customers: true, memberships: true },
    });
    const res = await s.admin.request('PUT', `/api/admin/instructors/${id}`, { permissions: { view_customers: false } });
    assert.equal(res.status, 200);
    const p = res.body.instructor.permissions;
    assert.deepEqual([p.view_customers, p.edit_customers, p.customer_status, p.memberships], [false, false, false, false]);
  });

  test('dependent permission without view_customers is turned off too', async () => {
    const s = await setup();
    const id = await createInstructor(s.studio, { branchIds: [s.a] });
    const res = await s.admin.request('PUT', `/api/admin/instructors/${id}`, { permissions: { edit_customers: true } });
    assert.equal(res.status, 200);
    assert.equal(res.body.instructor.permissions.edit_customers, false);
  });

  test('unknown or non-boolean permission rejected', async () => {
    const s = await setup();
    const id = await createInstructor(s.studio, { branchIds: [s.a] });
    for (const permissions of [{ payments: true }, { attendance: 'yes' }, ['attendance']]) {
      const res = await s.admin.request('PUT', `/api/admin/instructors/${id}`, { permissions });
      assert.equal(res.status, 400, JSON.stringify(permissions));
      assert.equal(res.body.error.code, 'INVALID_PERMISSION');
    }
  });

  test('removing a branch hides it at once', async () => {
    const s = await setup();
    const id = await createInstructor(s.studio, { branchIds: [s.a, s.b] });
    const session = await createSessionToday(await createGroup(s.studio, { branchId: s.b }), '10:00');
    const teacher = await clientFor(id);
    assert.equal((await teacher.request('GET', `/api/admin/sessions/${session}`)).status, 200);
    const res = await s.admin.request('PUT', `/api/admin/instructors/${id}`, { branchIds: [s.a] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.instructor.branches.map((b) => b.id), [s.a]);
    assert.equal((await teacher.request('GET', `/api/admin/sessions/${session}`)).status, 404);
    // Boş şube listesi kabul edilmez.
    assert.equal((await s.admin.request('PUT', `/api/admin/instructors/${id}`, { branchIds: [] })).status, 400);
  });

  test('leaving revokes sessions', async () => {
    const s = await setup();
    const id = await createInstructor(s.studio, { branchIds: [s.a] });
    const teacher = await clientFor(id);
    assert.equal((await teacher.request('GET', '/api/admin/today')).status, 200);
    assert.equal((await s.admin.request('POST', `/api/admin/instructors/${id}/leave`, {})).status, 200);
    assert.equal((await teacher.request('GET', '/api/admin/today')).status, 401);
    const list = await s.admin.request('GET', '/api/admin/instructors');
    assert.equal(list.body.instructors[0].status, 'left');
  });

  test('reset password gives a temporary password and closes sessions', async () => {
    const s = await setup();
    const id = await createInstructor(s.studio, { branchIds: [s.a] });
    const teacher = await clientFor(id);
    const res = await s.admin.request('POST', `/api/admin/instructors/${id}/reset-password`, {});
    assert.equal(res.status, 200);
    assert.ok(res.body.temporaryPassword);
    assert.equal((await teacher.request('GET', '/api/admin/today')).status, 401);
  });

  test('customer or admin id is not an instructor', async () => {
    const s = await setup();
    for (const id of [await createCustomer(s.studio), await createAdmin(s.studio)]) {
      const res = await s.admin.request('GET', `/api/admin/instructors/${id}`);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'INSTRUCTOR_NOT_FOUND');
    }
  });

  test('instructor cannot call instructor routes', async () => {
    const s = await setup();
    const teacher = await clientFor(await createInstructor(s.studio, { branchIds: [s.a] }));
    assert.equal((await teacher.request('GET', '/api/admin/instructors')).status, 403);
    assert.equal((await create(teacher, body([s.a]))).status, 403);
  });
});
