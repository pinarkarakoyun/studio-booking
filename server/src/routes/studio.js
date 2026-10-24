import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

// --- Tanıtım sitesi -----------------------------------------------------------------------------
// Gerçek stüdyonun metinleri (eğitmen, adres, fotoğraflar) koda girmez: BRAND_DIR/site.json'dan okunur
// (repo ileride public; örnek dosya: server/site.example.json). Dosya yoksa ya da bir alan eksikse o alan
// boş döner ve ekran yer tutucu gösterir. Fotoğraf adları "/brand/..." adresine çevrilir (logo gibi).
async function readSiteFile() {
  if (!process.env.BRAND_DIR) return {};
  try {
    return JSON.parse(await readFile(path.join(process.env.BRAND_DIR, 'site.json'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('site.json okunamadı:', err.message);
    return {};
  }
}

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
// Sadece dosya adı kabul edilir ("foto1.jpg"): "../" ile marka klasörünün dışına çıkılamaz.
const brandFile = (value) => (text(value) && path.basename(value) === value ? `/brand/${value}` : null);

router.get('/api/site', async (req, res) => {
  const [{ rows: [studio] }, site] = await Promise.all([
    pool.query(
      `SELECT st.name, st.whatsapp_phone, st.logo_url, ss.cancellation_deadline_hours, ss.credit_validity_days
       FROM studios st LEFT JOIN studio_settings ss ON ss.studio_id = st.id
       ORDER BY st.id LIMIT 1`,
    ),
    readSiteFile(),
  ]);
  const instructor = site.instructor ?? {};
  res.json({
    site: {
      studioName: studio?.name ?? null,
      whatsappPhone: studio?.whatsapp_phone ?? null,
      logoUrl: studio?.logo_url ?? null,
      // Sık sorulanlardaki iptal/telafi cevabı Ayarlar'dan: yönetici kuralı değiştirince site de değişir.
      rules: {
        cancellationDeadlineHours: studio?.cancellation_deadline_hours ?? null,
        creditValidityDays: studio?.credit_validity_days ?? null,
      },
      phone: text(site.phone),
      workingHours: text(site.workingHours),
      groupSize: text(site.groupSize),
      equipment: text(site.equipment),
      tagline: text(site.tagline),
      subline: text(site.subline),
      instructor: {
        name: text(instructor.name),
        years: Number.isInteger(instructor.years) ? instructor.years : null,
        bio: text(instructor.bio),
        certificates: Array.isArray(instructor.certificates) ? instructor.certificates.map(text).filter(Boolean) : [],
        photoUrl: brandFile(instructor.photo),
      },
      address: text(site.address),
      mapsUrl: text(site.mapsUrl),
      instagramUrl: text(site.instagramUrl),
      photos: Array.isArray(site.photos)
        ? site.photos.map((p) => ({ url: brandFile(p?.file), alt: text(p?.alt) ?? '' })).filter((p) => p.url)
        : [],
    },
  });
});

export default router;
