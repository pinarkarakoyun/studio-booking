import styles from './PublicSite.module.css';

// Ders takip sistemini anlatan bölüm (prototipte yok, ama sistemi anlatan tek yer olduğu için kalır). Metinler
// üyelik modeline göre: grup modelinde telafi anlatılır; paket modelinde telafi sözü geçmez.
const STEPS = {
  group: [
    'Sana uygun sabit gruba yerleş.',
    'Derslerini telefonundan gör.',
    'Gelemeyeceğin derste “Gelemiyorum” de.',
    'Hakkınla başka bir derse telafiye gel.',
  ],
  package: [
    'Sana uygun paketi ve grubu seç.',
    'Derslerini telefonundan gör.',
    'Gelemeyeceğin dersi uygulamadan iptal et.',
    'Kalan seansını uygulamadan takip et.',
  ],
};

export default function HowItWorks({ packageModel }) {
  const steps = packageModel ? STEPS.package : STEPS.group;
  return (
    <section id="isleyis" className={styles.section} aria-labelledby="isleyis-baslik">
      <div className={styles.how}>
        <div>
          <p className={`${styles.script} ${styles.scriptOnDark}`}>Derslerin cebinde</p>
          <h2 id="isleyis-baslik" className={styles.quizTitle}>
            Nasıl işler?
          </h2>
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        {/* Telefondaki "Derslerim" ekranının sadeleştirilmiş taklidi; ekran okuyucu onu değil adımları okur. */}
        <div className={styles.phone} aria-hidden="true">
          <p className={styles.phoneHello}>Merhaba,</p>
          <p className={styles.phoneName}>Derslerim</p>
          <div className={styles.phoneCard}>
            {packageModel ? (
              <>
                <span className={styles.phoneRing}>8</span>
                <span>seans kaldı</span>
              </>
            ) : (
              <span>1 telafi hakkın var</span>
            )}
          </div>
          <div className={styles.phoneNext}>
            <span>Sıradaki dersin</span>
            <strong>Pazartesi</strong>
            <span className={styles.phoneTime}>09:00</span>
          </div>
        </div>
      </div>
    </section>
  );
}
