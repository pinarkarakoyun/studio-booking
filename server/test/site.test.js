import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, beforeEach, describe, test } from 'node:test';
import { createStudio, pool, resetDb } from './helpers.js';
import { client, useServer } from './http.js';

useServer();
after(() => pool.end());
beforeEach(resetDb);

const original = process.env.BRAND_DIR;
afterEach(() => {
  if (original === undefined) delete process.env.BRAND_DIR;
  else process.env.BRAND_DIR = original;
});

describe('public site content', () => {
  test('works without logging in and without a site.json: fields are empty, nothing private leaks', async () => {
    delete process.env.BRAND_DIR;
    await createStudio();
    const res = await client().request('GET', '/api/site');
    assert.equal(res.status, 200);
    assert.equal(res.body.site.studioName, 'Test');
    assert.equal(res.body.site.instructor.name, null);
    assert.deepEqual(res.body.site.photos, []);
    const keys = Object.keys(res.body.site).sort();
    assert.deepEqual(keys, [
      'address', 'equipment', 'groupSize', 'instagramUrl', 'instructor', 'logoUrl', 'mapsUrl', 'phone', 'photos', 'reasons',
      'rules', 'studioName', 'subline', 'tagline', 'whatsappPhone', 'workingHours',
    ]);
    // Sadece iki kural; diğer ayarlar (ör. aylık telafi sınırı) sızmaz.
    assert.deepEqual(res.body.site.rules, { cancellationDeadlineHours: 2, creditValidityDays: 7 });
  });

  test("reads the brand folder's site.json; photo names become /brand addresses, paths outside are ignored", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'site-'));
    process.env.BRAND_DIR = dir;
    await writeFile(path.join(dir, 'site.json'), JSON.stringify({
      tagline: 'Merhaba',
      instructor: { name: 'Eğitmen', years: 8, certificates: ['A', ''], photo: 'e.jpg' },
      photos: [{ file: 's1.jpg', alt: 'Salon' }, { file: '../secret.txt' }],
    }));
    await createStudio();
    const { body } = await client().request('GET', '/api/site');
    assert.equal(body.site.tagline, 'Merhaba');
    assert.deepEqual(body.site.instructor, {
      name: 'Eğitmen', years: 8, bio: null, certificates: ['A'], photoUrl: '/brand/e.jpg',
    });
    assert.deepEqual(body.site.photos, [{ url: '/brand/s1.jpg', alt: 'Salon' }]);
    await rm(dir, { recursive: true });
  });

  test("site.json reasons: incomplete cards are dropped, at most four, other fields don't leak", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'site-'));
    process.env.BRAND_DIR = dir;
    const card = (n) => ({ title: `Başlık ${n}`, text: `Metin ${n}` });
    await writeFile(path.join(dir, 'site.json'), JSON.stringify({
      reasons: [card(1), { title: 'Metinsiz' }, { ...card(2), extra: 'x' }, card(3), card(4), card(5)],
    }));
    await createStudio();
    const { body } = await client().request('GET', '/api/site');
    assert.deepEqual(body.site.reasons, [card(1), card(2), card(3), card(4)]);
    await rm(dir, { recursive: true });
  });
});
