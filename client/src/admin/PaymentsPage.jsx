import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDateDayMonth, formatMoney } from '../format.js';
import styles from './Admin.module.css';

// Ödemeler sekmesi: sadece ilgilenilmesi gerekenler. Kişiye dokununca müşteri detayı (üyelik kartı) açılır.
export default function PaymentsPage({ onOpenCustomer }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/api/admin/payments').then(setData, (err) => setError(err.message));
  }, []);

  if (!data) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Ödemeler</h1>
        <p className={styles.muted}>{error ?? 'Yükleniyor…'}</p>
      </main>
    );
  }

  const nothingToDo = data.expired.length + data.endingSoon.length + data.underpaid.length + data.noMembership.length === 0;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Ödemeler</h1>
      <p className={styles.subtitle}>Sadece ilgilenmen gerekenler</p>

      {nothingToDo && <p className={styles.muted}>Biten, yaklaşan ya da eksik ödemesi olan üyelik yok.</p>}

      <Section title="Süresi bitti, yenilenmedi" rows={data.expired} onOpen={onOpenCustomer}>
        {(row) => [`${formatDateDayMonth(row.endsOn)} tarihinde bitti`, `${row.daysAgo} gün`, true]}
      </Section>

      <Section title="Bitişi yaklaşıyor" rows={data.endingSoon} onOpen={onOpenCustomer}>
        {(row) => [
          `${formatDateDayMonth(row.endsOn)} tarihinde bitiyor`,
          row.daysLeft === 0 ? 'bugün' : `${row.daysLeft} gün`,
          false,
        ]}
      </Section>

      <Section title="Eksik ödeme" rows={data.underpaid} onOpen={onOpenCustomer}>
        {(row) => [
          `${formatDateDayMonth(row.startsOn)} – ${formatDateDayMonth(row.endsOn)}, ${formatMoney(row.feeKurus)}`,
          `${formatMoney(row.remainingKurus)} kaldı`,
          true,
        ]}
      </Section>

      <h2 className={styles.listLabel}>Bu ay alınan</h2>
      <p className={styles.monthTotal}>
        <span>{data.thisMonth.count} ödeme</span>
        <strong>{formatMoney(data.thisMonth.totalKurus)}</strong>
      </p>

      {/* Geçişte uzun olabilir (henüz kimsenin dönemi girilmemişken herkes burada); bu yüzden en altta. */}
      <Section title="Üyelik dönemi girilmemiş" rows={data.noMembership} onOpen={onOpenCustomer}>
        {() => ['Dönemini ve ödemesini gir', null, false]}
      </Section>
    </main>
  );
}

// Bir bölüm: başlık (kişi sayısıyla) ve satırlar. children(row) -> [alt satır, sağdaki değer, vurgulu mu]
function Section({ title, rows, onOpen, children }) {
  if (rows.length === 0) return null;
  return (
    <>
      <h2 className={styles.listLabel}>
        {title} ({rows.length})
      </h2>
      <ul className={styles.people}>
        {rows.map((row) => {
          const [detail, value, alert] = children(row);
          return (
            <li key={`${row.customerId}-${row.startsOn ?? ''}`}>
              <button type="button" className={styles.memberRow} onClick={() => onOpen(row.customerId)}>
                <span className={styles.paymentRowText}>
                  {row.fullName}
                  <small>{detail}</small>
                </span>
                {value && <span className={alert ? styles.periodAlert : styles.paymentRowValue}>{value}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
