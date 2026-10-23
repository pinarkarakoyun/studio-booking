import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Monogram from '../components/Monogram.jsx';
import RotatingWord from './RotatingWord.jsx';
import styles from './PublicSite.module.css';

// Herkese açık tanıtım sitesi (/). İçerik sabit (BR-25): stüdyo adı, logo ve WhatsApp veritabanından;
// eğitmen, adres, fotoğraflar repo dışındaki site.json'dan (/api/site). Eksik alanlar yer tutucuyla gösterilir.
// Ders saatleri bilerek yazmıyor: gruplar değişebiliyor, ziyaretçi WhatsApp'tan soruyor.

const LOGIN_PATH = '/giris';
const MESSAGES = {
  hello: 'Merhaba, pilates dersleri hakkında bilgi almak istiyorum.',
  hours: 'Merhaba, ders saatleri hakkında bilgi alabilir miyim?',
};

function whatsappLink(phone, message) {
  if (!phone) return null;
  return `https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(message)}`;
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
  const hello = whatsappLink(site.whatsappPhone, MESSAGES.hello);

  return (
    <div className={styles.site}>
      <header className={styles.hero}>
        <div className={styles.inner}>
          <div className={styles.heroTop}>
            <Monogram size="hero" logoUrl={site.logoUrl} />
            <a className={styles.loginLink} href={LOGIN_PATH}>
              Üye girişi
            </a>
          </div>
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
      </header>

      <main>
        <section className={styles.section} aria-labelledby="egitmen">
          <div className={`${styles.inner} ${styles.instructor}`}>
            <h2 id="egitmen" className={styles.heading}>
              Eğitmenin
            </h2>
            <div className={styles.instructorBody}>
              {instructor.photoUrl ? (
                <img className={styles.instructorPhoto} src={instructor.photoUrl} alt={instructor.name ?? ''} />
              ) : (
                <div className={`${styles.placeholder} ${styles.instructorPhoto}`}>Eğitmen fotoğrafı</div>
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

        <section className={styles.section} aria-labelledby="nasil">
          <div className={styles.inner}>
            <h2 id="nasil" className={styles.heading}>
              Nasıl çalışır
            </h2>
            <ol className={styles.steps}>
              <li>Stüdyoyla konuş, sana uygun gruba yerleş.</li>
              <li>Derslerini telefonundan gör.</li>
              <li>Gelemeyeceğin derste “Gelemiyorum” de, başka bir derse telafiye gel.</li>
            </ol>
          </div>
        </section>

        <section className={styles.hours} aria-labelledby="saatler">
          <div className={styles.inner}>
            <h2 id="saatler" className={styles.hoursHeading}>
              Ders saatleri
            </h2>
            <p>Gruplar ve saatler zaman zaman değişiyor. Sana uygun saati sor, hemen söyleyelim.</p>
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

        <section className={styles.section} aria-labelledby="studyo">
          <div className={styles.inner}>
            <h2 id="studyo" className={styles.heading}>
              Stüdyo
            </h2>
            <div className={styles.photos}>
              {site.photos?.length
                ? site.photos.map((photo) => <img key={photo.url} src={photo.url} alt={photo.alt} loading="lazy" />)
                : ['Stüdyo fotoğrafı', 'Fotoğraf', 'Fotoğraf'].map((label, i) => (
                  <div key={i} className={styles.placeholder}>
                    {label}
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.contact}`} aria-labelledby="iletisim">
          <div className={styles.inner}>
            <h2 id="iletisim" className={styles.heading}>
              Bize ulaş
            </h2>
            <p>{site.address ?? 'Adres buraya gelecek, Antalya'}</p>
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
            <div className={styles.contactButtons}>
              {hello && (
                <a className={`${styles.button} ${styles.primary}`} href={hello} target="_blank" rel="noreferrer">
                  WhatsApp'tan yaz
                </a>
              )}
              <a className={`${styles.button} ${styles.outline}`} href={LOGIN_PATH}>
                Üye girişi
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
