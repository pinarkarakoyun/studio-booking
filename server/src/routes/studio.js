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
           ss.membership_model, ss.late_cancel_burns_session, ss.payment_reminder_days,
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
        // 'group' (grup + telafi) ya da 'package' (seans paketi): üye ekranları buna göre değişir.
        membershipModel: studio.membership_model,
        // Paket modelinde geç iptal seansı düşürür mü (üyeye iptal öncesi uyarı için).
        lateCancelBurnsSession: studio.late_cancel_burns_session,
        // Üye ana ekranı bitişe bu kadar gün kala uyarı şeridi gösterir (yöneticinin Ödemeler eşiğiyle aynı).
        paymentReminderDays: studio.payment_reminder_days,
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
// Sitede tıklanabilir bağlantı olacak adresler yalnızca https: "javascript:" ya da "data:" gibi bir değer siteye
// giremez (paneldeki şube harita bağlantısıyla aynı kural, services/adminBranches.js).
const httpsUrl = (value) => {
  const url = text(value);
  return url && /^https:\/\/\S+$/.test(url) ? url : null;
};
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

// Dizi alanlarını güvenli okur: dizi değilse boş dizi, en fazla `max` öğe.
const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

// Ders kartları. `link` yalnızca sayfa içi bölüm kimliği olabilir ("test" gibi): başka adres ya da
// "javascript:" bağlantısı siteye giremez.
const SECTION_ID = /^[a-z][a-z-]{0,30}$/;
export function readCourses(site) {
  return (Array.isArray(site.courses) ? site.courses : [])
    .map((c) => ({
      title: text(c?.title),
      text: text(c?.text),
      highlight: c?.highlight === true,
      link: typeof c?.link === 'string' && SECTION_ID.test(c.link) ? c.link : null,
    }))
    .filter((c) => c.title && c.text)
    .slice(0, 6);
}

// "Sana hangi ders uygun?" testi. Her seçenek ya sonraki bir soruya (next) ya da bir sonuca (result) gider,
// ikisine birden değil. Yalnızca ileri gidilebildiği için test döngüye giremez ve her yol bir sonuçla biter.
// Sorular sondan başa okunur: böylece seçeneği kalmadığı için atılan bir soruya giden seçenek de atılır.
export function readQuiz(site) {
  const quiz = site.quiz;
  if (!quiz || typeof quiz !== 'object') return null;
  const results = list(quiz.results, 6)
    .map((r) => ({ id: text(r?.id), title: text(r?.title), text: text(r?.text) }))
    .filter((r) => r.id && r.title && r.text);
  const resultIds = new Set(results.map((r) => r.id));
  const questions = list(quiz.questions, 5).map((q) => ({ id: text(q?.id), text: text(q?.text), options: q?.options }));
  if (results.length === 0 || !questions[0]?.id || !questions[0]?.text) return null;

  const kept = [];
  const laterIds = new Set();
  for (const question of [...questions].reverse()) {
    if (!question.id || !question.text || laterIds.has(question.id)) continue;
    const options = list(question.options, 4)
      .map((o) => ({ label: text(o?.label), next: text(o?.next), result: text(o?.result) }))
      .filter((o) => o.label && (o.next ? !o.result && laterIds.has(o.next) : resultIds.has(o.result)));
    if (options.length === 0) continue;
    kept.unshift({ id: question.id, text: question.text, options });
    laterIds.add(question.id);
  }
  // İlk soru atıldıysa test başlayamaz.
  if (kept[0]?.id !== questions[0].id) return null;
  return { title: text(quiz.title), intro: text(quiz.intro), questions: kept, results };
}

// Öne çıkan program: başlığı yoksa bölüm yok.
export function readSpotlight(site) {
  const s = site.spotlight;
  if (!text(s?.title)) return null;
  return {
    eyebrow: text(s.eyebrow),
    title: text(s.title),
    text: text(s.text),
    photoUrl: brandFile(s.photo),
    tabs: list(s.tabs, 4)
      .map((tab) => ({
        label: text(tab?.label),
        meta: text(tab?.meta),
        title: text(tab?.title),
        items: list(tab?.items, 6).map(text).filter(Boolean),
      }))
      .filter((tab) => tab.label && tab.title),
  };
}

// Fiyatlar (isteğe bağlı): stüdyonun site.json'ına yazılır, panelden gelmez (site içeriğini bakım kapsamında Pınar
// yönetir). Fiyat düz metindir ("3.200 ₺", "Açılışa özel"); tırnaksız sayı yazılmış kart atılır. Geçerli kart
// kalmazsa bölüm yok (sitede de menüde de görünmez).
export function readPricing(site) {
  const p = site.pricing;
  if (!p || typeof p !== 'object') return null;
  const plans = list(p.plans, 10)
    .map((plan) => {
      const badge = text(plan?.badge);
      return {
        name: text(plan?.name),
        price: text(plan?.price),
        detail: text(plan?.detail),
        badge: badge && badge.length <= 20 ? badge : null,
        highlight: plan?.highlight === true,
      };
    })
    .filter((plan) => plan.name && plan.price)
    .slice(0, 4);
  if (plans.length === 0) return null;
  return { eyebrow: text(p.eyebrow), title: text(p.title), note: text(p.note), plans };
}

// Eğitmen bölümündeki sayı kartları ("12" yıl, "500+" üye gibi): en fazla üç, kısa değerler.
export function readStats(site) {
  return (Array.isArray(site.stats) ? site.stats : [])
    .map((s) => ({ value: text(s?.value), label: text(s?.label) }))
    .filter((s) => s.value && s.label && s.value.length <= 12)
    .slice(0, 3);
}

// Şubelerin sitedeki ek bilgileri (rozet, açıklama, haftalık program) site.json'da şube adıyla yazılır;
// panelde öyle bir şube yoksa bilgi hiç kullanılmaz.
export function branchDetailsByName(site) {
  const byName = new Map();
  for (const d of Array.isArray(site.branchDetails) ? site.branchDetails : []) {
    const name = text(d?.name);
    if (!name || byName.has(name)) continue;
    byName.set(name, {
      badge: text(d.badge),
      description: text(d.description),
      schedule: list(d.schedule, 7)
        .map((row) => ({ day: text(row?.day), classes: text(row?.classes) }))
        .filter((row) => row.day && row.classes),
    });
  }
  return byName;
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
  const details = branchDetailsByName(site);
  const branches = branchRows.map((b) => ({
    name: b.name,
    address: b.address,
    mapsUrl: b.maps_url,
    ...(details.get(b.name) ?? { badge: null, description: null, schedule: [] }),
  }));
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
      hero: { eyebrow: text(site.hero?.eyebrow) },
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
      courses: readCourses(site),
      quiz: readQuiz(site),
      spotlight: readSpotlight(site),
      pricing: readPricing(site),
      stats: readStats(site),
      privacyNotice: privacyNotice(site.privacyNotice),
      branches,
      address: useSiteAddress ? text(site.address) : null,
      mapsUrl: useSiteAddress ? httpsUrl(site.mapsUrl) : null,
      instagramUrl: httpsUrl(site.instagramUrl),
      photos: Array.isArray(site.photos)
        ? site.photos.map((p) => ({ url: brandFile(p?.file), alt: text(p?.alt) ?? '' })).filter((p) => p.url)
        : [],
    },
  });
});

export default router;
