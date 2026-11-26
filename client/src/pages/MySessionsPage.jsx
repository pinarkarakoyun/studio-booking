import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Monogram from '../components/Monogram.jsx';
import Sheet from '../components/Sheet.jsx';
import Toast from '../components/Toast.jsx';
import { useToast } from '../components/useToast.js';
import Button from '../components/Button.jsx';
import { addDays, formatDay, formatDayMonth, formatTime, formatWeekdayTime, todayIn, weekLabel } from '../format.js';
import MakeupPickerPage, { SessionOption } from './MakeupPickerPage.jsx';
import { membershipNotice } from '../membershipNotice.js';
import ChangePasswordPage from './ChangePasswordPage.jsx';
import MyMembershipPage from './MyMembershipPage.jsx';
import styles from './MySessionsPage.module.css';

// Paket modelinde ek dersler ayrıca çekilir ("Ek dersler" bölümü); grup modelinde telafi listesinde zaten var.
function fetchMyData(packageModel) {
  return Promise.all([
    api('/api/me/sessions'),
    api('/api/me/credits'),
    api('/api/me/membership'),
    packageModel ? api('/api/me/extra-sessions') : Promise.resolve({ sessions: [] }),
  ]).then(([s, c, m, e]) => ({
    sessions: s.sessions,
    credits: c.credits,
    membership: m.membership,
    extraSessions: e.sessions,
    // Son tarih karşılaştırmaları için "şimdi", veri geldiği anda bir kez alınır (render sırasında değil).
    loadedAt: Date.now(),
  }));
}

// Müşterinin derse "geleceği" durumlar: düzenli dersi (iptal etmemiş) ya da telafisi.
const isComing = (session) =>
  session.status === 'scheduled' && (session.myStatus === 'attending' || session.myStatus === 'makeup');

const isPast = (instant, now) => new Date(instant).getTime() <= now;

// weekLabel'ın iki haftadan sonrası için verdiği başlık; bu gruptakiler başta gizli.
const LATER = 'Daha sonra';

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
  // "Gelemiyorum" penceresinin açıldığı an: son iptal saati geçti mi kararı sayfanın yüklendiği ana değil buna bakar
  // (sayfa sabah açılıp öğlen dokunulursa geç iptal uyarısı atlanmasın).
  const [sheetOpenedAt, setSheetOpenedAt] = useState(null);
  const openSheet = (session) => {
    setSheetOpenedAt(Date.now());
    setSheetSession(session);
  };
  // Ana ekran ('home'), Üyeliğim ('membership') ya da oradan açılan şifre değiştirme ('password').
  const [view, setView] = useState('home');
  // Liste varsayılan olarak bu hafta + gelecek haftayı gösterir; sonrası istenirse açılır.
  const [showLater, setShowLater] = useState(false);
  // Telafi seçme ekranı: { from: ders } "yerine şuna gel" için, { from: null } hakkını kullanmak için.
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  // "Ek dersler" bölümünde onay bekleyen ders (Bu derse gel → Onayla).
  const [pendingExtra, setPendingExtra] = useState(null);
  const { toast, showToast } = useToast();
  const timeZone = studio.timezone;
  // Seans paketi modelinde telafi yok: iptal paketten düşmeyi belirler, telafi seçme ve hak metinleri gizli.
  const packageModel = studio.membershipModel === 'package';

  function reload() {
    return fetchMyData(packageModel).then(setData, (err) => setLoadError(err.message));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sadece açılışta bir kez
  }, []);

  // Her işlem aynı kalıpta: gönder, listeyi yenile, sonucu bildirimle söyle. Hata olursa da liste
  // yenilenir (ör. "ders doldu" dendiyse ekran güncel doluluğu göstersin).
  async function perform(request, successText) {
    setBusy(true);
    try {
      const result = await request();
      showToast('success', typeof successText === 'function' ? successText(result) : successText);
      setSheetSession(null);
      setPicker(null);
      setPendingExtra(null);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      await reload().catch(() => {});
      setBusy(false);
    }
  }

  const cancelOnly = (session) =>
    perform(
      () => api(`/api/sessions/${session.id}/cancel`, { method: 'POST' }),
      (result) => {
        if (!packageModel) return `İptal edildi. Telafi hakkın ${formatDayMonth(result.expiresAt, timeZone)} tarihine kadar geçerli.`;
        return result.late && studio.lateCancelBurnsSession
          ? 'İptal edildi. Son saat geçtiği için bu seans paketinden düşecek.'
          : 'İptal edildi. Bu seans paketinden düşmez.';
      },
    );

  const undoCancel = (session) =>
    perform(
      () => api(`/api/sessions/${session.id}/undo-cancel`, { method: 'POST' }),
      `${formatDay(session.date)} dersine yeniden kayıtlısın.`,
    );

  const dropMakeup = (session) =>
    perform(
      () => api(`/api/sessions/${session.id}/makeup`, { method: 'DELETE' }),
      (result) => {
        const what = session.kind === 'extra' ? 'Ek ders kaydın' : 'Telafi kaydın';
        return result.refunded ? `${what} silindi, telafi hakkın geri geldi.` : `${what} silindi.`;
      },
    );

  // Paket modelinde ek derse kayıt: ders bittiğinde paketinden bir seans düşer.
  const bookExtra = (session) =>
    perform(
      () => api(`/api/sessions/${session.id}/makeup`, { method: 'PUT' }),
      `Ek derse kaydın alındı: ${formatDay(session.date)} ${formatTime(session.startsAt, timeZone)}. Ders bittiğinde paketinden bir seans düşer.`,
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

  const toastView = <Toast toast={toast} />;

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

  if (view === 'password') {
    return (
      <>
        <ChangePasswordPage
          user={user}
          studio={studio}
          voluntary
          onCancel={() => setView('membership')}
          onChanged={async () => {
            setView('membership');
            showToast('success', 'Şifren değiştirildi.');
          }}
          onLogout={onLogout}
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
  const weeks = groupByWeek(rest, today);
  const visibleWeeks = showLater ? weeks : weeks.filter((group) => group.label !== LATER);
  const hasHiddenWeeks = visibleWeeks.length < weeks.length;
  const credits = data.credits;
  // Henüz kayıt olunmamış ek dersler (kayıt olunanlar aşağıdaki listede zaten görünür).
  const openExtras = data.extraSessions.filter((s) => s.myStatus === null);

  if (view === 'membership') {
    return (
      <>
        <MyMembershipPage
          user={user}
          data={data}
          packageModel={packageModel}
          timeZone={timeZone}
          onBack={() => setView('home')}
          onPickMakeup={() => setPicker({ from: null })}
          onChangePassword={() => setView('password')}
          onLogout={onLogout}
        />
        {toastView}
      </>
    );
  }

  // Ana ekranda üyelikten yalnızca iş gerektirenler: yenileme uyarısı, telafi hakkı ya da kalan seans.
  const notice = membershipNotice({
    membership: data.membership,
    packageModel,
    reminderDays: studio.paymentReminderDays ?? 7,
    today,
  });
  const membership = data.membership;
  const sessionsLeft = packageModel && membership && !membership.ended && membership.remaining > 0 ? membership.remaining : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Monogram size="small" logoUrl={studio.logoUrl} name={studio.name} />
        <button type="button" className={styles.account} onClick={() => setView('membership')}>
          {user.fullName.split(' ')[0]}
        </button>
      </header>
      <h1 className={styles.greeting}>
        <span className={styles.hello}>Merhaba,</span>
        <span className={styles.name}>{user.fullName}</span>
      </h1>
      {notice && (
        <button type="button" className={styles.notice} onClick={() => setView('membership')}>
          <span>{notice}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {next ? (
        <section className={styles.next} aria-label="Sıradaki dersin">
          <p className={styles.nextLabel}>
            {next.myStatus !== 'makeup' ? 'Sıradaki dersin' : next.kind === 'extra' ? 'Sıradaki dersin (ek ders)' : 'Sıradaki dersin (telafi)'}
          </p>
          <p className={styles.nextDay}>
            {formatDay(next.date)}
            {studio.branchCount > 1 && next.branchName && ` · ${next.branchName}`}
          </p>
          <div className={styles.nextBottom}>
            <span className={styles.nextTime}>{formatTime(next.startsAt, timeZone)}</span>
            <button type="button" className={styles.nextButton} onClick={() => openSheet(next)}>
              Gelemiyorum
            </button>
          </div>
        </section>
      ) : (
        <p className={styles.empty}>
          Önümüzdeki günlerde dersin görünmüyor. Bir yanlışlık olduğunu düşünüyorsan stüdyoya yaz.
        </p>
      )}

      {!packageModel && credits.length > 0 && (
        <div className={styles.quick}>
          <span>
            <strong>{credits.length} telafi hakkın var</strong>
          </span>
          <button type="button" className={styles.inlineButton} onClick={() => setPicker({ from: null })}>
            Telafi seç
          </button>
        </div>
      )}
      {sessionsLeft !== null && (
        <button type="button" className={styles.quick} onClick={() => setView('membership')}>
          <span>
            <strong>{sessionsLeft} seans</strong> kaldı
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      {openExtras.length > 0 && (
        <section aria-label="Ek dersler">
          <h2 className={styles.weekLabel}>Ek dersler</h2>
          <p className={styles.muted}>Programın dışında açılan dersler. Kayıt olursan ders bittiğinde paketinden bir seans düşer.</p>
          <ul className={styles.list}>
            {openExtras.map((session) => (
              <SessionOption
                key={session.id}
                multiBranch={studio.branchCount > 1}
                showDate
                session={session}
                timeZone={timeZone}
                now={data.loadedAt}
                busy={busy}
                pending={pendingExtra === session.id}
                onSelect={() => setPendingExtra(session.id)}
                onCancel={() => setPendingExtra(null)}
                onConfirm={() => bookExtra(session)}
              />
            ))}
          </ul>
        </section>
      )}

      {visibleWeeks.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className={styles.weekLabel}>{group.label}</h2>
          <ul className={styles.list}>
            {group.sessions.map((session) => (
              <SessionRow
                multiBranch={studio.branchCount > 1}
                packageModel={packageModel}
                key={session.id}
                session={session}
                timeZone={timeZone}
                now={data.loadedAt}
                busy={busy}
                onOpen={() => openSheet(session)}
                onUndo={() => undoCancel(session)}
              />
            ))}
          </ul>
        </section>
      ))}

      {hasHiddenWeeks && (
        <button type="button" className={styles.showLater} onClick={() => setShowLater(true)}>
          Sonraki dersleri göster
        </button>
      )}

      <Sheet
        open={Boolean(sheetSession)}
        onClose={() => setSheetSession(null)}
        title={sheetSession ? `${formatDay(sheetSession.date)}, ${formatTime(sheetSession.startsAt, timeZone)}` : ''}
      >
        {sheetSession && (
          <CantComeOptions
            session={sheetSession}
            studio={studio}
            now={sheetOpenedAt}
            busy={busy}
            onSwap={() => setPicker({ from: sheetSession })}
            onCancelOnly={() => cancelOnly(sheetSession)}
            onDropMakeup={() => dropMakeup(sheetSession)}
            onClose={() => setSheetSession(null)}
          />
        )}
      </Sheet>

      {toastView}
    </main>
  );
}

function SessionRow({ session, multiBranch, packageModel, timeZone, now, busy, onOpen, onUndo }) {
  // Çok şubeli stüdyoda dersin şubesi günün yanında ("Pazartesi 24 Kasım · Kuzey").
  const dayText = `${formatDay(session.date)}${multiBranch && session.branchName ? ` · ${session.branchName}` : ''}`;
  const time = <span className={styles.time}>{formatTime(session.startsAt, timeZone)}</span>;
  const day = <span className={styles.day}>{dayText}</span>;

  if (session.status === 'cancelled') {
    return (
      <li className={`${styles.row} ${styles.inactive}`}>
        <div>
          {day}
          <p className={styles.rowNote}>
            Stüdyo bu dersi iptal etti{session.cancelReason ? ` (${session.cancelReason})` : ''}.
            {session.myStatus === 'cancelled' && !packageModel && ' Yerine telafi hakkın var.'}
          </p>
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
          <span className={`${styles.day} ${styles.struck}`}>{dayText}</span>
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
          {session.myStatus === 'makeup' && <span className={styles.tag}>{session.kind === 'extra' ? 'Ek ders' : 'Telafi'}</span>}
        </div>
        {time}
      </button>
    </li>
  );
}

// Stüdyonun "dersten kaç saat önceye kadar iptal" ayarı. /api/studio bunu göndermiyor; her dersin son iptal anı
// (cancelDeadlineAt) ile başlangıcı (startsAt) arasındaki farktan bulunur. Dönen değer: tam saat, ör. 12.
function lateCancelHours(session) {
  const ms = new Date(session.startsAt) - new Date(session.cancelDeadlineAt);
  return Math.round(ms / 3_600_000); // 1 saat = 60 × 60 × 1000 ms
}

function CantComeOptions({ session, studio, now, busy, onSwap, onCancelOnly, onDropMakeup, onClose }) {
  // Geç iptal onayı açık mı? Pencere her açılışta yeniden kurulduğu için ({open && children}) kendiliğinden sıfırlanır.
  const [confirmLate, setConfirmLate] = useState(false);
  const timeZone = studio.timezone;
  const deadline = formatWeekdayTime(session.cancelDeadlineAt, timeZone);

  // Paket modeli: ders başlayana kadar iptal edilebilir; son saatten sonrası geç iptal. "Yerine gel" yok.
  if (studio.membershipModel === 'package' && session.myStatus !== 'makeup') {
    if (isPast(session.startsAt, now)) {
      return (
        <>
          <p className={styles.sheetNote}>Ders başladı, artık iptal edilemez.</p>
          <button type="button" className={styles.closeLink} onClick={onClose}>
            Tamam
          </button>
        </>
      );
    }
    const late = isPast(session.cancelDeadlineAt, now);
    // Prototipteki onay: seans yanacaksa iptal tek dokunuşla olmaz, ne olacağı kırmızı butonla açıkça sorulur.
    if (late && studio.lateCancelBurnsSession && confirmLate) {
      return (
        <div className={styles.confirm} role="alertdialog" aria-label="Geç iptal uyarısı">
          <p className={styles.confirmTitle}>Derse {lateCancelHours(session)} saatten az kaldı</p>
          <p className={styles.confirmText}>
            {formatDay(session.date)} {formatTime(session.startsAt, timeZone)} dersini şimdi iptal edersen bu seans
            paketinden düşülür ve iade edilmez.
          </p>
          <Button variant="danger" size="lg" onClick={onCancelOnly} busy={busy} busyLabel="İptal ediliyor…">
            Yine de iptal et (seans yanar)
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Vazgeç, derse geleceğim
          </Button>
        </div>
      );
    }
    let effect = 'Bu seans paketinden düşmez.';
    if (late) effect = studio.lateCancelBurnsSession ? 'Bu seans düşecek.' : 'Geç iptal, ama bu seans paketinden düşmez.';
    return (
      <>
        <p className={styles.sheetNote}>
          {late ? `İptal için son saat geçti (${deadline}).` : `Paketinden düşmeden iptal için son saat: ${deadline}`}
        </p>
        <button
          type="button"
          className={`${styles.option} ${late ? '' : styles.optionPrimary}`}
          onClick={late && studio.lateCancelBurnsSession ? () => setConfirmLate(true) : onCancelOnly}
          disabled={busy}
        >
          <span className={styles.optionTitle}>İptal et</span>
          <span className={styles.optionText}>{effect}</span>
        </button>
        <button type="button" className={styles.closeLink} onClick={onClose}>
          Vazgeç, geliyorum
        </button>
      </>
    );
  }

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
          <span className={styles.optionTitle}>{session.kind === 'extra' ? 'Ek dersten vazgeç' : 'Telafiden vazgeç'}</span>
          <span className={styles.optionText}>
            Yerin başka birine açılır.
            {studio.membershipModel === 'package' && ' Paketinden düşmez.'}
          </span>
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
