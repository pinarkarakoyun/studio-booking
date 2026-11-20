import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createAdmin, createCustomer, createGroup, createSession, createStudio, pool, resetDb } from './helpers.js';

// Seans paketleri: veritabanı kuralları. Paket uçları adminPackages.test.js'te.
after(() => pool.end());
beforeEach(resetDb);

const modelOf = async (studioId) =>
  (await pool.query('SELECT membership_model FROM studio_settings WHERE studio_id = $1', [studioId])).rows[0].membership_model;

const insertPackage = (studioId, { name = '8 seans', sessionCount = 8, priceKurus = 100000, validityDays = 60 } = {}) =>
  pool.query(
    `INSERT INTO packages (studio_id, name, session_count, price_kurus, validity_days)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, is_active`,
    [studioId, name, sessionCount, priceKurus, validityDays],
  );

describe('session packages schema', () => {
  test('existing studios are group model', async () => {
    const studio = await createStudio();
    assert.equal(await modelOf(studio), 'group');
    const { rows: [row] } = await pool.query(
      'SELECT late_cancel_burns_session FROM studio_settings WHERE studio_id = $1',
      [studio],
    );
    assert.equal(row.late_cancel_burns_session, true);
  });

  test('createStudio can open a package model studio', async () => {
    const studio = await createStudio({ membershipModel: 'package' });
    assert.equal(await modelOf(studio), 'package');
  });

  test('membership_model accepts only group and package', async () => {
    const studio = await createStudio();
    await assert.rejects(
      pool.query(`UPDATE studio_settings SET membership_model = 'x' WHERE studio_id = $1`, [studio]),
      { code: '23514' },
    );
  });

  test('package rules are enforced', async () => {
    const studio = await createStudio();
    const { rows: [pkg] } = await insertPackage(studio);
    assert.equal(pkg.is_active, true);

    await assert.rejects(insertPackage(studio, { sessionCount: 0 }), { code: '23514' });
    await assert.rejects(insertPackage(studio, { sessionCount: 201 }), { code: '23514' });
    await assert.rejects(insertPackage(studio, { validityDays: 400 }), { code: '23514' });
    await assert.rejects(insertPackage(studio, { validityDays: 0 }), { code: '23514' });
    await assert.rejects(insertPackage(studio, { priceKurus: -1 }), { code: '23514' });
    await assert.rejects(insertPackage(studio, { name: 'A' }), { code: '23514' });
  });

  test('memberships.session_count must be positive', async () => {
    const studio = await createStudio();
    const customer = await createCustomer(studio);
    const insert = (count) =>
      pool.query(
        `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, session_count, package_name)
         VALUES ($1, current_date, current_date + 59, 100000, $2, '8 seans') RETURNING id`,
        [customer, count],
      );
    await assert.rejects(insert(0), { code: '23514' });
    const { rows: [row] } = await insert(8);
    assert.ok(row.id);
  });

  test('attendance is unique per session and user', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const customer = await createCustomer(studio, group);
    const admin = await createAdmin(studio);
    const session = await createSession(group, -2);
    const mark = () =>
      pool.query('INSERT INTO attendance (session_id, user_id, marked_by) VALUES ($1, $2, $3)', [session, customer, admin]);

    await mark();
    await assert.rejects(mark(), { code: '23505' });
    const { rows: [row] } = await pool.query('SELECT marked_at FROM attendance WHERE session_id = $1', [session]);
    assert.ok(row.marked_at instanceof Date);
  });
});
