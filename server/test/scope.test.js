import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import {
  assertBranchInScope,
  assertCustomerInScope,
  assertGroupInScope,
  assertSessionInScope,
  branchClause,
  isInstructor,
  redactPrices,
} from '../src/services/scope.js';
import {
  createAdmin,
  createBranch,
  createCustomer,
  createGroup,
  createInstructor,
  createSession,
  createStudio,
  defaultBranchId,
  pool,
  resetDb,
  setGroupInstructor,
} from './helpers.js';

// Kapsam yardımcıları: eğitmen yalnızca kendi şubelerini görür, yönetici her şeyi (kendi stüdyosunda).
after(() => pool.end());
beforeEach(resetDb);

const admin = (studioId) => ({ id: 1, studio_id: studioId, role: 'admin', branchIds: null });
const instructor = (studioId, branchIds, id = 99) => ({ id, studio_id: studioId, role: 'instructor', branchIds });

// İki şubeli stüdyo: her şubede bir grup ve bir ders, A şubesinde bir üye.
async function setup() {
  const studio = await createStudio();
  const a = await defaultBranchId(studio);
  const b = await createBranch(studio);
  const groupA = await createGroup(studio, { branchId: a });
  const groupB = await createGroup(studio, { branchId: b });
  return {
    studio,
    a,
    b,
    groupA,
    groupB,
    sessionA: await createSession(groupA, 24),
    sessionB: await createSession(groupB, 24),
    customerA: await createCustomer(studio, groupA),
  };
}

async function visibleSessions(actor) {
  const params = [actor.studio_id];
  const { rows } = await pool.query(
    `SELECT s.id FROM sessions s JOIN groups g ON g.id = s.group_id
     WHERE g.studio_id = $1 AND ${branchClause(actor, 'g.branch_id', params)} ORDER BY s.id`,
    params,
  );
  return rows.map((r) => Number(r.id));
}

const notFound = (code) => ({ status: 404, code });

describe('scope helpers', () => {
  test('admin sees everything', async () => {
    const { studio, sessionA, sessionB } = await setup();
    const params = [];
    assert.equal(branchClause(admin(studio), 'g.branch_id', params), 'TRUE');
    assert.deepEqual(params, []);
    assert.deepEqual(await visibleSessions(admin(studio)), [sessionA, sessionB]);
  });

  test('instructor limited to own branches', async () => {
    const { studio, b, sessionB } = await setup();
    assert.deepEqual(await visibleSessions(instructor(studio, [b])), [sessionB]);
  });

  test('empty branch list sees nothing', async () => {
    const { studio, sessionA, groupA, customerA, a } = await setup();
    const none = instructor(studio, []);
    assert.deepEqual(await visibleSessions(none), []);
    await assert.rejects(assertSessionInScope(none, sessionA, pool), notFound('SESSION_NOT_FOUND'));
    await assert.rejects(assertCustomerInScope(none, customerA, pool), notFound('CUSTOMER_NOT_FOUND'));
    await assert.rejects(assertGroupInScope(none, groupA, pool), notFound('GROUP_NOT_FOUND'));
    assert.throws(() => assertBranchInScope(none, a), notFound('BRANCH_NOT_FOUND'));
  });

  test('session in scope returns its details', async () => {
    const { studio, a, sessionA, groupA } = await setup();
    const teacher = await createInstructor(studio, { branchIds: [a] });
    await setGroupInstructor(groupA, teacher);
    const session = await assertSessionInScope(instructor(studio, [a], teacher), sessionA, pool);
    assert.equal(session.id, sessionA);
    assert.equal(session.branchId, a);
    assert.equal(session.status, 'scheduled');
    assert.equal(session.instructorId, teacher);
    assert.equal(session.groupKind, 'regular');
    assert.ok(session.date);
  });

  test('session override wins over group instructor', async () => {
    const { studio, a, sessionA, groupA } = await setup();
    const owner = await createInstructor(studio, { branchIds: [a] });
    const substitute = await createInstructor(studio, { branchIds: [a] });
    await setGroupInstructor(groupA, owner);
    await pool.query('UPDATE sessions SET instructor_id = $2 WHERE id = $1', [sessionA, substitute]);
    assert.equal((await assertSessionInScope(admin(studio), sessionA, pool)).instructorId, substitute);
  });

  test('other branch session is 404 for instructor', async () => {
    const { studio, a, sessionB } = await setup();
    await assert.rejects(assertSessionInScope(instructor(studio, [a]), sessionB, pool), notFound('SESSION_NOT_FOUND'));
  });

  test("other studio's session is 404 even for admin", async () => {
    const { sessionA } = await setup();
    const other = await createStudio();
    await assert.rejects(assertSessionInScope(admin(other), sessionA, pool), notFound('SESSION_NOT_FOUND'));
  });

  test('customer in scope by current group branch', async () => {
    const { studio, a, b, customerA } = await setup();
    await assertCustomerInScope(instructor(studio, [a]), customerA, pool);
    await assert.rejects(assertCustomerInScope(instructor(studio, [b]), customerA, pool), notFound('CUSTOMER_NOT_FOUND'));
  });

  test('customer who left the group is out of scope for instructor', async () => {
    const { studio, a, customerA } = await setup();
    await pool.query('UPDATE group_members SET left_on = current_date WHERE user_id = $1', [customerA]);
    await assert.rejects(assertCustomerInScope(instructor(studio, [a]), customerA, pool), notFound('CUSTOMER_NOT_FOUND'));
  });

  test('customer without group is out of scope for instructor, in scope for admin', async () => {
    const { studio, a } = await setup();
    const loner = await createCustomer(studio);
    await assert.rejects(assertCustomerInScope(instructor(studio, [a]), loner, pool), notFound('CUSTOMER_NOT_FOUND'));
    await assertCustomerInScope(admin(studio), loner, pool);
  });

  test('staff accounts are not customers', async () => {
    const { studio, a } = await setup();
    const otherAdmin = await createAdmin(studio);
    const otherInstructor = await createInstructor(studio, { branchIds: [a] });
    for (const id of [otherAdmin, otherInstructor]) {
      await assert.rejects(assertCustomerInScope(admin(studio), id, pool), notFound('CUSTOMER_NOT_FOUND'));
    }
  });

  test('group and branch scope', async () => {
    const { studio, a, b, groupA } = await setup();
    assert.deepEqual(await assertGroupInScope(instructor(studio, [a]), groupA, pool), { branchId: a });
    await assert.rejects(assertGroupInScope(instructor(studio, [b]), groupA, pool), notFound('GROUP_NOT_FOUND'));
    assertBranchInScope(admin(studio), b);
    assertBranchInScope(instructor(studio, [b]), b);
    assert.throws(() => assertBranchInScope(instructor(studio, [a]), b), notFound('BRANCH_NOT_FOUND'));
  });

  test('isInstructor', () => {
    assert.equal(isInstructor(instructor(1, [])), true);
    assert.equal(isInstructor(admin(1)), false);
  });

  test('redactPrices removes nested price keys', () => {
    const input = {
      a: { feeKurus: 1, payments: [{ amountKurus: 5 }], note: 'n' },
      list: [{ priceKurus: 2, name: 'x', remainingKurus: 3, price: 4, fee: 5, amount: 6 }],
      sessionCount: 8,
    };
    assert.deepEqual(redactPrices(input), { a: { note: 'n' }, list: [{ name: 'x' }], sessionCount: 8 });
    // Girdi değişmez (derin kopya).
    assert.equal(input.a.feeKurus, 1);
  });

  test('redactPrices keeps non-objects and dates as they are', () => {
    assert.equal(redactPrices(null), null);
    assert.equal(redactPrices('x'), 'x');
    const d = new Date('2026-11-24T00:00:00Z');
    assert.deepEqual(redactPrices({ paidOn: d }), { paidOn: d });
  });
});
