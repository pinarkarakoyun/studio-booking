import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin,
  createBranch,
  createGroup,
  createInstructor,
  createStudio,
  defaultBranchId,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Eğitmen ve gruplar: yalnızca kendi şubelerinin grupları; grubun eğitmeni o şubenin eğitmeni olmalı.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const groupBody = (extra = {}) => ({
  name: 'Akşam', weekdays: [2, 4], startTime: '19:00', durationMinutes: 50, capacity: 6, ...extra,
});

async function setup() {
  const studio = await createStudio();
  const a = await defaultBranchId(studio);
  const b = await createBranch(studio);
  const teacherA = await createInstructor(studio, { branchIds: [a], permissions: { manage_groups: true }, fullName: 'Ayşe' });
  const teacherB = await createInstructor(studio, { branchIds: [b], fullName: 'Berk' });
  return {
    studio, a, b, teacherA, teacherB,
    groupA: await createGroup(studio, { branchId: a }),
    groupB: await createGroup(studio, { branchId: b }),
    c: await clientFor(teacherA),
    admin: await clientFor(await createAdmin(studio)),
  };
}

describe('instructor groups', () => {
  test('groups limited to branch', async () => {
    const s = await setup();
    const res = await s.c.request('GET', '/api/admin/groups');
    assert.deepEqual(res.body.groups.map((g) => g.id), [s.groupA]);
    assert.equal((await s.c.request('GET', `/api/admin/groups/${s.groupB}`)).status, 404);
    for (const path of ['preview', 'close']) {
      const res2 = await s.c.request('POST', `/api/admin/groups/${s.groupB}/${path}`, groupBody({ effectiveFrom: '2026-12-01' }));
      assert.equal(res2.status, 404, path);
    }
    assert.equal((await s.c.request('PUT', `/api/admin/groups/${s.groupB}`, groupBody({ effectiveFrom: '2026-12-01' }))).status, 404);
  });

  test('branches list shows only own branches to instructor', async () => {
    const s = await setup();
    const res = await s.c.request('GET', '/api/admin/branches');
    assert.deepEqual(res.body.branches.map((b) => b.id), [s.a]);
    assert.equal((await s.admin.request('GET', '/api/admin/branches')).body.branches.length, 2);
  });

  test('cannot create group in other branch', async () => {
    const s = await setup();
    const res = await s.c.request('POST', '/api/admin/groups', groupBody({ branchId: s.b }));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'BRANCH_NOT_FOUND');
    assert.equal((await s.c.request('POST', '/api/admin/groups', groupBody({ branchId: s.a }))).status, 201);
  });

  test('cannot move group to other branch', async () => {
    const s = await setup();
    const res = await s.c.request('PUT', `/api/admin/groups/${s.groupA}`, groupBody({ branchId: s.b, effectiveFrom: '2026-12-01' }));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'BRANCH_NOT_FOUND');
  });

  test('group instructor must belong to branch', async () => {
    const s = await setup();
    const bad = await s.admin.request('POST', '/api/admin/groups', groupBody({ branchId: s.a, instructorId: s.teacherB }));
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_INSTRUCTOR');
    const ok = await s.admin.request('POST', '/api/admin/groups', groupBody({ branchId: s.a, instructorId: s.teacherA }));
    assert.equal(ok.status, 201);
    const detail = await s.admin.request('GET', `/api/admin/groups/${ok.body.groupId}`);
    assert.deepEqual(detail.body.group.instructor, { id: s.teacherA, name: 'Ayşe' });
    const list = await s.admin.request('GET', '/api/admin/groups');
    assert.deepEqual(list.body.groups.find((g) => g.id === ok.body.groupId).instructor, { id: s.teacherA, name: 'Ayşe' });
  });

  test('update can set and clear group instructor; omitted keeps it', async () => {
    const s = await setup();
    const url = `/api/admin/groups/${s.groupA}`;
    const put = (extra) => s.admin.request('PUT', url, groupBody({ effectiveFrom: '2026-12-01', ...extra }));
    assert.equal((await put({ instructorId: s.teacherA })).status, 200);
    assert.equal((await put({})).status, 200);
    assert.equal((await s.admin.request('GET', url)).body.group.instructor.id, s.teacherA);
    assert.equal((await put({ instructorId: null })).status, 200);
    assert.equal((await s.admin.request('GET', url)).body.group.instructor, null);
  });

  test('non-instructor user cannot be group instructor', async () => {
    const s = await setup();
    const adminId = await createAdmin(s.studio);
    const res = await s.admin.request('POST', '/api/admin/groups', groupBody({ branchId: s.a, instructorId: adminId }));
    assert.equal(res.status, 400);
  });
});
