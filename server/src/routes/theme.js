import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { DEFAULT_BRAND, PALETTE_VERSION, buildPalette, themeCss } from '../theme/palette.js';

const router = Router();

// Stüdyonun tema dosyası: yönetici panelindeki iki renkten üretilir (artık marka klasöründeki theme.css okunmaz).
// Her zaman geçerli bir CSS döner: renk yoksa ya da stüdyo bulunamadıysa yalnızca bir yorum (varsayılan renkler
// index.css'ten gelir). Tarayıcı her açılışta sorar (no-cache); değişmediyse ETag sayesinde 304 alır. ETag'e palet
// sürümü de girer: ton hesabı değişirse renkler aynı kalsa da yeni dosya gider. app.js'te /brand static'ten önce.
router.get('/brand/theme.css', async (req, res) => {
  let colours = { brand: null, accent: null };
  if (req.studio) {
    const { rows: [row] } = await pool.query('SELECT brand_color, accent_color FROM studios WHERE id = $1', [req.studio.id]);
    colours = { brand: row?.brand_color?.toLowerCase() ?? null, accent: row?.accent_color?.toLowerCase() ?? null };
  }
  const etag = `"${PALETTE_VERSION}-${colours.brand ?? 'none'}-${colours.accent ?? 'none'}"`;
  res.set({ 'Cache-Control': 'no-cache', ETag: etag });
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.type('text/css').send(themeCss(buildPalette(colours).vars));
});

// --- PWA: ana ekrana eklenebilir uygulama ---------------------------------------------------------
// Her stüdyonun kendi uygulama kimliği: ad, renk ve ikon. Service worker yok (çevrimdışı önbellek yok): üye her
// açılışta güncel ders listesini görür. Tasarım: docs/superpowers/specs/2026-11-27-member-experience-and-admin-polish-design.md

// index.css'teki varsayılan sayfa zemini (--surface): renk girilmemiş stüdyonun açılış ekranı.
const DEFAULT_SURFACE = '#f5f0e6';
const ICON_SIZES = new Set(['192', '512']);
const DEFAULT_ICON_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets');

router.get('/brand/manifest.webmanifest', async (req, res) => {
  let name = 'Pilates Rezervasyon';
  let colours = { brand: null, accent: null };
  if (req.studio) {
    const { rows: [row] } = await pool.query('SELECT name, brand_color, accent_color FROM studios WHERE id = $1', [req.studio.id]);
    name = row.name;
    colours = { brand: row.brand_color, accent: row.accent_color };
  }
  const { vars } = buildPalette(colours);
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(JSON.stringify({
    name,
    short_name: name,
    lang: 'tr',
    // Ana ekrandan açılınca giriş adresi: oturum açıksa doğrudan derslere geçer.
    start_url: '/giris',
    scope: '/',
    display: 'standalone',
    theme_color: vars['--brand'] ?? DEFAULT_BRAND,
    background_color: vars['--surface'] ?? DEFAULT_SURFACE,
    icons: [...ICON_SIZES].map((size) => ({
      src: `/brand/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any',
    })),
  }));
});

// Stüdyonun ikonu marka klasöründen (BRAND_DIR/<slug>/icon-192.png); yoksa markasız varsayılan ikon.
// Yol yalnızca veritabanındaki slug ve sabit boyut listesinden kurulur; istekten gelen metin yola girmez.
router.get('/brand/icon-:size.png', async (req, res) => {
  const { size } = req.params;
  if (!ICON_SIZES.has(size)) throw new AppError('NOT_FOUND', 'Bulunamadı.', 404);
  const file = `icon-${size}.png`;
  let dir = DEFAULT_ICON_DIR;
  if (process.env.BRAND_DIR && req.studio) {
    const studioDir = path.join(process.env.BRAND_DIR, req.studio.slug);
    if (await access(path.join(studioDir, file)).then(() => true, () => false)) dir = studioDir;
  }
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(file, { root: dir });
});

export default router;
