import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { generateSessions } from '../src/services/sessionGenerator.js';
import {
  createAdmin,
  createBranch,
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  defaultBranchId,
  grantCredit,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Ek ders = gizli, tek seferlik grup (groups.kind = 'extra'). Grup listelerinde görünmez;
// ders listelerinde görünür. Ek dersi açan uç Görev 9'da; burada doğrudan SQL ile kurulur.
useServer();
after(() => pool.end());
beforeEach(resetDb);

async function createExtra(studioId, branchId) {
  const { rows: [g] } = await pool.query(
    `INSERT INTO groups (studio_id, branch_id, name, start_time, duration_minutes, capacity, kind)
     VALUES ($1, $2, 'Ek ders', '10:00', 50, 6, 'extra') RETURNING id`,
    [studioId, branchId],
  );
  return { groupId: g.id, sessionId: await createSession(g.id, 24) };
}

async function setup() {
  const studio = await createStudio();
  const branch = await defaultBranchId(studio);
  const regular = await createGroup(studio);
  const extra = await createExtra(studio, branch);
  return { studio, branch, regular, extra, admin: await clientFor(await createAdmin(studio)) };
}

const groupBody = { name: 'Akşam', weekdays: [1], startTime: '10:00', durationMinutes: 50, capacity: 6, effectiveFrom: '2030-01-07' };

describe('extra groups are hidden from group lists', () => {
  test('group list and group routes do not see extra groups', async () => {
    const s = await setup();
    const list = await s.admin.request('GET', '/api/admin/groups');
    assert.deepEqual(list.body.groups.map((g) => g.id), [s.regular]);
    const id = s.extra.groupId;
    assert.equal((await s.admin.request('GET', `/api/admin/groups/${id}`)).status, 404);
    assert.equal((await s.admin.request('PUT', `/api/admin/groups/${id}`, groupBody)).status, 404);
    assert.equal((await s.admin.request('POST', `/api/admin/groups/${id}/preview`, groupBody)).status, 404);
    assert.equal((await s.admin.request('POST', `/api/admin/groups/${id}/close`, {})).status, 404);
  });

  test('customers cannot be put into an extra group', async () => {
    const s = await setup();
    const created = await s.admin.request('POST', '/api/admin/customers', {
      fullName: 'Yeni Üye', phone: '0555 123 45 67', groupId: s.extra.groupId, startsOn: '2030-01-07',
    });
    assert.equal(created.status, 404);
    assert.equal(created.body.error.code, 'GROUP_NOT_FOUND');
    const member = await createCustomer(s.studio, s.regular);
    const moved = await s.admin.request('POST', `/api/admin/customers/${member}/change-group`, {
      groupId: s.extra.groupId, effectiveFrom: '2030-01-07',
    });
    assert.equal(moved.status, 404);
  });

  test('branch group count and branch closing ignore extra groups', async () => {
    const studio = await createStudio();
    const other = await createBranch(studio, { name: 'Kuzey' });
    await createExtra(studio, other);
    const admin = await clientFor(await createAdmin(studio));
    const list = await admin.request('GET', '/api/admin/branches');
    assert.equal(list.body.branches.find((b) => b.id === other).activeGroupCount, 0);
    assert.equal((await admin.request('POST', `/api/admin/branches/${other}/close`, {})).status, 200);
  });

  test('session generator does not add sessions to an extra group', async () => {
    const s = await setup();
    await generateSessions({ db: pool });
    const { rows: [{ count }] } = await pool.query(
      'SELECT count(*)::int AS count FROM sessions WHERE group_id = $1',
      [s.extra.groupId],
    );
    assert.equal(count, 1);
  });

  test('extra session still appears in session lists', async () => {
    const s = await setup();
    const { rows: [{ date }] } = await pool.query('SELECT date::text AS date FROM sessions WHERE id = $1', [s.extra.sessionId]);
    const day = await s.admin.request('GET', `/api/admin/day?date=${date}`);
    const found = day.body.sessions.find((x) => x.id === s.extra.sessionId);
    assert.equal(found?.kind, 'extra');
    assert.equal((await s.admin.request('GET', `/api/admin/sessions/${s.extra.sessionId}`)).status, 200);
    // Grup modelindeki üyenin telafi listesinde de var.
    const member = await createCustomer(s.studio, s.regular);
    await grantCredit(member);
    const bookable = await (await clientFor(member)).request('GET', '/api/sessions');
    assert.ok(bookable.body.sessions.some((x) => x.id === s.extra.sessionId));
  });
});
