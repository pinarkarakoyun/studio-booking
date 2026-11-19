import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, beforeEach, describe, test } from 'node:test';
import {
  createAdmin, createBranch, createCustomer, createGroup, createSessionToday, createStudio, pool, resetDb,
} from './helpers.js';
import { client, clientFor, useServer } from './http.js';

// Yanıtlarda şube: yönetici listeleri, ayarlar, stüdyo bilgisi ve tanıtım sitesi.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const originalBrandDir = process.env.BRAND_DIR;
afterEach(() => {
  if (originalBrandDir === undefined) delete process.env.BRAND_DIR;
  else process.env.BRAND_DIR = originalBrandDir;
});

async function twoBranches() {
  const studio = await createStudio();
  const kuzey = await createBranch(studio, { name: 'Kuzey' });
  const admin = await clientFor(await createAdmin(studio));
  return { studio, kuzey, admin };
}

describe('admin lists show the branch', () => {
  test('today lists each session with its branch', async () => {
    const { studio, kuzey, admin } = await twoBranches();
    await createSessionToday(await createGroup(studio, { branchId: kuzey }), '23:00');

    const { body } = await admin.request('GET', '/api/admin/today');
    assert.deepEqual(body.sessions.map((s) => s.branch), [{ id: kuzey, name: 'Kuzey' }]);
  });

  test("customer list, detail and payments show the branch of today's group; null without a group", async () => {
    const { studio, kuzey, admin } = await twoBranches();
    const member = await createCustomer(studio, await createGroup(studio, { branchId: kuzey }));
    const loner = await createCustomer(studio);

    const { body: list } = await admin.request('GET', '/api/admin/customers');
    const byId = Object.fromEntries(list.customers.map((c) => [c.id, c.branchName]));
    assert.deepEqual(byId, { [member]: 'Kuzey', [loner]: null });

    const { body: detail } = await admin.request('GET', `/api/admin/customers/${member}`);
    assert.equal(detail.customer.branchName, 'Kuzey');

    const { body: payments } = await admin.request('GET', '/api/admin/payments');
    const noMembership = Object.fromEntries(payments.noMembership.map((p) => [p.customerId, p.branchName]));
    assert.deepEqual(noMembership, { [member]: 'Kuzey', [loner]: null });
  });
});

describe('settings', () => {
  test('expose and save makeupOtherBranches; branchCount counts open branches', async () => {
    const { admin } = await twoBranches();
    const { body: { settings } } = await admin.request('GET', '/api/admin/settings');
    assert.equal(settings.makeupOtherBranches, true);
    assert.equal(settings.branchCount, 2);

    const saved = await admin.request('PUT', '/api/admin/settings', { ...settings, makeupOtherBranches: false });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.settings.makeupOtherBranches, false);
  });

  test('branchCount reflects closing and reopening a branch', async () => {
    const { kuzey, admin } = await twoBranches();
    const count = async () => (await admin.request('GET', '/api/admin/settings')).body.settings.branchCount;
    assert.equal(await count(), 2);
    await admin.request('POST', `/api/admin/branches/${kuzey}/close`, {});
    assert.equal(await count(), 1);
    await admin.request('POST', `/api/admin/branches/${kuzey}/reopen`, {});
    assert.equal(await count(), 2);
  });
});

describe('studio and public site', () => {
  test('/api/studio returns branchCount', async () => {
    await twoBranches();
    const { body } = await client().request('GET', '/api/studio');
    assert.equal(body.studio.branchCount, 2);
  });

  async function brandWithAddress() {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'branches-site-'));
    await mkdir(path.join(dir, 'test-1'));
    await writeFile(path.join(dir, 'test-1', 'site.json'), JSON.stringify({ address: 'Eski adres', mapsUrl: 'https://maps.example.com/eski' }));
    process.env.BRAND_DIR = dir;
    return dir;
  }

  test('/api/site lists open branches and falls back to site.json while no branch has an address', async () => {
    const { studio } = await twoBranches();
    await createBranch(studio, { name: 'Kapalı', isActive: false });
    const dir = await brandWithAddress();

    const { body } = await client().request('GET', '/api/site');
    assert.deepEqual(body.site.branches, [
      { name: 'Merkez', address: null, mapsUrl: null },
      { name: 'Kuzey', address: null, mapsUrl: null },
    ]);
    assert.equal(body.site.address, 'Eski adres');
    assert.equal(body.site.mapsUrl, 'https://maps.example.com/eski');
    await rm(dir, { recursive: true });
  });

  // Review Focus: bir şubeye adres girilince site artık şube adreslerini kullanır; site.json'a dönülmez.
  test('site uses branch addresses once any is filled', async () => {
    const { kuzey } = await twoBranches();
    await pool.query("UPDATE branches SET address = 'Kuzey Mah. 5', maps_url = 'https://maps.example.com/k' WHERE id = $1", [kuzey]);
    const dir = await brandWithAddress();

    const { body } = await client().request('GET', '/api/site');
    assert.deepEqual(body.site.branches, [
      { name: 'Merkez', address: null, mapsUrl: null },
      { name: 'Kuzey', address: 'Kuzey Mah. 5', mapsUrl: 'https://maps.example.com/k' },
    ]);
    assert.equal(body.site.address, null);
    assert.equal(body.site.mapsUrl, null);
    await rm(dir, { recursive: true });
  });
});
