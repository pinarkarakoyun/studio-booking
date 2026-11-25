import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Monogram from '../components/Monogram.jsx';
import Sheet from '../components/Sheet.jsx';
import { addDays, formatDateDayMonth, formatDay, formatTime, formatWeekday, todayIn } from '../format.js';
import styles from './Admin.module.css';
import { showExtraTag } from '../extraSession.js';
import ExtraSessionForm from './ExtraSessionForm.jsx';
import { can, isInstructor } from './permissions.js';

const shiftDay = (date, days) => addDays(`${date}T12:00:00Z`, days).slice(0, 10);

// Bugünün dersleri ve uyarıları; ‹ › ile başka günlere de bakılır (ör. bayramda ileri tarihli dersi iptal etmek).
// date null ise bugün. Uyarılar ve "Yarın" satırı sadece bugünün ekranında.
export default function TodayPage({
  user, studio, date, onChangeDate, branchFilter, onBranchFilterChange, mineOnly, onMineOnlyChange, onOpenSession,
  onOpenAccount, onExtraCreated,
}) {
  const [extraOpen, setExtraOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const timeZone = studio.timezone;
  const today = todayIn(timeZone);
  const shown = date ?? today;
  const isToday = shown === today;
  const pickerRef = useRef(null);
  // Şube süzgeci: yalnızca çok şubeli stüdyoda. '' = tüm şubeler. Seçim AdminApp'te tutulur (gün değişince korunur).
  // Eğitmen yalnızca kendi şubelerini görür; tek şubesi varsa süzgeç gereksiz.
  const instructor = isInstructor(user);
  const multiBranch = instructor ? user.branches.length > 1 : studio.branchCount > 1;
  // Şube adı derslerde, stüdyonun birden çok şubesi varsa yazılır (eğitmenin tek şubesi olsa bile hangisi olduğu belli olsun).
  const showBranchName = studio.branchCount > 1;
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    const url = isToday ? '/api/admin/today' : `/api/admin/day?date=${shown}`;
    api(url).then(setData, (err) => setError(err.message));
  }, [isToday, shown]);

  useEffect(() => {
    if (!multiBranch) return;
    api('/api/admin/branches').then(({ branches: list }) => setBranches(list.filter((b) => b.isActive)), () => {});
  }, [multiBranch]);

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
      <Monogram size="small" logoUrl={studio.logoUrl} name={studio.name} />
      <button type="button" className={styles.account} onClick={onOpenAccount}>
        {user.fullName.split(' ')[0]}
      </button>
    </header>
  );

  if (error || !data) {
    return (
      <main className={styles.page}>
        {header}
        {dayNav}
        <h1 className={styles.title}>{title}</h1>
        {error && <p className={styles.muted}>{error}</p>}
      </main>
    );
  }

  // Süzme istemcide: bir günün ders sayısı küçük, sunucuya ayrı istek gerekmez.
  // Eğitmen: "Benim derslerim" (varsayılan) ya da şubelerinin bütün dersleri (yerine derse girmek için).
  const sessions = data.sessions
    .filter((s) => !(multiBranch && branchFilter) || String(s.branch.id) === branchFilter)
    .filter((s) => !(instructor && mineOnly) || s.isMine);
  const scheduled = sessions.filter((s) => s.status === 'scheduled');
  const people = scheduled.reduce((sum, s) => sum + s.bookedCount, 0);
  const fullCount = scheduled.filter((s) => s.bookedCount >= s.capacity).length;
  const { fullSessions, recentCancellations } = data.alerts ?? { fullSessions: [], recentCancellations: [] };
  const hasAlerts = fullSessions.length > 0 || recentCancellations.length > 0;

  return (
    <main className={styles.page}>
      {header}
      {/* Prototipteki gibi tarih başlığın üstünde; ‹ › ile gün değişir. */}
      {dayNav}
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{title}</h1>
        {can(user, 'create_extra_sessions') && (
          <button type="button" className={styles.addLink} onClick={() => setExtraOpen(true)}>
            + Ek ders
          </button>
        )}
      </div>
      {!isToday && (
        <p className={styles.subtitle}>
          <button type="button" className={styles.inlineButton} onClick={() => onChangeDate(null)}>
            Bugüne dön
          </button>
        </p>
      )}

      {/* Özet kartları: yalnızca bu ekranın zaten çektiği günün derslerinden (yeni istek yok). */}
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Ders</dt>
          <dd>{scheduled.length}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Kayıtlı kişi</dt>
          <dd>{people}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Dolu ders</dt>
          <dd>{fullCount}</dd>
        </div>
      </dl>

      {instructor && (
        <div className={styles.chips} role="group" aria-label="Hangi dersler">
          <button
            type="button"
            className={`${styles.chip} ${mineOnly ? styles.chipOn : ''}`}
            aria-pressed={mineOnly}
            onClick={() => onMineOnlyChange(true)}
          >
            Benim derslerim
          </button>
          <button
            type="button"
            className={`${styles.chip} ${!mineOnly ? styles.chipOn : ''}`}
            aria-pressed={!mineOnly}
            onClick={() => onMineOnlyChange(false)}
          >
            Bütün dersler
          </button>
        </div>
      )}

      {multiBranch && (
        <label className={styles.muted}>
          Şube:{' '}
          <select value={branchFilter} onChange={(e) => onBranchFilterChange(e.target.value)}>
            <option value="">Tüm şubeler</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      )}

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

      <h2 className={styles.sectionLabel}>{isToday ? 'Bugünün dersleri' : 'Dersler'}</h2>
      {sessions.length === 0 && (
        <p className={styles.emptyCard}>
          {instructor && mineOnly && data.sessions.length > 0 ? 'Bu gün senin dersin yok.' : 'Bu gün ders yok.'}
        </p>
      )}
      <ul className={styles.sessionList}>
        {sessions.map((session) => (
          <li key={session.id}>
            <SessionRow
              session={session}
              multiBranch={showBranchName}
              packageModel={studio.membershipModel === 'package'}
              timeZone={timeZone}
              onOpen={() => onOpenSession(session.id)}
            />
          </li>
        ))}
      </ul>

      <Sheet open={extraOpen} onClose={() => setExtraOpen(false)} title="Ek ders aç">
        {extraOpen && (
          <ExtraSessionForm
            user={user}
            studio={studio}
            onCreated={(result) => {
              setExtraOpen(false);
              onExtraCreated(result.session);
            }}
          />
        )}
      </Sheet>

      {data.tomorrow && (
        <p className={styles.tomorrow}>
          Yarın: {formatWeekday(data.tomorrow.date)},{' '}
          {data.tomorrow.sessionCount > 0 ? `${data.tomorrow.sessionCount} ders` : 'ders yok'}
        </p>
      )}
    </main>
  );
}

// Prototipteki ders kartı: solda serif saat, ortada grup adı ve doluluk, sağda sayı.
function SessionRow({ session, multiBranch, packageModel, timeZone, onOpen }) {
  const cancelledByStudio = session.status === 'cancelled';
  const full = session.bookedCount >= session.capacity;
  const freeSpots = Math.max(0, session.capacity - session.bookedCount);

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
          {multiBranch && ` · ${session.branch.name}`}
        </span>
        {session.instructor && <span className={styles.sessionInstructor}>{session.instructor.name}</span>}
        <span className={styles.sessionMeta}>
          {cancelledByStudio ? 'Ders iptal edildi' : full ? 'Dolu' : `${freeSpots} yer boş`}
          {showExtraTag(session) && <span className={styles.tagExtra}>Ek ders</span>}
          {session.makeupCount > 0 && <span className={styles.tagMakeup}>+{session.makeupCount} {packageModel ? 'eklendi' : 'telafi'}</span>}
          {!cancelledByStudio && session.cancelledCount > 0 && (
            <span className={styles.tagCancel}>{session.cancelledCount} iptal</span>
          )}
        </span>
      </span>
      <span className={`${styles.sessionCount} ${full && !cancelledByStudio ? styles.full : ''}`}>
        {session.bookedCount}/{session.capacity}
      </span>
    </button>
  );
}
