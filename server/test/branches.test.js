import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createGroup, createStudio, pool, resetDb } from './helpers.js';

// Şubeler: bir stüdyonun birden çok şubesi olabilir, her grup bir şubeye aittir.
// Bu dosya önce veritabanı kurallarını sınar; şube uçları adminBranches.test.js'te.
after(() => pool.end());
beforeEach(resetDb);

const branchesOf = async (studioId) =>
  (await pool.query('SELECT id, name, is_active FROM branches WHERE studio_id = $1 ORDER BY id', [studioId])).rows;

const insertBranch = (studioId, name, { mapsUrl = null } = {}) =>
  pool.query('INSERT INTO branches (studio_id, name, maps_url) VALUES ($1, $2, $3) RETURNING id', [studioId, name, mapsUrl]);

describe('branches schema', () => {
  test('createStudio opens a Merkez branch and groups belong to it', async () => {
    const studio = await createStudio();
    const branches = await branchesOf(studio);
    assert.deepEqual(branches.map((b) => [b.name, b.is_active]), [['Merkez', true]]);

    const group = await createGroup(studio);
    const { rows: [row] } = await pool.query('SELECT branch_id FROM groups WHERE id = $1', [group]);
    assert.equal(row.branch_id, branches[0].id);
  });

  // Birleşik yabancı anahtar: bir grup yalnızca kendi stüdyosunun şubesine bağlanabilir.
  test("a group cannot point to another studio's branch", async () => {
    const a = await createStudio();
    const b = await createStudio();
    const groupA = await createGroup(a);
    const [branchB] = await branchesOf(b);

    await assert.rejects(
      pool.query('UPDATE groups SET branch_id = $2 WHERE id = $1', [groupA, branchB.id]),
      { code: '23503' },
    );
  });

  test('branch names are unique per studio, ignoring case', async () => {
    const a = await createStudio();
    const b = await createStudio();
    // createStudio "Merkez"i zaten açtı.
    await assert.rejects(insertBranch(a, 'merkez'), { code: '23505' });
    await insertBranch(b, 'Kuzey');
    await insertBranch(a, 'Kuzey');
  });

  test('maps_url must be https', async () => {
    const studio = await createStudio();
    await assert.rejects(insertBranch(studio, 'Kuzey', { mapsUrl: 'http://maps.example.com/x' }), { code: '23514' });
    await insertBranch(studio, 'Güney', { mapsUrl: 'https://maps.example.com/x' });
  });

  test('a branch name needs 2 to 60 characters', async () => {
    const studio = await createStudio();
    await assert.rejects(insertBranch(studio, 'K'), { code: '23514' });
    await assert.rejects(insertBranch(studio, 'K'.repeat(61)), { code: '23514' });
  });

  test('makeup_other_branches defaults to true', async () => {
    const studio = await createStudio();
    const { rows: [row] } = await pool.query('SELECT makeup_other_branches FROM studio_settings WHERE studio_id = $1', [studio]);
    assert.equal(row.makeup_other_branches, true);
  });
});
