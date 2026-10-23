import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDay, formatTime } from '../format.js';
import styles from './Admin.module.css';

// Gelmeyen birinin yanında yazan sebep.
function reasonText(person) {
  if (person.state === 'frozen') return 'dondurulmuş';
  if (person.creditState === 'unused') return 'iptal etti, telafi hakkı var';
  if (person.creditState === 'used') return 'iptal etti, telafisini seçti';
  return 'iptal etti';
}

// Bir dersin katılımcı listesi (ilk sürümde sadece görüntüleme).
export default function SessionRosterPage({ studio, sessionId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/api/admin/sessions/${sessionId}`).then(setData, (err) => setError(err.message));
  }, [sessionId]);

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      ‹ Bugün
    </button>
  );

  if (error || !data) {
    return (
      <main className={styles.page}>
        {back}
        {error && <p className={styles.muted}>{error}</p>}
      </main>
    );
  }

  const { session, attending, notAttending } = data;
  const fill = Math.min(100, Math.round((session.bookedCount / session.capacity) * 100));

  return (
    <main className={styles.page}>
      {back}
      <h1 className={styles.rosterTitle}>
        {formatDay(session.date)}, {formatTime(session.startsAt, studio.timezone)}
      </h1>
      <p className={styles.subtitle}>
        {session.groupName}, {session.durationMinutes} dk
        {session.status === 'cancelled' && ' (ders iptal edildi)'}
      </p>

      <div className={styles.rosterFill}>
        <span className={styles.bar} aria-hidden="true">
          <span style={{ width: `${fill}%` }} />
        </span>
        <strong>
          {session.bookedCount}/{session.capacity}
        </strong>
        <span className={styles.muted}>{session.freeSpots > 0 ? `${session.freeSpots} boş` : 'dolu'}</span>
      </div>

      <h2 className={styles.listLabel}>Gelecekler</h2>
      {attending.length === 0 ? (
        <p className={styles.muted}>Bu derse gelecek kimse yok.</p>
      ) : (
        <ul className={styles.people}>
          {attending.map((person) => (
            <li key={person.id} className={styles.person}>
              <span>{person.fullName}</span>
              {person.state === 'makeup' && <span className={styles.tagMakeup}>Telafi</span>}
            </li>
          ))}
        </ul>
      )}

      {notAttending.length > 0 && (
        <>
          <h2 className={styles.listLabel}>Gelmeyecekler</h2>
          <ul className={styles.people}>
            {notAttending.map((person) => (
              <li key={person.id} className={`${styles.person} ${styles.inactive}`}>
                <span>{person.fullName}</span>
                <span className={styles.reason}>{reasonText(person)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
