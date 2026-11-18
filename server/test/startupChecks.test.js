import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { checkStartup } from '../src/startupChecks.js';
import { pool } from './helpers.js';

after(() => pool.end());

// Rolün yetkilerini taklit eden sahte veritabanı: gerçek test rolü süper kullanıcı olduğu için.
const fakeDb = (role) => ({ query: async () => ({ rows: [role] }) });
const LIMITED = { rolsuper: false, rolcreatedb: false, rolcreaterole: false, owns_objects: false };

// Derlenmiş istemci (index.html) ve aydınlatma metni olan bir marka klasörü.
async function withClientAndBrand(work, { privacy = true } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'deploy-'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html>');
  const notice = { updatedOn: '2026-11-12', sections: [{ title: 'Veri sorumlusu', text: 'Örnek Stüdyo' }] };
  await writeFile(path.join(dir, 'site.json'), JSON.stringify(privacy ? { privacyNotice: notice } : {}));
  try {
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true });
  }
}

describe('startup checks', () => {
  test('refuses to start without an explicit NODE_ENV', async () => {
    const { problems } = await checkStartup({ env: {}, db: fakeDb(LIMITED) });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /NODE_ENV/);
  });

  test('development starts with a powerful role, with a warning', async () => {
    const { problems, warnings } = await checkStartup({ env: { NODE_ENV: 'development' }, db: pool });
    assert.deepEqual(problems, []);
    assert.equal(warnings.length, 1);
  });

  // Gerçek veritabanıyla: test rolü hem süper kullanıcı hem de tabloların sahibi (migration'ları o çalıştırdı).
  // Böylece sahiplik sorgusunun kendisi de gerçek PostgreSQL'e karşı denenmiş olur.
  test('production refuses a superuser, a table owner, weak bcrypt, missing proxy and client, and the demo seed flag', async () => {
    const env = { NODE_ENV: 'production', BCRYPT_COST: '4', ALLOW_DEMO_SEED: '1' };
    const { problems } = await checkStartup({ env, db: pool });
    const text = problems.join('\n');
    for (const word of ['süper kullanıcı', 'tabloların sahibi', 'BCRYPT_COST', 'TRUST_PROXY', 'CLIENT_DIR', 'ALLOW_DEMO_SEED']) {
      assert.match(text, new RegExp(word));
    }
  });

  test('production starts with a limited role and complete settings', async () => {
    await withClientAndBrand(async (dir) => {
      const env = { NODE_ENV: 'production', TRUST_PROXY: 'loopback', CLIENT_DIR: dir, BRAND_DIR: dir };
      const { problems } = await checkStartup({ env, db: fakeDb(LIMITED) });
      assert.deepEqual(problems, []);
    });
  });

  test('production refuses a role that owns the tables, even without superuser rights', async () => {
    await withClientAndBrand(async (dir) => {
      const env = { NODE_ENV: 'production', TRUST_PROXY: 'loopback', CLIENT_DIR: dir, BRAND_DIR: dir };
      const { problems } = await checkStartup({ env, db: fakeDb({ ...LIMITED, owns_objects: true }) });
      assert.equal(problems.length, 1);
      assert.match(problems[0], /tabloların sahibi/);
    });
  });

  test('production refuses a TRUST_PROXY value Express cannot use, with a clear message', async () => {
    await withClientAndBrand(async (dir) => {
      for (const value of ['true', '*', 'yes']) {
        const env = { NODE_ENV: 'production', TRUST_PROXY: value, CLIENT_DIR: dir, BRAND_DIR: dir };
        const { problems } = await checkStartup({ env, db: fakeDb(LIMITED) });
        assert.equal(problems.length, 1, value);
        assert.match(problems[0], /TRUST_PROXY/);
      }
    });
  });

  // Sayı ("1") "önümdeki ilk bağlantı proxy'dir" demek. Sunucu tüm ağı dinliyorsa ve port dışarıdan erişilebilirse,
  // herkes kendini proxy gibi gösterip sahte X-Forwarded-For ile IP sınırını aşabilir.
  test('production warns when a proxy hop count is trusted while listening on all interfaces', async () => {
    await withClientAndBrand(async (dir) => {
      const base = { NODE_ENV: 'production', TRUST_PROXY: '1', CLIENT_DIR: dir, BRAND_DIR: dir };
      const exposed = await checkStartup({ env: { ...base, HOST: '0.0.0.0' }, db: fakeDb(LIMITED) });
      assert.deepEqual(exposed.problems, []);
      assert.equal(exposed.warnings.length, 1);
      assert.match(exposed.warnings[0], /X-Forwarded-For/);

      const local = await checkStartup({ env: base, db: fakeDb(LIMITED) });
      assert.deepEqual(local.warnings, []);
    });
  });

  test('production refuses to start without a privacy notice', async () => {
    await withClientAndBrand(async (dir) => {
      const env = { NODE_ENV: 'production', TRUST_PROXY: 'loopback', CLIENT_DIR: dir, BRAND_DIR: dir };
      const { problems } = await checkStartup({ env, db: fakeDb(LIMITED) });
      assert.equal(problems.length, 1);
      assert.match(problems[0], /aydınlatma metni/);
    }, { privacy: false });
  });
});
