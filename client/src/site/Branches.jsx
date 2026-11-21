import { useState } from 'react';
import { displayPhone, telLink } from './siteParts.js';
import styles from './PublicSite.module.css';

// Şubeler: şube adı ve adresi panelden; rozet, açıklama ve haftalık program site.json'daki branchDetails'ten
// (sunucu şube adıyla eşleştirir). Birden çok şubede hap sekmeler, tek şubede sekme yok. Hiçbir şubenin adresi
// yokken sunucu site.json'daki eski adresi gönderir (site.address); o zaman o adres gösterilir.
export default function Branches({ site }) {
  const branches = site.branches?.length ? site.branches : [{ name: site.studioName ?? 'Stüdyo', schedule: [] }];
  const [selected, setSelected] = useState(0);
  const branch = branches[selected] ?? branches[0];
  const many = branches.length > 1;
  const address = branch.address ?? site.address;
  const mapsUrl = branch.mapsUrl ?? (branch.address ? null : site.mapsUrl);
  const phone = site.phone ?? site.whatsappPhone;

  return (
    <section id="subeler" className={styles.section} aria-labelledby="subeler-baslik">
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.eyebrow}>{many ? 'Şubeler' : 'Stüdyo'}</p>
          <h2 id="subeler-baslik" className={styles.sectionTitle}>
            {many ? 'Sana en yakın stüdyo' : 'Bizi ziyaret et'}
          </h2>
        </div>
        {many && (
          <div className={styles.segmented} role="tablist" aria-label="Şube seçimi">
            {branches.map((b, i) => (
              <button
                key={b.name}
                type="button"
                role="tab"
                id={`sube-tab-${i}`}
                aria-selected={i === selected}
                aria-controls="sube-panel"
                className={`${styles.segment} ${i === selected ? styles.segmentOn : ''}`}
                onClick={() => setSelected(i)}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className={styles.branchGrid}
        id="sube-panel"
        role={many ? 'tabpanel' : undefined}
        aria-labelledby={many ? `sube-tab-${selected}` : undefined}
      >
        <div className={styles.card}>
          {branch.badge && <span className={styles.badge}>{branch.badge}</span>}
          <h3 className={styles.branchName}>{branch.name}</h3>
          {branch.description && <p className={styles.cardText}>{branch.description}</p>}
          <dl className={styles.branchInfo}>
            {address && (
              <div>
                <dt>Adres</dt>
                <dd>{address}</dd>
              </div>
            )}
            {phone && (
              <div>
                <dt>Telefon</dt>
                <dd>
                  <a href={telLink(phone)}>{displayPhone(phone)}</a>
                </dd>
              </div>
            )}
            {site.workingHours && (
              <div>
                <dt>Saatler</dt>
                <dd>{site.workingHours}</dd>
              </div>
            )}
          </dl>
          {mapsUrl && (
            <a className={`${styles.pill} ${styles.pillOutline} ${styles.pillSmall}`} href={mapsUrl} target="_blank" rel="noreferrer">
              Haritada aç
            </a>
          )}
        </div>
        {branch.schedule?.length > 0 && (
          <div className={styles.card}>
            <h3 className={styles.cardTitleLarge}>Haftalık program</h3>
            <ul className={styles.schedule}>
              {branch.schedule.map((row) => (
                <li key={row.day}>
                  <span>{row.day}</span>
                  <span>{row.classes}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
