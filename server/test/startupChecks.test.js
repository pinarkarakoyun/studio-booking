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
const LIMITED = { rolsuper: false, rolcreatedb: false, rolcreaterole: false };

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

  test('production refuses a superuser, weak bcrypt, missing proxy and client, and the demo seed flag', async () => {
    const env = { NODE_ENV: 'production', BCRYPT_COST: '4', ALLOW_DEMO_SEED: '1' };
    const { problems } = await checkStartup({ env, db: pool });
    const text = problems.join('\n');
    for (const word of ['süper kullanıcı', 'BCRYPT_COST', 'TRUST_PROXY', 'CLIENT_DIR', 'ALLOW_DEMO_SEED']) {
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

  test('production refuses to start without a privacy notice', async () => {
    await withClientAndBrand(async (dir) => {
      const env = { NODE_ENV: 'production', TRUST_PROXY: 'loopback', CLIENT_DIR: dir, BRAND_DIR: dir };
      const { problems } = await checkStartup({ env, db: fakeDb(LIMITED) });
      assert.equal(problems.length, 1);
      assert.match(problems[0], /aydınlatma metni/);
    }, { privacy: false });
  });
});
