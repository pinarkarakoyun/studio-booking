import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDateDayMonth, formatMoney, formatMonth, formatMonthShort, shiftMonth } from '../format.js';
import styles from './Admin.module.css';
import ds from './Dashboard.module.css';

// Analiz sekmesi (yalnızca yönetici): seçilen ayın özeti, 12 aylık gelir ve ilgilenilecek iki liste.
// Kartlar seçilen aya göre; "bekleyen ödeme" ve "bir aydır gelmeyenler" her zaman bugüne göre.
export default function DashboardPage({ studio, onOpenCustomer, onOpenPayments }) {
  const multiBranch = studio.branchCount > 1;
  // null = bu ay (sunucu karar verir; stüdyonun saat dilimine göre).
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/api/admin/dashboard${month ? `?month=${month}` : ''}`).then(
      (next) => {
        setError(null);
        setData(next);
      },
      (err) => setError(err.message),
    );
  }, [month]);

  if (!data) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Analiz</h1>
        <p className={styles.muted}>{error ?? 'Yükleniyor…'}</p>
      </main>
    );
  }

  const { sessions } = data;
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Analiz</h1>

      <div className={ds.monthSwitch}>
        <button type="button" className={ds.monthButton} aria-label="Önceki ay" onClick={() => setMonth(shiftMonth(data.month, -1))}>
          ‹
        </button>
        <span className={ds.monthLabel} aria-live="polite">{formatMonth(data.month)}</span>
        <button
          type="button"
          className={ds.monthButton}
          aria-label="Sonraki ay"
          disabled={data.isCurrentMonth}
          onClick={() => setMonth(shiftMonth(data.month, 1))}
        >
          ›
        </button>
      </div>
      {/* Ay değiştirirken hata olursa önceki ayın verisi kalır; hata üstte yazar. */}
      {error && <p className={ds.note} role="alert">{error}</p>}

      <dl className={ds.kpis}>
        <Kpi label="Gelir" value={formatMoney(data.revenue.kurus)} current={data.revenue.kurus} previous={data.revenue.previousKurus} />
        <Kpi label="Aktif üye" hint="en az bir derse gelen" value={data.activeMembers.count} current={data.activeMembers.count} previous={data.activeMembers.previous} />
        <Kpi label="Yeni üye" value={data.newMembers.count} current={data.newMembers.count} previous={data.newMembers.previous} />
        <Kpi
          label="Yapılan ders"
          hint={sessions.avgOccupancy === null ? null : `ortalama doluluk %${Math.round(sessions.avgOccupancy * 100)}`}
          value={sessions.held}
          current={sessions.held}
          previous={sessions.previousHeld}
        />
      </dl>
      <p className={ds.note}>
        Oklar önceki aya göre değişimi gösterir.
        {data.isCurrentMonth && ' Ay henüz bitmedi; geçen ayın tamamıyla karşılaştırılıyor.'}
      </p>

      <RevenueTrend trend={data.trend} selected={data.month} onSelect={setMonth} />

      <h2 className={styles.sectionLabel}>Şu an</h2>
      <button type="button" className={ds.pending} onClick={onOpenPayments}>
        <span>
          Bekleyen ödeme
          <small>{data.pendingPayments.customerCount === 0 ? 'Eksik ödeme yok' : `${data.pendingPayments.customerCount} kişi`}</small>
        </span>
        <strong>{formatMoney(data.pendingPayments.totalKurus)}</strong>
      </button>

      <section className={styles.paymentSection}>
        <h2 className={styles.paymentSectionTitle}>
          Bir aydır gelmeyenler <span>{data.lapsed.length}</span>
        </h2>
        {data.lapsed.length === 0 ? (
          <p className={styles.muted}>Son 30 günde herkes en az bir kez geldi.</p>
        ) : (
          <ul className={styles.people}>
            {data.lapsed.map((row) => (
              <li key={row.customerId}>
                <button type="button" className={styles.memberRow} onClick={() => onOpenCustomer(row.customerId)}>
                  <span className={styles.paymentRowText}>
                    {row.fullName}
                    {multiBranch && row.branchName && ` · ${row.branchName}`}
                    <small>{row.lastVisitOn ? `Son geliş ${formatDateDayMonth(row.lastVisitOn)}` : 'Hiç gelmedi'}</small>
                  </span>
                  <span className={styles.paymentRowValue}>{row.daysSince} gün</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// Önceki aya göre fark: "↑ %12", "↓ %5" (ne olduğu kartların altındaki notta yazar).
// Önceki ay 0 ise yüzde anlamsız, gösterilmez.
function change(current, previous) {
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return '= aynı';
  return `${pct > 0 ? '↑' : '↓'} %${Math.abs(pct)}`;
}

function Kpi({ label, hint, value, current, previous }) {
  const delta = change(current, previous);
  return (
    <div className={ds.kpi}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {hint && <span className={ds.kpiHint}>{hint}</span>}
      {delta && <span className={ds.kpiDelta} aria-label={`önceki aya göre ${delta}`}>{delta}</span>}
    </div>
  );
}

// 12 aylık gelir: tek seri sütun grafiği. Üstteki satır üzerine gelinen (yoksa seçili) ayı yazar.
// Sütuna dokununca o ay seçilir. Ekran okuyucu ve yazdırma için altta tablo görünümü var.
function RevenueTrend({ trend, selected, onSelect }) {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(...trend.map((t) => t.revenueKurus));
  const shown = trend.find((t) => t.month === (hovered ?? selected)) ?? trend[trend.length - 1];
  const describe = (t) =>
    `${formatMonth(t.month)}: ${formatMoney(t.revenueKurus)}, ${t.activeMembers} aktif üye, ${t.sessionsHeld} ders`;

  return (
    <section className={ds.trend}>
      <h2 className={styles.sectionLabel}>Son 12 ay gelir</h2>
      <p className={ds.trendReadout}>
        <strong>{formatMoney(shown.revenueKurus)}</strong> {formatMonth(shown.month)} · {shown.activeMembers} aktif üye ·{' '}
        {shown.sessionsHeld} ders
      </p>
      <div className={ds.bars} onMouseLeave={() => setHovered(null)}>
        {trend.map((t) => (
          <button
            key={t.month}
            type="button"
            className={`${ds.barSlot} ${t.month === selected ? ds.barSelected : ''}`}
            aria-label={describe(t)}
            aria-pressed={t.month === selected}
            onMouseEnter={() => setHovered(t.month)}
            onFocus={() => setHovered(t.month)}
            onBlur={() => setHovered(null)}
            onClick={() => onSelect(t.month)}
          >
            <span className={ds.barTrack}>
              {/* Hepsi 0 ise yükseklik 0: sütunlar taban çizgisinde düz kalır. */}
              <span className={ds.bar} style={{ height: max === 0 ? 0 : `${(t.revenueKurus / max) * 100}%` }} />
            </span>
            <span className={ds.barLabel}>{formatMonthShort(t.month)}</span>
          </button>
        ))}
      </div>
      <details className={ds.table}>
        <summary>Tablo olarak gör</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Ay</th>
              <th scope="col">Gelir</th>
              <th scope="col">Aktif üye</th>
              <th scope="col">Ders</th>
            </tr>
          </thead>
          <tbody>
            {[...trend].reverse().map((t) => (
              <tr key={t.month}>
                <th scope="row">{formatMonth(t.month)}</th>
                <td>{formatMoney(t.revenueKurus)}</td>
                <td>{t.activeMembers}</td>
                <td>{t.sessionsHeld}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
