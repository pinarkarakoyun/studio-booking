import { formatDateDayMonth, formatDayMonth, formatMoney } from '../format.js';
import PackageRing from './PackageRing.jsx';
import styles from './MembershipSummary.module.css';

const METHOD_LABELS = { cash: 'nakit', transfer: 'havale', card: 'kart' };

// Paket bittiyse ya da son günü geçtiyse ne olduğunu söyler; yoksa null (kart son günü ayrıca yazar).
function packageEndedLine(m) {
  if (m.ended) return `Paketinin son günü ${formatDateDayMonth(m.endsOn)} tarihinde geçti.`;
  if (m.remaining === 0) return `Paketindeki ${m.sessionCount} seans bitti.`;
  return null;
}

// Derslerim'in üstündeki koyu kart (prototip): paket modelinde kalan seans halkası, grup modelinde üyelik bitişi
// ve telafi hakları. Sakin kalır: kalan tutar uyarı rengiyle gösterilmez (üyeye baskı hissi vermesin).
export default function MembershipSummary({ membership, credits, packageModel, timeZone, onPickMakeup }) {
  if (packageModel && !membership) return <p className={styles.plain}>Henüz bir paketin yok.</p>;

  const hasCredits = !packageModel && credits.length > 0;
  if (!membership && !hasCredits) return null;

  return (
    <>
      <section className={styles.card} aria-label={packageModel ? 'Paketin' : 'Üyeliğin'}>
        {membership?.sessionCount ? (
          <PackageCard membership={membership} />
        ) : (
          membership && (
            <p className={styles.line}>
              Üyeliğin {formatDateDayMonth(membership.endsOn)} tarihinde {membership.ended ? 'bitti' : 'bitiyor'}.
            </p>
          )
        )}
        {hasCredits && (
          <div className={styles.credits}>
            <p className={styles.creditsText}>
              <strong>{credits.length} telafi hakkın var.</strong>
              <br />
              {credits.length === 1 ? '' : 'İlki '}
              {formatDayMonth(credits[0].expiresAt, timeZone)} tarihine kadar kullanabilirsin.
            </p>
            <button type="button" className={styles.creditsButton} onClick={onPickMakeup}>
              Telafi seç
            </button>
          </div>
        )}
      </section>
      {membership?.period && <Payments period={membership.period} />}
    </>
  );
}

function PackageCard({ membership: m }) {
  const endedLine = packageEndedLine(m);
  return (
    <>
      <div className={styles.package}>
        <PackageRing remaining={endedLine ? 0 : m.remaining} total={m.sessionCount} />
        <div className={styles.packageText}>
          <span className={styles.small}>{endedLine ? 'Son paketin' : 'Aktif paket'}</span>
          <span className={styles.packageName}>{m.packageName ?? `${m.sessionCount} Seans`}</span>
          {endedLine ? (
            <span className={styles.small}>{endedLine}</span>
          ) : (
            <>
              <span className={styles.small}>Son gün: {formatDateDayMonth(m.endsOn)}</span>
              <span className={styles.small}>{m.used} kullanıldı</span>
            </>
          )}
        </div>
      </div>
      {m.unpackaged > 0 && <p className={styles.notice}>{m.unpackaged} ders yeni paketinden düşecek.</p>}
    </>
  );
}

function Payments({ period }) {
  const paidShare = period.feeKurus === 0 ? 1 : Math.min(1, period.paidKurus / period.feeKurus);
  return (
    <section className={styles.payments} aria-label="Ödemelerin">
      <p className={styles.amounts}>
        {formatMoney(period.feeKurus)}
        {period.remainingKurus > 0
          ? `, ${formatMoney(period.paidKurus)} ödendi, ${formatMoney(period.remainingKurus)} kaldı`
          : ', tamamı ödendi'}
      </p>
      <span className={styles.paidBar} aria-hidden="true">
        <span style={{ width: `${paidShare * 100}%` }} />
      </span>
      {period.payments.length > 0 && (
        <details className={styles.paymentsDetails}>
          <summary>Ödemelerim</summary>
          <ul>
            {period.payments.map((payment, index) => (
              <li key={index}>
                <span>
                  {formatDateDayMonth(payment.paidOn)}, {METHOD_LABELS[payment.method]}
                </span>
                <span>{formatMoney(payment.amountKurus)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
