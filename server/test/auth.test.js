import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { createUser, resetLoginAttempts, resetPassword } from '../src/services/auth.js';
import { createStudio, pool, resetDb } from './helpers.js';

// Uygulamayı rastgele boş bir portta (0) başlatıp gerçek HTTP istekleriyle test ediyoruz:
// cookie'ler, durum kodları ve middleware sırası gerçekte nasılsa öyle çalışır.
let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  resetLoginAttempts();
});

// Küçük bir istemci: Set-Cookie'yi saklayıp sonraki isteklere ekler (tarayıcının yaptığı gibi).
function client() {
  let cookie = null;
  return {
    async request(method, path, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const json = res.status === 204 ? null : await res.json();
      return { status: res.status, body: json, setCookie };
    },
  };
}

const PHONE = '0532 111 22 33';
const TEMP_PASSWORD = 'gecici-sifre-1';
const NEW_PASSWORD = 'yeni-sifre-123';

async function createCustomer() {
  const studio = await createStudio();
  return createUser({
    studioId: studio, role: 'customer', fullName: 'Ayşe', phone: PHONE, temporaryPassword: TEMP_PASSWORD,
  });
}

// Geçici şifreyle girip yeni şifre belirlemiş, kullanıma hazır bir müşteri oturumu.
async function loggedInCustomer() {
  const userId = await createCustomer();
  const c = client();
  await c.request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });
  await c.request('POST', '/api/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD });
  return { c, userId };
}

describe('login', () => {
  test('works with any way of writing the phone and sets a secure session cookie', async () => {
    await createCustomer();
    const c = client();

    const res = await c.request('POST', '/api/auth/login', { phone: '+90 (532) 111-22-33', password: TEMP_PASSWORD });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user, { id: 1, fullName: 'Ayşe', role: 'customer', mustChangePassword: true });
    assert.match(res.setCookie, /HttpOnly/);
    assert.match(res.setCookie, /SameSite=Lax/);
  });

  test('stores only a hash of the session token', async () => {
    await createCustomer();
    const res = await client().request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });
    const token = res.setCookie.split(';')[0].split('=')[1];

    const { rows } = await pool.query('SELECT token_hash FROM user_sessions');
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token);
  });

  test('gives the same answer for a wrong password and an unknown phone', async () => {
    await createCustomer();

    const wrongPassword = await client().request('POST', '/api/auth/login', { phone: PHONE, password: 'yanlis-sifre' });
    const unknownPhone = await client().request('POST', '/api/auth/login', { phone: '0533 999 88 77', password: TEMP_PASSWORD });

    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongPassword.body, unknownPhone.body);
  });

  test('blocks a phone after 5 failed attempts', async () => {
    await createCustomer();
    for (let i = 0; i < 5; i += 1) {
      await client().request('POST', '/api/auth/login', { phone: PHONE, password: 'yanlis-sifre' });
    }

    // Doğru şifre bile artık kabul edilmiyor.
    const res = await client().request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'TOO_MANY_ATTEMPTS');
  });

  test('refuses a customer who left, and tells them so only after a correct password', async () => {
    const userId = await createCustomer();
    await pool.query(`UPDATE users SET status = 'left' WHERE id = $1`, [userId]);

    const wrong = await client().request('POST', '/api/auth/login', { phone: PHONE, password: 'yanlis-sifre' });
    const right = await client().request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });

    assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(right.status, 403);
    assert.equal(right.body.error.code, 'ACCOUNT_CLOSED');
  });
});

describe('session', () => {
  test('/me requires login', async () => {
    const res = await client().request('GET', '/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('a customer marked as left is logged out immediately', async () => {
    const { c, userId } = await loggedInCustomer();
    assert.equal((await c.request('GET', '/api/auth/me')).status, 200);

    await pool.query(`UPDATE users SET status = 'left' WHERE id = $1`, [userId]);

    assert.equal((await c.request('GET', '/api/auth/me')).status, 401);
  });

  test('an expired session is rejected', async () => {
    const { c } = await loggedInCustomer();
    await pool.query(`UPDATE user_sessions SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'`);

    assert.equal((await c.request('GET', '/api/auth/me')).status, 401);
  });

  test('logout ends the session on the server too', async () => {
    const { c } = await loggedInCustomer();

    assert.equal((await c.request('POST', '/api/auth/logout')).status, 204);

    const { rowCount } = await pool.query('SELECT 1 FROM user_sessions');
    assert.equal(rowCount, 0);
  });
});

describe('temporary password', () => {
  test('a user with a temporary password can only see /me and change the password', async () => {
    await createCustomer();
    const c = client();
    await c.request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });

    const me = await c.request('GET', '/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.mustChangePassword, true);
  });

  test('changing the password clears the flag and lets the user log in with the new one', async () => {
    await createCustomer();
    const c = client();
    await c.request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });

    const change = await c.request('POST', '/api/auth/change-password', {
      currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD,
    });
    assert.equal(change.status, 204);
    assert.equal((await c.request('GET', '/api/auth/me')).body.user.mustChangePassword, false);

    const relogin = await client().request('POST', '/api/auth/login', { phone: PHONE, password: NEW_PASSWORD });
    assert.equal(relogin.status, 200);
  });

  test('rejects a short new password and a wrong current password', async () => {
    await createCustomer();
    const c = client();
    await c.request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });

    const short = await c.request('POST', '/api/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: 'kisa' });
    const wrong = await c.request('POST', '/api/auth/change-password', { currentPassword: 'yanlis', newPassword: NEW_PASSWORD });

    assert.equal(short.body.error.code, 'WEAK_PASSWORD');
    assert.equal(wrong.body.error.code, 'INVALID_CURRENT_PASSWORD');
  });

  test('changing the password logs out other devices but keeps this one', async () => {
    await createCustomer();
    const phoneApp = client();
    const laptop = client();
    await phoneApp.request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });
    await laptop.request('POST', '/api/auth/login', { phone: PHONE, password: TEMP_PASSWORD });

    await phoneApp.request('POST', '/api/auth/change-password', { currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD });

    assert.equal((await phoneApp.request('GET', '/api/auth/me')).status, 200);
    assert.equal((await laptop.request('GET', '/api/auth/me')).status, 401);
  });

  test('an admin reset logs the user out everywhere and requires a new password again', async () => {
    const { c, userId } = await loggedInCustomer();

    await resetPassword({ userId, temporaryPassword: 'yeni-gecici-1' });

    assert.equal((await c.request('GET', '/api/auth/me')).status, 401);
    const relogin = await client().request('POST', '/api/auth/login', { phone: PHONE, password: 'yeni-gecici-1' });
    assert.equal(relogin.body.user.mustChangePassword, true);
  });
});

describe('createUser', () => {
  test('rejects a phone number that is already registered, however it is written', async () => {
    const studio = await createStudio();
    await createUser({ studioId: studio, role: 'customer', fullName: 'A', phone: '05321112233', temporaryPassword: TEMP_PASSWORD });

    await assert.rejects(
      createUser({ studioId: studio, role: 'customer', fullName: 'B', phone: '+90 532 111 22 33', temporaryPassword: TEMP_PASSWORD }),
      (err) => err.code === 'PHONE_TAKEN',
    );
  });
});

test('malformed JSON gets a 400, not a crash', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bozuk',
  });
  assert.equal(res.status, 400);
});
