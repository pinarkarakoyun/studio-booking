import { useState } from 'react';
import PhotoSlot from './PhotoSlot.jsx';
import { onTabKeyDown } from './siteParts.js';
import styles from './PublicSite.module.css';

// Öne çıkan program (prototipteki dönem sekmeli bölümün genel hâli): solda başlık, metin ve fotoğraf; sağda
// sekmeler ve seçili sekmenin işaretli maddeleri. İlerleme çizgisi seçili sekmenin sırasına göre uzar.
export default function Spotlight({ spotlight }) {
  const [selected, setSelected] = useState(0);
  const tab = spotlight.tabs[selected];
  return (
    <section id="program" className={`${styles.section} ${styles.split}`} aria-labelledby="program-baslik">
      <div className={styles.splitText}>
        {spotlight.eyebrow && <p className={styles.eyebrow}>{spotlight.eyebrow}</p>}
        <h2 id="program-baslik" className={styles.sectionTitle}>
          {spotlight.title}
        </h2>
        {spotlight.text && <p className={styles.lead}>{spotlight.text}</p>}
        <PhotoSlot photo={spotlight.photoUrl ? { url: spotlight.photoUrl } : null} label="Program fotoğrafı" className={styles.spotPhoto} />
      </div>
      {tab && (
        <div className={styles.splitSide}>
          {spotlight.tabs.length > 1 && (
            <div className={styles.tabs} role="tablist" aria-label={spotlight.title}>
              {spotlight.tabs.map((t, i) => (
                <button
                  key={t.label}
                  type="button"
                  role="tab"
                  id={`program-tab-${i}`}
                  aria-selected={i === selected}
                  aria-controls="program-panel"
                  className={`${styles.tab} ${i === selected ? styles.tabOn : ''}`}
                  tabIndex={i === selected ? 0 : -1}
                  onClick={() => setSelected(i)}
                  onKeyDown={(event) => onTabKeyDown(event, i, spotlight.tabs.length, setSelected)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          {/* Tek sekmede sekme çubuğu yok; o zaman bu kutu da sekme paneli değil, düz bir kart. */}
          <div
            className={styles.card}
            id="program-panel"
            role={spotlight.tabs.length > 1 ? 'tabpanel' : undefined}
            aria-labelledby={spotlight.tabs.length > 1 ? `program-tab-${selected}` : undefined}
          >
            <span
              className={styles.progress}
              style={{ width: `${((selected + 1) / spotlight.tabs.length) * 100}%` }}
              aria-hidden="true"
            />
            {tab.meta && <p className={styles.quizStep}>{tab.meta}</p>}
            <h3 className={styles.cardTitleLarge}>{tab.title}</h3>
            <ul className={styles.checks}>
              {tab.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
