import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { requireStudio } from '../middleware/studio.js';

const router = Router();

// Herkese açık stüdyo bilgisi: giriş ekranı, müşteri ekranı ve tanıtım sitesi kullanır (giriş gerektirmez).
// Sadece zaten herkese açık olan bilgiler döner: isim, logo, WhatsApp hattı, marka rengi, saat dilimi ve
// müşterinin bilmesi gereken kural (iptal edince hakkın kaç gün geçerli olduğu).
// Hangi stüdyo olduğu adresten belirlenir (middleware/studio.js). İstemci bu uçla üç durumu ayırır:
// stüdyo adresi (stüdyo bilgisi), kök adres ({ studio: null }, ürün sayfası), bilinmeyen adres (404).
router.get('/api/studio', async (req, res) => {
  if (req.hostKind === 'unknown') {
    throw new AppError('STUDIO_NOT_FOUND', 'Stüdyo bulunamadı.', 404);
  }
  if (req.hostKind === 'root') {
    return res.json({ studio: null });
  }
  const { rows: [studio] } = await pool.query(
    `
    SELECT st.name, st.whatsapp_phone, st.brand_color, st.logo_url, st.timezone, ss.credit_validity_days,
           (SELECT count(*)::int FROM branches b WHERE b.studio_id = st.id AND b.is_active) AS branch_count
    FROM studios st
    LEFT JOIN studio_settings ss ON ss.studio_id = st.id
    WHERE st.id = $1
    `,
    [req.studio.id],
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
        // Üye ekranları şube adını yalnızca açık şube sayısı 1'den fazlaysa gösterir.
        branchCount: studio.branch_count,
      }
      : null,
  });
});

// --- Tanıtım sitesi -----------------------------------------------------------------------------
// Gerçek stüdyonun metinleri (eğitmen, adres, fotoğraflar) koda girmez: BRAND_DIR/<slug>/site.json'dan okunur
// (repo ileride public; örnek dosya: server/site.example.json). Dosya yoksa ya da bir alan eksikse o alan
// boş döner ve ekran yer tutucu gösterir. Fotoğraf adları "/brand/..." adresine çevrilir (logo gibi).
// slug yalnızca veritabanından gelir (biçimi CHECK ile sınırlı); istekten gelen bir değer yol oluşturmaz.
export async function readSiteFile(slug, brandDir = process.env.BRAND_DIR) {
  if (!brandDir || !slug) return {};
  try {
    return JSON.parse(await readFile(path.join(brandDir, slug, 'site.json'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('site.json okunamadı:', err.message);
    return {};
  }
}

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
// Sadece dosya adı kabul edilir ("foto1.jpg"): "../" ile marka klasörünün dışına çıkılamaz.
const brandFile = (value) => (text(value) && path.basename(value) === value ? `/brand/${value}` : null);

// KVKK aydınlatma metni (/aydinlatma sayfası). Metni veri sorumlusu olan stüdyo belirler, bu yüzden koda değil
// stüdyonun site.json'ına yazılır; şablon: server/site.example.json. Bölümü olmayan metin "yok" sayılır.
export function privacyNotice(value) {
  const sections = Array.isArray(value?.sections)
    ? value.sections
        .map((s) => ({ title: text(s?.title), text: text(s?.text) }))
        .filter((s) => s.title && s.text)
        .slice(0, 30)
    : [];
  if (sections.length === 0) return null;
  const updatedOn = /^\d{4}-\d{2}-\d{2}$/.test(value.updatedOn ?? '') ? value.updatedOn : null;
  return { updatedOn, sections };
}

router.get('/api/site', requireStudio, async (req, res) => {
  const [{ rows: [studio] }, { rows: branchRows }, site] = await Promise.all([
    pool.query(
      `SELECT st.name, st.whatsapp_phone, st.logo_url, ss.cancellation_deadline_hours, ss.credit_validity_days
       FROM studios st LEFT JOIN studio_settings ss ON ss.studio_id = st.id
       WHERE st.id = $1`,
      [req.studio.id],
    ),
    pool.query(
      'SELECT name, address, maps_url FROM branches WHERE studio_id = $1 AND is_active ORDER BY id',
      [req.studio.id],
    ),
    readSiteFile(req.studio.slug),
  ]);
  const instructor = site.instructor ?? {};
  // Şube adresleri panelden gelir. Geçiş kuralı: hiçbir açık şubenin adresi yokken site bugünkü gibi
  // site.json'daki adresi gösterir; bir şubeye adres girilince yalnızca şube adresleri kullanılır.
  const branches = branchRows.map((b) => ({ name: b.name, address: b.address, mapsUrl: b.maps_url }));
  const useSiteAddress = !branches.some((b) => b.address);
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
      // "Neden biz" kartları: her stüdyo kendi farkını yazar (ör. "Kadınlara özel" her stüdyo için doğru değil).
      // Yoksa ya da geçersizse boş döner ve ekran kendi genel kartlarını gösterir. Düzen dört kart için.
      reasons: Array.isArray(site.reasons)
        ? site.reasons
            .map((r) => ({ title: text(r?.title), text: text(r?.text) }))
            .filter((r) => r.title && r.text)
            .slice(0, 4)
        : [],
      privacyNotice: privacyNotice(site.privacyNotice),
      branches,
      address: useSiteAddress ? text(site.address) : null,
      mapsUrl: useSiteAddress ? text(site.mapsUrl) : null,
      instagramUrl: text(site.instagramUrl),
      photos: Array.isArray(site.photos)
        ? site.photos.map((p) => ({ url: brandFile(p?.file), alt: text(p?.alt) ?? '' })).filter((p) => p.url)
        : [],
    },
  });
});

export default router;
