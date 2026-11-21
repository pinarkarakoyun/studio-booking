import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PRIVACY_PATH } from './PrivacyPage.jsx';
import Branches from './Branches.jsx';
import Courses from './Courses.jsx';
import Faq from './Faq.jsx';
import HowItWorks from './HowItWorks.jsx';
import Instructor from './Instructor.jsx';
import PhotoSlot from './PhotoSlot.jsx';
import Quiz from './Quiz.jsx';
import Reasons from './Reasons.jsx';
import SiteNav from './SiteNav.jsx';
import Spotlight from './Spotlight.jsx';
import { LOGIN_PATH, displayPhone, telLink, visibleSections, whatsappLink } from './siteParts.js';
import styles from './PublicSite.module.css';

// Herkese açık tanıtım sitesi (/), prototipin görünümünde. Metinler koda yazılmaz: stüdyo adı, logo, WhatsApp ve
// kurallar veritabanından, gerisi repo dışındaki site.json'dan (/api/site). Üyelik modeli (grup ya da paket)
// /api/studio'dan: telafi anlatan metinler yalnızca grup modelinde görünür. İçeriği olmayan bölüm çizilmez.

const HELLO = 'Merhaba, pilates dersleri hakkında bilgi almak istiyorum.';

export default function PublicSite() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Hata olsa da sayfa yer tutucularla açılır; tanıtım sitesi boş ekran göstermemeli.
    Promise.all([
      api('/api/site').then(({ site }) => site, () => ({})),
      api('/api/studio').then(({ studio }) => studio ?? {}, () => ({})),
    ]).then(([site, studio]) => setData({ site, studio }));
  }, []);

  useEffect(() => {
    if (data?.site.studioName) document.title = data.site.studioName;
  }, [data]);

  if (!data) return null;
  const { site, studio } = data;
  const packageModel = studio.membershipModel === 'package';
  const sections = visibleSections(site);
  const visible = new Set(sections.map((section) => section.id));
  const hello = whatsappLink(site.whatsappPhone, HELLO);

  return (
    <div className={styles.site} id="ust">
      <SiteNav logoUrl={site.logoUrl} studioName={site.studioName} sections={sections} />

      <main>
        <Hero site={site} hello={hello} hasQuiz={visible.has('test')} />
        <Marquee site={site} />
        <Reasons reasons={site.reasons} packageModel={packageModel} />
        {visible.has('dersler') && <Courses courses={site.courses} visible={visible} />}
        {visible.has('test') && <Quiz quiz={site.quiz} whatsappPhone={site.whatsappPhone} />}
        {visible.has('program') && <Spotlight spotlight={site.spotlight} />}
        {visible.has('subeler') && <Branches site={site} />}
        {visible.has('egitmen') && <Instructor instructor={site.instructor} stats={site.stats} />}
        <HowItWorks packageModel={packageModel} />
        <Faq site={site} packageModel={packageModel} lateCancelBurnsSession={studio.lateCancelBurnsSession === true} />
      </main>

      <Footer site={site} />

      {hello && (
        <a className={styles.whatsappFloat} href={hello} target="_blank" rel="noreferrer" aria-label="WhatsApp ile yaz">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z" />
            <path d="M9 9.5c.5 2.5 2.5 4.5 5 5l1.2-1.2 2 .8-.4 1.8c-4.5.3-8.7-3.9-8.4-8.4l1.8-.4.8 2z" />
          </svg>
        </a>
      )}
    </div>
  );
}

// Giriş: el yazısı üst başlık, serif büyük başlık, açıklama, iki hap; sağda kemerli fotoğraf alanı, süs yaprak
// ve "N. yıl" rozeti (eğitmenin yılı ya da ilk sayı kartı; ikisi de yoksa rozet yok).
function Hero({ site, hello, hasQuiz }) {
  const years = site.instructor?.years;
  const firstStat = site.stats?.[0];
  const badge = years
    ? { value: `${years}. yıl`, label: 'pilates eğitmenliği' }
    : firstStat && { value: firstStat.value, label: firstStat.label };
  return (
    <section className={styles.hero} aria-labelledby="hero-baslik">
      <div className={styles.heroText}>
        {site.hero?.eyebrow && <p className={`${styles.script} ${styles.reveal}`}>{site.hero.eyebrow}</p>}
        <h1 id="hero-baslik" className={`${styles.heroTitle} ${styles.reveal}`}>
          {site.tagline ?? 'Küçük gruplarla pilates'}
        </h1>
        <p className={`${styles.heroLead} ${styles.reveal}`}>{site.subline ?? 'Küçük gruplar, sana göre bir program.'}</p>
        <div className={`${styles.pills} ${styles.reveal}`}>
          {hasQuiz && (
            <a className={`${styles.pill} ${styles.pillPrimary}`} href="#test">
              Sana hangi ders uygun?
            </a>
          )}
          {hello && (
            <a className={`${styles.pill} ${hasQuiz ? styles.pillOutline : styles.pillPrimary}`} href={hello} target="_blank" rel="noreferrer">
              WhatsApp'tan yaz
            </a>
          )}
        </div>
      </div>
      <div className={`${styles.heroVisual} ${styles.reveal}`}>
        <PhotoSlot photo={site.photos?.[0]} label="Stüdyo fotoğrafı" shape="arch" className={styles.heroPhoto} />
        <svg className={styles.leaf} width="110" height="150" viewBox="0 0 110 150" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M55 148V20" />
          <path d="M55 40c-20-4-34-18-38-34 18 2 34 14 38 34Z" />
          <path d="M55 70c20-4 34-18 38-34-18 2-34 14-38 34Z" />
          <path d="M55 100c-20-4-34-18-38-34 18 2 34 14 38 34Z" />
        </svg>
        {badge && (
          <p className={styles.heroBadge}>
            <strong>{badge.value}</strong>
            <span>{badge.label}</span>
          </p>
        )}
      </div>
    </section>
  );
}

// Kayan yazı bandı: ders ve şube adları. Süs olduğu için ekran okuyucudan gizli; aynı liste iki kez yan yana
// durur ve yarısı kadar kayınca başa döner (kesintisiz döngü). Hareket azaltma tercihinde durur.
// Ders yoksa bant yok (yalnızca şube adının tekrarı anlamsız). Az kelimede liste, geniş ekranı dolduracak
// kadar (en az 8 kelime) tekrarlanır; yoksa döngüde boşluk görünürdü.
const MIN_WORDS = 8;
function Marquee({ site }) {
  if (!site.courses?.length) return null;
  const base = [...site.courses.map((c) => c.title), ...(site.branches ?? []).map((b) => b.name)];
  const words = Array.from({ length: Math.ceil(MIN_WORDS / base.length) }, () => base).flat();
  const copy = (prefix) =>
    words.flatMap((word, i) => [<span key={`${prefix}w${i}`}>{word}</span>, <span key={`${prefix}d${i}`}>·</span>]);
  return (
    <div className={styles.marquee} aria-hidden="true">
      <div className={styles.marqueeTrack}>
        {copy('a')}
        {copy('b')}
      </div>
    </div>
  );
}

function Footer({ site }) {
  const phone = site.phone ?? site.whatsappPhone;
  return (
    <footer id="iletisim" className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <span className={styles.footerName}>{site.studioName}</span>
          {site.hero?.eyebrow && <span className={styles.footerScript}>{site.hero.eyebrow}</span>}
        </div>
        {site.branches?.length > 0 && (
          <div className={styles.footerColumn}>
            <span className={styles.footerHeading}>{site.branches.length > 1 ? 'Şubeler' : 'Stüdyo'}</span>
            {site.branches.map((branch) => (
              <span key={branch.name}>{branch.address ? `${branch.name} · ${branch.address}` : branch.name}</span>
            ))}
            {site.workingHours && <span>{site.workingHours}</span>}
          </div>
        )}
        <div className={styles.footerColumn}>
          <span className={styles.footerHeading}>İletişim</span>
          {phone && <a href={telLink(phone)}>{displayPhone(phone)}</a>}
          {site.instagramUrl && (
            <a href={site.instagramUrl} target="_blank" rel="noreferrer">
              Instagram
            </a>
          )}
          <a href={LOGIN_PATH}>Üye girişi</a>
          <a href={PRIVACY_PATH}>KVKK aydınlatma metni</a>
        </div>
      </div>
    </footer>
  );
}
