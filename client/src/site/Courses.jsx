import styles from './PublicSite.module.css';

// Dersler (prototip): sade çizgi süslü kartlar; "highlight" kart koyu. Kartın bağlantısı yalnızca sayfada
// görünen bir bölüme gidiyorsa çizilir (sunucu zaten yalnızca bölüm kimliği kabul ediyor).
export default function Courses({ courses, visible }) {
  return (
    <section id="dersler" className={styles.section} aria-labelledby="dersler-baslik">
      <p className={styles.eyebrow}>Dersler</p>
      <h2 id="dersler-baslik" className={styles.sectionTitle}>
        Her beden için doğru tempo
      </h2>
      <ul className={styles.courseGrid}>
        {courses.map((course) => (
          <li key={course.title} className={`${styles.card} ${styles.lift} ${course.highlight ? styles.cardDark : ''}`}>
            <span className={styles.cardLine} aria-hidden="true" />
            <h3 className={styles.cardTitleLarge}>{course.title}</h3>
            <p className={styles.cardText}>{course.text}</p>
            {course.link && visible.has(course.link) && (
              <a className={styles.cardLink} href={`#${course.link}`}>
                Detaylı bilgi →
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
