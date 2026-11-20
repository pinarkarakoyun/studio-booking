import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin, createBranch, createCustomer, createGroup, createStudio, defaultBranchId, grantCredit, pool, resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Üye tarafında şubeler: derslerde şube adı ve "diğer şubelerde telafi" ayarı.
// Ayar kapalıyken kural sunucuda da uygulanır; listeden gizlemek yetmez.
useServer();
after(() => pool.end());
beforeEach(resetDb);

// Stüdyonun saatine göre bugünden `daysAhead` gün sonra, verilen saatte bir ders. Aynı gündeki dersleri
// kesin olarak aynı güne koymak için ("şimdiden N saat sonra" gece yarısını aşabilir).
async function sessionOnDay(groupId, daysAhead, time) {
  const { rows: [session] } = await pool.query(
    `
    INSERT INTO sessions (group_id, date, starts_at, capacity)
    SELECT g.id, d.date, (d.date + $3::time) AT TIME ZONE st.timezone, g.capacity
    FROM groups g JOIN studios st ON st.id = g.studio_id
    CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE st.timezone)::date + $2::int AS date) AS d
    WHERE g.id = $1
    RETURNING id
    `,
    [groupId, daysAhead, time],
  );
  return session.id;
}

async function setSameBranchOnly(studioId) {
  await pool.query('UPDATE studio_settings SET makeup_other_branches = false WHERE studio_id = $1', [studioId]);
}

// Merkez ve Kuzey şubeleri, her birinde bir grup; üye Merkez'deki grupta ve bir telafi hakkı var.
async function setup() {
  const studio = await createStudio();
  const kuzey = await createBranch(studio, { name: 'Kuzey' });
  const groupMerkez = await createGroup(studio, { branchId: await defaultBranchId(studio) });
  const groupKuzey = await createGroup(studio, { branchId: kuzey });
  const member = await createCustomer(studio, groupMerkez);
  await grantCredit(member);
  return { studio, kuzey, groupMerkez, groupKuzey, member, c: await clientFor(member) };
}

const bookable = async (c) => (await c.request('GET', '/api/sessions')).body.sessions;
const creditsOf = async (userId) =>
  (await pool.query('SELECT id, used_session_id, source_session_id FROM credits WHERE user_id = $1 ORDER BY id', [userId])).rows;

describe('member sessions and branches', () => {
  test('sessions carry the branch name', async () => {
    const { groupMerkez, groupKuzey, c } = await setup();
    const own = await sessionOnDay(groupMerkez, 2, '09:00');
    const other = await sessionOnDay(groupKuzey, 2, '10:00');

    const mine = (await c.request('GET', '/api/me/sessions')).body.sessions;
    assert.equal(mine.find((s) => s.id === own).branchName, 'Merkez');
    const list = await bookable(c);
    assert.equal(list.find((s) => s.id === other).branchName, 'Kuzey');
  });

  test("setting on: the make-up list shows every branch, own branch first within a day", async () => {
    const { groupMerkez, groupKuzey, c } = await setup();
    const kuzeyEarly = await sessionOnDay(groupKuzey, 2, '08:00');
    const merkezLate = await sessionOnDay(groupMerkez, 2, '18:00');
    const kuzeyNextDay = await sessionOnDay(groupKuzey, 3, '08:00');

    const ids = (await bookable(c)).map((s) => s.id);
    assert.deepEqual(ids, [merkezLate, kuzeyEarly, kuzeyNextDay]);
  });

  test("setting off: the make-up list shows only the member's branch", async () => {
    const { studio, groupMerkez, groupKuzey, c } = await setup();
    const own = await sessionOnDay(groupMerkez, 2, '09:00');
    await sessionOnDay(groupKuzey, 2, '10:00');
    await setSameBranchOnly(studio);

    assert.deepEqual((await bookable(c)).map((s) => s.id), [own]);
  });

  test('setting off: a member without a group sees every branch', async () => {
    const { studio, groupMerkez, groupKuzey } = await setup();
    const a = await sessionOnDay(groupMerkez, 2, '09:00');
    const b = await sessionOnDay(groupKuzey, 2, '10:00');
    await setSameBranchOnly(studio);
    const loner = await createCustomer(studio);

    assert.deepEqual((await bookable(await clientFor(loner))).map((s) => s.id).sort(), [a, b].sort());
  });

  test('setting off: booking a make-up or swapping into another branch fails with OTHER_BRANCH and changes nothing', async () => {
    const { studio, member, groupMerkez, groupKuzey, c } = await setup();
    const own = await sessionOnDay(groupMerkez, 3, '09:00');
    const other = await sessionOnDay(groupKuzey, 2, '10:00');
    await setSameBranchOnly(studio);
    const before = await creditsOf(member);

    const makeup = await c.request('PUT', `/api/sessions/${other}/makeup`);
    assert.equal(makeup.status, 409);
    assert.equal(makeup.body.error.code, 'OTHER_BRANCH');
    const swap = await c.request('POST', `/api/sessions/${own}/swap`, { toSessionId: other });
    assert.equal(swap.status, 409);
    assert.equal(swap.body.error.code, 'OTHER_BRANCH');
    assert.deepEqual(await creditsOf(member), before);
  });

  test('setting on: booking a make-up in another branch works', async () => {
    const { groupKuzey, c } = await setup();
    const other = await sessionOnDay(groupKuzey, 2, '10:00');
    assert.equal((await c.request('PUT', `/api/sessions/${other}/makeup`)).status, 200);
  });

  // Review Focus: üyenin şubesi dersin tarihindeki grubundan gelir (grup değiştiren üye).
  test('own branch follows the group on the session date', async () => {
    const { studio, member, groupMerkez, groupKuzey, c } = await setup();
    await pool.query(
      `UPDATE group_members SET left_on = (SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date + 3)
       WHERE user_id = $1 AND group_id = $2`,
      [member, groupMerkez],
    );
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, joined_on)
       VALUES ($1, $2, (SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date + 3))`,
      [groupKuzey, member],
    );
    const merkezBefore = await sessionOnDay(groupMerkez, 1, '09:00');
    const kuzeyBefore = await sessionOnDay(groupKuzey, 1, '10:00');
    const merkezAfter = await sessionOnDay(groupMerkez, 5, '09:00');
    const kuzeyAfter = await sessionOnDay(groupKuzey, 5, '10:00');
    await setSameBranchOnly(studio);

    const ids = (await bookable(c)).map((s) => s.id);
    assert.ok(ids.includes(merkezBefore) && ids.includes(kuzeyAfter), JSON.stringify(ids));
    assert.ok(!ids.includes(kuzeyBefore) && !ids.includes(merkezAfter), JSON.stringify(ids));
  });

  test('admins are not bound by the setting', async () => {
    const { studio, member, groupKuzey } = await setup();
    const other = await sessionOnDay(groupKuzey, 2, '10:00');
    await setSameBranchOnly(studio);
    const admin = await clientFor(await createAdmin(studio));

    const res = await admin.request('POST', `/api/admin/sessions/${other}/attendees`, { userId: member, confirmFull: true });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });
});
