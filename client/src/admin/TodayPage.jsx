import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Monogram from '../components/Monogram.jsx';
import { formatDay, formatTime, formatWeekday } from '../format.js';
import styles from './Admin.module.css';

export default function TodayPage({ user, studio, onOpenSession, onOpenAccount }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const timeZone = studio.timezone;

  useEffect(() => {
    api('/api/admin/today').then(setData, (err) => setError(err.message));
  }, []);

  const header = (
    <header className={styles.header}>
      <Monogram size="small" logoUrl={studio.logoUrl} />
      <button type="button" className={styles.account} onClick={onOpenAccount}>
        {user.fullName.split(' ')[0]}
      </button>
    </header>
  );

  if (error || !data) {
    return (
      <main className={styles.page}>
        {header}
        <h1 className={styles.title}>Bugün</h1>
        {error && <p className={styles.muted}>{error}</p>}
      </main>
    );
  }

  const scheduled = data.sessions.filter((s) => s.status === 'scheduled');
  const people = scheduled.reduce((sum, s) => sum + s.bookedCount, 0);
  const { fullSessions, recentCancellations } = data.alerts;
  const hasAlerts = fullSessions.length > 0 || recentCancellations.length > 0;

  return (
    <main className={styles.page}>
      {header}
      <h1 className={styles.title}>Bugün</h1>
      <p className={styles.subtitle}>
        {formatDay(data.date)}
        {scheduled.length > 0 ? `, ${scheduled.length} ders, ${people} kişi` : ', ders yok'}
      </p>

      {/* Dikkat edilecekler: sadece gösterecek bir şey varsa görünür. */}
      {hasAlerts && (
        <section className={styles.alerts} aria-label="Dikkat edilecekler">
          <ul>
            {fullSessions.map((s) => (
              <li key={`full-${s.id}`}>
                <strong>
                  {formatWeekday(s.date)} {formatTime(s.startsAt, timeZone)}
                </strong>{' '}
                dersi dolu
              </li>
            ))}
            {recentCancellations.map((c) => (
              <li key={`cancel-${c.sessionId}-${c.fullName}`}>
                <strong>{c.fullName}</strong> {formatWeekday(c.date)} {formatTime(c.startsAt, timeZone)} dersini iptal
                etti
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className={styles.list}>
        {data.sessions.map((session) => (
          <li key={session.id}>
            <SessionRow session={session} timeZone={timeZone} onOpen={() => onOpenSession(session.id)} />
          </li>
        ))}
      </ul>

      <p className={styles.tomorrow}>
        Yarın: {formatWeekday(data.tomorrow.date)},{' '}
        {data.tomorrow.sessionCount > 0 ? `${data.tomorrow.sessionCount} ders` : 'ders yok'}
      </p>
    </main>
  );
}

function SessionRow({ session, timeZone, onOpen }) {
  const cancelledByStudio = session.status === 'cancelled';
  const full = session.bookedCount >= session.capacity;
  const fill = Math.min(100, Math.round((session.bookedCount / session.capacity) * 100));

  return (
    <button
      type="button"
      className={`${styles.sessionRow} ${cancelledByStudio ? styles.inactive : ''}`}
      onClick={onOpen}
    >
      <span className={styles.sessionTime}>
        {formatTime(session.startsAt, timeZone)}
        {session.hasEnded && <span className={styles.ended}>bitti</span>}
      </span>
      <span className={styles.sessionMiddle}>
        <span className={styles.sessionGroup}>
          {session.groupName}
          {session.makeupCount > 0 && <span className={styles.tagMakeup}>+{session.makeupCount} telafi</span>}
          {session.cancelledCount > 0 && <span className={styles.tagCancel}>{session.cancelledCount} iptal</span>}
        </span>
        {cancelledByStudio ? (
          <span className={styles.ended}>Ders iptal edildi</span>
        ) : (
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${fill}%` }} />
          </span>
        )}
      </span>
      <span className={`${styles.sessionCount} ${full ? styles.full : ''}`}>
        {session.bookedCount}/{session.capacity}
      </span>
    </button>
  );
}
