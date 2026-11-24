import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { PERMISSION_KEYS } from '../src/services/instructorPermissions.js';
import {
  createAdmin,
  createBranch,
  createCustomer,
  createGroup,
  createInstructor,
  createStudio,
  defaultBranchId,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Eğitmen ve üyeler: yalnızca kendi şubelerinin üyeleri; fiyatlar hiçbir cevapta yok.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const ALL_ON = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));
const today = async () => (await pool.query(`SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date::text AS d`)).rows[0].d;

async function setup({ membershipModel = 'group' } = {}) {
  const studio = await createStudio({ membershipModel });
  const a = await defaultBranchId(studio);
  const b = await createBranch(studio);
  const groupA = await createGroup(studio, { branchId: a, capacity: 10 });
  const groupB = await createGroup(studio, { branchId: b, capacity: 10 });
  const instructor = await createInstructor(studio, { branchIds: [a], permissions: ALL_ON });
  return {
    studio, a, b, groupA, groupB,
    memberA: await createCustomer(studio, groupA),
    memberB: await createCustomer(studio, groupB),
    c: await clientFor(instructor),
  };
}

// Anahtarları derinlemesine dolaşır; fiyat sayılan her anahtarın yolunu döndürür.
function priceKeys(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => priceKeys(v, `${path}[${i}]`));
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(/Kurus$|^(price|fee|amount)|^payments$/.test(k) ? [`${path}.${k}`] : []),
    ...priceKeys(v, `${path}.${k}`),
  ]);
}

describe('instructor customers', () => {
  test('customer list limited to branch', async () => {
    const s = await setup();
    const res = await s.c.request('GET', '/api/admin/customers');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.customers.map((x) => x.id), [s.memberA]);
  });

  test('other branch customer is 404 on every customer route', async () => {
    const s = await setup();
    const d = await today();
    const id = s.memberB;
    const routes = [
      ['GET', `/api/admin/customers/${id}`],
      ['POST', `/api/admin/customers/${id}/reset-password`, {}],
      ['POST', `/api/admin/customers/${id}/freeze`, { startsOn: d }],
      ['POST', `/api/admin/customers/${id}/end-freeze`, {}],
      ['GET', `/api/admin/customers/${id}/leave-preview`],
      ['POST', `/api/admin/customers/${id}/leave`, {}],
      ['POST', `/api/admin/customers/${id}/change-group`, { groupId: s.groupA, effectiveFrom: d }],
      ['POST', `/api/admin/customers/${id}/credits`, { count: 1, expiresOn: d, note: 'x' }],
      ['GET', `/api/admin/customers/${id}/memberships`],
      ['POST', `/api/admin/customers/${id}/memberships`, { startsOn: d, endsOn: d }],
    ];
    for (const [method, path, body] of routes) {
      const res = await s.c.request(method, path, body);
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.body.error.code, 'CUSTOMER_NOT_FOUND', `${method} ${path}`);
    }
  });

  test('instructor must put new customer in own branch group', async () => {
    const s = await setup();
    const body = (groupId) => ({ fullName: 'Yeni Üye', phone: '0555 111 22 33', groupId, startsOn: '2026-12-01' });
    const other = await s.c.request('POST', '/api/admin/customers', body(s.groupB));
    assert.equal(other.status, 404);
    assert.equal(other.body.error.code, 'GROUP_NOT_FOUND');
    const own = await s.c.request('POST', '/api/admin/customers', body(s.groupA));
    assert.equal(own.status, 201);
    assert.ok(own.body.temporaryPassword);
  });

  test('cannot reset password of admin or instructor', async () => {
    const s = await setup();
    for (const id of [await createAdmin(s.studio), await createInstructor(s.studio, { branchIds: [s.a] })]) {
      assert.equal((await s.c.request('POST', `/api/admin/customers/${id}/reset-password`, {})).status, 404);
    }
  });

  test('change group: target group must be in own branches', async () => {
    const s = await setup();
    const other = await createGroup(s.studio, { branchId: s.a, capacity: 10 });
    const d = await today();
    const bad = await s.c.request('POST', `/api/admin/customers/${s.memberA}/change-group`, { groupId: s.groupB, effectiveFrom: d });
    assert.equal(bad.status, 404);
    assert.equal(bad.body.error.code, 'GROUP_NOT_FOUND');
    const ok = await s.c.request('POST', `/api/admin/customers/${s.memberA}/change-group`, { groupId: other, effectiveFrom: d });
    assert.equal(ok.status, 200);
  });

  test('group model: instructor cannot open membership period', async () => {
    const s = await setup();
    const d = await today();
    const res = await s.c.request('POST', `/api/admin/customers/${s.memberA}/memberships`, { startsOn: d, endsOn: d, feeKurus: 100 });
    assert.equal(res.status, 403);
  });

  test('package model: instructor opens period, fee from package, fee field rejected', async () => {
    const s = await setup({ membershipModel: 'package' });
    const { rows: [pkg] } = await pool.query(
      `INSERT INTO packages (studio_id, name, session_count, price_kurus, validity_days)
       VALUES ($1, '8 seans', 8, 240000, 60) RETURNING id`,
      [s.studio],
    );
    const d = await today();
    const url = `/api/admin/customers/${s.memberA}/memberships`;
    const withFee = await s.c.request('POST', url, { packageId: pkg.id, startsOn: d, feeKurus: 1 });
    assert.equal(withFee.status, 400);
    assert.equal(withFee.body.error.code, 'FEE_NOT_ALLOWED');

    const res = await s.c.request('POST', url, { packageId: pkg.id, startsOn: d });
    assert.equal(res.status, 201);
    assert.deepEqual(priceKeys(res.body), []);
    const { rows: [row] } = await pool.query('SELECT fee_kurus FROM memberships WHERE user_id = $1', [s.memberA]);
    assert.equal(Number(row.fee_kurus), 240000);
  });

  test('no price keys reach an instructor', async () => {
    const s = await setup({ membershipModel: 'package' });
    const { rows: [pkg] } = await pool.query(
      `INSERT INTO packages (studio_id, name, session_count, price_kurus, validity_days)
       VALUES ($1, '8 seans', 8, 240000, 60) RETURNING id`,
      [s.studio],
    );
    const { rows: [m] } = await pool.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, session_count, package_name)
       VALUES ($1, current_date, current_date + 59, 240000, 8, '8 seans') RETURNING id`,
      [s.memberA],
    );
    await pool.query(
      `INSERT INTO payments (membership_id, amount_kurus, paid_on, method) VALUES ($1, 100000, current_date, 'cash')`,
      [m.id],
    );
    for (const path of [
      `/api/admin/customers/${s.memberA}`,
      `/api/admin/customers/${s.memberA}/memberships`,
      '/api/admin/packages',
      '/api/admin/customers',
    ]) {
      const res = await s.c.request('GET', path);
      assert.equal(res.status, 200, path);
      assert.deepEqual(priceKeys(res.body), [], path);
    }
    // Yönetici aynı cevaplarda fiyatları görmeye devam eder.
    const adminRes = await (await clientFor(await createAdmin(s.studio))).request('GET', '/api/admin/packages');
    assert.equal(adminRes.body.packages[0].priceKurus, 240000);
    assert.ok(pkg.id);
  });

  test('member who starts later is visible to the instructor who added them', async () => {
    const s = await setup();
    const res = await s.c.request('POST', '/api/admin/customers', {
      fullName: 'İleride Başlayan', phone: '0555 999 88 77', groupId: s.groupA, startsOn: '2030-01-07',
    });
    assert.equal(res.status, 201);
    const list = await s.c.request('GET', '/api/admin/customers');
    assert.ok(list.body.customers.some((c) => c.id === res.body.customerId));
    assert.equal((await s.c.request('GET', `/api/admin/customers/${res.body.customerId}`)).status, 200);
    // Başka şubenin eğitmeni görmez.
    const other = await clientFor(await createInstructor(s.studio, { branchIds: [s.b], permissions: ALL_ON }));
    assert.equal((await other.request('GET', `/api/admin/customers/${res.body.customerId}`)).status, 404);
  });

  test('membership notes are hidden from instructors', async () => {
    const s = await setup();
    await pool.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, note)
       VALUES ($1, current_date, current_date + 29, 300000, '200 TL indirim')`,
      [s.memberA],
    );
    const res = await s.c.request('GET', `/api/admin/customers/${s.memberA}/memberships`);
    assert.equal(res.status, 200);
    assert.doesNotMatch(JSON.stringify(res.body), /indirim/);
    const adminRes = await (await clientFor(await createAdmin(s.studio))).request('GET', `/api/admin/customers/${s.memberA}/memberships`);
    assert.equal(adminRes.body.memberships[0].note, '200 TL indirim');
  });
});
