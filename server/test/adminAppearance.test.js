import assert from 'node:assert/strict';
import { after, beforeEach, describe, test } from 'node:test';
import { createAdmin, createCustomer, createStudio, pool, resetDb } from './helpers.js';
import { clientFor, getBaseUrl, useServer } from './http.js';

// Görünüm ayarı: yönetici iki rengi okur, kaydeder ve kaydetmeden önizler. theme.css kaydedilen renkleri izler.
useServer();
after(() => pool.end());
beforeEach(resetDb);

const URL = '/api/admin/appearance';
const themeCss = async (host) => (await fetch(`${getBaseUrl(host)}/brand/theme.css`)).text();

async function setup() {
  const studio = await createStudio();
  return { studio, c: await clientFor(await createAdmin(studio)) };
}

describe('admin appearance', () => {
  test('admin reads and saves colours; theme.css follows', async () => {
    const { c } = await setup();
    const first = await c.request('GET', URL);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.appearance, { brandColor: null, accentColor: null, warnings: [] });

    const saved = await c.request('PUT', URL, { brandColor: '#E91E63', accentColor: null });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.appearance.brandColor, '#e91e63');
    assert.equal(saved.body.appearance.accentColor, null);
    assert.ok(Array.isArray(saved.body.appearance.warnings));
    assert.match(await themeCss(), /--brand: #e91e63;/);
    assert.deepEqual((await c.request('GET', URL)).body.appearance, saved.body.appearance);
  });

  test('colour input is trimmed, lower-cased, validated', async () => {
    const { c } = await setup();
    const ok = await c.request('PUT', URL, { brandColor: ' #ABCDEF ', accentColor: '' });
    assert.equal(ok.body.appearance.brandColor, '#abcdef');
    assert.equal(ok.body.appearance.accentColor, null);

    for (const bad of ['#fff', 'red', 123, '#12345g', 'url(x)']) {
      const res = await c.request('PUT', URL, { brandColor: bad, accentColor: null });
      assert.equal(res.status, 400, String(bad));
      assert.equal(res.body.error.code, 'INVALID_COLOR');
    }
    assert.equal((await c.request('GET', URL)).body.appearance.brandColor, '#abcdef');
  });

  test('null colours reset to the default palette', async () => {
    const { c } = await setup();
    await c.request('PUT', URL, { brandColor: '#1565c0', accentColor: '#e91e63' });
    const reset = await c.request('PUT', URL, { brandColor: null, accentColor: null });
    assert.deepEqual(reset.body.appearance, { brandColor: null, accentColor: null, warnings: [] });
    assert.doesNotMatch(await themeCss(), /--/);
  });

  test('preview returns the palette without saving', async () => {
    const { c } = await setup();
    const res = await c.request('POST', `${URL}/preview`, { brandColor: '#777777', accentColor: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.preview.vars['--brand'], '#777777');
    assert.equal(res.body.preview.warnings.length, 1);
    assert.equal((await c.request('GET', URL)).body.appearance.brandColor, null);

    const bad = await c.request('POST', `${URL}/preview`, { brandColor: 'red', accentColor: null });
    assert.equal(bad.status, 400);
  });

  test('preview of empty colours shows the full default palette, not nothing', async () => {
    // Sayfa stüdyonun kayıtlı rengiyle açık; önizleme kutusu bu rengi miras almasın diye bütün değişkenler gelir.
    const { c } = await setup();
    const res = await c.request('POST', `${URL}/preview`, { brandColor: null, accentColor: '' });
    assert.equal(res.body.preview.vars['--brand'], '#4b5530');
    assert.equal(res.body.preview.vars['--accent'], '#826330');
    assert.deepEqual(res.body.preview.warnings, []);
  });

  test('a customer cannot read or change appearance', async () => {
    const studio = await createStudio();
    const c = await clientFor(await createCustomer(studio));
    assert.equal((await c.request('GET', URL)).status, 403);
    assert.equal((await c.request('PUT', URL, { brandColor: '#e91e63', accentColor: null })).status, 403);
    assert.equal((await c.request('POST', `${URL}/preview`, { brandColor: '#e91e63', accentColor: null })).status, 403);
  });

  test("an admin changes only their own studio's colours", async () => {
    const first = await createStudio();
    const second = await createStudio();
    const c = await clientFor(await createAdmin(second));
    await c.request('PUT', URL, { brandColor: '#e91e63', accentColor: null });
    const { rows } = await pool.query('SELECT id, brand_color FROM studios ORDER BY id');
    assert.deepEqual(rows, [{ id: first, brand_color: null }, { id: second, brand_color: '#e91e63' }]);
    assert.doesNotMatch(await themeCss('test-1.localhost'), /--/);
  });
});
