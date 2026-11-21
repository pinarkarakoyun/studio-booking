import { useEffect, useRef, useState } from 'react';
import PhotoSlot from './PhotoSlot.jsx';
import styles from './PublicSite.module.css';

// Eğitmen: fotoğraf, ad, tanıtım, sertifikalar ve en fazla üç sayı kartı (stats). Sayılar ekrana girince 0'dan
// sayarak artar; yalnızca baştaki sayı kısmı sayılır ("500+" → 500'e kadar, "+" sabit). Hareket azaltma
// tercihinde ya da tarayıcı IntersectionObserver bilmiyorsa sayılar doğrudan son değerleriyle görünür.
export default function Instructor({ instructor, stats }) {
  return (
    <section id="egitmen" className={`${styles.section} ${styles.split}`} aria-labelledby="egitmen-baslik">
      <PhotoSlot
        photo={instructor.photoUrl ? { url: instructor.photoUrl, alt: instructor.name } : null}
        label="Eğitmen fotoğrafı"
        shape="leafShape"
        className={styles.instructorPhoto}
      />
      <div className={styles.splitText}>
        <p className={styles.eyebrow}>Eğitmen</p>
        <h2 id="egitmen-baslik" className={styles.sectionTitle}>
          {instructor.name}
        </h2>
        {instructor.bio && <p className={styles.lead}>{instructor.bio}</p>}
        {instructor.certificates?.length > 0 && (
          <ul className={styles.certificates}>
            {instructor.certificates.map((certificate) => (
              <li key={certificate}>{certificate}</li>
            ))}
          </ul>
        )}
        {stats?.length > 0 && (
          <dl className={styles.stats}>
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>
                  <CountUp value={stat.value} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

const DURATION = 1200; // ms

function CountUp({ value }) {
  const ref = useRef(null);
  const match = /^(\d+)(.*)$/.exec(value);
  const target = match ? Number(match[1]) : null;
  const [shown, setShown] = useState(null);

  useEffect(() => {
    const element = ref.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (target === null || reduced || !('IntersectionObserver' in window) || !element) return undefined;
    let frame;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - start) / DURATION);
        setShown(Math.round(target * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      setShown(0);
      frame = requestAnimationFrame(step);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [target]);

  // Sayılmaya başlamadan önce de son değer yazılı durur: ekran okuyucu ve sayfayı yazdıran biri doğru değeri görür.
  return <span ref={ref}>{shown === null || !match ? value : `${shown}${match[2]}`}</span>;
}
