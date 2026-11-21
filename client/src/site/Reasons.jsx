import styles from './PublicSite.module.css';

// site.json'da "reasons" yoksa gösterilen genel kartlar. Her stüdyo için doğru olmayan bir iddia (hedef kitle,
// şehir) içermez. Paket modelinde telafi olmadığı için "Telafi hakkı" kartının yerine iptal kuralı anlatılır.
const GROUP_REASONS = [
  { title: 'Rahat ortam', text: 'Rahat ve güvenli bir ortam.' },
  { title: 'Küçük gruplar', text: 'Eğitmen herkesi tek tek görür.' },
  { title: 'Telafi hakkı', text: 'Kaçırdığın dersi başka bir güne al.' },
  { title: 'Seviyene göre', text: 'Program sana göre ilerler.' },
];
const PACKAGE_REASONS = GROUP_REASONS.map((reason) =>
  reason.title === 'Telafi hakkı'
    ? { title: 'Esnek iptal', text: 'Gelemeyeceğin dersi önceden bildir, seansın yanmasın.' }
    : reason,
);

export default function Reasons({ reasons, packageModel }) {
  const cards = reasons?.length ? reasons : packageModel ? PACKAGE_REASONS : GROUP_REASONS;
  return (
    <section id="neden-biz" className={styles.section} aria-labelledby="neden-baslik">
      <p className={styles.eyebrow}>Neden biz</p>
      <h2 id="neden-baslik" className={styles.sectionTitle}>
        Sana iyi gelecek bir stüdyo
      </h2>
      <ul className={styles.reasonGrid}>
        {cards.map((reason) => (
          <li key={reason.title} className={`${styles.card} ${styles.lift}`}>
            <span className={styles.cardLine} aria-hidden="true" />
            <h3 className={styles.cardTitle}>{reason.title}</h3>
            <p className={styles.cardText}>{reason.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
