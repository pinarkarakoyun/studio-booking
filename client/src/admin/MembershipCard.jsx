import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import TextField from '../components/TextField.jsx';
import { addMonthsInclusive, formatDateDayMonth, formatMoney, parseMoney } from '../format.js';
import styles from './Admin.module.css';

const METHODS = [
  { value: 'cash', label: 'Nakit' },
  { value: 'transfer', label: 'Havale' },
  { value: 'card', label: 'Kart' },
];
// Yeni dönem en fazla kaç aylık yazılabilir (sadece ekranda; sunucu tarihlere bakar).
const MAX_MONTHS = 12;
const methodLabel = (value) => METHODS.find((m) => m.value === value).label.toLocaleLowerCase('tr');

// Müşteri detayındaki üyelik kartı: dönem, ödenen/kalan, ödemeler; "Ödeme ekle" ve "Yeni dönem başlat".
// Tutarlar sadece yöneticide görünür (BR-37).
export default function MembershipCard({ customerId, today, canStartPeriod }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Açık panel: 'payment' | 'period' | { deletePayment } | null
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showOthers, setShowOthers] = useState(false);

  function load() {
    return api(`/api/admin/customers/${customerId}/memberships`).then(setData, (err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- müşteri değişince yeniden yüklenir
  }, [customerId]);

  async function done(message) {
    setPanel(null);
    setNotice(message);
    await load();
  }

  if (!data) return error ? <p className={styles.muted}>{error}</p> : null;

  // Kartta sürmekte olan dönem; yoksa en yenisi (başlamamış ya da bitmiş).
  const current = data.memberships.find((m) => m.status === 'active') ?? data.memberships[0];
  const others = data.memberships.filter((m) => m !== current);

  return (
    <section aria-labelledby="membership-title">
      <h2 id="membership-title" className={styles.listLabel}>
        Üyelik
      </h2>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {current ? (
        <div className={styles.membershipCard}>
          <PeriodSummary membership={current} today={today} />
          {current.payments.length > 0 && (
            <ul className={styles.paymentList}>
              {current.payments.map((payment) => (
                <li key={payment.id}>
                  <span>
                    {formatDateDayMonth(payment.paidOn)}, {methodLabel(payment.method)}
                    {payment.note && <small> · {payment.note}</small>}
                  </span>
                  <span className={styles.paymentAmount}>
                    {formatMoney(payment.amountKurus)}
                    <button
                      type="button"
                      className={styles.paymentDelete}
                      aria-label={`${formatDateDayMonth(payment.paidOn)} tarihli ödemeyi sil`}
                      onClick={() => setPanel({ deletePayment: payment })}
                    >
                      Sil
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {current.remainingKurus > 0 && (
            <div className={styles.formSubmit}>
              <Button type="button" onClick={() => setPanel('payment')}>
                Ödeme ekle
              </Button>
            </div>
          )}
        </div>
      ) : (
        <p className={styles.muted}>Henüz üyelik dönemi yok.</p>
      )}

      {canStartPeriod && (
        <div className={styles.formSubmit}>
          <Button variant="quiet" type="button" onClick={() => setPanel('period')}>
            Yeni dönem başlat
          </Button>
        </div>
      )}

      {others.length > 0 && (
        <>
          <button type="button" className={styles.closedToggle} onClick={() => setShowOthers((v) => !v)}>
            {showOthers ? 'Diğer dönemleri gizle' : `Diğer dönemler (${others.length})`}
          </button>
          {showOthers && (
            <ul className={styles.people}>
              {others.map((m) => (
                <li key={m.id} className={styles.otherPeriod}>
                  <span>
                    {formatDateDayMonth(m.startsOn)} – {formatDateDayMonth(m.endsOn)}
                  </span>
                  <span>{m.remainingKurus > 0 ? `${formatMoney(m.remainingKurus)} kaldı` : 'ödendi'}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={panel === 'payment'} onClose={() => setPanel(null)} title="Ödeme ekle">
        {panel === 'payment' && current && (
          <PaymentForm membership={current} today={today} onDone={() => done('Ödeme kaydedildi.')} />
        )}
      </Sheet>

      <Sheet open={panel === 'period'} onClose={() => setPanel(null)} title="Yeni dönem başlat">
        {panel === 'period' && (
          <PeriodForm
            customerId={customerId}
            suggestedStartsOn={data.suggestedStartsOn}
            lastFeeKurus={data.memberships[0]?.feeKurus}
            onDone={() => done('Yeni dönem başlatıldı.')}
          />
        )}
      </Sheet>

      <Sheet open={Boolean(panel?.deletePayment)} onClose={() => setPanel(null)} title="Ödemeyi sil">
        {panel?.deletePayment && (
          <DeletePayment payment={panel.deletePayment} onDone={() => done('Ödeme silindi.')} />
        )}
      </Sheet>
    </section>
  );
}

function PeriodSummary({ membership: m, today }) {
  const paidShare = m.feeKurus === 0 ? 1 : Math.min(1, m.paidKurus / m.feeKurus);
  let state = null;
  if (m.status === 'upcoming') state = `${formatDateDayMonth(m.startsOn)} tarihinde başlıyor`;
  else if (m.status === 'ended') state = 'Bitti, yeni dönem başlatılmadı';
  else if (m.endsOn === today) state = 'Bugün bitiyor';

  return (
    <>
      <p className={styles.periodDates}>
        {formatDateDayMonth(m.startsOn)} – {formatDateDayMonth(m.endsOn)}
      </p>
      <p className={styles.periodMeta}>
        {formatMoney(m.feeKurus)}
        {m.freezeDays > 0 && `, dondurma ile ${m.freezeDays} gün uzadı`}
        {m.note && `, ${m.note}`}
      </p>
      {state && <p className={m.status === 'ended' ? styles.periodAlert : styles.periodMeta}>{state}</p>}
      <div
        className={styles.paidBar}
        role="img"
        aria-label={`${formatMoney(m.paidKurus)} ödendi, ${formatMoney(m.remainingKurus)} kaldı`}
      >
        <span style={{ width: `${paidShare * 100}%` }} />
      </div>
      <p className={styles.paidLine}>
        <span>{formatMoney(m.paidKurus)} ödendi</span>
        {m.remainingKurus > 0 ? (
          <span className={styles.periodAlert}>{formatMoney(m.remainingKurus)} kaldı</span>
        ) : (
          <span>Tamamı ödendi</span>
        )}
      </p>
    </>
  );
}

function PaymentForm({ membership, today, onDone }) {
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const amountKurus = parseMoney(amount);
    const found = {};
    if (!amountKurus) found.amount = 'Tutarı yaz, ör. 1.500';
    if (!method) found.method = 'Ödeme yöntemini seç.';
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setBusy(true);
    try {
      await api(`/api/admin/memberships/${membership.id}/payments`, {
        method: 'POST',
        body: { amountKurus, paidOn, method, note },
      });
      onDone();
    } catch (err) {
      setErrors({ [err.code === 'INVALID_AMOUNT' || err.code === 'PAYMENT_EXCEEDS_FEE' ? 'amount' : 'form']: err.message });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <TextField
        label="Tutar (₺)"
        inputMode="decimal"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setErrors((current) => ({ ...current, amount: null }));
        }}
        error={errors.amount}
      >
        <button type="button" className={styles.fillButton} onClick={() => setAmount(String(membership.remainingKurus / 100).replace('.', ','))}>
          Kalanın tamamı: {formatMoney(membership.remainingKurus)}
        </button>
      </TextField>
      <TextField label="Tarih" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
      <fieldset className={styles.choiceGroup}>
        <legend>Yöntem</legend>
        <div className={styles.choices}>
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`${styles.choice} ${method === m.value ? styles.choiceOn : ''}`}
              aria-pressed={method === m.value}
              onClick={() => {
                setMethod(m.value);
                setErrors((current) => ({ ...current, method: null }));
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {errors.method && <p className={styles.formError}>{errors.method}</p>}
      </fieldset>
      <TextField label="Not (isteğe bağlı)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      {errors.form && <p className={styles.formError}>{errors.form}</p>}
      <div className={styles.formSubmit}>
        <Button type="submit" busy={busy} busyLabel="Kaydediliyor…">
          Ödemeyi kaydet
        </Button>
      </div>
    </form>
  );
}

function PeriodForm({ customerId, suggestedStartsOn, lastFeeKurus, onDone }) {
  const [startsOn, setStartsOn] = useState(suggestedStartsOn);
  // Ay sayısı metin olarak tutulur (kutu boş da olabilir); bitiş elle değişirse boşalır.
  const [months, setMonths] = useState('1');
  const [endsOn, setEndsOn] = useState(addMonthsInclusive(suggestedStartsOn, 1));
  const [fee, setFee] = useState(lastFeeKurus ? String(lastFeeKurus / 100).replace('.', ',') : '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Yazılan ay sayısı bitişi başlangıca göre doldurur (1–12). Bitiş elle değiştirilirse kutu boşalır.
  function changeMonths(value) {
    setMonths(value);
    const count = Number(value);
    if (Number.isInteger(count) && count >= 1 && count <= MAX_MONTHS && startsOn) {
      setEndsOn(addMonthsInclusive(startsOn, count));
    }
  }

  async function submit(event) {
    event.preventDefault();
    const feeKurus = parseMoney(fee);
    if (feeKurus === null) {
      setErrors({ fee: 'Ücreti yaz, ör. 4.500' });
      return;
    }
    setBusy(true);
    try {
      await api(`/api/admin/customers/${customerId}/memberships`, {
        method: 'POST',
        body: { startsOn, endsOn, feeKurus, note },
      });
      onDone();
    } catch (err) {
      setErrors({ [err.code === 'INVALID_AMOUNT' ? 'fee' : 'form']: err.message });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <TextField
        label="Başlangıç"
        type="date"
        value={startsOn}
        onChange={(e) => {
          setStartsOn(e.target.value);
          const count = Number(months);
          if (count >= 1 && count <= MAX_MONTHS && e.target.value) setEndsOn(addMonthsInclusive(e.target.value, count));
        }}
        hint={lastFeeKurus === undefined ? undefined : 'Önceki dönemin bittiği günün ertesi; geç ödeme günü kaydırmaz.'}
      />
      <TextField
        label="Kaç aylık?"
        type="number"
        inputMode="numeric"
        min="1"
        max={MAX_MONTHS}
        value={months}
        onChange={(e) => changeMonths(e.target.value)}
        hint="Bitiş tarihi buna göre dolar; özel bir bitiş için tarihi elle değiştirebilirsin."
      />
      <TextField
        label="Bitiş"
        type="date"
        value={endsOn}
        min={startsOn}
        onChange={(e) => {
          setEndsOn(e.target.value);
          setMonths('');
        }}
      />
      <TextField
        label="Ücret (₺)"
        inputMode="decimal"
        value={fee}
        onChange={(e) => {
          setFee(e.target.value);
          setErrors((current) => ({ ...current, fee: null }));
        }}
        error={errors.fee}
      />
      <TextField label="Not (isteğe bağlı)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      {errors.form && <p className={styles.formError}>{errors.form}</p>}
      <div className={styles.formSubmit}>
        <Button type="submit" busy={busy} busyLabel="Kaydediliyor…">
          Dönemi başlat
        </Button>
      </div>
    </form>
  );
}

function DeletePayment({ payment, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    try {
      await api(`/api/admin/payments/${payment.id}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.sheetText}>
        {formatDateDayMonth(payment.paidOn)} tarihli {formatMoney(payment.amountKurus)} tutarındaki ödeme kaydı silinecek.
        Yanlış girdiğin bir ödemeyi düzeltmek için kullan.
      </p>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.formSubmit}>
        <Button type="button" busy={busy} busyLabel="Siliniyor…" onClick={run}>
          Ödemeyi sil
        </Button>
      </div>
    </>
  );
}
