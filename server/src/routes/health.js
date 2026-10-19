import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/api/health', async (req, res) => {
  try {
    // En basit sorgu: veritabanına gerçekten ulaşabiliyor muyuz diye test eder.
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (err) {
    // Hata detayını sadece sunucu loguna yazıyoruz; istemciye sızdırmıyoruz (güvenlik).
    console.error('Health check failed:', err);
    res.status(500).json({ status: 'error', database: 'unreachable' });
  }
});

export default router;
