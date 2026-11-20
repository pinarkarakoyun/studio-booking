import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin, createCustomer, createGroup, createSession, createStudio, pool, resetDb,
} from './helpers.js';
import { client, clientFor, useServer } from './http.js';

// Paket modelinde yanıtlara eklenen bilgiler: kullanılan/kalan/yanan seans, paketsiz ders sayısı, "Paketi bitti"
// listesi, model ve geç iptal ayarı.
useServer();
after(() => pool.end());
beforeEach(resetDb);

async function day(n) {
  const { rows: [row] } = await pool.query(
    `SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date + $1::int)::text AS d`,
    [n],
  );
  return row.d;
}

async function insertPackage(userId, { startsOn, count = 8, validityDays = 60, name = '8 seans' }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, session_count, package_name)
     VALUES ($1, $2::date, $2::date + $3::int - 1, 240000, $4, $5) RETURNING id`,
    [userId, startsOn, validityDays, count, name],
  );
  return row.id;
}

async function setup(membershipModel = 'package') {
  const studio = await createStudio({ membershipModel });
  const group = await createGroup(studio, { capacity: 8 });
  const admin = await clientFor(await createAdmin(studio));
  return { studio, group, admin };
}

describe('package info in responses', () => {
  test('memberships show used and remaining', async () => {
    const { studio, group, admin } = await setup();
    const customer = await createCustomer(studio, group);
    await insertPackage(customer, { startsOn: await day(-10), count: 8 });
    await createSession(group, -3 * 24);
    await createSession(group, -1 * 24);

    const { body } = await admin.request('GET', `/api/admin/customers/${customer}/memberships`);
    const [m] = body.memberships;
    assert.deepEqual([m.packageName, m.sessionCount, m.used, m.remaining, m.burned], ['8 seans', 8, 2, 6, 0]);
    assert.equal(body.unpackaged, 0);
  });

  test('time-based periods have no usage numbers', async () => {
    const { studio, admin } = await setup('group');
    const customer = await createCustomer(studio);
    await admin.request('POST', `/api/admin/customers/${customer}/memberships`, { startsOn: await day(0), endsOn: await day(30), feeKurus: 100000 });
    const { body } = await admin.request('GET', `/api/admin/customers/${customer}/memberships`);
    assert.deepEqual([body.memberships[0].used, body.memberships[0].remaining, body.memberships[0].burned], [null, null, null]);
    assert.equal(body.unpackaged, undefined);
  });

  test('my membership shows remaining and unpackaged', async () => {
    const { studio, group } = await setup();
    const customer = await createCustomer(studio, group);
    const me = await clientFor(customer);
    await createSession(group, -5 * 24); // paket yokken: paketsiz
    assert.deepEqual((await me.request('GET', '/api/me/membership')).body.membership, null);

    await insertPackage(customer, { startsOn: await day(-2), count: 8, validityDays: 30 });
    await createSession(group, -1 * 24);
    const { body: { membership } } = await me.request('GET', '/api/me/membership');
    assert.deepEqual(membership, {
      endsOn: await day(27), ended: false, packageName: '8 seans', sessionCount: 8, used: 2, remaining: 6, unpackaged: 0,
    });
  });

  test('payments list packageFinished', async () => {
    const { studio, group, admin } = await setup();
    const usedUp = await createCustomer(studio, group);
    const expired = await createCustomer(studio, group);
    const renewed = await createCustomer(studio, group);
    const fine = await createCustomer(studio, group);
    await pool.query(`UPDATE users SET full_name = 'Ayşe' WHERE id = $1`, [usedUp]);
    await pool.query(`UPDATE users SET full_name = 'Büşra' WHERE id = $1`, [expired]);

    await insertPackage(usedUp, { startsOn: await day(-10), count: 1 }); // 2 ders: 1 paketsiz
    await insertPackage(expired, { startsOn: await day(-40), count: 8, validityDays: 30 });
    await insertPackage(renewed, { startsOn: await day(-10), count: 1 });
    await insertPackage(renewed, { startsOn: await day(60), count: 8 }); // yenisi açılmış
    await insertPackage(fine, { startsOn: await day(-10), count: 8 });
    await createSession(group, -3 * 24);
    await createSession(group, -1 * 24);

    const { body } = await admin.request('GET', '/api/admin/payments');
    assert.deepEqual(body.packageFinished.map((p) => [p.fullName, p.unpackaged]), [['Ayşe', 1], ['Büşra', 2]]);
    assert.ok(body.packageFinished.every((p) => 'customerId' in p && 'branchName' in p && 'endsOn' in p));
    // Son günü geçen paket "süresi doldu" listesinde ikinci kez görünmez.
    assert.deepEqual(body.expired, []);
  });

  test('group model payments have no packageFinished list', async () => {
    const { admin } = await setup('group');
    const { body } = await admin.request('GET', '/api/admin/payments');
    assert.equal(body.packageFinished, undefined);
  });

  test('settings show the model and save lateCancelBurnsSession', async () => {
    const { admin } = await setup();
    const { body: { settings } } = await admin.request('GET', '/api/admin/settings');
    assert.equal(settings.membershipModel, 'package');
    assert.equal(settings.lateCancelBurnsSession, true);

    const res = await admin.request('PUT', '/api/admin/settings', { ...settings, lateCancelBurnsSession: false });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.lateCancelBurnsSession, false);

    const bad = await admin.request('PUT', '/api/admin/settings', { ...settings, lateCancelBurnsSession: 'evet' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_SETTING');
  });

  test('membershipModel cannot be changed through settings', async () => {
    const { studio, admin } = await setup('group');
    const { body: { settings } } = await admin.request('GET', '/api/admin/settings');
    assert.equal(settings.membershipModel, 'group');
    const res = await admin.request('PUT', '/api/admin/settings', { ...settings, membershipModel: 'package' });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.membershipModel, 'group');
    const { rows: [row] } = await pool.query('SELECT membership_model FROM studio_settings WHERE studio_id = $1', [studio]);
    assert.equal(row.membership_model, 'group');
  });

  test('/api/studio returns membershipModel', async () => {
    await setup();
    const { body } = await client().request('GET', '/api/studio');
    assert.equal(body.studio.membershipModel, 'package');
  });
});
