import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createUser, resetLoginAttempts } from '../src/services/auth.js';
import { createStudio, pool, resetDb } from './helpers.js';
import { client, getBaseUrl, useServer } from './http.js';

// Küçük sınırlarla: 3 hatalı giriş, dakikada 40 API isteği. Testlerin hepsi aynı IP'den (localhost) gelir.
// Sınır sayaçları sunucu açıkken birikir; testler bu sıraya göre yazıldı.
useServer({ rateLimits: { loginFailuresPer15Min: 3, apiRequestsPerMinute: 40 } });
after(() => pool.end());

beforeEach(async () => {
  await resetDb();
  resetLoginAttempts();
});

const PHONE = '0532 111 22 33';
const PASSWORD = 'gecici-sifre-1';

describe('security headers', () => {
  test('CSP forbids framing and outside scripts; the server does not name itself', async () => {
    const res = await fetch(`${getBaseUrl()}/api/health`);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('an unknown API address gets a JSON 404, not the web page', async () => {
    const res = await client().request('GET', '/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});

describe('login limits', () => {
  test('oversized or malformed input is rejected like a wrong password, without touching the counter', async () => {
    const studio = await createStudio();
    await createUser({ studioId: studio, role: 'customer', fullName: 'Ayşe', phone: PHONE, temporaryPassword: PASSWORD });

    const longPhone = await client().request('POST', '/api/auth/login', { phone: '5'.repeat(5000), password: 'x' });
    const objectPhone = await client().request('POST', '/api/auth/login', { phone: { $ne: '' }, password: 'x' });
    const longPassword = await client().request('POST', '/api/auth/login', { phone: PHONE, password: 'a'.repeat(5000) });
    for (const res of [longPhone, objectPhone, longPassword]) {
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    }
    // Bu üç istek IP sayacına girdi (3/3), ama telefon sayacına girmedi: doğru şifre çalışmalı mı?
    // IP sınırı dolduğu için 429 bekliyoruz; telefon sınırı olsaydı kod TOO_MANY_ATTEMPTS olurdu.
    const right = await client().request('POST', '/api/auth/login', { phone: PHONE, password: PASSWORD });
    assert.equal(right.status, 429);
    assert.equal(right.body.error.code, 'TOO_MANY_REQUESTS');
  });
});

describe('API limit', () => {
  test('too many requests from one address are refused with 429', async () => {
    const statuses = [];
    for (let i = 0; i < 45; i += 1) {
      statuses.push((await fetch(`${getBaseUrl()}/api/health`)).status);
    }
    assert.ok(statuses.includes(200));
    assert.equal(statuses.at(-1), 429);
  });
});
