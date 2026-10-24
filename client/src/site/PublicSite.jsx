import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Monogram from '../components/Monogram.jsx';
import Faq from './Faq.jsx';
import HowItWorks from './HowItWorks.jsx';
import RotatingWord from './RotatingWord.jsx';
import SiteNav from './SiteNav.jsx';
import styles from './PublicSite.module.css';

// Herkese açık tanıtım sitesi (/), ikinci taslak (24 Ekim 2026): renk bantları, arkada dev soluk kelimeler,
// büyük harf başlıklar, fotoğraf alanları. İçerik sabit (BR-25): stüdyo adı, logo, WhatsApp ve iptal/telafi
// kuralları veritabanından; eğitmen, adres, fotoğraflar repo dışındaki site.json'dan (/api/site).
// Eksik alanlar yer tutucuyla gösterilir; hiçbir bilgi uydurulmaz.

const LOGIN_PATH = '/giris';
const MESSAGES = {
  hello: 'Merhaba, pilates dersleri hakkında bilgi almak istiyorum.',
  hours: 'Merhaba, ders saatleri hakkında bilgi alabilir miyim?',
};

const REASONS = [
  { title: 'Kadınlara özel', text: 'Rahat ve güvenli bir ortam.' },
  { title: 'Küçük gruplar', text: 'Eğitmen herkesi tek tek görür.' },
  { title: 'Telafi hakkı', text: 'Kaçırdığın dersi başka bir güne al.' },
  { title: 'Seviyene göre', text: 'Program sana göre ilerler.' },
];

// Ölçülü yazıldı: tıbbi iddia yok.
const BENEFITS = [
  { title: 'Dik duruş', text: 'Omurgayı destekleyen kaslar güçlenir.' },
  { title: 'Güçlü merkez', text: 'Karın ve bel bölgesi çalışır.' },
  { title: 'Esneklik', text: 'Hareket açıklığın artar.' },
  { title: 'Nefes', text: 'Hareketle uyumlu, daha derin nefes.' },
  { title: 'Eklem dostu', text: 'Düşük darbeli, kontrollü yük.' },
  { title: 'Zihinsel denge', text: 'Ders boyunca odak sende.' },
];

const digits = (phone) => phone.replace(/\D/g, '').replace(/^0/, '90');

function whatsappLink(phone, message) {
  return phone ? `https://wa.me/${digits(phone)}?text=${encodeURIComponent(message)}` : null;
}

// Fotoğraf geldiyse fotoğraf, gelmediyse lavanta yer tutucu (stüdyonun fotoğrafları gelince yerine oturur).
function PhotoSlot({ photo, label, className = '' }) {
  if (photo) return <img className={`${styles.photo} ${className}`} src={photo.url} alt={photo.alt} loading="lazy" />;
  return (
    <div className={`${styles.photo} ${styles.photoEmpty} ${className}`} role="img" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

export default function PublicSite() {
  const [site, setSite] = useState(null);

  useEffect(() => {
    // Hata olsa da sayfa yer tutucularla açılır; tanıtım sitesi boş ekran göstermemeli.
    api('/api/site').then(({ site: data }) => setSite(data), () => setSite({}));
  }, []);

  useEffect(() => {
    if (site?.studioName) document.title = site.studioName;
  }, [site]);

  if (!site) return null;

  const instructor = site.instructor ?? {};
  const photos = site.photos ?? [];
  const hello = whatsappLink(site.whatsappPhone, MESSAGES.hello);
  const callNumber = site.phone ?? site.whatsappPhone;

  return (
    <div className={styles.site} id="ust">
      <header className={`${styles.band} ${styles.hero}`}>
        <span className={`${styles.ghost} ${styles.heroGhost}`} aria-hidden="true">
          PİLATES
        </span>
        <div className={styles.inner}>
          <SiteNav logoUrl={site.logoUrl} loginPath={LOGIN_PATH} />
          <div className={styles.heroGrid}>
            <div className={styles.heroText}>
              <h1 className={styles.srOnly}>{site.studioName}</h1>
              <RotatingWord />
              <p className={styles.tagline}>{site.tagline ?? "Antalya'da kadınlara özel reformer pilates"}</p>
              <p className={styles.subline}>{site.subline ?? 'Küçük gruplar, sana göre bir program.'}</p>
              {hello && (
                <a className={`${styles.button} ${styles.primary}`} href={hello} target="_blank" rel="noreferrer">
                  WhatsApp'tan yaz
                </a>
              )}
            </div>
            <PhotoSlot photo={photos[0]} label="Stüdyo fotoğrafı" className={styles.heroPhoto} />
          </div>
        </div>
      </header>

      <main>
        <section id="neden-biz" className={styles.band} aria-labelledby="neden-baslik">
          <div className={styles.inner}>
            <h2 id="neden-baslik" className={`${styles.heading} ${styles.onLight}`}>
              Neden biz
            </h2>
            <ul className={`${styles.cards} ${styles.fourUp}`}>
              {REASONS.map((reason) => (
                <li key={reason.title} className={`${styles.card} ${styles.accentCard}`}>
                  <h3>{reason.title}</h3>
                  <p>{reason.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <HowItWorks />

        <section id="pilates" className={`${styles.band} ${styles.lilac}`} aria-labelledby="pilates-baslik">
          <span className={styles.ghost} aria-hidden="true">
            FAYDALAR
          </span>
          <div className={styles.inner}>
            <h2 id="pilates-baslik" className={`${styles.heading} ${styles.onLight}`}>
              Pilates nedir
            </h2>
            <p className={styles.lead}>
              Nefesle uyumlu, kontrollü hareketlerle derin kasları çalıştıran bir egzersiz yöntemi. Reformer, yayların
              direnciyle hareketleri herkesin seviyesine uyarlar.
            </p>
            <ul className={`${styles.cards} ${styles.threeUp}`}>
              {BENEFITS.map((benefit) => (
                <li key={benefit.title} className={styles.card}>
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.band} aria-labelledby="egitmen-baslik">
          <div className={styles.inner}>
            <h2 id="egitmen-baslik" className={`${styles.heading} ${styles.onLight}`}>
              Eğitmenin
            </h2>
            <div className={styles.instructor}>
              {instructor.photoUrl ? (
                <img className={styles.instructorPhoto} src={instructor.photoUrl} alt={instructor.name ?? ''} />
              ) : (
                <PhotoSlot label="Eğitmen fotoğrafı" className={styles.instructorPhoto} />
              )}
              <div>
                <p className={styles.name}>{instructor.name ?? 'Eğitmenin adı'}</p>
                <p className={styles.muted}>
                  {instructor.years ? `${instructor.years} yıldır pilates eğitmeni` : '… yıldır pilates eğitmeni'}
                </p>
                <p className={styles.bio}>{instructor.bio ?? 'Eğitmenin kendini anlattığı iki üç cümle buraya gelecek.'}</p>
                <p className={styles.smallHeading}>Sertifikalar</p>
                <ul className={styles.certificates}>
                  {(instructor.certificates?.length ? instructor.certificates : ['Sertifika 1', 'Sertifika 2']).map(
                    (certificate) => (
                      <li key={certificate}>{certificate}</li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.band} ${styles.brand}`} aria-labelledby="saatler-baslik">
          <div className={`${styles.inner} ${styles.hoursInner}`}>
            <div>
              <h2 id="saatler-baslik" className={styles.heading}>
                Ders saatleri
              </h2>
              <p className={styles.lead}>Gruplar zaman zaman değişiyor. Sana uygun saati sor, hemen söyleyelim.</p>
            </div>
            {site.whatsappPhone && (
              <a
                className={`${styles.button} ${styles.light}`}
                href={whatsappLink(site.whatsappPhone, MESSAGES.hours)}
                target="_blank"
                rel="noreferrer"
              >
                Ders saatlerini WhatsApp'tan sor
              </a>
            )}
          </div>
        </section>

        <section className={styles.band} aria-labelledby="studyo-baslik">
          <div className={styles.inner}>
            <h2 id="studyo-baslik" className={`${styles.heading} ${styles.onLight}`}>
              Stüdyo
            </h2>
            <div className={styles.gallery}>
              {[1, 2, 3].map((n) => (
                <PhotoSlot key={n} photo={photos[n]} label="Stüdyo fotoğrafı" />
              ))}
            </div>
          </div>
        </section>

        <Faq site={site} />

        <section id="iletisim" className={`${styles.band} ${styles.dark} ${styles.contact}`} aria-labelledby="iletisim-baslik">
          <div className={`${styles.inner} ${styles.contactInner}`}>
            <div>
              <Monogram size="hero" logoUrl={site.logoUrl} />
              <h2 id="iletisim-baslik" className={styles.heading}>
                Bize ulaş
              </h2>
              <p>{site.address ?? 'Adres buraya gelecek, Antalya'}</p>
              {site.workingHours && <p className={styles.mutedLight}>{site.workingHours}</p>}
              <p className={styles.links}>
                {site.mapsUrl && (
                  <a href={site.mapsUrl} target="_blank" rel="noreferrer">
                    Haritada aç
                  </a>
                )}
                {site.instagramUrl && (
                  <a href={site.instagramUrl} target="_blank" rel="noreferrer">
                    Instagram
                  </a>
                )}
              </p>
            </div>
            <div className={styles.contactButtons}>
              {hello && (
                <a className={`${styles.button} ${styles.primary}`} href={hello} target="_blank" rel="noreferrer">
                  WhatsApp'tan yaz
                </a>
              )}
              <a className={`${styles.button} ${styles.outlineLight}`} href={LOGIN_PATH}>
                Üye girişi
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Telefonda altta sabit: sayfanın neresinde olursa olsun tek dokunuşla ulaşsın. */}
      <nav className={styles.mobileBar} aria-label="Hızlı iletişim">
        {callNumber && <a href={`tel:+${digits(callNumber)}`}>Ara</a>}
        {hello && (
          <a href={hello} target="_blank" rel="noreferrer" className={styles.mobileBarMain}>
            WhatsApp
          </a>
        )}
        {site.instagramUrl && (
          <a href={site.instagramUrl} target="_blank" rel="noreferrer">
            Instagram
          </a>
        )}
      </nav>
    </div>
  );
}
