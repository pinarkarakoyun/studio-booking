# Görünüm Ayarları (Renkler) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yönetici panelinden girilen iki renkten (ana, vurgu) bütün tema tonlarını sunucuda türetip `/brand/theme.css` olarak sunmak.

**Architecture:** Saf bir palet modülü iki hex rengi rol değişkenlerine ve uyarılara çevirir. `/brand/theme.css` artık dosyadan değil, isteğin stüdyosunun renklerinden bu modülle üretilir (ETag'li, `no-cache`). Yönetici API'si renkleri okur, kaydeder ve kaydetmeden önizleme döner; Ayarlar sayfasındaki yeni Görünüm kartı bunu kullanır.

**Tech Stack:** Node/Express, PostgreSQL, `node:test`; React + Vite, CSS modülleri.

**Spec:** `docs/superpowers/specs/2026-11-24-appearance-settings-design.md`

**Dal:** `feat/appearance` (`main`'den). Tahmini toplam: ~6–7 saat.

## Global Constraints

- Renk biçimi: `null` ya da `#rrggbb`; girişte büyük/küçük harf kabul, saklanırken küçük harf. `#fff` gibi kısa biçim kabul edilmez. Baştaki/sondaki boşluk kırpılır, boş metin `null` sayılır.
- Okunurluk eşiği: 4.5:1 (WCAG AA). `--ink-faint` hariç.
- Varsayılanlar (`client/src/index.css`): ana `#4b5530`, vurgu `#826330`.
- Türetilen değişkenler: `--brand --brand-strong --brand-soft --on-brand --on-brand-soft --accent --accent-text --accent-hover --accent-disabled --surface --surface-raised --surface-sunken --line --line-strong --ink --ink-soft --ink-faint`. Sabit kalanlar (çıktıda yok): `--danger --on-danger --warning --control-off`, yazı tipleri, boşluklar, yarıçaplar.
- Tema CSS'i yalnızca bu sabit adları ve hesaplanmış `#rrggbb` değerlerini içerir; seçici `html:root`.
- `/brand/theme.css`: her zaman `200`, `Content-Type: text/css; charset=utf-8`, `Cache-Control: no-cache`, `ETag` (renkler + `PALETTE_VERSION`).
- Uyarılar kaydetmeyi engellemez. Uyarı metinleri Türkçe.
- Kodda gerçek stüdyo adı yok. Commit, push ve PR Pınar'da; commit ve PR metinlerinde Claude adı ya da `Co-Authored-By` yok.
- Projede biçimlendirici yok; elle yazılan biçime dokunulmaz.

## Review Focus

1. **Çok açık ana renk** (`#ffffff`, `#ffff00`): buton yazısı koyu seçilmeli, zeminler ve yazılar yine okunur kalmalı → Task 1 testi `very light brand gets dark text on buttons`.
2. **Orta gri ana renk** (`#777777`), beyaz da koyu da 4.5:1'e ulaşamıyor: daha iyisi seçilmeli ve uyarı dönmeli, hata değil → Task 1 testi `mid-grey brand picks the better text colour and warns`.
3. **Renk kaydedildikten sonra eski tema önbellekte**: kayıttan sonra ETag değişmeli, eski ETag ile istek `304` değil `200` almalı → Task 2 testi `etag changes when colours change`.
4. **Kirli giriş** (`" #ABCDEF "`, `"#fff"`, `"red"`, `""`, `123`): kırpılıp küçük harfe çevrilmeli ya da `400 INVALID_COLOR`; boş metin varsayılana dönmeli → Task 3 testi `colour input is trimmed, lower-cased, validated`.
5. **İki stüdyo**: bir stüdyonun rengi diğerinin `theme.css`'ine ya da kök adrese sızmamalı → Task 2 testi `each studio gets only its own colours`.

---

### Task 1 (Görev 1): Palet modülü (TDD) — ~1,5 saat

**Files:**
- Create: `server/src/theme/palette.js`
- Test: `server/test/palette.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_BRAND = '#4b5530'`, `DEFAULT_ACCENT = '#826330'`, `PALETTE_VERSION = 1`
  - `contrastRatio(hexA: string, hexB: string) -> number` (WCAG göreli parlaklık formülü)
  - `buildPalette({ brand: string|null, accent: string|null }) -> { vars: Record<string,string>, warnings: string[] }` — ikisi de `null` ise `{ vars: {}, warnings: [] }`; biri `null` ise o renk için varsayılan kullanılır ve bütün değişkenler üretilir.
  - `themeCss(vars) -> string` — `vars` boşsa yalnızca bir yorum satırı; değilse `html:root { --ad: #rrggbb; … }`.

- [ ] **Step 1: Testleri yaz** (`server/test/palette.test.js`, veritabanı yok)

```js
const COLOURS = ['#4b5530', '#ffffff', '#ffff00', '#000000', '#e91e63', '#1565c0', '#777777', '#a0d8ef'];
const HEX = /^#[0-9a-f]{6}$/;
const SURFACES = ['--surface', '--surface-raised', '--surface-sunken'];

test('no colours means no overrides', () => {
  assert.deepEqual(buildPalette({ brand: null, accent: null }), { vars: {}, warnings: [] });
});
test('every variable is a lower-case #rrggbb and nothing else is emitted', () => {
  for (const brand of COLOURS) {
    const { vars } = buildPalette({ brand, accent: '#826330' });
    assert.deepEqual(Object.keys(vars).sort(), EXPECTED_NAMES.sort()); // Global Constraints'teki 17 ad
    for (const v of Object.values(vars)) assert.match(v, HEX);
  }
});
test('ink, ink-soft and accent-text are readable on every surface', () => {
  for (const brand of COLOURS) for (const accent of COLOURS) {
    const { vars } = buildPalette({ brand, accent });
    for (const s of SURFACES) for (const t of ['--ink', '--ink-soft', '--accent-text'])
      assert.ok(contrastRatio(vars[t], vars[s]) >= 4.5, `${t} on ${s} for ${brand}/${accent}`);
  }
});
test('on-brand is readable on brand and brand-strong, or a warning is returned', () => {
  for (const brand of COLOURS) {
    const { vars, warnings } = buildPalette({ brand, accent: null });
    const ok = contrastRatio(vars['--on-brand'], vars['--brand']) >= 4.5;
    assert.ok(ok || warnings.length > 0, brand);
    assert.ok(contrastRatio(vars['--on-brand'], vars['--brand-strong']) >= 4.5, brand);
  }
});
test('very light brand gets dark text on buttons', () => {
  for (const brand of ['#ffffff', '#ffff00']) {
    const { vars } = buildPalette({ brand, accent: null });
    assert.ok(contrastRatio(vars['--on-brand'], '#000000') > contrastRatio(vars['--on-brand'], '#ffffff'));
  }
});
test('mid-grey brand picks the better text colour and warns', () => {
  const { vars, warnings } = buildPalette({ brand: '#777777', accent: null });
  const other = contrastRatio('#ffffff', '#777777') > contrastRatio('#1a1a1a', '#777777') ? '#1a1a1a' : '#ffffff';
  assert.ok(contrastRatio(vars['--on-brand'], '#777777') >= contrastRatio(other, '#777777'));
  assert.equal(warnings.length, 1);
});
test('a pale accent warns that text uses a darker shade', () => {
  assert.ok(buildPalette({ brand: null, accent: '#a0d8ef' }).warnings.length >= 1);
});
test('default colours reproduce the default palette closely', () => {
  // index.css değerleri; her kanal en fazla 24 farklı olabilir
  const { vars } = buildPalette({ brand: DEFAULT_BRAND, accent: DEFAULT_ACCENT });
  for (const [name, hex] of Object.entries(INDEX_CSS_DEFAULTS)) assertClose(vars[name], hex, 24);
});
test('themeCss writes only html:root declarations', () => {
  assert.doesNotMatch(themeCss({}), /--/);
  const css = themeCss(buildPalette({ brand: '#e91e63', accent: null }).vars);
  assert.match(css, /^html:root \{/m);
  assert.match(css, /--brand: #e91e63;/);
});
```

`EXPECTED_NAMES`: Global Constraints'teki 17 değişken adı. `INDEX_CSS_DEFAULTS`: `client/src/index.css`'teki 17 değişkenin bugünkü değerleri, test dosyasında sabit olarak. `assertClose`: üç kanalın her birinin farkı ≤ tolerans.

- [ ] **Step 2: Çalıştır, kırmızı gör**

Run: `cd server && npm run pretest && DB_NAME=studio_booking_test node --test test/palette.test.js`
Expected: FAIL, `Cannot find module '../src/theme/palette.js'`

- [ ] **Step 3: `palette.js`'i yaz**

Yaklaşım: hex ↔ RGB, `mix(a, b, t)` (sRGB doğrusal karışım). Tonlar karışımla türetilir: `--brand-strong` ana rengin siyahla karışımı, `--brand-soft` beyazla; zeminler bugünkü krem değerlerinin ana renkle çok küçük oranda (≤ %6) karışımı; `--ink` / `--ink-soft` ana rengin koyu karışımları. Okunurluk gereken her çift için eşik geçilene kadar küçük adımlarla koyulaştıran bir `ensureContrast(fg, bg, 4.5)` yardımcısı. Oranları "varsayılan renkler varsayılan palete yakın" testi sabitler. Uyarı metinleri:
- `'Bu ana renkte buton yazısı zor okunur; yazı rengi otomatik seçildi.'`
- `'Vurgu rengi açık zeminde zor okunur; yazılarda koyusu kullanılacak.'`

- [ ] **Step 4: Çalıştır, yeşil gör**

Run: `cd server && DB_NAME=studio_booking_test node --test test/palette.test.js`
Expected: PASS (9 test)

---

### Task 2 (Görev 2): Migration 018 ve üretilen `theme.css` (TDD) — ~1,5 saat

**Files:**
- Create: `server/db/migrations/018_accent_color.sql`
- Create: `server/src/routes/theme.js`
- Modify: `server/src/app.js` (theme router `/brand` static'ten önce)
- Modify: `server/src/scripts/seedDev.js` (`studio.accentColor`)
- Modify: `client/index.html` (yorum: dosya artık sunucuda üretiliyor)
- Test: `server/test/theme.test.js`

**Interfaces:**
- Consumes: `buildPalette`, `themeCss`, `PALETTE_VERSION` (Task 1); `req.studio` (`resolveStudio`, `{ id, slug }`).
- Produces: `GET /brand/theme.css`; `studios.accent_color` sütunu.

- [ ] **Step 1: Testleri yaz** (`server/test/theme.test.js`; `client()` JSON çözdüğü için `fetch(getBaseUrl(host) + '/brand/theme.css')` doğrudan)

```js
test('a studio without colours gets an empty, valid stylesheet', async () => {
  await createStudio();
  const res = await fetch(getBaseUrl() + '/brand/theme.css');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/css/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.doesNotMatch(await res.text(), /--/);
});
test('saved colours become the generated palette', async () => {
  const id = await createStudio();
  await pool.query("UPDATE studios SET brand_color = '#e91e63' WHERE id = $1", [id]);
  assert.match(await (await fetch(getBaseUrl() + '/brand/theme.css')).text(), /--brand: #e91e63;/);
});
test('each studio gets only its own colours', async () => { /* iki stüdyo, birine renk; diğerinin ve
  getBaseUrl('localhost')'un çıktısında "--" yok, ikisi de 200 */ });
test('etag changes when colours change; a matching etag gets 304', async () => {
  // ilk istek → etag1; If-None-Match: etag1 → 304; renk güncelle → If-None-Match: etag1 → 200 ve yeni etag
});
test('accent_color only accepts #rrggbb', async () => {
  const id = await createStudio();
  await assert.rejects(pool.query("UPDATE studios SET accent_color = 'red' WHERE id = $1", [id]));
});
```

- [ ] **Step 2: Çalıştır, kırmızı gör**

Run: `cd server && npm run pretest && DB_NAME=studio_booking_test BASE_DOMAIN=localhost BCRYPT_COST=4 node --test test/theme.test.js`
Expected: FAIL (ilk test 404 alır, son test `column "accent_color" does not exist`)

- [ ] **Step 3: Migration 018**

`ALTER TABLE studios ADD COLUMN accent_color text CONSTRAINT studios_accent_color_hex CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$');` ve `UPDATE studios SET brand_color = NULL;` Dosyanın başına sıfırlamanın sebebini yazan yorum (spec 5.1).

- [ ] **Step 4: `routes/theme.js` ve `app.js`**

`GET /brand/theme.css`: `req.studio` yoksa renkler `null`; varsa `SELECT brand_color, accent_color FROM studios WHERE id = $1`. ETag: `"` + `PALETTE_VERSION` + `-` + iki renk (ya da `none`) + `"`; `req.headers['if-none-match']` eşitse `304`. Router, `app.js`'te `/brand` static middleware'inden önce `app.use(themeRouter)` ile bağlanır.

- [ ] **Step 5: `seedDev.js`**

`STUDIO` varsayılanına `accentColor: null`; INSERT'e `accent_color`. Yorum: demo dosyası `studio.brandColor` / `studio.accentColor` verebilir.

- [ ] **Step 6: Bütün sunucu testleri yeşil**

Run: `cd server && npm test`
Expected: `ℹ fail 0` (338 + yeni testler)

- [ ] **Step 7: Commit durağı (Pınar)** — Görev 1 ve 2 birlikte

```bash
git add server/src/theme server/test/palette.test.js server/db/migrations/018_accent_color.sql server/src/routes/theme.js server/src/app.js server/src/scripts/seedDev.js server/test/theme.test.js client/index.html
git commit -m "feat(theme): generate theme.css from two studio colours"
```

---

### Task 3 (Görev 3): Yönetici API'si (TDD) — ~1 saat

**Files:**
- Create: `server/src/services/adminAppearance.js`
- Modify: `server/src/routes/admin.js` (Ayarlar bölümünün altına üç uç)
- Test: `server/test/adminAppearance.test.js`

**Interfaces:**
- Consumes: `buildPalette` (Task 1); `requireRole('admin')` zaten `/api/admin` için bağlı.
- Produces:
  - `GET /api/admin/appearance` → `200 { appearance: { brandColor: string|null, accentColor: string|null, warnings: string[] } }`
  - `PUT /api/admin/appearance` body `{ brandColor, accentColor }` → aynı biçim; geçersizse `400 { error: { code: 'INVALID_COLOR' } }`
  - `POST /api/admin/appearance/preview` body `{ brandColor, accentColor }` → `200 { preview: { vars, warnings } }`, veritabanına yazmaz
  - Servis: `getAppearance(admin)`, `updateAppearance(admin, input)`, `previewAppearance(input)`; ortak `parseColor(value) -> string|null` (geçersizse `AppError('INVALID_COLOR', 'Renk #rrggbb biçiminde olmalı.', 400)`)

- [ ] **Step 1: Testleri yaz**

```js
test('admin reads and saves colours; theme.css follows', async () => {
  // GET → { brandColor: null, accentColor: null, warnings: [] }
  // PUT { brandColor: '#E91E63', accentColor: null } → brandColor '#e91e63'
  // fetch theme.css → /--brand: #e91e63;/
});
test('colour input is trimmed, lower-cased, validated', async () => {
  // ' #ABCDEF ' → '#abcdef'; '' → null; '#fff', 'red', 123, '#12345g' → 400 INVALID_COLOR ve veritabanı değişmez
});
test('null colours reset to the default palette', async () => { /* PUT null,null → theme.css'te "--" yok */ });
test('preview returns the palette without saving', async () => {
  // POST preview { brandColor: '#777777' } → preview.vars['--brand'] === '#777777', warnings.length === 1;
  // ardından GET → brandColor null
});
test('a customer cannot read or change appearance', async () => { /* üç uç da 403 */ });
test("an admin changes only their own studio's colours", async () => { /* iki stüdyo */ });
```

- [ ] **Step 2: Çalıştır, kırmızı gör** — Expected: FAIL, `404 NOT_FOUND`

- [ ] **Step 3: Servis ve uçlar** — kaydetme `UPDATE studios SET brand_color = $1, accent_color = $2 WHERE id = $3` (stüdyo `admin.studioId`'den, istekten değil); yanıttaki `warnings` kaydedilen renklerden `buildPalette` ile.

- [ ] **Step 4: Yeşil** — Run: `cd server && npm test` · Expected: `ℹ fail 0`

---

### Task 4 (Görev 4): Görünüm kartı (panel) — ~1,5 saat

**Files:**
- Create: `client/src/admin/AppearanceSection.jsx`
- Modify: `client/src/admin/SettingsPage.jsx` (kartı "Stüdyo" kartından sonra ekle; `showToast`'ı geçir)
- Modify: `client/src/admin/Admin.module.css` (renk satırı ve önizleme kutusu için birkaç sınıf; yalnızca rol değişkenleri)

**Interfaces:**
- Consumes: Task 3'ün üç ucu; `api()`; `Button`, `TextField`, `Sheet`; `showToast(tone, text)`.
- Produces: `export default function AppearanceSection({ showToast })`.

- [ ] **Step 1: Kart** — spec 5.5'teki düzen: her renk için `<input type="color">` ve hex `TextField` (ikisi birbirini günceller; metin kutusu boşsa renk seçici varsayılanı gösterir), önizleme (koyu kart, birincil buton, vurgu yazısı), uyarılar (`role="status"`), "Logo marka klasöründen gelir.", "Varsayılana dön", "Kaydet".
- [ ] **Step 2: Önizleme** — değer değiştikten 300 ms sonra `POST /api/admin/appearance/preview`; gelen `vars` yalnızca önizleme kutusunun elemanına `style.setProperty` ile uygulanır (sayfanın geri kalanına değil). Geçersiz hex yazılırken istek atılmaz.
- [ ] **Step 3: Kaydet ve varsayılana dön** — `PUT`; başarıda toast `'Renkler kaydedildi.'` ve `<link href="/brand/theme.css">` öğesinin `href`'i `/brand/theme.css?v=<Date.now()>` yapılır: panel yenilemeden yeni renge geçer. "Varsayılana dön" bir `Sheet` onayıyla iki rengi `null` kaydeder. Sunucu hatası kartın içinde gösterilir.
- [ ] **Step 4: Tarayıcıda dene** (test veritabanı, `.claude/launch.json`'a geçici `DB_NAME`; sonra geri alınır): pembe, sarı, `#777777`; uyarılar; kaydedince panel, üye ekranı ve site yeni renkte; varsayılana dönünce krem/zeytin; 375 ve 1280; konsol temiz (theme.css hatası yok).
- [ ] **Step 5: Lint ve build** — Run: `cd client && npm run lint && npm run build` · Expected: uyarı yok, `✓ built`
- [ ] **Step 6: Commit durağı (Pınar)** — Görev 3 ve 4 birlikte

```bash
git add server/src/services/adminAppearance.js server/src/routes/admin.js server/test/adminAppearance.test.js client/src/admin
git commit -m "feat(admin): appearance card with live preview and contrast warnings"
```

---

### Task 5 (Görev 5): README, son kontrol, inceleme, PR — ~1 saat

**Files:**
- Modify: `README.md` ("Studio branding": `theme.css` artık panelden üretiliyor, marka klasöründe logo, fotoğraflar ve `site.json` kalıyor; "UI conventions" → "Theme override" maddesi; yol haritasında "Appearance settings" kutusu **işaretlenmez**, fiyat kısmı kaldığı için metni "colours done, prices next" olarak güncellenir)

- [ ] **Step 1: README**
- [ ] **Step 2: Kontroller** — `cd server && npm test` (`fail 0`); `cd client && npm run lint && npm run build`; `grep -rn "Tua\|Konyaaltı\|Kepez\|Antalya" client/src server/src` çıktı yok.
- [ ] **Step 3: Bağımsız inceleme** — bütün dal; bulgular düzeltilir (her düzeltmede önce kırmızı test); `.claude/launch.json` geri alınmış mı; günlüğe kısa not.
- [ ] **Step 4: Geliştirme veritabanına migration 018** — önce yedek (`studio-booking-notes/yedek/`), sonra `npm run migrate`. Pınar'a söylenir: marka klasörlerindeki `theme.css` artık okunmuyor.
- [ ] **Step 5: Commit, push, PR (Pınar)**

```bash
git add README.md
git commit -m "docs: appearance settings replace theme.css"
git push -u origin feat/appearance
```

PR başlığı: "Appearance settings: studio colours from the admin panel". Açıklamada Claude adı yok.
