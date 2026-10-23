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
export default function SessionRosterPage({ studio, sessionId, backLabel = 'Bugün', onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Açık panel: 'cancel' | 'add' | { remove: kişi } | null
  const [panel, setPanel] = useState(null);
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

  async function done(message) {
    setPanel(null);
    setNotice(message);
    await load();
  }

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      ‹ {backLabel}
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
  const startsAt = new Date(session.startsAt).getTime();
  const canCancel = !isCancelled && startsAt > data.loadedAt;
  // Kişi ders bitene kadar eklenebilir (kapıdan gelen de kaydedilsin).
  const canEdit = !isCancelled && startsAt + session.durationMinutes * 60000 > data.loadedAt;
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
              {person.state === 'makeup' && (
                <span className={styles.personEnd}>
                  <span className={styles.tagMakeup}>{person.creditState === 'added' ? 'Yönetici ekledi' : 'Telafi'}</span>
                  {canEdit && (
                    <button
                      type="button"
                      className={styles.paymentDelete}
                      aria-label={`${person.fullName} dersten çıkar`}
                      onClick={() => setPanel({ remove: person })}
                    >
                      Çıkar
                    </button>
                  )}
                </span>
              )}
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

      {canEdit && (
        <>
          <h2 className={styles.listLabel}>İşlemler</h2>
          <ul className={styles.people}>
            <li>
              <button type="button" className={styles.actionRow} onClick={() => setPanel('add')}>
                <span>Derse kişi ekle</span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
            {canCancel && (
              <li>
                <button type="button" className={`${styles.actionRow} ${styles.danger}`} onClick={() => setPanel('cancel')}>
                  <span>Dersi iptal et</span>
                  <span aria-hidden="true">›</span>
                </button>
              </li>
            )}
          </ul>
        </>
      )}

      <Sheet open={panel === 'cancel'} onClose={() => setPanel(null)} title="Dersi iptal et">
        {panel === 'cancel' && <CancelSessionForm sessionId={session.id} onDone={done} />}
      </Sheet>

      <Sheet open={panel === 'add'} onClose={() => setPanel(null)} title="Derse kişi ekle">
        {panel === 'add' && (
          <AddPersonForm
            sessionId={session.id}
            excludedIds={[...attending, ...notAttending].map((p) => p.id)}
            onDone={done}
          />
        )}
      </Sheet>

      <Sheet open={Boolean(panel?.remove)} onClose={() => setPanel(null)} title="Dersten çıkar">
        {panel?.remove && <RemovePerson sessionId={session.id} person={panel.remove} onDone={done} />}
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

// Müşteri arayıp seç, sonra onayla. Bu dersin grubundaki üyeler ve zaten gelenler listede yok
// (sunucu da reddeder). Ders doluysa uyarı çıkar, "Yine de ekle" ile eklenir.
function AddPersonForm({ sessionId, excludedIds, onDone }) {
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);
  const [full, setFull] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/admin/customers').then(({ customers: list }) => setCustomers(list), (err) => setError(err.message));
  }, []);

  async function submit(confirmFull) {
    setBusy(true);
    setError(null);
    try {
      const { usedCredit } = await api(`/api/admin/sessions/${sessionId}/attendees`, {
        method: 'POST',
        body: { userId: chosen.id, confirmFull },
      });
      onDone(`${chosen.fullName} derse eklendi${usedCredit ? ', telafi hakkından düşüldü' : ', hak kullanılmadan'}.`);
    } catch (err) {
      if (err.code === 'SESSION_FULL') setFull(err.message);
      else setError(err.message);
      setBusy(false);
    }
  }

  if (chosen) {
    return (
      <>
        <p className={styles.sheetText}>
          <strong>{chosen.fullName}</strong>{' '}
          {chosen.unusedCredits > 0
            ? `${chosen.unusedCredits} telafi hakkı var; geçerli bir hakkı varsa ondan düşülür.`
            : 'telafi hakkı yok; hak kullanılmadan eklenir.'}
        </p>
        {full && <p className={styles.formError}>{full} Yine de eklemek istiyor musun?</p>}
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.formSubmit}>
          <Button type="button" busy={busy} busyLabel="Ekleniyor…" onClick={() => submit(Boolean(full))}>
            {full ? 'Yine de ekle' : 'Derse ekle'}
          </Button>
          <Button variant="quiet" type="button" onClick={() => { setChosen(null); setFull(null); setError(null); }}>
            Başka birini seç
          </Button>
        </div>
      </>
    );
  }

  const excluded = new Set(excludedIds);
  const needle = query.trim().toLocaleLowerCase('tr');
  const matches = (customers ?? []).filter(
    (c) => c.status !== 'left' && !excluded.has(c.id) && c.fullName.toLocaleLowerCase('tr').includes(needle),
  );

  return (
    <>
      <TextField label="İsim ara" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Elif" />
      {error && <p className={styles.formError}>{error}</p>}
      {!customers && !error && <p className={styles.muted}>Yükleniyor…</p>}
      {customers && matches.length === 0 && <p className={styles.muted}>Eşleşen müşteri yok.</p>}
      <ul className={`${styles.people} ${styles.pickList}`}>
        {matches.map((c) => (
          <li key={c.id}>
            <button type="button" className={styles.memberRow} onClick={() => setChosen(c)}>
              <span className={styles.paymentRowText}>
                {c.fullName}
                <small>{c.group?.name ?? 'Grubu yok'}</small>
              </span>
              {c.unusedCredits > 0 && <span className={styles.paymentRowValue}>{c.unusedCredits} hak</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function RemovePerson({ sessionId, person, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const added = person.creditState === 'added';

  async function run() {
    setBusy(true);
    try {
      await api(`/api/admin/sessions/${sessionId}/attendees/${person.id}`, { method: 'DELETE' });
      onDone(`${person.fullName} dersten çıkarıldı${added ? '.' : ', telafi hakkı geri verildi.'}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.sheetText}>
        {person.fullName} bu dersten çıkarılacak.{' '}
        {added ? 'Hak kullanılmadan eklendiği için geri verilecek bir hak yok.' : 'Kullandığı telafi hakkı geri verilecek.'}
      </p>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.formSubmit}>
        <Button type="button" busy={busy} busyLabel="Çıkarılıyor…" onClick={run}>
          Dersten çıkar
        </Button>
      </div>
    </>
  );
}
