import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Monogram from '../components/Monogram.jsx';
import Sheet from '../components/Sheet.jsx';
import { addDays, formatDay, formatDayMonth, formatTime, formatWeekdayTime, todayIn, weekLabel } from '../format.js';
import MakeupPickerPage from './MakeupPickerPage.jsx';
import styles from './MySessionsPage.module.css';

function fetchMyData() {
  return Promise.all([api('/api/me/sessions'), api('/api/me/credits')]).then(([s, c]) => ({
    sessions: s.sessions,
    credits: c.credits,
    // Son tarih karşılaştırmaları için "şimdi", veri geldiği anda bir kez alınır (render sırasında değil).
    loadedAt: Date.now(),
  }));
}

// Müşterinin derse "geleceği" durumlar: düzenli dersi (iptal etmemiş) ya da telafisi.
const isComing = (session) =>
  session.status === 'scheduled' && (session.myStatus === 'attending' || session.myStatus === 'makeup');

const isPast = (instant, now) => new Date(instant).getTime() <= now;

// Ders listesini "Bu hafta / Gelecek hafta / Daha sonra" başlıklarına böler (sıra korunur).
function groupByWeek(sessions, today) {
  const groups = [];
  for (const session of sessions) {
    const label = weekLabel(session.date, today);
    if (groups.at(-1)?.label !== label) groups.push({ label, sessions: [] });
    groups.at(-1).sessions.push(session);
  }
  return groups;
}

export default function MySessionsPage({ user, studio, onLogout }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sheetSession, setSheetSession] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  // Telafi seçme ekranı: { from: ders } "yerine şuna gel" için, { from: null } hakkını kullanmak için.
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const timeZone = studio.timezone;

  function reload() {
    return fetchMyData().then(setData, (err) => setLoadError(err.message));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sadece açılışta bir kez
  }, []);

  // Bildirim birkaç saniye sonra kendiliğinden kaybolur.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Her işlem aynı kalıpta: gönder, listeyi yenile, sonucu bildirimle söyle. Hata olursa da liste
  // yenilenir (ör. "ders doldu" dendiyse ekran güncel doluluğu göstersin).
  async function perform(request, successText) {
    setBusy(true);
    try {
      const result = await request();
      setToast({ tone: 'success', text: typeof successText === 'function' ? successText(result) : successText });
      setSheetSession(null);
      setPicker(null);
    } catch (err) {
      setToast({ tone: 'error', text: err.message });
    } finally {
      await reload().catch(() => {});
      setBusy(false);
    }
  }

  const cancelOnly = (session) =>
    perform(
      () => api(`/api/sessions/${session.id}/cancel`, { method: 'POST' }),
      (result) => `İptal edildi. Telafi hakkın ${formatDayMonth(result.expiresAt, timeZone)} tarihine kadar geçerli.`,
    );

  const undoCancel = (session) =>
    perform(
      () => api(`/api/sessions/${session.id}/undo-cancel`, { method: 'POST' }),
      `${formatDay(session.date)} dersine yeniden kayıtlısın.`,
    );

  const dropMakeup = (session) =>
    perform(
      () => api(`/api/sessions/${session.id}/makeup`, { method: 'DELETE' }),
      (result) => (result.refunded ? 'Telafi kaydın silindi, hakkın geri geldi.' : 'Telafi kaydın silindi.'),
    );

  function pickMakeup(target) {
    const label = `${formatDay(target.date)} ${formatTime(target.startsAt, timeZone)}`;
    if (picker.from) {
      return perform(
        () => api(`/api/sessions/${picker.from.id}/swap`, { method: 'POST', body: { toSessionId: target.id } }),
        `Tamam, ${label} dersine geliyorsun.`,
      );
    }
    return perform(() => api(`/api/sessions/${target.id}/makeup`, { method: 'PUT' }), `Telafin kaydedildi: ${label}.`);
  }

  const toastView = toast && (
    <p className={`${styles.toast} ${toast.tone === 'error' ? styles.toastError : ''}`} role="status">
      {toast.text}
    </p>
  );

  if (picker) {
    return (
      <>
        <MakeupPickerPage
          studio={studio}
          from={picker.from}
          busy={busy}
          onBack={() => setPicker(null)}
          onPick={pickMakeup}
        />
        {toastView}
      </>
    );
  }

  if (loadError) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Derslerim</h1>
        <p className={styles.muted}>{loadError}</p>
      </main>
    );
  }
  if (!data) return null;

  const today = todayIn(timeZone);
  const next = data.sessions.find(isComing);
  const rest = data.sessions.filter((session) => session !== next);
  const credits = data.credits;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Monogram size="small" />
        <button type="button" className={styles.account} onClick={() => setAccountOpen(true)}>
          {user.fullName.split(' ')[0]}
        </button>
      </header>
      <h1 className={styles.title}>Derslerim</h1>

      {next ? (
        <section className={styles.next} aria-label="Sıradaki dersin">
          <p className={styles.nextLabel}>{next.myStatus === 'makeup' ? 'Sıradaki dersin (telafi)' : 'Sıradaki dersin'}</p>
          <p className={styles.nextDay}>{formatDay(next.date)}</p>
          <div className={styles.nextBottom}>
            <span className={styles.nextTime}>{formatTime(next.startsAt, timeZone)}</span>
            <button type="button" className={styles.nextButton} onClick={() => setSheetSession(next)}>
              Gelemiyorum
            </button>
          </div>
        </section>
      ) : (
        <p className={styles.empty}>
          Önümüzdeki günlerde dersin görünmüyor. Bir yanlışlık olduğunu düşünüyorsan stüdyoya yaz.
        </p>
      )}

      {credits.length > 0 && (
        <section className={styles.credits}>
          <p>
            <strong>
              {credits.length} telafi hakkın var.
            </strong>
            <br />
            <span className={styles.muted}>
              {credits.length === 1 ? '' : 'İlki '}
              {formatDayMonth(credits[0].expiresAt, timeZone)} tarihine kadar kullanabilirsin.
            </span>
          </p>
          <button type="button" className={styles.creditsButton} onClick={() => setPicker({ from: null })}>
            Telafi seç
          </button>
        </section>
      )}

      {groupByWeek(rest, today).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className={styles.weekLabel}>{group.label}</h2>
          <ul className={styles.list}>
            {group.sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                timeZone={timeZone}
                now={data.loadedAt}
                busy={busy}
                onOpen={() => setSheetSession(session)}
                onUndo={() => undoCancel(session)}
              />
            ))}
          </ul>
        </section>
      ))}

      <Sheet
        open={Boolean(sheetSession)}
        onClose={() => setSheetSession(null)}
        title={sheetSession ? `${formatDay(sheetSession.date)}, ${formatTime(sheetSession.startsAt, timeZone)}` : ''}
      >
        {sheetSession && (
          <CantComeOptions
            session={sheetSession}
            studio={studio}
            now={data.loadedAt}
            busy={busy}
            onSwap={() => setPicker({ from: sheetSession })}
            onCancelOnly={() => cancelOnly(sheetSession)}
            onDropMakeup={() => dropMakeup(sheetSession)}
            onClose={() => setSheetSession(null)}
          />
        )}
      </Sheet>

      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title={user.fullName}>
        <button type="button" className={styles.option} onClick={onLogout}>
          <span className={styles.optionTitle}>Çıkış yap</span>
        </button>
      </Sheet>

      {toastView}
    </main>
  );
}

function SessionRow({ session, timeZone, now, busy, onOpen, onUndo }) {
  const time = <span className={styles.time}>{formatTime(session.startsAt, timeZone)}</span>;
  const day = <span className={styles.day}>{formatDay(session.date)}</span>;

  if (session.status === 'cancelled') {
    return (
      <li className={`${styles.row} ${styles.inactive}`}>
        <div>
          {day}
          <p className={styles.rowNote}>Stüdyo bu dersi iptal etti.</p>
        </div>
        {time}
      </li>
    );
  }
  if (session.myStatus === 'frozen') {
    return (
      <li className={`${styles.row} ${styles.inactive}`}>
        <div>
          {day}
          <p className={styles.rowNote}>Üyeliğin bu tarihte dondurulmuş.</p>
        </div>
        {time}
      </li>
    );
  }
  if (session.myStatus === 'cancelled') {
    return (
      <li className={`${styles.row} ${styles.inactive}`}>
        <div>
          <span className={`${styles.day} ${styles.struck}`}>{formatDay(session.date)}</span>
          <p className={styles.rowNote}>
            İptal ettin.{' '}
            {session.canUndoCancel && !isPast(session.startsAt, now) && (
              <button type="button" className={styles.inlineButton} onClick={onUndo} disabled={busy}>
                Geri al
              </button>
            )}
          </p>
        </div>
        {time}
      </li>
    );
  }
  // Geleceği dersler: satırın tamamı "Gelemiyorum" panelini açan bir düğme.
  return (
    <li>
      <button type="button" className={`${styles.row} ${styles.rowButton}`} onClick={onOpen}>
        <div>
          {day}
          {session.myStatus === 'makeup' && <span className={styles.tag}>Telafi</span>}
        </div>
        {time}
      </button>
    </li>
  );
}

function CantComeOptions({ session, studio, now, busy, onSwap, onCancelOnly, onDropMakeup, onClose }) {
  const timeZone = studio.timezone;
  const deadline = formatWeekdayTime(session.cancelDeadlineAt, timeZone);

  if (isPast(session.cancelDeadlineAt, now)) {
    return (
      <>
        <p className={styles.sheetNote}>
          Bu ders için iptal süresi doldu (son saat: {deadline}). Gelemeyeceksen stüdyoya haber ver.
        </p>
        <button type="button" className={styles.closeLink} onClick={onClose}>
          Tamam
        </button>
      </>
    );
  }

  if (session.myStatus === 'makeup') {
    return (
      <>
        <p className={styles.sheetNote}>Bırakman için son saat: {deadline}</p>
        <button type="button" className={styles.option} onClick={onDropMakeup} disabled={busy}>
          <span className={styles.optionTitle}>Telafiden vazgeç</span>
          <span className={styles.optionText}>Yerin başka birine açılır.</span>
        </button>
        <button type="button" className={styles.closeLink} onClick={onClose}>
          Vazgeç, geliyorum
        </button>
      </>
    );
  }

  const creditUntil = formatDayMonth(addDays(session.startsAt, studio.creditValidityDays), timeZone);
  return (
    <>
      <p className={styles.sheetNote}>İptal için son saat: {deadline}</p>
      <button type="button" className={`${styles.option} ${styles.optionPrimary}`} onClick={onSwap} disabled={busy}>
        <span className={styles.optionTitle}>Yerine başka bir derse gel</span>
        <span className={styles.optionText}>Boş yeri olan derslerden birini seç</span>
      </button>
      <button type="button" className={styles.option} onClick={onCancelOnly} disabled={busy}>
        <span className={styles.optionTitle}>Sadece iptal et</span>
        <span className={styles.optionText}>Telafi hakkın {creditUntil} tarihine kadar saklanır</span>
      </button>
      <button type="button" className={styles.closeLink} onClick={onClose}>
        Vazgeç, geliyorum
      </button>
    </>
  );
}
