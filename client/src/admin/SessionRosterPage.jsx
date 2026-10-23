import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import TextField from '../components/TextField.jsx';
import { formatDay, formatTime } from '../format.js';
import styles from './Admin.module.css';

// Gelmeyen birinin yanında yazan sebep. Stüdyonun iptal ettiği derste "iptal etti" demeyiz.
function reasonText(person, sessionCancelled) {
  if (person.state === 'frozen') return 'dondurulmuş';
  if (sessionCancelled) return person.creditState === 'used' ? 'telafi hakkını kullandı' : 'telafi hakkı verildi';
  if (person.creditState === 'unused') return 'iptal etti, telafi hakkı var';
  if (person.creditState === 'used') return 'iptal etti, telafisini seçti';
  return 'iptal etti';
}

// Bir dersin katılımcı listesi; başlamamış bir ders buradan iptal edilebilir.
export default function SessionRosterPage({ studio, sessionId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState(null);

  // "Ders başladı mı?" için şimdiki zaman, veri geldiği anda bir kez alınır (render sırasında değil).
  function load() {
    return api(`/api/admin/sessions/${sessionId}`).then(
      (result) => setData({ ...result, loadedAt: Date.now() }),
      (err) => setError(err.message),
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ders değişince yeniden yüklenir
  }, [sessionId]);

  async function cancelled(message) {
    setCancelling(false);
    setNotice(message);
    await load();
  }

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
  const isCancelled = session.status === 'cancelled';
  const canCancel = !isCancelled && new Date(session.startsAt).getTime() > data.loadedAt;
  const fill = Math.min(100, Math.round((session.bookedCount / session.capacity) * 100));

  return (
    <main className={styles.page}>
      {back}
      <h1 className={styles.rosterTitle}>
        {formatDay(session.date)}, {formatTime(session.startsAt, studio.timezone)}
      </h1>
      <p className={styles.subtitle}>
        {session.groupName}, {session.durationMinutes} dk
        {isCancelled && ' (ders iptal edildi)'}
      </p>
      {isCancelled && session.cancelReason && <p className={styles.muted}>Sebep: {session.cancelReason}</p>}

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

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
                <span className={styles.reason}>{reasonText(person, isCancelled)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {canCancel && (
        <>
          <h2 className={styles.listLabel}>İşlemler</h2>
          <ul className={styles.people}>
            <li>
              <button type="button" className={`${styles.actionRow} ${styles.danger}`} onClick={() => setCancelling(true)}>
                <span>Dersi iptal et</span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          </ul>
        </>
      )}

      <Sheet open={cancelling} onClose={() => setCancelling(false)} title="Dersi iptal et">
        {cancelling && <CancelSessionForm sessionId={session.id} onDone={cancelled} />}
      </Sheet>
    </main>
  );
}

// Önce sunucudan "kaç kişi etkilenir?" önizlemesi alınır (aynı kod, sonunda geri alınır), sonra onay.
function CancelSessionForm({ sessionId, onDone }) {
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/api/admin/sessions/${sessionId}/cancel/preview`, { method: 'POST', body: {} }).then(setPreview, (err) =>
      setError(err.message),
    );
  }, [sessionId]);

  async function confirm() {
    setBusy(true);
    try {
      const result = await api(`/api/admin/sessions/${sessionId}/cancel`, { method: 'POST', body: { reason } });
      onDone(`Ders iptal edildi. ${summary(result, true)}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.sheetText}>
        İptal kesindir, geri alınamaz. {preview ? summary(preview, false) : !error && 'Etkisi hesaplanıyor…'}
      </p>
      <TextField
        label="Sebep (isteğe bağlı)"
        value={reason}
        maxLength={120}
        placeholder="Hocamız hasta"
        onChange={(e) => setReason(e.target.value)}
        hint="Müşteriler Derslerim'de iptal edilen dersin altında görür."
      />
      {error && <p className={styles.formError}>{error}</p>}
      <div className={`${styles.formSubmit} ${styles.dangerButton}`}>
        <Button type="button" busy={busy} busyLabel="İptal ediliyor…" onClick={confirm} disabled={busy || !preview}>
          Dersi iptal et
        </Button>
      </div>
    </>
  );
}

// Sunucunun sayılarını cümleye çevirir. Önizlemede gelecek zaman, sonuçta geçmiş zaman.
function summary({ creditedMembers, refundedMakeups, creditsEnabled }, done) {
  const parts = [];
  if (creditsEnabled) {
    parts.push(
      creditedMembers
        ? `${creditedMembers} kişiye telafi hakkı ${done ? 'verildi' : 'verilecek'}`
        : `Telafi hakkı ${done ? 'verilen' : 'verilecek'} kimse yok`,
    );
  } else {
    parts.push('Ayarlara göre kimseye telafi hakkı verilmez');
  }
  if (refundedMakeups) parts.push(`${refundedMakeups} telafi kaydı iptal ${done ? 'edildi' : 'edilecek'}, hakkı iade ${done ? 'edildi' : 'edilecek'}`);
  return `${parts.join('; ')}.`;
}
