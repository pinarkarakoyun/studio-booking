import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, beforeEach, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { classifyHost, hostnameFromHeader } from '../src/middleware/studio.js';
import { createStudio, pool, resetDb } from './helpers.js';
import { client, getBaseUrl, useServer } from './http.js';

// Stüdyo, isteğin geldiği adresten (Host) belirlenir. Bilinmeyen bir adres hiçbir zaman
// başka bir stüdyoya düşmez (fail closed).
useServer();
after(() => pool.end());
beforeEach(resetDb);

const originalBrandDir = process.env.BRAND_DIR;
afterEach(() => {
  if (originalBrandDir === undefined) delete process.env.BRAND_DIR;
  else process.env.BRAND_DIR = originalBrandDir;
});

// Adı verilen bir stüdyo: /api/studio ve /api/site yanıtlarında hangi stüdyonun döndüğünü görmek için.
async function namedStudio(slug, name) {
  const id = await createStudio({ slug });
  await pool.query('UPDATE studios SET name = $2 WHERE id = $1', [id, name]);
  return id;
}

// Geçici marka klasörü: BRAND_DIR/<slug>/ yapısında.
async function brandDir(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'brand-'));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), content);
  }
  process.env.BRAND_DIR = dir;
  return dir;
}

// Marka dosyası JSON değil, ham içerik olarak alınır.
const rawGet = (host, urlPath) => fetch(getBaseUrl(host) + urlPath);

describe('classifyHost', () => {
  const base = 'siteadi.com';
  const cases = [
    ['siteadi.com', { kind: 'root' }],
    ['www.siteadi.com', { kind: 'root' }],
    ['SITEADI.com', { kind: 'root' }],
    ['ornek.siteadi.com', { kind: 'studio', slug: 'ornek' }],
    ['ORNEK.siteadi.com', { kind: 'studio', slug: 'ornek' }],
    ['a.b.siteadi.com', { kind: 'unknown' }],
    ['ornek.siteadi.com.', { kind: 'unknown' }],
    ['sahte-siteadi.com', { kind: 'unknown' }],
    ['ornek.baska.com', { kind: 'unknown' }],
    ['127.0.0.1', { kind: 'unknown' }],
    ['', { kind: 'unknown' }],
  ];
  // Host başlığından ad çıkarma: port atılır, IPv6 köşeli parantezli adres bozulmaz.
  const headerCases = [
    ['ornek.siteadi.com:5173', 'ornek.siteadi.com'],
    ['ornek.siteadi.com', 'ornek.siteadi.com'],
    ['[::1]:3000', '[::1]'],
    ['', ''],
    [undefined, ''],
  ];
  for (const [header, expected] of headerCases) {
    test(`hostnameFromHeader(${JSON.stringify(header)}) -> ${JSON.stringify(expected)}`, () => {
      assert.equal(hostnameFromHeader(header), expected);
    });
  }
  for (const [hostname, expected] of cases) {
    test(`${hostname || '(boş)'} -> ${expected.kind}`, () => {
      assert.deepEqual(classifyHost(hostname, base), expected);
    });
  }
});

describe('studio from the request host', () => {
  test('root host: no studio, and studio endpoints are not found', async () => {
    await namedStudio('test-1', 'Birinci');
    const studio = await client(null, { host: 'localhost' }).request('GET', '/api/studio');
    assert.equal(studio.status, 200);
    assert.deepEqual(studio.body, { studio: null });

    const site = await client(null, { host: 'localhost' }).request('GET', '/api/site');
    assert.equal(site.status, 404);
    assert.equal(site.body.error.code, 'STUDIO_NOT_FOUND');
  });

  test('unknown slug never falls back to another studio', async () => {
    await namedStudio('test-1', 'Birinci');
    for (const urlPath of ['/api/studio', '/api/site', '/api/auth/me']) {
      const res = await client(null, { host: 'yok.localhost' }).request('GET', urlPath);
      assert.equal(res.status, 404, urlPath);
      assert.equal(res.body.error.code, 'STUDIO_NOT_FOUND', urlPath);
      assert.doesNotMatch(JSON.stringify(res.body), /Birinci/, urlPath);
    }
  });

  test('each host gets its own studio', async () => {
    await namedStudio('test-1', 'Birinci');
    await namedStudio('ikinci', 'İkinci');

    const a = client(null, { host: 'test-1.localhost' });
    const b = client(null, { host: 'ikinci.localhost' });
    assert.equal((await a.request('GET', '/api/studio')).body.studio.name, 'Birinci');
    assert.equal((await b.request('GET', '/api/studio')).body.studio.name, 'İkinci');
    assert.equal((await a.request('GET', '/api/site')).body.site.studioName, 'Birinci');
    assert.equal((await b.request('GET', '/api/site')).body.site.studioName, 'İkinci');
  });

  test('health works on any host', async () => {
    for (const host of ['localhost', 'yok.localhost']) {
      const res = await client(null, { host }).request('GET', '/api/health');
      assert.equal(res.status, 200, host);
    }
  });

  // Proxy'ye güvenildiğinde (TRUST_PROXY) Express'in req.hostname'i X-Forwarded-Host'u tercih eder. Nginx bu başlığı
  // istemciden olduğu gibi geçirebilir: stüdyo, proxy'nin denetlediği Host'tan bağımsız seçilirdi (önbellekte
  // A'nın adresine B'nin yanıtı yazılabilirdi). Stüdyo her zaman Host başlığından belirlenmeli.
  test('the studio comes from Host, not from X-Forwarded-Host, even behind a trusted proxy', async () => {
    await namedStudio('test-1', 'Birinci');
    await namedStudio('ikinci', 'İkinci');
    const saved = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = 'loopback';
    const proxied = createApp().listen(0);
    try {
      await new Promise((resolve) => proxied.once('listening', resolve));
      const res = await fetch(`http://test-1.localhost:${proxied.address().port}/api/studio`, {
        headers: { 'x-forwarded-host': 'ikinci.localhost' },
      });
      assert.equal((await res.json()).studio.name, 'Birinci');
    } finally {
      await new Promise((resolve) => proxied.close(resolve));
      if (saved === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = saved;
    }
  });

  test('createApp fails without BASE_DOMAIN', () => {
    const saved = process.env.BASE_DOMAIN;
    delete process.env.BASE_DOMAIN;
    try {
      assert.throws(() => createApp(), /BASE_DOMAIN/);
    } finally {
      process.env.BASE_DOMAIN = saved;
    }
  });

  test('brand files are per studio', async () => {
    await namedStudio('test-1', 'Birinci');
    await namedStudio('ikinci', 'İkinci');
    const dir = await brandDir({
      'test-1/logo.png': 'logo-birinci',
      'ikinci/logo.png': 'logo-ikinci',
      'ikinci/sadece-ikinci.png': 'gizli',
    });

    assert.equal(await (await rawGet('test-1.localhost', '/brand/logo.png')).text(), 'logo-birinci');
    assert.equal(await (await rawGet('ikinci.localhost', '/brand/logo.png')).text(), 'logo-ikinci');
    // Birinci stüdyonun adresinden ikincinin dosyasına ulaşılamaz.
    assert.equal((await rawGet('test-1.localhost', '/brand/sadece-ikinci.png')).status, 404);
    // "../" ile klasör dışına çıkma denemesi (%2F: fetch düz "../" yolunu kendisi sadeleştirirdi).
    const escape = await rawGet('test-1.localhost', '/brand/..%2Fikinci%2Fsadece-ikinci.png');
    assert.ok(escape.status >= 400 && escape.status < 500, String(escape.status));
    assert.notEqual(await escape.text(), 'gizli');
    // Kök ve bilinmeyen adreste marka dosyası yok.
    assert.equal((await rawGet('localhost', '/brand/logo.png')).status, 404);
    assert.equal((await rawGet('yok.localhost', '/brand/logo.png')).status, 404);
    await rm(dir, { recursive: true });
  });

  test('site.json is per studio', async () => {
    await namedStudio('test-1', 'Birinci');
    await namedStudio('ikinci', 'İkinci');
    const dir = await brandDir({
      'test-1/site.json': JSON.stringify({ tagline: 'Birinci slogan' }),
      'ikinci/site.json': JSON.stringify({ tagline: 'İkinci slogan' }),
    });

    const a = await client(null, { host: 'test-1.localhost' }).request('GET', '/api/site');
    const b = await client(null, { host: 'ikinci.localhost' }).request('GET', '/api/site');
    assert.equal(a.body.site.tagline, 'Birinci slogan');
    assert.equal(b.body.site.tagline, 'İkinci slogan');
    await rm(dir, { recursive: true });
  });
});
