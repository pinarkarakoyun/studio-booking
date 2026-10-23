import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Herkese açık stüdyo bilgisi: giriş ekranı ve tanıtım sitesi kullanır (giriş gerektirmez).
// Sadece zaten herkese açık olan bilgiler döner (isim, WhatsApp hattı, marka rengi).
// Şimdilik tek stüdyo var; çoklu stüdyoda hangi stüdyo olduğu alan adından (domain) belirlenecek.
router.get('/api/studio', async (req, res) => {
  const { rows: [studio] } = await pool.query(
    'SELECT name, whatsapp_phone, brand_color FROM studios ORDER BY id LIMIT 1',
  );
  res.json({
    studio: studio
      ? { name: studio.name, whatsappPhone: studio.whatsapp_phone, brandColor: studio.brand_color }
      : null,
  });
});

export default router;
