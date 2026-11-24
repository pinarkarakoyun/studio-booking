import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createBranch, createGroup, createInstructor, createStudio, defaultBranchId, pool, resetDb } from './helpers.js';

// Eğitmen rolü: veritabanı kuralları. Uçlar ve kapsam diğer instructor*.test.js dosyalarında.
after(() => pool.end());
beforeEach(resetDb);

const permissionsOf = async (userId) =>
  (await pool.query('SELECT * FROM instructor_permissions WHERE user_id = $1', [userId])).rows[0];

describe('instructor schema', () => {
  test('instructor role is accepted', async () => {
    const studio = await createStudio();
    const id = await createInstructor(studio, { branchIds: [await defaultBranchId(studio)] });
    const { rows: [user] } = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    assert.equal(user.role, 'instructor');
  });

  test('permission defaults match the spec', async () => {
    const studio = await createStudio();
    const id = await createInstructor(studio);
    const { user_id: _, ...permissions } = await permissionsOf(id);
    assert.deepEqual(permissions, {
      attendance: true,
      cancel_own_sessions: true,
      create_extra_sessions: true,
      manage_attendees: false,
      view_customers: false,
      edit_customers: false,
      customer_status: false,
      memberships: false,
      manage_groups: false,
    });
  });

  test('view_customers off forbids customer permissions', async () => {
    const studio = await createStudio();
    const id = await createInstructor(studio);
    for (const column of ['edit_customers', 'customer_status', 'memberships']) {
      await assert.rejects(
        pool.query(`UPDATE instructor_permissions SET ${column} = true WHERE user_id = $1`, [id]),
        { code: '23514' },
        column,
      );
    }
    // Üyeleri görme açıkken izin verilir.
    await pool.query(
      `UPDATE instructor_permissions SET view_customers = true, edit_customers = true WHERE user_id = $1`,
      [id],
    );
  });

  test('instructor branch must be in the same studio', async () => {
    const studio = await createStudio();
    const other = await createStudio();
    const id = await createInstructor(studio);
    await assert.rejects(
      pool.query(
        'INSERT INTO instructor_branches (user_id, branch_id, studio_id) VALUES ($1, $2, $3)',
        [id, await defaultBranchId(other), studio],
      ),
      { code: '23503' },
    );
    // studio_id'yi diğer stüdyo yazmak da işe yaramaz: kullanıcı o stüdyoda değil.
    await assert.rejects(
      pool.query(
        'INSERT INTO instructor_branches (user_id, branch_id, studio_id) VALUES ($1, $2, $3)',
        [id, await defaultBranchId(other), other],
      ),
      { code: '23503' },
    );
  });

  test('createInstructor assigns the given branches', async () => {
    const studio = await createStudio();
    const second = await createBranch(studio);
    const id = await createInstructor(studio, { branchIds: [second] });
    const { rows } = await pool.query('SELECT branch_id FROM instructor_branches WHERE user_id = $1', [id]);
    assert.deepEqual(rows.map((r) => Number(r.branch_id)), [second]);
  });

  test('group kind defaults to regular, instructor columns are empty', async () => {
    const studio = await createStudio();
    const group = await createGroup(studio);
    const { rows: [row] } = await pool.query('SELECT kind, instructor_id FROM groups WHERE id = $1', [group]);
    assert.deepEqual(row, { kind: 'regular', instructor_id: null });
    await assert.rejects(pool.query(`UPDATE groups SET kind = 'x' WHERE id = $1`, [group]), { code: '23514' });
  });
});
