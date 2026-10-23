import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Monogram from '../components/Monogram.jsx';
import { addDays, formatDateDayMonth, formatDay, formatTime, formatWeekday, todayIn } from '../format.js';
import styles from './Admin.module.css';

const shiftDay = (date, days) => addDays(`${date}T12:00:00Z`, days).slice(0, 10);

// Bugünün dersleri ve uyarıları; ‹ › ile başka günlere de bakılır (ör. bayramda ileri tarihli dersi iptal etmek).
// date null ise bugün. Uyarılar ve "Yarın" satırı sadece bugünün ekranında.
export default function TodayPage({ user, studio, date, onChangeDate, onOpenSession, onOpenAccount }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const timeZone = studio.timezone;
  const today = todayIn(timeZone);
  const shown = date ?? today;
  const isToday = shown === today;
  const pickerRef = useRef(null);

  useEffect(() => {
    const url = isToday ? '/api/admin/today' : `/api/admin/day?date=${shown}`;
    api(url).then(setData, (err) => setError(err.message));
  }, [isToday, shown]);

  // Başlık "Bugün / Yarın / Dün" ya da gün adı; tarih satırı başlığı tekrar etmesin diye gün adı başlıktaysa
  // sadece "26 Ekim" yazar.
  const relative = { [today]: 'Bugün', [shiftDay(today, 1)]: 'Yarın', [shiftDay(today, -1)]: 'Dün' }[shown];
  const title = relative ?? formatWeekday(shown);
  const dateLabel = relative ? formatDay(shown) : formatDateDayMonth(shown);

  const go = (next) => onChangeDate(next === today ? null : next);
  const dayNav = (
    <div className={styles.dayNav}>
      <button type="button" className={styles.dayArrow} aria-label="Önceki gün" onClick={() => go(shiftDay(shown, -1))}>
        ‹
      </button>
      {/* Tarihe dokununca telefonun kendi tarih seçicisi açılır. */}
      <label className={styles.dayPick}>
        {dateLabel}
        <input
          ref={pickerRef}
          type="date"
          value={shown}
          aria-label="Gün seç"
          onClick={() => pickerRef.current?.showPicker?.()}
          onChange={(e) => e.target.value && go(e.target.value)}
        />
      </label>
      <button type="button" className={styles.dayArrow} aria-label="Sonraki gün" onClick={() => go(shiftDay(shown, 1))}>
        ›
      </button>
    </div>
  );

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
        <h1 className={styles.title}>{title}</h1>
        {dayNav}
        {error && <p className={styles.muted}>{error}</p>}
      </main>
    );
  }

  const scheduled = data.sessions.filter((s) => s.status === 'scheduled');
  const people = scheduled.reduce((sum, s) => sum + s.bookedCount, 0);
  const { fullSessions, recentCancellations } = data.alerts ?? { fullSessions: [], recentCancellations: [] };
  const hasAlerts = fullSessions.length > 0 || recentCancellations.length > 0;

  return (
    <main className={styles.page}>
      {header}
      <h1 className={styles.title}>{title}</h1>
      {dayNav}
      <p className={styles.subtitle}>
        {scheduled.length > 0 ? `${scheduled.length} ders, ${people} kişi` : 'Ders yok'}
        {!isToday && (
          <>
            {', '}
            <button type="button" className={styles.inlineButton} onClick={() => onChangeDate(null)}>
              bugüne dön
            </button>
          </>
        )}
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

      {data.tomorrow && (
        <p className={styles.tomorrow}>
          Yarın: {formatWeekday(data.tomorrow.date)},{' '}
          {data.tomorrow.sessionCount > 0 ? `${data.tomorrow.sessionCount} ders` : 'ders yok'}
        </p>
      )}
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
          {!cancelledByStudio && session.cancelledCount > 0 && (
            <span className={styles.tagCancel}>{session.cancelledCount} iptal</span>
          )}
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
