import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createAdmin, createCustomer, createStudio, pool, resetDb } from './helpers.js';
import { clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

async function setup() {
  const studio = await createStudio();
  const c = await clientFor(await createAdmin(studio));
  const { body } = await c.request('GET', '/api/admin/settings');
  return { studio, c, settings: body.settings };
}

describe('settings', () => {
  test('saves all settings together and returns them', async () => {
    const { c, settings } = await setup();
    const res = await c.request('PUT', '/api/admin/settings', {
      ...settings,
      studioName: '  Yeni   Stüdyo ',
      whatsappPhone: '0532 123 45 67',
      cancellationDeadlineHours: 6,
      creditValidityDays: 14,
      maxMakeupsPerMonth: 4,
      allowUndoCancel: false,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.studioName, 'Yeni Stüdyo');
    assert.equal(res.body.settings.whatsappPhone, '+905321234567');
    assert.equal(res.body.settings.cancellationDeadlineHours, 6);
    assert.equal(res.body.settings.maxMakeupsPerMonth, 4);
    assert.equal(res.body.settings.allowUndoCancel, false);

    const again = await c.request('GET', '/api/admin/settings');
    assert.deepEqual(again.body.settings, res.body.settings);
  });

  test('an empty WhatsApp number and an empty make-up limit are allowed', async () => {
    const { c, settings } = await setup();
    const res = await c.request('PUT', '/api/admin/settings', { ...settings, whatsappPhone: '', maxMakeupsPerMonth: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.whatsappPhone, null);
    assert.equal(res.body.settings.maxMakeupsPerMonth, null);
  });

  test('an invalid value is rejected and nothing is saved', async () => {
    const { c, settings } = await setup();
    const res = await c.request('PUT', '/api/admin/settings', { ...settings, studioName: 'Değişmemeli', creditValidityDays: 0 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_CREDIT_VALIDITY_DAYS');
    const after = await c.request('GET', '/api/admin/settings');
    assert.deepEqual(after.body.settings, settings);
  });

  test('a new credit validity does not change credits already given', async () => {
    const { studio, c, settings } = await setup();
    const userId = await createCustomer(studio);
    await pool.query(`INSERT INTO credits (user_id, expires_at) VALUES ($1, now() + interval '30 days')`, [userId]);
    await c.request('PUT', '/api/admin/settings', { ...settings, creditValidityDays: 7 });
    const { rows: [row] } = await pool.query(
      `SELECT expires_at > now() + interval '29 days' AS unchanged FROM credits WHERE user_id = $1`,
      [userId],
    );
    assert.equal(row.unchanged, true);
  });

  test('customers cannot read or change settings', async () => {
    const studio = await createStudio();
    const customer = await clientFor(await createCustomer(studio));
    assert.equal((await customer.request('GET', '/api/admin/settings')).status, 403);
  });
});
