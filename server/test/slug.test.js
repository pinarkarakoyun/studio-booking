import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { slugProblem } from '../src/slug.js';

// Komut satırı araçları (create-admin, seed:dev) slug'ı veritabanından önce denetler: ham veritabanı
// hatası yerine kuralı anlatan bir mesaj göstermek için. Kural migration 013'teki CHECK ile aynı.
describe('slugProblem', () => {
  test('valid slugs have no problem', () => {
    for (const slug of ['demo', 'ornek-pilates', 'a1b', 'x'.repeat(63)]) {
      assert.equal(slugProblem(slug), null, slug);
    }
  });

  test('format errors explain the rule', () => {
    for (const slug of ['Ornek', 'ab', '-ornek', 'ornek-', 'orn.ek', 'orn ek', 'x'.repeat(64), '', undefined]) {
      assert.match(slugProblem(slug) ?? '', /küçük harf/, String(slug));
    }
  });

  test('reserved names are refused with their own message', () => {
    for (const slug of ['www', 'api', 'admin', 'app', 'mail', 'static', 'assets']) {
      assert.match(slugProblem(slug) ?? '', /ayrılmış/, slug);
    }
  });
});
