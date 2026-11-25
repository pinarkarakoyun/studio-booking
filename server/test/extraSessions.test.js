import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin,
  createBranch,
  createCustomer,
  createGroup,
  createInstructor,
  createStudio,
  defaultBranchId,
  grantCredit,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Ek ders açma: tek seferlik, gizli bir grup + tek ders. Üye kaydı Görev 10'da (extraBooking.test.js).
useServer();
after(() => pool.end());
beforeEach(resetDb);

// Stüdyonun saatine göre bugünden n gün sonrası.
const day = async (n) =>
  (await pool.query(`SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`, [n])).rows[0].d;

async function setup({ membershipModel = 'group' } = {}) {
  const studio = await createStudio({ membershipModel });
  const a = await defaultBranchId(studio);
  const b = await createBranch(studio, { name: 'Kuzey' });
  const teacher = await createInstructor(studio, { branchIds: [a], fullName: 'Ayşe' });
  const other = await createInstructor(studio, { branchIds: [a], fullName: 'Zeynep' });
  return {
    studio, a, b, teacher, other,
    t: await clientFor(teacher),
    admin: await clientFor(await createAdmin(studio)),
  };
}

const create = (c, body) => c.request('POST', '/api/admin/extra-sessions', body);
const body = async (extra = {}) => ({
  date: await day(3), startTime: '10:00', durationMinutes: 50, capacity: 6, ...extra,
});

describe('extra sessions', () => {
  test('instructor creates extra session assigned to self', async () => {
    const s = await setup();
    const res = await create(s.t, await body({ branchId: s.a }));
    assert.equal(res.status, 201);
    const { session, isMine } = res.body;
    assert.equal(session.kind, 'extra');
    assert.equal(session.groupName, 'Ek ders');
    assert.deepEqual(session.instructor, { id: s.teacher, name: 'Ayşe' });
    assert.equal(isMine, true);
    assert.equal(session.capacity, 6);
    assert.equal(session.durationMinutes, 50);
    const { rows: [g] } = await pool.query(
      'SELECT g.kind, g.branch_id, g.instructor_id FROM sessions s JOIN groups g ON g.id = s.group_id WHERE s.id = $1',
      [session.id],
    );
    assert.deepEqual([g.kind, Number(g.branch_id), Number(g.instructor_id)], ['extra', s.a, s.teacher]);
  });

  test('instructor cannot assign someone else, admin can choose', async () => {
    const s = await setup();
    const bad = await create(s.t, await body({ branchId: s.a, instructorId: s.other }));
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_INSTRUCTOR');
    const ok = await create(s.admin, await body({ branchId: s.a, instructorId: s.other, title: '  Cumartesi telafi  ' }));
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.body.session.instructor, { id: s.other, name: 'Zeynep' });
    assert.equal(ok.body.session.groupName, 'Cumartesi telafi');
    // Yönetici eğitmen seçmeyebilir.
    assert.equal((await create(s.admin, await body({ branchId: s.a }))).body.session.instructor, null);
    // Şubeye atanmamış eğitmen olmaz.
    const berk = await createInstructor(s.studio, { branchIds: [s.b] });
    assert.equal((await create(s.admin, await body({ branchId: s.a, instructorId: berk }))).status, 400);
  });

  test('past time rejected', async () => {
    const s = await setup();
    const res = await create(s.admin, await body({ branchId: s.a, date: await day(-1) }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'IN_THE_PAST');
  });

  test('invalid shape rejected with the group form codes', async () => {
    const s = await setup();
    for (const [extra, code] of [
      [{ startTime: '25:00' }, 'INVALID_TIME'],
      [{ durationMinutes: 5 }, 'INVALID_DURATION'],
      [{ capacity: 0 }, 'INVALID_CAPACITY'],
      [{ date: '2026-13-40' }, 'INVALID_DATE'],
    ]) {
      const res = await create(s.admin, await body({ branchId: s.a, ...extra }));
      assert.equal(res.status, 400, code);
      assert.equal(res.body.error.code, code);
    }
  });

  test('other branch rejected for instructor; branch required in multi-branch studio', async () => {
    const s = await setup();
    const res = await create(s.t, await body({ branchId: s.b }));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'BRANCH_NOT_FOUND');
    assert.equal((await create(s.admin, await body())).body.error.code, 'BRANCH_REQUIRED');
  });

  test('permission needed', async () => {
    const s = await setup();
    const noPerm = await clientFor(await createInstructor(s.studio, { branchIds: [s.a], permissions: { create_extra_sessions: false } }));
    assert.equal((await create(noPerm, await body({ branchId: s.a }))).status, 403);
  });

  test('extra session appears in day list with kind extra and is hidden from groups', async () => {
    const s = await setup();
    const date = await day(3);
    const res = await create(s.t, await body({ branchId: s.a, date }));
    const list = await s.admin.request('GET', `/api/admin/day?date=${date}`);
    assert.equal(list.body.sessions.find((x) => x.id === res.body.session.id)?.kind, 'extra');
    assert.equal((await s.admin.request('GET', '/api/admin/groups')).body.groups.length, 0);
  });

  test('cancelling extra session returns makeup credits', async () => {
    const s = await setup();
    const res = await create(s.t, await body({ branchId: s.a }));
    const id = res.body.session.id;
    const member = await createCustomer(s.studio, await createGroup(s.studio, { branchId: s.a }));
    await grantCredit(member);
    assert.equal((await (await clientFor(member)).request('PUT', `/api/sessions/${id}/makeup`)).status, 200);
    const cancel = await s.t.request('POST', `/api/admin/sessions/${id}/cancel`, { reason: 'Hastayım' });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.refundedMakeups, 1);
    const { rows: [c] } = await pool.query('SELECT used_session_id FROM credits WHERE user_id = $1', [member]);
    assert.equal(c.used_session_id, null);
  });

  test('cancelling extra session in package model removes bookings', async () => {
    const s = await setup({ membershipModel: 'package' });
    const res = await create(s.admin, await body({ branchId: s.a }));
    const id = res.body.session.id;
    const member = await createCustomer(s.studio, await createGroup(s.studio, { branchId: s.a }));
    // Paket modelinde ek ders kaydı: kaynağı boş, kullanılmış bir kayıt (Görev 10'daki kayıt yolu bunu yazar).
    await pool.query(
      `INSERT INTO credits (user_id, used_session_id, used_at, expires_at)
       SELECT $1, s.id, now(), s.starts_at + interval '1 day' FROM sessions s WHERE s.id = $2`,
      [member, id],
    );
    const cancel = await s.admin.request('POST', `/api/admin/sessions/${id}/cancel`, {});
    assert.equal(cancel.status, 200);
    const { rows } = await pool.query('SELECT 1 FROM credits WHERE user_id = $1', [member]);
    assert.equal(rows.length, 0);
  });
});
