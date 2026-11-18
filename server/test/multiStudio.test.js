import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createUser } from '../src/services/auth.js';
import { createStudio, pool, resetDb } from './helpers.js';

// Çoklu stüdyo: her stüdyonun kendi adresi (slug) ve kendi hesapları var.
// Bu dosya önce veritabanı kurallarını, sonraki görevlerde giriş ve oturum ayrımını sınar.
after(() => pool.end());
beforeEach(resetDb);

const TEMP_PASSWORD = 'gecici-sifre-1';

function newUser(studioId, phone, fullName = 'Ayşe') {
  return createUser({ studioId, role: 'customer', fullName, phone, temporaryPassword: TEMP_PASSWORD });
}

// Doğrudan SQL ile stüdyo ekler; slug kurallarını uygulama kodunu atlayarak veritabanında denemek için.
function insertStudio(slug) {
  return pool.query(`INSERT INTO studios (name, slug) VALUES ('Deneme', $1) RETURNING id`, [slug]);
}

describe('multi-studio schema', () => {
  test('same phone can exist in two studios', async () => {
    const a = await createStudio();
    const b = await createStudio();

    const userA = await newUser(a, '0532 111 22 33');
    const userB = await newUser(b, '0532 111 22 33');

    assert.ok(userA);
    assert.ok(userB);
    assert.notEqual(userA, userB);
  });

  test('same phone in one studio is still rejected', async () => {
    const studio = await createStudio();
    await newUser(studio, '05321112233');

    await assert.rejects(newUser(studio, '+90 532 111 22 33', 'B'), (err) => err.code === 'PHONE_TAKEN');
  });

  test('same email is allowed across studios, rejected within one', async () => {
    const a = await createStudio();
    const b = await createStudio();
    const insert = (studioId, phone, email) => pool.query(
      `INSERT INTO users (studio_id, role, full_name, phone, email, password_hash)
       VALUES ($1, 'customer', 'X', $2, $3, 'x')`,
      [studioId, phone, email],
    );

    await insert(a, '+905321110001', 'ayse@ornek.com');
    // Büyük/küçük harf farkı aynı e-posta sayılır, ama başka stüdyoda serbest.
    await insert(b, '+905321110002', 'AYSE@ornek.com');
    await assert.rejects(insert(a, '+905321110003', 'Ayse@Ornek.com'), { code: '23505' });
  });

  test('slug rules are enforced by the database', async () => {
    for (const slug of ['Ornek', 'ab', '-ornek', 'ornek-', 'orn.ek', 'www', 'admin']) {
      // 23514: CHECK kısıtı ihlali.
      await assert.rejects(insertStudio(slug), { code: '23514' }, slug);
    }
    await insertStudio('ornek-pilates');
  });

  test('slug is required and unique', async () => {
    await insertStudio('ornek');
    await assert.rejects(insertStudio('ornek'), { code: '23505' });
    await assert.rejects(insertStudio(null), { code: '23502' });
  });

  test('createStudio gives each test studio its own slug', async () => {
    await createStudio();
    await createStudio({ slug: 'ozel-ad' });
    const { rows } = await pool.query('SELECT slug FROM studios ORDER BY id');
    assert.deepEqual(rows.map((r) => r.slug), ['test-1', 'ozel-ad']);
  });
});
