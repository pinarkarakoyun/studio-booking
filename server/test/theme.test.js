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
