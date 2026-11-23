# Sitede Fiyatlar Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `site.json`'daki isteğe bağlı `pricing` bölümünü sitede "Fiyatlar" kartları olarak göstermek.

**Architecture:** `/api/site` diğer `site.json` bölümleri gibi `pricing`'i alan alan doğrular (`readPricing`); site, Dersler bölümünün kalıbında yeni bir `Pricing` bölümü çizer ve menüye ekler.

**Tech Stack:** Express, `node:test`; React + CSS modülleri.

**Spec:** `docs/superpowers/specs/2026-11-24-site-pricing-design.md`

**Dal:** `feat/site-pricing` (`main`'den). Tahmini toplam: ~1,5–2 saat.

## Global Constraints

- `name`, `price` zorunlu metin (kırpılır); `detail`, `badge` isteğe bağlı metin; `badge` en fazla 20 karakter (uzunsa yalnızca rozet atılır, kart kalır); `highlight` yalnızca `true` ise; en fazla 4 kart; geçerli kart yoksa `pricing: null`.
- `eyebrow`, `title`, `note` isteğe bağlı metin; varsayılanlar: üst başlık "Fiyatlar", başlık "Sana uyan paketi seç".
- Bölüm Eğitmen'den sonra, "Nasıl işler"den önce; bölüm kimliği `fiyatlar`; menü etiketi `eyebrow` ya da "Fiyatlar".
- "Bilgi al" WhatsApp mesajı sabit: `Merhaba, paketleriniz hakkında bilgi almak istiyorum.` Kartın adı mesaja eklenmez. Numara yoksa bağlantı yok.
- Kodda gerçek stüdyo adı yok. Commit, push ve PR Pınar'da; Claude adı yok.

## Review Focus

1. **`plans` dizi değil ya da hiç yok** → `pricing: null`, bölüm ve menü bağlantısı yok → Task 1 testi `pricing without valid plans is null`.
2. **Fiyat tırnaksız sayı yazılmış** (`"price": 3200`) → o kart atılır, diğerleri kalır (sitenin geri kalanı bozulmaz) → Task 1 testi `site.json pricing: incomplete plans dropped, limits`.
3. **Çok uzun rozet** → rozet atılır, kart kalır → aynı test.
4. **WhatsApp numarası yok** → kartlar görünür, "Bilgi al" bağlantısı çizilmez → Task 2 Step 3 tarayıcı kontrolü.
5. **`highlight: "true"` (metin)** → koyu kart değil → Task 1 testi.

---

### Task 1 (Görev 1): `readPricing` (TDD) — ~30 dk

**Files:**
- Modify: `server/src/routes/studio.js` (`readSpotlight`'ın yanına `readPricing`; `/api/site` yanıtına `pricing`)
- Modify: `server/site.example.json` (`pricing` örneği)
- Test: `server/test/site.test.js` (mevcut `withSite` yardımcısıyla); ilk testteki alan listesine `pricing` eklenir

**Interfaces:**
- Produces: `readPricing(site) -> { eyebrow: string|null, title: string|null, note: string|null, plans: Array<{ name, price, detail: string|null, badge: string|null, highlight: boolean }> } | null`; `/api/site` yanıtında `site.pricing`.

- [ ] **Step 1: Testleri yaz**

```js
test('site.json pricing: incomplete plans dropped, limits', async () => {
  const plan = (n) => ({ name: `${n} Seans`, price: `${n}00 ₺` });
  await withSite({ pricing: { eyebrow: ' Paketler ', title: 'Seç', note: 'KDV dahil', extra: 'x', plans: [
    { ...plan(8), detail: 'Haftada 2', badge: 'EN POPÜLER', highlight: true, extra: 'x' },
    { name: '12 Seans', price: 4200 },            // sayı: atılır
    { price: '1 ₺' },                              // adsız: atılır
    { ...plan(12), badge: 'x'.repeat(21), highlight: 'true' },
    plan(16), plan(20), plan(24),
  ] } }, (site) => {
    assert.deepEqual(site.pricing, {
      eyebrow: 'Paketler', title: 'Seç', note: 'KDV dahil',
      plans: [
        { name: '8 Seans', price: '800 ₺', detail: 'Haftada 2', badge: 'EN POPÜLER', highlight: true },
        { name: '12 Seans', price: '1200 ₺', detail: null, badge: null, highlight: false },
        { name: '16 Seans', price: '1600 ₺', detail: null, badge: null, highlight: false },
        { name: '20 Seans', price: '2000 ₺', detail: null, badge: null, highlight: false },
      ],
    });
  });
});
test('pricing without valid plans is null', async () => {
  for (const pricing of [undefined, {}, { plans: 'x' }, { title: 'Fiyatlar', plans: [{ name: 'Adsız fiyat' }] }]) {
    await withSite({ pricing }, (site) => assert.equal(site.pricing, null));
  }
});
```

- [ ] **Step 2: Kırmızı gör** — Run: `cd server && npm run pretest && DB_NAME=studio_booking_test BASE_DOMAIN=localhost BCRYPT_COST=4 node --test test/site.test.js` · Expected: FAIL (`site.pricing` undefined)
- [ ] **Step 3: `readPricing`'i yaz** — mevcut `text()` ve `list(value, 4)` yardımcılarıyla; `badge` 20 karakteri aşarsa `null`.
- [ ] **Step 4: Yeşil** — Run: `cd server && npm test` · Expected: `ℹ fail 0`

---

### Task 2 (Görev 2): `Pricing` bölümü ve menü — ~45 dk

**Files:**
- Create: `client/src/site/Pricing.jsx`
- Modify: `client/src/site/siteParts.js` (`visibleSections`: `egitmen`'den sonra `{ id: 'fiyatlar', label: site.pricing?.eyebrow ?? 'Fiyatlar', show: Boolean(site.pricing) }`)
- Modify: `client/src/site/PublicSite.jsx` (Eğitmen'den sonra `visible.has('fiyatlar') && <Pricing pricing={site.pricing} whatsappPhone={site.whatsappPhone} />`)
- Modify: `client/src/site/PublicSite.module.css` (fiyat kartı: büyük serif fiyat, rozet; yalnızca rol değişkenleri; hareket azaltma bloğuna yeni geçişler)

**Interfaces:**
- Consumes: `site.pricing` (Task 1); `whatsappLink(phone, message)` (`siteParts.js`).
- Produces: `export default function Pricing({ pricing, whatsappPhone })`.

- [ ] **Step 1: Bölüm** — `<section id="fiyatlar" aria-labelledby="fiyatlar-baslik">`; üst başlık, başlık, `<ul>` kartlar (Dersler kartlarının sınıfları + `cardDark` öne çıkan için), rozet `<span>`, büyük fiyat, ayrıntı, "Bilgi al" bağlantısı (`target="_blank" rel="noreferrer"`), altta `note`. Kart anahtarı `${index}-${name}` (tekrar eden adlar uyarı vermesin).
- [ ] **Step 2: Lint ve build** — Run: `cd client && npm run lint && npm run build` · Expected: uyarı yok, `✓ built`
- [ ] **Step 3: Tarayıcı** (test veritabanı, geçici `launch.json`, sonra geri): demo'da 2–3 kart (biri öne çıkan, rozetli), menüde "Fiyatlar" bağlantısı bölüme gidiyor; `pricing` silinince bölüm ve menü bağlantısı yok; WhatsApp numarası boşken "Bilgi al" yok; 375 ve 1280; konsol temiz.

---

### Task 3 (Görev 3): İçerik, README, inceleme, PR — ~30 dk

**Files:**
- Modify (repo dışı): `studio-booking-brands/tua/site.json` (8 Seans 3.200 ₺ "Haftada 2 ders"; 12 Seans 4.200 ₺ "Haftada 3 ders", "EN POPÜLER", öne çıkan; `_not`'a "fiyatlar açılış kampanyasından, görüşmede güncellenecek"), `studio-booking-notes/marka/demo/site.json` (deneme kartları). Her düzenlemeden sonra `JSON.parse` ile denenir.
- Modify: `README.md` (`site.json` tablosuna `pricing` satırı; Public page listesine "prices"; yol haritası maddesi: "Appearance settings: brand and accent colours … and prices on the public page" işaretlenir, logo yükleme "later" notu kalır)

- [ ] **Step 1: İçerik ve README**
- [ ] **Step 2: Kontroller** — `cd server && npm test` (`fail 0`); `cd client && npm run lint && npm run build`; `grep -rn "Tua\|Konyaaltı\|Kepez\|Antalya" client/src server/src server/site.example.json` çıktı yok.
- [ ] **Step 3: Bağımsız inceleme** (bütün dal), önemli bulgular önce kırmızı testle düzeltilir; günlüğe not.
- [ ] **Step 4: Commit durağı, push, PR (Pınar)**

```bash
git add docs/superpowers/specs/2026-11-24-site-pricing-design.md docs/superpowers/plans/2026-11-24-site-pricing.md server/src/routes/studio.js server/site.example.json server/test/site.test.js client/src/site README.md
git commit -m "feat(site): optional prices section from site.json"
git push -u origin feat/site-pricing
```

PR başlığı: "Public site: optional prices section". Açıklamada Claude adı yok.
