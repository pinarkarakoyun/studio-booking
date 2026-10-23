import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDay, formatDayShort, formatTime } from '../format.js';
import styles from './MakeupPickerPage.module.css';

// Telafi dersi seçme ekranı. İki yerden açılır:
//   from = bir ders  -> "bu ders yerine şuna gel" (iptal + telafi tek işlem)
//   from = null      -> elindeki telafi hakkını kullan
export default function MakeupPickerPage({ studio, from, busy, onBack, onPick }) {
  const [sessions, setSessions] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  // Yanlışlıkla dokunmaya karşı iki adım: "Seç" -> "Onayla".
  const [pendingId, setPendingId] = useState(null);
  // "Kayıt kapandı mı?" kararı için şimdiki zaman, veri gelince bir kez alınır; render sırasında
  // her seferinde new Date() çağırmak aynı ekranda farklı sonuçlar verebilirdi.
  const [loadedAt, setLoadedAt] = useState(null);
  const timeZone = studio.timezone;

  useEffect(() => {
    api('/api/sessions').then(
      ({ sessions: all }) => {
        // Kendi dersleri (düzenli ya da zaten telafi) seçenek değil; bırakılan ders de değil.
        const options = all.filter((session) => session.myStatus === null && session.id !== from?.id);
        setSessions(options);
        setLoadedAt(Date.now());
        setSelectedDate(options[0]?.date ?? null);
      },
      (err) => setLoadError(err.message),
    );
  }, [from]);

  const dates = sessions ? [...new Set(sessions.map((session) => session.date))] : [];
  const daySessions = sessions?.filter((session) => session.date === selectedDate) ?? [];

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={onBack}>
        ‹ Geri
      </button>
      <h1 className={styles.title}>Telafi dersi seç</h1>
      <p className={styles.subtitle}>
        {from
          ? `${formatDay(from.date)} ${formatTime(from.startsAt, timeZone)} yerine`
          : 'Telafi hakkını kullanacağın dersi seç'}
      </p>

      {loadError && <p className={styles.subtitle}>{loadError}</p>}

      {sessions && sessions.length === 0 && (
        <p className={styles.empty}>
          Önümüzdeki günlerde seçebileceğin bir ders yok. Stüdyoya WhatsApp'tan sorabilirsin.
        </p>
      )}

      {dates.length > 0 && (
        <div className={styles.days} role="tablist" aria-label="Gün">
          {dates.map((date) => {
            const { weekday, day } = formatDayShort(date);
            const selected = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={formatDay(date)}
                className={`${styles.dayChip} ${selected ? styles.dayChipSelected : ''}`}
                onClick={() => {
                  setSelectedDate(date);
                  setPendingId(null);
                }}
              >
                <span className={styles.dayChipWeekday}>{weekday}</span>
                <span className={styles.dayChipNumber}>{day}</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedDate && (
        <section role="tabpanel" aria-label={formatDay(selectedDate)}>
          <h2 className={styles.dayTitle}>{formatDay(selectedDate)}</h2>
          <ul className={styles.list}>
            {daySessions.map((session) => (
              <SessionOption
                key={session.id}
                session={session}
                timeZone={timeZone}
                now={loadedAt}
                busy={busy}
                pending={pendingId === session.id}
                onSelect={() => setPendingId(session.id)}
                onCancel={() => setPendingId(null)}
                onConfirm={() => onPick(session)}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function SessionOption({ session, timeZone, now, busy, pending, onSelect, onCancel, onConfirm }) {
  const full = session.freeSpots <= 0;
  const closed = new Date(session.makeupDeadlineAt).getTime() <= now;
  const fill = Math.min(100, Math.round((session.bookedCount / session.capacity) * 100));
  const time = formatTime(session.startsAt, timeZone);

  return (
    <li className={`${styles.option} ${full || closed ? styles.optionUnavailable : ''}`}>
      <div>
        <span className={styles.time}>{time}</span>
        {!full && !closed && (
          <span className={styles.bar} aria-hidden="true">
            <span style={{ width: `${fill}%` }} />
          </span>
        )}
        <span className={styles.spots}>
          {full ? 'Dolu' : closed ? 'Telafi kaydı kapandı' : `${session.freeSpots} boş yer`}
        </span>
      </div>

      {!full && !closed && (
        pending ? (
          <div className={styles.confirm}>
            <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
              Vazgeç
            </button>
            <button type="button" className={styles.pick} onClick={onConfirm} disabled={busy}>
              {busy ? 'Kaydediliyor…' : 'Onayla'}
            </button>
          </div>
        ) : (
          <button type="button" className={styles.pick} onClick={onSelect} aria-label={`${time} dersini seç`}>
            Seç
          </button>
        )
      )}
    </li>
  );
}
