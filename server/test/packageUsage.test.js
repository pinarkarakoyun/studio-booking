import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { chargeableSessions, packageUsage } from '../src/services/packageUsage.js';
import {
  createAdmin, createCustomer, createGroup, createSession, createStudio, insertMakeup, pool, resetDb,
} from './helpers.js';

// Seans paketi: hangi ders paketten düşer ve düşen dersler paketlere nasıl dağılır?
// Kurallar: docs/superpowers/specs/2026-11-20-session-packages-design.md "Seansın düşmesi".
after(() => pool.end());
beforeEach(resetDb);

const HOUR = 1;
const DAY = 24;

// Stüdyonun bugününe göre n gün sonrası ("YYYY-MM-DD").
async function day(n) {
  const { rows: [row] } = await pool.query(
    `SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`,
    [n],
  );
  return row.d;
}

// Doğrudan veritabanına satılmış paket (satış kuralları packageSales.test.js'te sınanıyor).
async function insertPackage(userId, { startsOn, count = 10, validityDays = 60 }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, session_count, package_name)
     VALUES ($1, $2::date, $2::date + $3::int - 1, 100000, $4, 'Paket') RETURNING id`,
    [userId, startsOn, validityDays, count],
  );
  return row.id;
}

// Üyenin paket iptali; `charged`: iptal anında verilen "seans düşer mi" kararı (booking.js verir, orada sınanıyor).
async function cancelAt(userId, sessionId, hoursBefore, charged) {
  await pool.query(
    `INSERT INTO credits (user_id, source_session_id, created_at, expires_at, forfeited_at, charges_session)
     SELECT $1, s.id, s.starts_at - $3::float8 * interval '1 hour', s.starts_at + interval '30 days',
            s.starts_at - $3::float8 * interval '1 hour', $4
     FROM sessions s WHERE s.id = $2`,
    [userId, sessionId, hoursBefore, charged],
  );
}

async function setup(settings = {}) {
  const studio = await createStudio({ membershipModel: 'package', cancellationDeadlineHours: 2, ...settings });
  const group = await createGroup(studio, { capacity: 8 });
  const customer = await createCustomer(studio, group);
  return { studio, group, customer };
}

const ids = async (userId) => (await chargeableSessions(userId, pool)).map((s) => s.sessionId);

describe('which sessions count', () => {
  test('attended or unmarked counts', async () => {
    const { group, customer } = await setup();
    const session = await createSession(group, -3 * HOUR);
    assert.deepEqual(await ids(customer), [session]);
  });

  // Haber vermeden gelmemek de düşer: geç iptalden avantajlı olmamalı.
  test('no-show counts', async () => {
    const { studio, group, customer } = await setup();
    const session = await createSession(group, -3 * HOUR);
    await pool.query('INSERT INTO attendance (session_id, user_id, marked_by) VALUES ($1, $2, $3)', [session, customer, await createAdmin(studio)]);
    assert.deepEqual(await ids(customer), [session]);
  });

  test('early cancel does not count', async () => {
    const { group, customer } = await setup();
    const session = await createSession(group, -3 * HOUR);
    await cancelAt(customer, session, 5, false); // son iptal saati: 2 saat önce
    assert.deepEqual(await ids(customer), []);
  });

  // Ayar iptal anında uygulanır (packageBooking.test.js); burada saklanan karar okunur.
  test('late cancel follows the decision stored at cancel time', async () => {
    const { group, customer } = await setup();
    const charged = await createSession(group, -3 * HOUR);
    const notCharged = await createSession(group, -2 * DAY);
    await cancelAt(customer, charged, 1, true);
    await cancelAt(customer, notCharged, 1, false);
    assert.deepEqual(await ids(customer), [charged]);
  });

  test('studio-cancelled does not count', async () => {
    const { group, customer } = await setup();
    const session = await createSession(group, -3 * HOUR);
    await pool.query(`UPDATE sessions SET status = 'cancelled' WHERE id = $1`, [session]);
    assert.deepEqual(await ids(customer), []);
  });

  test('frozen does not count', async () => {
    const { group, customer } = await setup();
    const session = await createSession(group, -3 * DAY);
    await pool.query('INSERT INTO freezes (user_id, starts_on, ends_on) VALUES ($1, $2, $3)', [customer, await day(-5), await day(-1)]);
    assert.deepEqual(await ids(customer), []);
  });

  // Ders 60 dakika: yarım saat önce başlayan ders henüz bitmedi.
  test('a session in progress is not counted yet', async () => {
    const { group, customer } = await setup();
    await createSession(group, -0.5 * HOUR);
    await createSession(group, 5 * HOUR);
    assert.deepEqual(await ids(customer), []);
  });

  test('an admin-added session counts', async () => {
    const { studio, group, customer } = await setup();
    const otherGroup = await createGroup(studio);
    const session = await createSession(otherGroup, -3 * HOUR);
    await insertMakeup(customer, session);
    const own = await createSession(group, -2 * DAY);
    assert.deepEqual(await ids(customer), [own, session]);
  });

  test("another member's sessions and groups do not count", async () => {
    const { studio, customer } = await setup();
    const otherGroup = await createGroup(studio);
    await createSession(otherGroup, -3 * HOUR);
    assert.deepEqual(await ids(customer), []);
  });
});

describe('how sessions fill packages', () => {
  test('a session on the package start day counts for that package', async () => {
    const { group, customer } = await setup();
    const session = await createSession(group, -3 * HOUR);
    const { rows: [{ date }] } = await pool.query('SELECT date::text FROM sessions WHERE id = $1', [session]);
    const membershipId = await insertPackage(customer, { startsOn: date, count: 8 });

    assert.deepEqual(await packageUsage(customer, pool), {
      packages: [{ membershipId, used: 1, remaining: 7, burned: 0 }],
      unpackaged: 0,
    });
  });

  test('two packages fill in order', async () => {
    const { group, customer } = await setup();
    const first = await insertPackage(customer, { startsOn: await day(-20), count: 2, validityDays: 15 });
    const second = await insertPackage(customer, { startsOn: await day(-5), count: 5 });
    for (const daysAgo of [15, 10, 3, 1]) await createSession(group, -daysAgo * DAY);

    assert.deepEqual(await packageUsage(customer, pool), {
      packages: [
        { membershipId: first, used: 2, remaining: 0, burned: 0 },
        { membershipId: second, used: 2, remaining: 3, burned: 0 },
      ],
      unpackaged: 0,
    });
  });

  test('remaining sessions burn after the end date', async () => {
    const { group, customer } = await setup();
    const membershipId = await insertPackage(customer, { startsOn: await day(-20), count: 5, validityDays: 10 });
    await createSession(group, -15 * DAY);
    await createSession(group, -3 * DAY); // paketin son günü geçti: paketsiz

    assert.deepEqual(await packageUsage(customer, pool), {
      packages: [{ membershipId, used: 1, remaining: 0, burned: 4 }],
      unpackaged: 1,
    });
  });

  test('sessions without a package go to the next package first', async () => {
    const { group, customer } = await setup();
    await createSession(group, -3 * DAY);
    await createSession(group, -1 * DAY);
    assert.deepEqual(await packageUsage(customer, pool), { packages: [], unpackaged: 2 });

    // Yeni paket yarın başlasa da önce paketsiz dersler ona yazılır.
    const membershipId = await insertPackage(customer, { startsOn: await day(1), count: 5 });
    assert.deepEqual(await packageUsage(customer, pool), {
      packages: [{ membershipId, used: 2, remaining: 3, burned: 0 }],
      unpackaged: 0,
    });
  });

  test('time-based periods are not packages', async () => {
    const { customer } = await setup();
    await pool.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus) VALUES ($1, $2, $3, 100000)`,
      [customer, await day(-10), await day(20)],
    );
    assert.deepEqual(await packageUsage(customer, pool), { packages: [], unpackaged: 0 });
  });
});
