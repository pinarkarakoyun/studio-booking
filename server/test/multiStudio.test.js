import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createUser, resetLoginAttempts } from '../src/services/auth.js';
import { createStudio, pool, resetDb } from './helpers.js';
import { client, useServer } from './http.js';

// Çoklu stüdyo: her stüdyonun kendi adresi (slug) ve kendi hesapları var.
// Bu dosya önce veritabanı kurallarını, sonraki görevlerde giriş ve oturum ayrımını sınar.
useServer();
after(() => pool.end());
beforeEach(async () => {
  await resetDb();
  resetLoginAttempts();
});

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

describe('login and sessions are scoped to the studio', () => {
  const PHONE = '0532 111 22 33';
  const HOST_A = 'test-1.localhost';
  const HOST_B = 'ikinci.localhost';
  const PASSWORD_A = 'sifre-stüdyo-a';
  const PASSWORD_B = 'sifre-stüdyo-b';

  // İki stüdyo, aynı numarada iki ayrı kişi, farklı şifreler.
  async function twoStudiosSamePhone() {
    const a = await createStudio();
    const b = await createStudio({ slug: 'ikinci' });
    const userA = await createUser({ studioId: a, role: 'customer', fullName: 'Ayşe A', phone: PHONE, temporaryPassword: PASSWORD_A });
    const userB = await createUser({ studioId: b, role: 'customer', fullName: 'Ayşe B', phone: PHONE, temporaryPassword: PASSWORD_B });
    return { a, b, userA, userB };
  }

  const loginAt = (host, password, phone = PHONE) => {
    const c = client(null, { host });
    return c.request('POST', '/api/auth/login', { phone, password }).then((res) => ({ c, res }));
  };

  test('login uses the account of the current studio', async () => {
    const { userA, userB } = await twoStudiosSamePhone();

    const { c: cA, res: resA } = await loginAt(HOST_A, PASSWORD_A);
    const { c: cB, res: resB } = await loginAt(HOST_B, PASSWORD_B);
    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.equal((await cA.request('GET', '/api/auth/me')).body.user.id, userA);
    assert.equal((await cB.request('GET', '/api/auth/me')).body.user.id, userB);
  });

  test("login with the other studio's password fails like an unknown number", async () => {
    await twoStudiosSamePhone();
    const { res: wrongStudio } = await loginAt(HOST_A, PASSWORD_B);
    const { res: unknown } = await loginAt(HOST_A, PASSWORD_A, '0532 999 88 77');

    assert.equal(wrongStudio.status, 401);
    assert.equal(wrongStudio.body.error.code, 'INVALID_CREDENTIALS');
    assert.deepEqual(wrongStudio.body, unknown.body);
  });

  test('number registered only in the other studio fails the same way', async () => {
    await createStudio();
    const b = await createStudio({ slug: 'ikinci' });
    await createUser({ studioId: b, role: 'customer', fullName: 'Ayşe B', phone: PHONE, temporaryPassword: PASSWORD_B });

    const { res } = await loginAt(HOST_A, PASSWORD_B);
    const { res: unknown } = await loginAt(HOST_A, PASSWORD_B, '0532 999 88 77');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, unknown.body);
  });

  test('failed attempts are counted per studio', async () => {
    await twoStudiosSamePhone();
    // A'da hesap kilitlenene kadar yanlış şifre.
    let last;
    for (let i = 0; i < 6; i += 1) ({ res: last } = await loginAt(HOST_A, 'yanlis-sifre-123'));
    assert.equal(last.status, 429);

    // Aynı numaranın B'deki hesabı etkilenmez.
    const { res } = await loginAt(HOST_B, PASSWORD_B);
    assert.equal(res.status, 200);
  });

  test('session cookie of A is ignored on B', async () => {
    await twoStudiosSamePhone();
    const { res } = await loginAt(HOST_A, PASSWORD_A);
    const cookie = res.setCookie.split(';')[0];

    assert.equal((await client(cookie, { host: HOST_B }).request('GET', '/api/auth/me')).status, 401);
    assert.equal((await client(cookie, { host: HOST_A }).request('GET', '/api/auth/me')).status, 200);
  });

  test('session cookie is ignored on the root host', async () => {
    await twoStudiosSamePhone();
    const { res } = await loginAt(HOST_A, PASSWORD_A);
    const cookie = res.setCookie.split(';')[0];

    const root = await client(cookie, { host: 'localhost' }).request('GET', '/api/auth/me');
    assert.equal(root.status, 404);
    assert.equal(root.body.error.code, 'STUDIO_NOT_FOUND');
  });

  test('session cookie has no Domain attribute', async () => {
    await twoStudiosSamePhone();
    const { res } = await loginAt(HOST_A, PASSWORD_A);
    assert.ok(res.setCookie);
    // Domain verilseydi çerez bütün alt alan adlarına (diğer stüdyolara) da giderdi.
    assert.doesNotMatch(res.setCookie, /domain=/i);
  });
});
