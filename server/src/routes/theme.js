import { Router } from 'express';
import pool from '../db/pool.js';
import { PALETTE_VERSION, buildPalette, themeCss } from '../theme/palette.js';

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

export default router;
