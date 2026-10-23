import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  createAdmin,
  createCustomer,
  createGroup,
  createSession,
  createStudio,
  insertCancellation,
  insertMakeup,
  pool,
  resetDb,
} from './helpers.js';
import { clientFor, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

async function setup(settings) {
  const studio = await createStudio(settings);
  const c = await clientFor(await createAdmin(studio));
  const group = await createGroup(studio, { capacity: 6 });
  const sessionId = await createSession(group, 48);
  return { studio, c, group, sessionId };
}

const creditsOf = async (userId) =>
  (await pool.query('SELECT source_session_id, used_session_id, note FROM credits WHERE user_id = $1 ORDER BY id', [userId])).rows;

describe('studio cancels a session', () => {
  test('attending members get a credit, make-ups are refunded, already-cancelled and frozen members get nothing new', async () => {
    const { studio, c, group, sessionId } = await setup();
    const attending = await createCustomer(studio, group);
    const alreadyCancelled = await createCustomer(studio, group);
    await insertCancellation(alreadyCancelled, sessionId);
    const frozen = await createCustomer(studio, group);
    await pool.query(`INSERT INTO freezes (user_id, starts_on, ends_on) VALUES ($1, current_date, current_date + 10)`, [frozen]);
    const makeupGuest = await createCustomer(studio);
    await insertMakeup(makeupGuest, sessionId);

    const res = await c.request('POST', `/api/admin/sessions/${sessionId}/cancel`, { reason: ' Hocamız hasta ' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { creditedMembers: 1, refundedMakeups: 1, creditsEnabled: true });

    assert.deepEqual(await creditsOf(attending), [{ source_session_id: sessionId, used_session_id: null, note: 'Stüdyo dersi iptal etti' }]);
    assert.equal((await creditsOf(alreadyCancelled)).length, 1);
    assert.equal((await creditsOf(frozen)).length, 0);
    assert.equal((await creditsOf(makeupGuest))[0].used_session_id, null);

    const roster = await c.request('GET', `/api/admin/sessions/${sessionId}`);
    assert.equal(roster.body.session.status, 'cancelled');
    assert.equal(roster.body.session.cancelReason, 'Hocamız hasta');

    // Müşteri dersi iptal edilmiş ve sebebiyle görür; stüdyonun iptalinde "Geri al" yok.
    const mine = (await (await clientFor(attending)).request('GET', '/api/me/sessions')).body.sessions;
    const shown = mine.find((s) => s.id === sessionId);
    assert.equal(shown.status, 'cancelled');
    assert.equal(shown.cancelReason, 'Hocamız hasta');
    assert.equal(shown.canUndoCancel, false);
  });

  test("credits from the studio's cancellation are not shown as customers' recent cancellations", async () => {
    const { studio, c, group, sessionId } = await setup();
    await createCustomer(studio, group);
    await c.request('POST', `/api/admin/sessions/${sessionId}/cancel`, {});
    const { body } = await c.request('GET', '/api/admin/today');
    assert.equal(body.alerts.recentCancellations.length, 0);
  });

  test('preview reports the same numbers and changes nothing', async () => {
    const { studio, c, group, sessionId } = await setup();
    await createCustomer(studio, group);
    await createCustomer(studio, group);
    const preview = await c.request('POST', `/api/admin/sessions/${sessionId}/cancel/preview`, {});
    assert.deepEqual(preview.body, { creditedMembers: 2, refundedMakeups: 0, creditsEnabled: true });
    const { rows: [s] } = await pool.query('SELECT status FROM sessions WHERE id = $1', [sessionId]);
    assert.equal(s.status, 'scheduled');
    assert.equal((await pool.query('SELECT 1 FROM credits')).rowCount, 0);
  });

  test('with the setting off, members get no credit', async () => {
    const { studio, c, group, sessionId } = await setup();
    await pool.query('UPDATE studio_settings SET credit_on_studio_cancel = false WHERE studio_id = $1', [studio]);
    const member = await createCustomer(studio, group);
    const res = await c.request('POST', `/api/admin/sessions/${sessionId}/cancel`, {});
    assert.equal(res.body.creditedMembers, 0);
    assert.equal((await creditsOf(member)).length, 0);
  });

  test('a session cannot be cancelled twice, after it started, or in another studio', async () => {
    const { c, group, sessionId } = await setup();
    await c.request('POST', `/api/admin/sessions/${sessionId}/cancel`, {});
    assert.equal((await c.request('POST', `/api/admin/sessions/${sessionId}/cancel`, {})).body.error.code, 'SESSION_ALREADY_CANCELLED');

    const past = await createSession(group, -1);
    assert.equal((await c.request('POST', `/api/admin/sessions/${past}/cancel`, {})).body.error.code, 'SESSION_STARTED');

    const other = await clientFor(await createAdmin(await createStudio()));
    const fresh = await createSession(group, 72);
    assert.equal((await other.request('POST', `/api/admin/sessions/${fresh}/cancel`, {})).status, 404);
  });
});
