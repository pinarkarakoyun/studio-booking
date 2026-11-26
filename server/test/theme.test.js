import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createStudio, pool, resetDb } from './helpers.js';
import { getBaseUrl, useServer } from './http.js';

// /brand/theme.css artık marka klasöründen değil, isteğin stüdyosunun renklerinden üretiliyor.
// client() JSON çözdüğü için burada fetch doğrudan kullanılıyor.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const themeUrl = (host) => `${getBaseUrl(host)}/brand/theme.css`;
const setColours = (id, brand, accent = null) =>
  pool.query('UPDATE studios SET brand_color = $1, accent_color = $2 WHERE id = $3', [brand, accent, id]);

describe('generated theme.css', () => {
  test('a studio without colours gets an empty, valid stylesheet', async () => {
    await createStudio();
    const res = await fetch(themeUrl());
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/css/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.doesNotMatch(await res.text(), /--/);
  });

  test('saved colours become the generated palette', async () => {
    const id = await createStudio();
    await setColours(id, '#e91e63');
    const css = await (await fetch(themeUrl())).text();
    assert.match(css, /^html:root \{/m);
    assert.match(css, /--brand: #e91e63;/);
  });

  test('each studio gets only its own colours', async () => {
    const first = await createStudio();
    await createStudio();
    await setColours(first, '#e91e63');
    for (const host of ['test-2.localhost', 'localhost']) {
      const res = await fetch(themeUrl(host));
      assert.equal(res.status, 200, host);
      assert.doesNotMatch(await res.text(), /--/, host);
    }
    assert.match(await (await fetch(themeUrl('test-1.localhost'))).text(), /--brand: #e91e63;/);
  });

  test('etag changes when colours change; a matching etag gets 304', async () => {
    const id = await createStudio();
    const first = await fetch(themeUrl());
    const etag = first.headers.get('etag');
    assert.ok(etag);
    assert.equal((await fetch(themeUrl(), { headers: { 'if-none-match': etag } })).status, 304);

    await setColours(id, '#1565c0', '#e91e63');
    const changed = await fetch(themeUrl(), { headers: { 'if-none-match': etag } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.match(await changed.text(), /--accent: #e91e63;/);
  });

  test('accent_color only accepts #rrggbb', async () => {
    const id = await createStudio();
    await pool.query("UPDATE studios SET accent_color = '#A0D8EF' WHERE id = $1", [id]);
    await assert.rejects(pool.query("UPDATE studios SET accent_color = 'red' WHERE id = $1", [id]), /studios_accent_color_hex/);
  });
});

// PWA: her stüdyonun kendi uygulama kimliği (ad, renk, ikon). Ana ekrana eklenince stüdyonun adıyla açılır.
describe('web app manifest and icons', () => {
  const manifest = async (host) => {
    const res = await fetch(`${getBaseUrl(host)}/brand/manifest.webmanifest`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/manifest\+json/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    return res.json();
  };

  test("manifest uses the studio's name and colours", async () => {
    const id = await createStudio();
    let m = await manifest();
    assert.equal(m.name, 'Test');
    assert.equal(m.short_name, 'Test');
    assert.equal(m.start_url, '/giris');
    assert.equal(m.display, 'standalone');
    assert.equal(m.lang, 'tr');
    // Renk girilmemiş stüdyo: varsayılan palet (index.css ile aynı).
    assert.equal(m.theme_color, '#4b5530');
    assert.equal(m.background_color, '#f5f0e6');
    assert.deepEqual(m.icons.map((i) => i.src), ['/brand/icon-192.png', '/brand/icon-512.png']);

    await setColours(id, '#e91e63');
    m = await manifest();
    assert.equal(m.theme_color, '#e91e63');
  });

  test('each studio gets its own manifest', async () => {
    await createStudio();
    const second = await createStudio();
    await pool.query(`UPDATE studios SET name = 'İkinci Stüdyo' WHERE id = $1`, [second]);
    assert.equal((await manifest('test-1.localhost')).name, 'Test');
    assert.equal((await manifest('test-2.localhost')).name, 'İkinci Stüdyo');
  });

  test('icon falls back to the default when the studio has none', async () => {
    await createStudio();
    for (const size of [192, 512]) {
      const res = await fetch(`${getBaseUrl()}/brand/icon-${size}.png`);
      assert.equal(res.status, 200, String(size));
      assert.equal(res.headers.get('content-type'), 'image/png');
      const bytes = Buffer.from(await res.arrayBuffer());
      // PNG imzası ve genişlik/yükseklik (IHDR).
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(bytes.readUInt32BE(16), size);
    }
  });

  test('other icon sizes are 404', async () => {
    await createStudio();
    assert.equal((await fetch(`${getBaseUrl()}/brand/icon-64.png`)).status, 404);
  });
});
