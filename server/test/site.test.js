import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
      'address', 'branches', 'courses', 'equipment', 'groupSize', 'hero', 'instagramUrl', 'instructor', 'logoUrl', 'mapsUrl', 'phone',
      'photos', 'privacyNotice', 'quiz', 'reasons', 'rules', 'spotlight', 'stats', 'studioName', 'subline', 'tagline', 'whatsappPhone',
      'workingHours',
    ]);
    // Yeni bölümler site.json yokken boş: ekran bu bölümleri hiç göstermez.
    assert.deepEqual(res.body.site.hero, { eyebrow: null });
    assert.deepEqual(res.body.site.courses, []);
    assert.deepEqual(res.body.site.stats, []);
    assert.equal(res.body.site.quiz, null);
    assert.equal(res.body.site.spotlight, null);
    assert.deepEqual(res.body.site.branches.map(({ badge, description, schedule }) => ({ badge, description, schedule })), [
      { badge: null, description: null, schedule: [] },
    ]);
    // Sadece iki kural; diğer ayarlar (ör. aylık telafi sınırı) sızmaz.
    assert.deepEqual(res.body.site.rules, { cancellationDeadlineHours: 2, creditValidityDays: 7 });
  });

  test("reads the brand folder's site.json; photo names become /brand addresses, paths outside are ignored", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'site-'));
    process.env.BRAND_DIR = dir;
    // Marka dosyaları stüdyo klasöründe: BRAND_DIR/<slug>/ (ilk test stüdyosu test-1).
    await mkdir(path.join(dir, 'test-1'));
    await writeFile(path.join(dir, 'test-1', 'site.json'), JSON.stringify({
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

  test('site.json privacy notice: sections without a title or text are dropped; none at all means null', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'site-'));
    process.env.BRAND_DIR = dir;
    // Marka dosyaları stüdyo klasöründe: BRAND_DIR/<slug>/ (ilk test stüdyosu test-1).
    await mkdir(path.join(dir, 'test-1'));
    await writeFile(path.join(dir, 'test-1', 'site.json'), JSON.stringify({
      privacyNotice: { updatedOn: '2026-11-12', sections: [{ title: 'Veri sorumlusu', text: 'Stüdyo' }, { title: 'Boş' }] },
    }));
    await createStudio();
    const { body } = await client().request('GET', '/api/site');
    assert.deepEqual(body.site.privacyNotice, {
      updatedOn: '2026-11-12', sections: [{ title: 'Veri sorumlusu', text: 'Stüdyo' }],
    });

    await writeFile(path.join(dir, 'test-1', 'site.json'), JSON.stringify({ privacyNotice: { sections: [{ title: 'Boş' }] } }));
    const { body: empty } = await client().request('GET', '/api/site');
    assert.equal(empty.site.privacyNotice, null);
    await rm(dir, { recursive: true });
  });

  test("site.json reasons: incomplete cards are dropped, at most four, other fields don't leak", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'site-'));
    process.env.BRAND_DIR = dir;
    // Marka dosyaları stüdyo klasöründe: BRAND_DIR/<slug>/ (ilk test stüdyosu test-1).
    await mkdir(path.join(dir, 'test-1'));
    const card = (n) => ({ title: `Başlık ${n}`, text: `Metin ${n}` });
    await writeFile(path.join(dir, 'test-1', 'site.json'), JSON.stringify({
      reasons: [card(1), { title: 'Metinsiz' }, { ...card(2), extra: 'x' }, card(3), card(4), card(5)],
    }));
    await createStudio();
    const { body } = await client().request('GET', '/api/site');
    assert.deepEqual(body.site.reasons, [card(1), card(2), card(3), card(4)]);
    await rm(dir, { recursive: true });
  });

  test('site.json courses: incomplete dropped, at most six, link only a section id', async () => {
    const card = (n) => ({ title: `Ders ${n}`, text: `Metin ${n}` });
    await withSite({
      courses: [
        { ...card(1), highlight: true, link: 'test' },
        { title: 'A' },
        { ...card(2), link: 'javascript:alert(1)' },
        card(3), card(4), card(5), card(6), card(7),
      ],
    }, (site) => {
      assert.equal(site.courses.length, 6);
      assert.deepEqual(site.courses[0], { title: 'Ders 1', text: 'Metin 1', highlight: true, link: 'test' });
      assert.deepEqual(site.courses[1], { title: 'Ders 2', text: 'Metin 2', highlight: false, link: null });
      assert.equal(site.courses.at(-1).title, 'Ders 6');
    });
  });

  test('site.json quiz: options must point forward or to an existing result', async () => {
    const result = { id: 'r1', title: 'Sonuç', text: 'Metin' };
    await withSite({
      quiz: {
        title: 'Test',
        intro: 'Giriş',
        questions: [
          { id: 'q1', text: 'Bir', options: [
            { label: 'İleri', next: 'q3' },
            { label: 'Boş soruya', next: 'q2' },
            { label: 'Olmayan sonuç', result: 'yok' },
            { label: 'İkisi birden', next: 'q3', result: 'r1' },
          ] },
          // Tek seçeneği geri dönüyor (döngü): seçeneksiz kalır, soru atılır; ona giden seçenek de atılır.
          { id: 'q2', text: 'İki', options: [{ label: 'Geri', next: 'q1' }] },
          { id: 'q3', text: 'Üç', options: [{ label: 'Bitir', result: 'r1' }] },
        ],
        results: [result],
      },
    }, (site) => {
      assert.equal(site.quiz.title, 'Test');
      assert.deepEqual(site.quiz.questions.map((q) => q.id), ['q1', 'q3']);
      assert.deepEqual(site.quiz.questions[0].options, [{ label: 'İleri', next: 'q3', result: null }]);
      assert.deepEqual(site.quiz.questions[1].options, [{ label: 'Bitir', next: null, result: 'r1' }]);
      assert.deepEqual(site.quiz.results, [result]);
    });

    await withSite({
      quiz: { title: 'Test', questions: [{ id: 'q1', text: 'Bir', options: [{ label: 'A', result: 'r1' }] }], results: [] },
    }, (site) => assert.equal(site.quiz, null));
  });

  test('site.json spotlight and stats: limits', async () => {
    const tab = (n) => ({ label: `S${n}`, meta: 'm', title: `T${n}`, items: ['1', '2', '3', '4', '5', '6', '7'] });
    await withSite({
      spotlight: { eyebrow: 'Öne çıkan', title: 'Program', text: 'Metin', photo: 'p.jpg', tabs: [tab(1), tab(2), tab(3), tab(4), tab(5)] },
      stats: [
        { value: '12', label: 'Yıl' }, { value: '12345678901234567890', label: 'Çok uzun' },
        { value: '500+', label: 'Üye' }, { value: '3', label: 'Şube' }, { value: '9', label: 'Fazla' },
      ],
    }, (site) => {
      assert.equal(site.spotlight.title, 'Program');
      assert.equal(site.spotlight.photoUrl, '/brand/p.jpg');
      assert.equal(site.spotlight.tabs.length, 4);
      assert.equal(site.spotlight.tabs[0].items.length, 6);
      assert.deepEqual(site.stats, [{ value: '12', label: 'Yıl' }, { value: '500+', label: 'Üye' }, { value: '3', label: 'Şube' }]);
    });

    await withSite({ spotlight: { text: 'Başlıksız' } }, (site) => assert.equal(site.spotlight, null));
  });

  test('branch details are matched by exact branch name', async () => {
    const schedule = Array.from({ length: 8 }, (_, i) => ({ day: `Gün ${i}`, classes: 'Reformer' }));
    await withSite({
      branchDetails: [
        { name: 'Merkez', badge: 'Ana şube', description: 'Açıklama', schedule },
        { name: 'Yok', badge: 'Gizli', description: 'Görünmemeli' },
      ],
    }, (site, raw) => {
      assert.equal(site.branches.length, 1);
      assert.equal(site.branches[0].name, 'Merkez');
      assert.equal(site.branches[0].badge, 'Ana şube');
      assert.equal(site.branches[0].description, 'Açıklama');
      assert.equal(site.branches[0].schedule.length, 7);
      assert.equal(raw.includes('Görünmemeli'), false);
    });
  });
  test('site.json links: instagramUrl and mapsUrl only as https, like branch map links in the panel', async () => {
    await withSite({ address: 'Adres', instagramUrl: 'javascript:alert(1)', mapsUrl: 'http://maps.example' }, (site) => {
      assert.equal(site.instagramUrl, null);
      assert.equal(site.mapsUrl, null);
    });
    await withSite({ address: 'Adres', instagramUrl: ' https://instagram.example/studyo ', mapsUrl: 'https://maps.example/x' }, (site) => {
      assert.equal(site.instagramUrl, 'https://instagram.example/studyo');
      assert.equal(site.mapsUrl, 'https://maps.example/x');
    });
  });
});

// Geçici marka klasörüne site.json yazar, ilk test stüdyosunu açar, /api/site cevabıyla check'i çağırır.
async function withSite(siteJson, check) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'site-'));
  process.env.BRAND_DIR = dir;
  try {
    const { rows: [{ count }] } = await pool.query('SELECT count(*)::int AS count FROM studios');
    const slug = `test-${count + 1}`;
    await mkdir(path.join(dir, slug));
    await writeFile(path.join(dir, slug, 'site.json'), JSON.stringify(siteJson));
    await createStudio();
    const res = await client().request('GET', '/api/site');
    await check(res.body.site, JSON.stringify(res.body));
  } finally {
    await rm(dir, { recursive: true });
    await resetDb();
  }
}
