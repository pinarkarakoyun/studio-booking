import styles from './PublicSite.module.css';

const STEPS = [
  'Sana uygun sabit gruba yerleş.',
  'Derslerini telefonundan gör.',
  'Gelemeyeceğin derste “Gelemiyorum” de.',
  'Hakkınla başka bir derse telafiye gel.',
];

// Stüdyonun rezervasyon sistemi: sitenin en dikkat çekici bölümü. Telefondaki "Derslerim" ekranı
// gerçek uygulamanın sadeleştirilmiş taklidi; ekran okuyucu onu değil adımları okur.
export default function HowItWorks() {
  return (
    <section id="isleyis" className={`${styles.band} ${styles.dark}`} aria-labelledby="isleyis-baslik">
      <span className={styles.ghost} aria-hidden="true">
        UYGULAMA
      </span>
      <div className={styles.inner}>
        <h2 id="isleyis-baslik" className={styles.heading}>
          İşleyişimiz
        </h2>
        <p className={styles.lead}>Derslerin telefonunda. Gelemeyeceksen tek dokunuşla bildir, hakkın seni bekler.</p>
        <div className={styles.howGrid}>
          <div className={styles.phone} aria-hidden="true">
            <p className={styles.phoneTitle}>Derslerim</p>
            <p className={styles.phoneLine}>Üyeliğin 22 Ocak tarihinde bitiyor.</p>
            <div className={styles.phoneNext}>
              <p>Sıradaki dersin</p>
              <p className={styles.phoneDay}>Pazartesi 26 Ekim</p>
              <div className={styles.phoneBottom}>
                <strong>09:00</strong>
                <span className={styles.phonePress}>Gelemiyorum</span>
              </div>
            </div>
            <p className={styles.phoneCredit}>1 telafi hakkın var.</p>
            <p className={styles.phoneRow}>
              <span>Çarşamba 28 Ekim</span>
              <strong>09:00</strong>
            </p>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
