import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Herkese açık stüdyo bilgisi: giriş ekranı, müşteri ekranı ve tanıtım sitesi kullanır (giriş gerektirmez).
// Sadece zaten herkese açık olan bilgiler döner: isim, logo, WhatsApp hattı, marka rengi, saat dilimi ve
// müşterinin bilmesi gereken kural (iptal edince hakkın kaç gün geçerli olduğu).
// Şimdilik tek stüdyo var; çoklu stüdyoda hangi stüdyo olduğu alan adından (domain) belirlenecek.
router.get('/api/studio', async (req, res) => {
  const { rows: [studio] } = await pool.query(
    `
    SELECT st.name, st.whatsapp_phone, st.brand_color, st.logo_url, st.timezone, ss.credit_validity_days
    FROM studios st
    LEFT JOIN studio_settings ss ON ss.studio_id = st.id
    ORDER BY st.id
    LIMIT 1
    `,
  );
  res.json({
    studio: studio
      ? {
        name: studio.name,
        whatsappPhone: studio.whatsapp_phone,
        brandColor: studio.brand_color,
        logoUrl: studio.logo_url,
        timezone: studio.timezone,
        creditValidityDays: studio.credit_validity_days,
      }
      : null,
  });
});

export default router;
