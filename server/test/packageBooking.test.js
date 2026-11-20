import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { chargeableSessions } from '../src/services/packageUsage.js';
import {
  createCustomer, createGroup, createSession, createStudio, grantCredit, pool, resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

// Paket modelinde iptal: ders başlayana kadar yapılabilir; son iptal saatinden sonrası "geç iptal".
// İptal telafi hakkı doğurmaz (credits satırı yanmış olarak açılır); telafi ve "yerine şuna gel" kapalı.
useServer();
after(() => pool.end());
beforeEach(resetDb);

async function setup(membershipModel = 'package') {
  const studio = await createStudio({ membershipModel, cancellationDeadlineHours: 2 });
  const group = await createGroup(studio, { capacity: 8 });
  const otherGroup = await createGroup(studio, { capacity: 8 });
  const customer = await createCustomer(studio, group);
  const c = await clientFor(customer);
  return { studio, group, otherGroup, customer, c };
}

const creditOf = async (userId, sessionId) =>
  (await pool.query('SELECT used_session_id, forfeited_at FROM credits WHERE user_id = $1 AND source_session_id = $2', [userId, sessionId])).rows[0];

describe('package model cancellations', () => {
  test('package model allows a late cancel and marks it late', async () => {
    const { group, customer, c } = await setup();
    const early = await createSession(group, 30);
    const late = await createSession(group, 1); // son iptal saati (2 saat önce) geçti

    const a = await c.request('POST', `/api/sessions/${early}/cancel`, {});
    assert.equal(a.status, 200);
    assert.equal(a.body.late, false);
    const b = await c.request('POST', `/api/sessions/${late}/cancel`, {});
    assert.equal(b.status, 200);
    assert.equal(b.body.late, true);
    assert.ok((await creditOf(customer, late)).forfeited_at);
  });

  test('a started session cannot be cancelled', async () => {
    const { group, c } = await setup();
    const started = await createSession(group, -0.5);
    const res = await c.request('POST', `/api/sessions/${started}/cancel`, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SESSION_STARTED');
  });

  test('a package cancel is not a usable make-up credit', async () => {
    const { group, customer, c } = await setup();
    const session = await createSession(group, 30);
    await c.request('POST', `/api/sessions/${session}/cancel`, {});
    const credit = await creditOf(customer, session);
    assert.ok(credit.forfeited_at);
    assert.equal(credit.used_session_id, null);
    assert.deepEqual((await c.request('GET', '/api/me/credits')).body.credits, []);
  });

  test('make-up and swap are refused in package model', async () => {
    const { group, otherGroup, customer, c } = await setup();
    await grantCredit(customer); // elle verilmiş eski bir hak bile olsa
    const own = await createSession(group, 30);
    const other = await createSession(otherGroup, 50);

    const makeup = await c.request('PUT', `/api/sessions/${other}/makeup`, {});
    assert.equal(makeup.status, 409);
    assert.equal(makeup.body.error.code, 'MAKEUP_NOT_AVAILABLE');

    const swap = await c.request('POST', `/api/sessions/${own}/swap`, { toSessionId: other });
    assert.equal(swap.status, 409);
    assert.equal(swap.body.error.code, 'MAKEUP_NOT_AVAILABLE');
    // "Yerine şuna gel" geri alındı: kendi dersi iptal edilmemiş kaldı.
    assert.equal(await creditOf(customer, own), undefined);
  });

  test('undo works until the start, even after a late cancel', async () => {
    const { studio, group, customer, c } = await setup();
    await pool.query('UPDATE studio_settings SET allow_undo_cancel = false WHERE studio_id = $1', [studio]);
    const late = await createSession(group, 1);
    await c.request('POST', `/api/sessions/${late}/cancel`, {});
    const mine = (await c.request('GET', '/api/me/sessions')).body.sessions.find((s) => s.id === late);
    assert.equal(mine.canUndoCancel, true);

    const res = await c.request('POST', `/api/sessions/${late}/undo-cancel`, {});
    assert.equal(res.status, 204);
    assert.equal(await creditOf(customer, late), undefined);
  });

  // Ders başladıktan sonra iptal geri alınamaz; geç iptal ayarı açıksa seans düşmüş kalır.
  test('undo after the start is refused in package model', async () => {
    const { group, customer, c } = await setup();
    const session = await createSession(group, 1);
    assert.equal((await c.request('POST', `/api/sessions/${session}/cancel`, {})).status, 200);
    // Ders başladı ve bitti (zamanı geriye al).
    await pool.query(`UPDATE sessions SET starts_at = now() - interval '2 hours' WHERE id = $1`, [session]);
    await pool.query(`UPDATE credits SET created_at = now() - interval '3 hours' WHERE source_session_id = $1`, [session]);

    const res = await c.request('POST', `/api/sessions/${session}/undo-cancel`, {});
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SESSION_STARTED');
    assert.deepEqual((await chargeableSessions(customer, pool)).map((s) => s.sessionId), [session]);
  });

  // Geç iptalin seans düşürüp düşürmediği iptal anında karar verilir ve saklanır. Yönetici sonradan ayarı ya da
  // son iptal saatini değiştirirse geçmiş iptaller yeniden hesaplanmaz (Ayarlar: "bundan sonraki işlemlerde geçerli").
  test('later setting changes do not regrade past cancels', async () => {
    const { studio, group, customer, c } = await setup();
    const late = await createSession(group, 1);
    const early = await createSession(group, 30);
    assert.equal((await c.request('POST', `/api/sessions/${late}/cancel`, {})).body.late, true);
    assert.equal((await c.request('POST', `/api/sessions/${early}/cancel`, {})).body.late, false);
    // İki ders de geçti.
    await pool.query(`UPDATE sessions SET starts_at = now() - interval '3 hours' WHERE id = $1`, [late]);
    await pool.query(`UPDATE sessions SET starts_at = now() - interval '5 hours' WHERE id = $1`, [early]);
    assert.deepEqual((await chargeableSessions(customer, pool)).map((s) => s.sessionId), [late]);

    await pool.query(
      'UPDATE studio_settings SET late_cancel_burns_session = false, cancellation_deadline_hours = 48 WHERE studio_id = $1',
      [studio],
    );
    assert.deepEqual((await chargeableSessions(customer, pool)).map((s) => s.sessionId), [late]);
  });

  test('a late cancel with the setting off is stored as not charged', async () => {
    const { studio, group, customer, c } = await setup();
    await pool.query('UPDATE studio_settings SET late_cancel_burns_session = false WHERE studio_id = $1', [studio]);
    const late = await createSession(group, 1);
    await c.request('POST', `/api/sessions/${late}/cancel`, {});
    await pool.query(`UPDATE sessions SET starts_at = now() - interval '3 hours' WHERE id = $1`, [late]);
    await pool.query('UPDATE studio_settings SET late_cancel_burns_session = true WHERE studio_id = $1', [studio]);
    assert.deepEqual(await chargeableSessions(customer, pool), []);
  });
});

describe('group model', () => {
  test('group model cancel rules are unchanged', async () => {
    const { group, otherGroup, customer, c } = await setup('group');
    const late = await createSession(group, 1);
    const tooLate = await c.request('POST', `/api/sessions/${late}/cancel`, {});
    assert.equal(tooLate.status, 409);
    assert.equal(tooLate.body.error.code, 'CANCELLATION_DEADLINE_PASSED');

    const session = await createSession(group, 30);
    const res = await c.request('POST', `/api/sessions/${session}/cancel`, {});
    assert.equal(res.status, 200);
    assert.equal(res.body.late, false);
    assert.equal((await creditOf(customer, session)).forfeited_at, null);

    const other = await createSession(otherGroup, 50);
    assert.equal((await c.request('PUT', `/api/sessions/${other}/makeup`, {})).status, 200);
  });
});
