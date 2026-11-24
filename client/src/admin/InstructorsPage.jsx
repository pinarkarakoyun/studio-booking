import { useEffect, useState } from 'react';
import { api } from '../api.js';
import styles from './Admin.module.css';

// Yönetici: eğitmenler. Ayrılanlar ayrı bir başlık altında, kapalı.
export default function InstructorsPage({ studio, onOpen, onAdd }) {
  const [instructors, setInstructors] = useState(null);
  const [error, setError] = useState(null);
  const [showLeft, setShowLeft] = useState(false);
  const multiBranch = studio.branchCount > 1;

  useEffect(() => {
    api('/api/admin/instructors').then(({ instructors: list }) => setInstructors(list), (err) => setError(err.message));
  }, []);

  const active = instructors?.filter((i) => i.status !== 'left') ?? [];
  const left = instructors?.filter((i) => i.status === 'left') ?? [];

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Eğitmenler</h1>
        <button type="button" className={styles.addLink} onClick={onAdd}>
          + Ekle
        </button>
      </div>
      <p className={styles.subtitle}>
        Eğitmen kendi derslerini görür, yoklama alır. Neleri yapabileceğini eğitmenin sayfasından seçersin.
      </p>
      {error && <p className={styles.muted}>{error}</p>}
      {instructors && active.length === 0 && <p className={styles.emptyCard}>Henüz eğitmen yok.</p>}

      <ul className={styles.list}>
        {active.map((instructor) => (
          <li key={instructor.id}>
            <InstructorRow instructor={instructor} multiBranch={multiBranch} onOpen={() => onOpen(instructor.id)} />
          </li>
        ))}
      </ul>

      {left.length > 0 && (
        <>
          <button type="button" className={styles.closedToggle} onClick={() => setShowLeft((v) => !v)}>
            Ayrılanlar ({left.length}) {showLeft ? '▾' : '›'}
          </button>
          {showLeft && (
            <ul className={styles.list}>
              {left.map((instructor) => (
                <li key={instructor.id}>
                  <InstructorRow instructor={instructor} multiBranch={multiBranch} onOpen={() => onOpen(instructor.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function InstructorRow({ instructor, multiBranch, onOpen }) {
  return (
    <button
      type="button"
      className={`${styles.groupRow} ${instructor.status === 'left' ? styles.inactive : ''}`}
      onClick={onOpen}
    >
      <span className={styles.groupTop}>
        <strong>{instructor.fullName}</strong>
      </span>
      {multiBranch && (
        <span className={styles.customerMeta}>
          {instructor.branches.length > 0 ? instructor.branches.map((b) => b.name).join(', ') : 'Açık şubesi yok'}
        </span>
      )}
    </button>
  );
}
