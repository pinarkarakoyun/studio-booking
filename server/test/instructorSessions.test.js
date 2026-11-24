import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin,
  createBranch,
  createCustomer,
  createGroup,
  createInstructor,
  createSession,
  createSessionToday,
  createStudio,
  defaultBranchId,
  pool,
  resetDb,
  setGroupInstructor,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Eğitmen ve dersler: şube kapsamı, "benim dersim", devralma, yoklama ve iptal.
useServer();
after(() => pool.end());
beforeEach(resetDb);

// İki şube (A, B). A'da iki eğitmen (ayşe, zeynep), B'de bir eğitmen (berk).
// Bugün: A'da ayşenin ve zeynebin birer dersi (başlamış), B'de berkin dersi. Ayrıca ayşenin 2 gün sonraki dersi.
async function setup() {
  const studio = await createStudio();
  const a = await defaultBranchId(studio);
  const b = await createBranch(studio);
  const ayse = await createInstructor(studio, { branchIds: [a], fullName: 'Ayşe' });
  const zeynep = await createInstructor(studio, { branchIds: [a], fullName: 'Zeynep' });
  const berk = await createInstructor(studio, { branchIds: [b], fullName: 'Berk' });
  const groupAyse = await createGroup(studio, { branchId: a });
  const groupZeynep = await createGroup(studio, { branchId: a });
  const groupBerk = await createGroup(studio, { branchId: b });
  await setGroupInstructor(groupAyse, ayse);
  await setGroupInstructor(groupZeynep, zeynep);
  await setGroupInstructor(groupBerk, berk);
  const member = await createCustomer(studio, groupZeynep);
  return {
    studio, a, b, ayse, zeynep, berk, groupAyse, groupZeynep, member,
    todayAyse: await createSessionToday(groupAyse, '00:00'),
    todayZeynep: await createSessionToday(groupZeynep, '00:00'),
    todayBerk: await createSessionToday(groupBerk, '00:00'),
    futureAyse: await createSession(groupAyse, 48),
    adminClient: await clientFor(await createAdmin(studio)),
  };
}

const roster = (c, id) => c.request('GET', `/api/admin/sessions/${id}`);
const takeOver = (c, id) => c.request('POST', `/api/admin/sessions/${id}/take-over`);
const markAbsent = (c, id, userId) => c.request('PUT', `/api/admin/sessions/${id}/attendance/${userId}`);

describe('instructor sessions', () => {
  test('instructor sees all sessions of own branches only', async () => {
    const s = await setup();
    const res = await (await clientFor(s.ayse)).request('GET', '/api/admin/today');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sessions.map((x) => x.id).sort(), [s.todayAyse, s.todayZeynep].sort());
    // Başka şubenin dersi detayda da yok.
    assert.equal((await roster(await clientFor(s.ayse), s.todayBerk)).status, 404);
  });

  test('isMine follows group instructor and override', async () => {
    const s = await setup();
    const c = await clientFor(s.ayse);
    const byId = (body) => Object.fromEntries(body.sessions.map((x) => [x.id, x]));
    let sessions = byId((await c.request('GET', '/api/admin/today')).body);
    assert.equal(sessions[s.todayAyse].isMine, true);
    assert.equal(sessions[s.todayZeynep].isMine, false);
    assert.deepEqual(sessions[s.todayZeynep].instructor, { id: s.zeynep, name: 'Zeynep' });
    assert.equal(sessions[s.todayAyse].kind, 'regular');

    await pool.query('UPDATE sessions SET instructor_id = $2 WHERE id = $1', [s.todayZeynep, s.ayse]);
    sessions = byId((await c.request('GET', '/api/admin/today')).body);
    assert.equal(sessions[s.todayZeynep].isMine, true);
    assert.deepEqual(sessions[s.todayZeynep].instructor, { id: s.ayse, name: 'Ayşe' });
  });

  test('admin today: every branch, never mine', async () => {
    const s = await setup();
    const res = await s.adminClient.request('GET', '/api/admin/today');
    assert.equal(res.body.sessions.length, 3);
    assert.ok(res.body.sessions.every((x) => x.isMine === false));
  });

  test('roster has no phone numbers for instructor', async () => {
    const s = await setup();
    const res = await roster(await clientFor(s.zeynep), s.todayZeynep);
    assert.equal(res.status, 200);
    assert.ok(res.body.attending.length > 0);
    assert.ok(res.body.attending.every((p) => !('phone' in p)));
  });

  test("cannot mark attendance on someone else's session", async () => {
    const s = await setup();
    const res = await markAbsent(await clientFor(s.ayse), s.todayZeynep, s.member);
    assert.equal(res.status, 403);
    assert.equal(res.body.error?.code ?? res.body.code, 'NOT_YOUR_SESSION');
  });

  test('take-over then attendance works', async () => {
    const s = await setup();
    const c = await clientFor(s.ayse);
    const before = await roster(c, s.todayZeynep);
    assert.equal(before.body.canTakeOver, true);
    assert.equal(before.body.session.branch.id, s.a);
    const res = await takeOver(c, s.todayZeynep);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.session.instructor, { id: s.ayse, name: 'Ayşe' });
    assert.equal(res.body.isMine, true);
    assert.equal(res.body.canTakeOver, false);
    assert.equal((await markAbsent(c, s.todayZeynep, s.member)).status, 200);
  });

  test('group instructor unchanged after take-over', async () => {
    const s = await setup();
    await takeOver(await clientFor(s.ayse), s.todayZeynep);
    const { rows: [g] } = await pool.query('SELECT instructor_id FROM groups WHERE id = $1', [s.groupZeynep]);
    assert.equal(Number(g.instructor_id), s.zeynep);
  });

  test("take-over only on today's scheduled session in scope", async () => {
    const s = await setup();
    const c = await clientFor(s.ayse);
    // Kendi dersi: devralacak bir şey yok.
    assert.equal((await takeOver(c, s.todayAyse)).status, 409);
    // Başka gün.
    const future = await createSession(s.groupZeynep, 48);
    assert.equal((await takeOver(c, future)).status, 409);
    // İptal edilmiş ders.
    await pool.query(`UPDATE sessions SET status = 'cancelled' WHERE id = $1`, [s.todayZeynep]);
    assert.equal((await takeOver(c, s.todayZeynep)).status, 409);
    // Başka şube.
    assert.equal((await takeOver(c, s.todayBerk)).status, 404);
  });

  test('take-over needs attendance permission; admin cannot take over', async () => {
    const s = await setup();
    const noAttendance = await createInstructor(s.studio, { branchIds: [s.a], permissions: { attendance: false } });
    const c = await clientFor(noAttendance);
    assert.equal((await roster(c, s.todayZeynep)).body.canTakeOver, false);
    assert.equal((await takeOver(c, s.todayZeynep)).status, 403);
    assert.equal((await takeOver(s.adminClient, s.todayZeynep)).status, 409);
  });

  test('cancel only own session', async () => {
    const s = await setup();
    const otherFuture = await createSession(s.groupZeynep, 48);
    const c = await clientFor(s.ayse);
    for (const path of ['cancel/preview', 'cancel']) {
      const res = await c.request('POST', `/api/admin/sessions/${otherFuture}/${path}`, {});
      assert.equal(res.status, 403, path);
    }
    assert.equal((await c.request('POST', `/api/admin/sessions/${s.futureAyse}/cancel/preview`, {})).status, 200);
    assert.equal((await c.request('POST', `/api/admin/sessions/${s.futureAyse}/cancel`, { reason: 'Hastayım' })).status, 200);
  });

  test('admin can set and clear session instructor', async () => {
    const s = await setup();
    const put = (body) => s.adminClient.request('PUT', `/api/admin/sessions/${s.todayZeynep}/instructor`, body);
    let res = await put({ instructorId: s.ayse });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.session.instructor, { id: s.ayse, name: 'Ayşe' });
    // Şubeye atanmamış eğitmen olmaz.
    assert.equal((await put({ instructorId: s.berk })).status, 400);
    // Eğitmen olmayan kullanıcı olmaz.
    assert.equal((await put({ instructorId: s.member })).status, 400);
    res = await put({ instructorId: null });
    assert.deepEqual(res.body.session.instructor, { id: s.zeynep, name: 'Zeynep' });
    // Eğitmen bu ucu kullanamaz.
    assert.equal((await (await clientFor(s.ayse)).request('PUT', `/api/admin/sessions/${s.todayZeynep}/instructor`, { instructorId: s.ayse })).status, 403);
  });

  test('manage attendees is limited to branch members', async () => {
    const s = await setup();
    const c = await clientFor(await createInstructor(s.studio, { branchIds: [s.a], permissions: { manage_attendees: true } }));
    const otherBranchMember = await createCustomer(s.studio, await createGroup(s.studio, { branchId: s.b }));
    const res = await c.request('POST', `/api/admin/sessions/${s.futureAyse}/attendees`, { userId: otherBranchMember });
    assert.equal(res.status, 404);
    const own = await createCustomer(s.studio, s.groupZeynep);
    assert.equal((await c.request('POST', `/api/admin/sessions/${s.futureAyse}/attendees`, { userId: own })).status, 201);
  });
});
