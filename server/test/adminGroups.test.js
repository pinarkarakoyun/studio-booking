import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { generateSessions } from '../src/services/sessionGenerator.js';
import {
  createAdmin,
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  insertMakeup,
  occupancy,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

// Stüdyonun saatine göre bugün + N gün ("2026-10-30")
async function daysFromToday(n) {
  const { rows: [row] } = await pool.query(
    `SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`,
    [n],
  );
  return row.d;
}

// Bir grubun dersleri: tarih -> yerel saat
async function sessionTimes(groupId) {
  const { rows } = await pool.query(
    `SELECT date::text AS date, to_char(starts_at AT TIME ZONE 'Europe/Istanbul', 'HH24:MI') AS time,
            EXTRACT(ISODOW FROM date)::int AS weekday
     FROM sessions WHERE group_id = $1 ORDER BY date`,
    [groupId],
  );
  return rows;
}

async function setup() {
  const studio = await createStudio();
  const c = await clientFor(await createAdmin(studio));
  return { studio, c };
}

const groupBody = (overrides = {}) => ({
  name: 'Her gün sabah', weekdays: ALL_DAYS, startTime: '09:00', durationMinutes: 50, capacity: 8, ...overrides,
});

async function createViaApi(c, overrides) {
  const res = await c.request('POST', '/api/admin/groups', groupBody(overrides));
  assert.equal(res.status, 201);
  return res.body.groupId;
}

describe('create and read', () => {
  test('creating a group generates its upcoming sessions right away', async () => {
    const { c } = await setup();
    const id = await createViaApi(c, { weekdays: [1, 3, 5] });

    const times = await sessionTimes(id);
    assert.ok(times.length >= 15);
    assert.ok(times.every((s) => [1, 3, 5].includes(s.weekday) && s.time === '09:00'));

    const { body } = await c.request('GET', `/api/admin/groups/${id}`);
    assert.deepEqual(body.group.weekdays, [1, 3, 5]);
    assert.equal(body.group.startTime, '09:00');
  });

  test('rejects invalid input', async () => {
    const { c } = await setup();
    const noDays = await c.request('POST', '/api/admin/groups', groupBody({ weekdays: [] }));
    const badTime = await c.request('POST', '/api/admin/groups', groupBody({ startTime: '25:00' }));
    assert.equal(noDays.body.error.code, 'INVALID_DAYS');
    assert.equal(badTime.body.error.code, 'INVALID_TIME');
  });

  test("another studio's group is not found", async () => {
    const { c } = await setup();
    const foreign = await createGroup(await createStudio());
    assert.equal((await c.request('GET', `/api/admin/groups/${foreign}`)).status, 404);
  });
});

describe('schedule change from a chosen date', () => {
  test('sessions before the date keep the old time; after it they move and their make-ups are refunded', async () => {
    const { studio, c } = await setup();
    const id = await createViaApi(c);
    const effectiveFrom = await daysFromToday(7);
    const { rows: [later] } = await pool.query(
      'SELECT id FROM sessions WHERE group_id = $1 AND date = $2', [id, await daysFromToday(10)],
    );
    const guest = await createCustomer(studio);
    await insertMakeup(guest, later.id);

    const res = await c.request('PUT', `/api/admin/groups/${id}`, groupBody({ startTime: '10:00', effectiveFrom }));

    assert.equal(res.body.refundedMakeups, 1);
    const times = await sessionTimes(id);
    assert.ok(times.filter((s) => s.date < effectiveFrom).every((s) => s.time === '09:00'));
    assert.ok(times.filter((s) => s.date >= effectiveFrom).every((s) => s.time === '10:00'));
    assert.equal((await occupancy(later.id)).makeup_count, 0);
  });

  test('a removed weekday disappears only from the chosen date', async () => {
    const { c } = await setup();
    const id = await createViaApi(c);
    const effectiveFrom = await daysFromToday(7);
    const { rows: [{ weekday }] } = await pool.query(
      `SELECT EXTRACT(ISODOW FROM $1::date)::int AS weekday`, [await daysFromToday(9)],
    );

    await c.request('PUT', `/api/admin/groups/${id}`, groupBody({
      weekdays: ALL_DAYS.filter((d) => d !== weekday), effectiveFrom,
    }));

    const times = await sessionTimes(id);
    assert.ok(times.some((s) => s.date < effectiveFrom && s.weekday === weekday)); // önceki hafta duruyor
    assert.ok(!times.some((s) => s.date >= effectiveFrom && s.weekday === weekday));
  });

  test('a new weekday starts only from the chosen date, even when the generator runs again', async () => {
    const { c } = await setup();
    const effectiveFrom = await daysFromToday(8);
    const { rows: [{ weekday }] } = await pool.query(
      `SELECT EXTRACT(ISODOW FROM $1::date)::int AS weekday`, [effectiveFrom],
    );
    const otherDay = weekday === 1 ? 2 : 1;
    const id = await createViaApi(c, { weekdays: [otherDay] });

    await c.request('PUT', `/api/admin/groups/${id}`, groupBody({ weekdays: [otherDay, weekday], effectiveFrom }));
    await generateSessions(); // günlük iş tekrar çalışsa bile

    const added = (await sessionTimes(id)).filter((s) => s.weekday === weekday);
    assert.ok(added.length > 0);
    assert.ok(added.every((s) => s.date >= effectiveFrom));
  });

  test('a schedule change needs a date that is not in the past', async () => {
    const { c } = await setup();
    const id = await createViaApi(c);
    const noDate = await c.request('PUT', `/api/admin/groups/${id}`, groupBody({ startTime: '10:00' }));
    const past = await c.request('PUT', `/api/admin/groups/${id}`, groupBody({
      startTime: '10:00', effectiveFrom: await daysFromToday(-1),
    }));
    assert.equal(noDate.body.error.code, 'INVALID_DATE');
    assert.equal(past.body.error.code, 'INVALID_DATE');
  });

  test('preview reports what would happen without changing anything', async () => {
    const { c } = await setup();
    const id = await createViaApi(c);
    const before = await sessionTimes(id);

    const res = await c.request('POST', `/api/admin/groups/${id}/preview`, groupBody({
      startTime: '10:00', effectiveFrom: await daysFromToday(7),
    }));

    assert.equal(res.body.scheduleChanged, true);
    assert.ok(res.body.movedSessions > 0);
    assert.deepEqual(await sessionTimes(id), before);
  });
});

describe('capacity', () => {
  test('a new capacity applies to all future sessions; registered members are not removed', async () => {
    const { studio, c } = await setup();
    const id = await createViaApi(c, { capacity: 3 });
    for (let i = 0; i < 3; i += 1) await createCustomer(studio, id);

    await c.request('PUT', `/api/admin/groups/${id}`, groupBody({ capacity: 2 }));

    const { rows } = await pool.query(
      `SELECT DISTINCT o.capacity, o.regular_count FROM sessions s JOIN session_occupancy o ON o.session_id = s.id
       WHERE s.group_id = $1 AND s.starts_at > now()`,
      [id],
    );
    assert.deepEqual(rows, [{ capacity: 2, regular_count: 3 }]);
  });
});

describe('close', () => {
  test('a group with members cannot be closed', async () => {
    const { studio, c } = await setup();
    const id = await createViaApi(c);
    await createCustomer(studio, id);

    const res = await c.request('POST', `/api/admin/groups/${id}/close`);
    assert.equal(res.body.error.code, 'GROUP_HAS_MEMBERS');
  });

  test('an empty group closes: its future sessions go away and make-ups are refunded', async () => {
    const { studio, c } = await setup();
    const id = await createViaApi(c);
    const { rows: [future] } = await pool.query(
      'SELECT id FROM sessions WHERE group_id = $1 AND starts_at > now() ORDER BY starts_at LIMIT 1', [id],
    );
    const guest = await createCustomer(studio);
    await insertMakeup(guest, future.id);

    const res = await c.request('POST', `/api/admin/groups/${id}/close`);

    assert.equal(res.body.refundedMakeups, 1);
    const { rows: [{ left }] } = await pool.query(
      `SELECT count(*)::int AS left FROM sessions WHERE group_id = $1 AND starts_at > now()`, [id],
    );
    assert.equal(left, 0);
    const { rows: [credit] } = await pool.query('SELECT used_session_id FROM credits WHERE user_id = $1', [guest]);
    assert.equal(credit.used_session_id, null);
    const { body } = await c.request('GET', `/api/admin/groups/${id}`);
    assert.equal(body.group.isActive, false);
  });
});

describe("changing a customer's group", () => {
  test('moves the customer from the chosen date and refunds make-ups into the new group', async () => {
    const { studio, c } = await setup();
    const oldGroup = await createGroup(studio);
    const newGroup = await createGroup(studio);
    const customer = await createCustomer(studio, oldGroup);
    const oldSoon = await createSession(oldGroup, 24);
    const oldLater = await createSession(oldGroup, 24 * 10);
    const newLater = await createSession(newGroup, 24 * 10 + 2);
    await insertMakeup(customer, newLater);

    const res = await c.request('POST', `/api/admin/customers/${customer}/change-group`, {
      groupId: newGroup, effectiveFrom: await daysFromToday(5),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.refundedMakeups, 1);
    assert.equal((await occupancy(oldSoon)).regular_count, 1); // geçişten önce eski grubunda
    assert.equal((await occupancy(oldLater)).regular_count, 0);
    assert.deepEqual(
      [(await occupancy(newLater)).regular_count, (await occupancy(newLater)).makeup_count],
      [1, 0], // telafi değil, artık düzenli üye; iki kez sayılmıyor
    );
  });

  test('until the move date the customer still shows in the old group, with the upcoming group noted', async () => {
    const { studio, c } = await setup();
    const oldGroup = await createGroup(studio);
    const newGroup = await createGroup(studio);
    const customer = await createCustomer(studio, oldGroup);
    const moveOn = await daysFromToday(14);

    await c.request('POST', `/api/admin/customers/${customer}/change-group`, { groupId: newGroup, effectiveFrom: moveOn });

    const { body } = await c.request('GET', `/api/admin/customers/${customer}`);
    assert.equal(body.customer.group.id, oldGroup);
    assert.deepEqual(body.customer.upcomingGroup, { id: newGroup, name: 'G', startsOn: moveOn });

    const oldDetail = (await c.request('GET', `/api/admin/groups/${oldGroup}`)).body.group;
    const newDetail = (await c.request('GET', `/api/admin/groups/${newGroup}`)).body.group;
    assert.equal(oldDetail.members[0].leavesOn, moveOn);
    assert.equal(newDetail.members[0].joinsOn, moveOn);
  });

  test('a customer with a pending move can still be marked as left', async () => {
    const { studio, c } = await setup();
    const oldGroup = await createGroup(studio);
    const newGroup = await createGroup(studio);
    const customer = await createCustomer(studio, oldGroup);
    await c.request('POST', `/api/admin/customers/${customer}/change-group`, {
      groupId: newGroup, effectiveFrom: await daysFromToday(14),
    });

    assert.equal((await c.request('POST', `/api/admin/customers/${customer}/leave`)).status, 204);

    const { body } = await c.request('GET', `/api/admin/customers/${customer}`);
    assert.equal(body.customer.group, null);
    assert.equal(body.customer.upcomingGroup, null);
  });

  test('warns when the new group is full and moves after confirmation', async () => {
    const { studio, c } = await setup();
    const oldGroup = await createGroup(studio);
    const fullGroup = await createGroup(studio, { capacity: 1 });
    await createCustomer(studio, fullGroup);
    const customer = await createCustomer(studio, oldGroup);
    const body = { groupId: fullGroup, effectiveFrom: await daysFromToday(0) };

    const warned = await c.request('POST', `/api/admin/customers/${customer}/change-group`, body);
    const moved = await c.request('POST', `/api/admin/customers/${customer}/change-group`, { ...body, confirmFull: true });

    assert.equal(warned.body.error.code, 'GROUP_FULL');
    assert.equal(moved.status, 200);
  });

  test('rejects moving into the same group', async () => {
    const { studio, c } = await setup();
    const group = await createGroup(studio);
    const customer = await createCustomer(studio, group);
    const res = await c.request('POST', `/api/admin/customers/${customer}/change-group`, {
      groupId: group, effectiveFrom: await daysFromToday(0),
    });
    assert.equal(res.body.error.code, 'SAME_GROUP');
  });
});
