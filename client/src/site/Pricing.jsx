import { whatsappLink } from './siteParts.js';
import styles from './PublicSite.module.css';

// Fiyatlar (isteğe bağlı): kartlar stüdyonun site.json'ından gelir (sunucu doğrular, en fazla dört). Öne çıkan kart
// koyu. "Bilgi al" mesajı sabittir: ziyaretçinin hangi kartı seçtiği hiçbir yere gönderilmez (testteki kural).
const INFO_MESSAGE = 'Merhaba, paketleriniz hakkında bilgi almak istiyorum.';

export default function Pricing({ pricing, whatsappPhone }) {
  const info = whatsappLink(whatsappPhone, INFO_MESSAGE);
  return (
    <section id="fiyatlar" className={styles.section} aria-labelledby="fiyatlar-baslik">
      <p className={styles.eyebrow}>{pricing.eyebrow ?? 'Fiyatlar'}</p>
      <h2 id="fiyatlar-baslik" className={styles.sectionTitle}>
        {pricing.title ?? 'Sana uyan paketi seç'}
      </h2>
      <ul className={styles.priceGrid}>
        {pricing.plans.map((plan, index) => (
          <li
            key={`${index}-${plan.name}`}
            className={`${styles.card} ${styles.lift} ${plan.highlight ? styles.cardDark : ''}`}
          >
            {/* Ad ve rozet yan yana; rozet uzunsa ad alt satıra kayar, üst üste binmez. */}
            <div className={styles.priceHead}>
              <h3 className={styles.priceName}>{plan.name}</h3>
              {plan.badge && <span className={styles.priceBadge}>{plan.badge}</span>}
            </div>
            <p className={styles.priceValue}>{plan.price}</p>
            {plan.detail && <p className={styles.cardText}>{plan.detail}</p>}
            {info && (
              <a
                className={`${styles.pill} ${styles.pillSmall} ${plan.highlight ? styles.pillOnBrand : styles.pillOutline}`}
                href={info}
                target="_blank"
                rel="noreferrer"
              >
                Bilgi al
              </a>
            )}
          </li>
        ))}
      </ul>
      {pricing.note && <p className={styles.priceNote}>{pricing.note}</p>}
    </section>
  );
}
