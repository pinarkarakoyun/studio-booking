import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import TextField from '../components/TextField.jsx';
import { formatDateDayMonth, formatDay, formatDayMonth, formatPhone, formatTime, todayIn } from '../format.js';
import styles from './Admin.module.css';

const whatsappLink = (phone) => `https://wa.me/${phone.replace('+', '')}`;

export default function CustomerDetailPage({ studio, customerId, onBack, onCredentials }) {
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState(null);
  // Açık olan işlem paneli: 'freeze' | 'endFreeze' | 'reset' | 'leave' | null
  const [action, setAction] = useState(null);
  const [notice, setNotice] = useState(null);
  const timeZone = studio.timezone;

  function load() {
    return api(`/api/admin/customers/${customerId}`).then(
      ({ customer: data }) => setCustomer(data),
      (err) => setError(err.message),
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- müşteri değişince yeniden yüklenir
  }, [customerId]);

  async function done(message) {
    setAction(null);
    setNotice(message);
    await load();
  }

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      ‹ Müşteriler
    </button>
  );

  if (error || !customer) {
    return (
      <main className={styles.page}>
        {back}
        {error && <p className={styles.muted}>{error}</p>}
      </main>
    );
  }

  const left = customer.status === 'left';
  const firstName = customer.fullName.split(' ')[0];

  return (
    <main className={styles.page}>
      {back}
      <h1 className={styles.rosterTitle}>{customer.fullName}</h1>
      <p className={styles.subtitle}>
        {formatPhone(customer.phone)}{' '}
        <a className={styles.inlineLink} href={whatsappLink(customer.phone)} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
      </p>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      <dl className={styles.summary}>
        <div>
          <dt>Grup</dt>
          <dd>{customer.group?.name ?? (left ? 'Stüdyodan ayrıldı' : 'Grubu yok')}</dd>
        </div>
        {customer.freeze && (
          <div>
            <dt>Dondurma</dt>
            <dd>
              {formatDateDayMonth(customer.freeze.startsOn)}
              {customer.freeze.endsOn ? ` – ${formatDateDayMonth(customer.freeze.endsOn)}` : ', bitiş tarihi yok'}
            </dd>
          </div>
        )}
        <div>
          <dt>Telafi hakkı</dt>
          <dd>
            {customer.credits.length === 0
              ? 'yok'
              : `${customer.credits.length}, ilki ${formatDayMonth(customer.credits[0].expiresAt, timeZone)} tarihine kadar`}
          </dd>
        </div>
        {customer.nextSession && (
          <div>
            <dt>Sıradaki dersi</dt>
            <dd>
              {formatDay(customer.nextSession.date)}, {formatTime(customer.nextSession.startsAt, timeZone)}
              {customer.nextSession.makeup ? ' (telafi)' : ''}
            </dd>
          </div>
        )}
      </dl>

      {!left && (
        <>
          <h2 className={styles.listLabel}>İşlemler</h2>
          <ul className={styles.people}>
            {customer.freeze ? (
              <ActionRow label="Dondurmayı bitir" onClick={() => setAction('endFreeze')} />
            ) : (
              <ActionRow label="Üyeliği dondur" onClick={() => setAction('freeze')} />
            )}
            <ActionRow label="Şifresini sıfırla" onClick={() => setAction('reset')} />
            <ActionRow label="Stüdyodan ayrıldı" danger onClick={() => setAction('leave')} />
          </ul>
        </>
      )}

      <Sheet open={action === 'freeze'} onClose={() => setAction(null)} title="Üyeliği dondur">
        <FreezeForm
          customerId={customer.id}
          today={todayIn(timeZone)}
          onDone={() => done(`${firstName} için dondurma kaydedildi.`)}
        />
      </Sheet>

      <Sheet open={action === 'endFreeze'} onClose={() => setAction(null)} title="Dondurmayı bitir">
        <ConfirmAction
          text={`${firstName} bugünden itibaren derslerine dönecek.`}
          button="Dondurmayı bitir"
          request={() => api(`/api/admin/customers/${customer.id}/end-freeze`, { method: 'POST' })}
          onDone={(result) =>
            done(
              result.groupOverCapacity
                ? `Dondurma bitti. Dikkat: ${customer.group?.name} grubu şu an kapasitesinin üstünde.`
                : 'Dondurma bitti.',
            )
          }
        />
      </Sheet>

      <Sheet open={action === 'reset'} onClose={() => setAction(null)} title="Şifresini sıfırla">
        <ConfirmAction
          text={`${firstName} için yeni bir geçici şifre oluşturulacak. Açık oturumları kapanır; ilk girişte kendi şifresini belirler.`}
          button="Yeni şifre oluştur"
          request={() => api(`/api/admin/customers/${customer.id}/reset-password`, { method: 'POST' })}
          onDone={(result) => {
            setAction(null);
            onCredentials({ fullName: customer.fullName, phone: customer.phone, temporaryPassword: result.temporaryPassword });
          }}
        />
      </Sheet>

      <Sheet open={action === 'leave'} onClose={() => setAction(null)} title="Stüdyodan ayrıldı">
        <LeaveConfirm customer={customer} onDone={() => done(`${firstName} ayrıldı olarak işaretlendi.`)} />
      </Sheet>
    </main>
  );
}

function ActionRow({ label, danger = false, onClick }) {
  return (
    <li>
      <button type="button" className={`${styles.actionRow} ${danger ? styles.danger : ''}`} onClick={onClick}>
        <span>{label}</span>
        <span aria-hidden="true">›</span>
      </button>
    </li>
  );
}

// Tek düğmeli onay paneli: isteği gönderir, hatayı panelin içinde gösterir.
function ConfirmAction({ text, button, request, onDone, danger = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onDone(await request());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.sheetText}>{text}</p>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={danger ? styles.dangerButton : undefined}>
        <Button type="button" busy={busy} busyLabel="Kaydediliyor…" onClick={run}>
          {button}
        </Button>
      </div>
    </>
  );
}

function FreezeForm({ customerId, today, onDone }) {
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/customers/${customerId}/freeze`, {
        method: 'POST',
        body: { startsOn, endsOn: endsOn || null },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className={styles.sheetText}>
        Dondurulan günlerde dersleri boşa çıkar ve yeri başkasına açılır; bu derslerden telafi hakkı doğmaz.
      </p>
      <TextField label="Başlangıç" type="date" value={startsOn} min={today} onChange={(e) => setStartsOn(e.target.value)} />
      <TextField
        label="Bitiş (isteğe bağlı)"
        type="date"
        value={endsOn}
        min={startsOn}
        onChange={(e) => setEndsOn(e.target.value)}
        hint="Boş bırakırsan sen bitirene kadar sürer."
      />
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.formSubmit}>
        <Button type="submit" busy={busy} busyLabel="Kaydediliyor…">
          Dondur
        </Button>
      </div>
    </form>
  );
}

// Ayrılma geri dönüşü zor bir işlem: önce kaç telafi kaydının iptal edileceğini gösterip onay istiyoruz (BR-23).
function LeaveConfirm({ customer, onDone }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    api(`/api/admin/customers/${customer.id}/leave-preview`).then(setPreview, () => setPreview({ futureMakeups: 0 }));
  }, [customer.id]);

  if (!preview) return null;
  const firstName = customer.fullName.split(' ')[0];
  const makeups = preview.futureMakeups > 0 ? ` ${preview.futureMakeups} telafi kaydı iptal edilecek ve` : '';

  return (
    <ConfirmAction
      danger
      text={`${firstName} bugünden itibaren grubundan çıkarılacak,${makeups} uygulamaya giremeyecek. Geçmiş kayıtları silinmez.`}
      button="Ayrıldı olarak işaretle"
      request={() => api(`/api/admin/customers/${customer.id}/leave`, { method: 'POST' })}
      onDone={onDone}
    />
  );
}
