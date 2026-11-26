import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { getPaymentOverview } from './adminMemberships.js';
import { daysBetween, isLapsed } from './lapsedRule.js';

// Analiz sekmesi: seçilen ayın özeti ve önceki ayla karşılaştırması (yalnızca yönetici; fiyat içerir).
// Tasarım: docs/superpowers/specs/2026-11-26-admin-dashboard-design.md
// Ay, stüdyonun saat dilimindeki takvim ayıdır. sessions.date ve payments.paid_on zaten yerel takvim günü.

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// "2026-11" + n ay -> "2026-12-01" (ayın ilk günü, takvim günü olarak).
function monthStart(month, offset = 0) {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, m - 1 + offset, 1));
  return d.toISOString().slice(0, 10);
}

// Kim hangi derse geldi? Tek tanım; aylık sayılar ve son geliş tarihi aynı kuralı kullanır.
// $1 = studio_id. from dahil, to hariç (ör. ayın 1'i ile sonraki ayın 1'i).
// visits: derste olanlar. Düzenli üye (o tarihte grupta, dondurulmamış, bu dersi iptal etmemiş; session_occupancy ile
// aynı kural) ya da telafiyle gelen. came: bunlardan yoklamada "gelmedi" işaretli olmayanlar.
// Yalnızca iptal edilmemiş ve başlamış dersler; ek dersler gizli grup olduğu için kendiliğinden dahil.
export function visitsCte(from, to) {
  const sessionFilter = `s.status = 'scheduled' AND s.starts_at <= now() AND s.date >= ${from} AND s.date < ${to}`;
  return `
  visits AS (
    SELECT s.id AS session_id, gm.user_id, s.date
    FROM sessions s
    JOIN groups g ON g.id = s.group_id AND g.studio_id = $1
    JOIN group_members gm ON gm.group_id = s.group_id
                         AND gm.joined_on <= s.date AND (gm.left_on IS NULL OR s.date < gm.left_on)
    WHERE ${sessionFilter}
      AND NOT EXISTS (SELECT 1 FROM freezes f WHERE f.user_id = gm.user_id
                      AND daterange(f.starts_on, f.ends_on, '[]') @> s.date)
      AND NOT EXISTS (SELECT 1 FROM credits c WHERE c.user_id = gm.user_id AND c.source_session_id = s.id)
    UNION
    SELECT s.id, c.user_id, s.date
    FROM credits c
    JOIN sessions s ON s.id = c.used_session_id
    JOIN groups g ON g.id = s.group_id AND g.studio_id = $1
    WHERE ${sessionFilter}
  ),
  came AS (
    SELECT v.* FROM visits v
    WHERE NOT EXISTS (SELECT 1 FROM attendance a WHERE a.session_id = v.session_id AND a.user_id = v.user_id)
  )`;
}

// Stüdyonun bugünü ("2026-11-26") ve bu ayı ("2026-11").
async function studioToday(studioId, db) {
  const { rows: [row] } = await db.query(
    `SELECT (now() AT TIME ZONE timezone)::date::text AS today FROM studios WHERE id = $1`,
    [studioId],
  );
  return { today: row.today, month: row.today.slice(0, 7) };
}

// Bir aydır gelmeyenler: bugüne göre, seçilen aydan bağımsız. Ayrılmış müşteriler hiç bakılmaz.
// Son geliş tüm zamanların "came" kaydından. Şube adı bugünkü düzenli grubundan (yoksa null).
async function lapsedCustomers(studioId, today, db) {
  const { rows } = await db.query(
    `
    WITH ${visitsCte("'-infinity'::date", '$2::date + 1')},
    last_visit AS (SELECT user_id, max(date)::text AS day FROM came GROUP BY user_id)
    SELECT u.id, u.full_name, lv.day AS last_visit_on,
           (u.created_at AT TIME ZONE st.timezone)::date::text AS joined_on,
           EXISTS (SELECT 1 FROM freezes f
                   WHERE f.user_id = u.id AND daterange(f.starts_on, f.ends_on, '[]') @> $2::date) AS is_frozen,
           branch.name AS branch_name
    FROM users u
    JOIN studios st ON st.id = u.studio_id
    LEFT JOIN last_visit lv ON lv.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT b.name
      FROM group_members gm JOIN groups g ON g.id = gm.group_id JOIN branches b ON b.id = g.branch_id
      WHERE gm.user_id = u.id AND gm.joined_on <= $2::date AND (gm.left_on IS NULL OR $2::date < gm.left_on)
      ORDER BY g.kind = 'regular' DESC
      LIMIT 1
    ) branch ON true
    WHERE u.studio_id = $1 AND u.role = 'customer' AND u.status <> 'left'
    `,
    [studioId, today],
  );
  return rows
    .filter((row) => isLapsed({
      lastVisitOn: row.last_visit_on, joinedOn: row.joined_on, isFrozenToday: row.is_frozen, today,
    }))
    .map((row) => ({
      customerId: Number(row.id),
      fullName: row.full_name,
      branchName: row.branch_name,
      lastVisitOn: row.last_visit_on,
      // Hiç gelmediyse hesabın açıldığı günden itibaren.
      daysSince: daysBetween(row.last_visit_on ?? row.joined_on, today),
    }))
    // En yakın zamanda kopan en üstte: geri kazanması en kolay olan o.
    .sort((a, b) => a.daysSince - b.daysSince || a.fullName.localeCompare(b.fullName, 'tr'));
}

// "Bu ay" ile "önceki ay" sütun çifti: her metrik iki ayı tek sorguda, FILTER ile ayırarak getirir.
// Parametreler: $1 studio, $2 önceki ayın 1'i, $3 seçilen ayın 1'i, $4 sonraki ayın 1'i.
const pair = (row) => ({ current: Number(row.cur), previous: Number(row.prev) });

export async function getDashboard(admin, { month } = {}, { db = pool } = {}) {
  const { today, month: currentMonth } = await studioToday(admin.studio_id, db);
  const selected = month ?? currentMonth;
  // Biçim aynı olduğu için metin karşılaştırması tarih sırasını verir ("2026-11" > "2026-10").
  if (typeof selected !== 'string' || !MONTH_RE.test(selected) || selected > currentMonth) {
    throw new AppError('INVALID_MONTH', 'Ay geçersiz.', 400);
  }
  const params = [admin.studio_id, monthStart(selected, -1), monthStart(selected), monthStart(selected, 1)];

  const { rows: [revenue] } = await db.query(
    `
    SELECT COALESCE(SUM(p.amount_kurus) FILTER (WHERE p.paid_on >= $3::date), 0)::bigint AS cur,
           COALESCE(SUM(p.amount_kurus) FILTER (WHERE p.paid_on <  $3::date), 0)::bigint AS prev
    FROM payments p
    JOIN memberships m ON m.id = p.membership_id
    JOIN users u ON u.id = m.user_id
    WHERE u.studio_id = $1 AND p.paid_on >= $2::date AND p.paid_on < $4::date
    `,
    params,
  );

  const { rows: [newMembers] } = await db.query(
    `
    SELECT count(*) FILTER (WHERE local.day >= $3::date)::int AS cur,
           count(*) FILTER (WHERE local.day <  $3::date)::int AS prev
    FROM users u
    JOIN studios st ON st.id = u.studio_id
    CROSS JOIN LATERAL (SELECT (u.created_at AT TIME ZONE st.timezone)::date AS day) AS local
    WHERE u.studio_id = $1 AND u.role = 'customer' AND local.day >= $2::date AND local.day < $4::date
    `,
    params,
  );

  const { rows: [active] } = await db.query(
    `
    WITH ${visitsCte('$2::date', '$4::date')}
    SELECT count(DISTINCT user_id) FILTER (WHERE date >= $3::date)::int AS cur,
           count(DISTINCT user_id) FILTER (WHERE date <  $3::date)::int AS prev
    FROM came
    `,
    params,
  );

  // Ders başına "gelen / kapasite", sonra ortalaması. Kimsenin gelmediği ders 0 olarak ortalamaya girer.
  const { rows: sessionRows } = await db.query(
    `
    WITH ${visitsCte('$2::date', '$4::date')},
    came_count AS (SELECT session_id, count(*) AS n FROM came GROUP BY session_id)
    SELECT s.date >= $3::date AS is_current,
           count(*)::int AS held,
           avg(COALESCE(cc.n, 0)::float8 / s.capacity) AS occupancy
    FROM sessions s
    JOIN groups g ON g.id = s.group_id
    LEFT JOIN came_count cc ON cc.session_id = s.id
    WHERE g.studio_id = $1 AND s.status = 'scheduled' AND s.starts_at <= now()
      AND s.date >= $2::date AND s.date < $4::date
    GROUP BY 1
    `,
    params,
  );
  const sessionsOf = (isCurrent) => sessionRows.find((r) => r.is_current === isCurrent);
  const cur = sessionsOf(true);
  const prev = sessionsOf(false);

  // Seçilen ay dahil geriye doğru 12 ay. Ay listesi generate_series ile kurulur, böylece boş aylar da 0 gelir.
  const { rows: trend } = await db.query(
    `
    WITH ${visitsCte('$2::date', '$3::date')},
    months AS (SELECT generate_series($2::date, $3::date - interval '1 month', interval '1 month')::date AS m),
    rev AS (
      SELECT date_trunc('month', p.paid_on)::date AS m, sum(p.amount_kurus) AS total
      FROM payments p
      JOIN memberships ms ON ms.id = p.membership_id
      JOIN users u ON u.id = ms.user_id
      WHERE u.studio_id = $1 AND p.paid_on >= $2::date AND p.paid_on < $3::date
      GROUP BY 1
    ),
    act AS (SELECT date_trunc('month', date)::date AS m, count(DISTINCT user_id) AS n FROM came GROUP BY 1),
    held AS (
      SELECT date_trunc('month', s.date)::date AS m, count(*) AS n
      FROM sessions s JOIN groups g ON g.id = s.group_id
      WHERE g.studio_id = $1 AND s.status = 'scheduled' AND s.starts_at <= now()
        AND s.date >= $2::date AND s.date < $3::date
      GROUP BY 1
    )
    SELECT to_char(months.m, 'YYYY-MM') AS month,
           COALESCE(rev.total, 0)::bigint AS revenue_kurus,
           COALESCE(act.n, 0)::int AS active_members,
           COALESCE(held.n, 0)::int AS sessions_held
    FROM months
    LEFT JOIN rev ON rev.m = months.m
    LEFT JOIN act ON act.m = months.m
    LEFT JOIN held ON held.m = months.m
    ORDER BY months.m
    `,
    [admin.studio_id, monthStart(selected, -11), monthStart(selected, 1)],
  );

  // Bekleyen ödeme: Ödemeler sekmesindeki "eksik ödeme" listesinin toplamı (kural orada, burada kopyalanmaz).
  const { underpaid } = await getPaymentOverview(admin, { db });

  const r = pair(revenue);
  const n = pair(newMembers);
  const a = pair(active);
  return {
    month: selected,
    isCurrentMonth: selected === currentMonth,
    revenue: { kurus: r.current, previousKurus: r.previous },
    activeMembers: { count: a.current, previous: a.previous },
    newMembers: { count: n.current, previous: n.previous },
    sessions: {
      held: cur?.held ?? 0,
      previousHeld: prev?.held ?? 0,
      avgOccupancy: cur ? cur.occupancy : null,
      previousAvgOccupancy: prev ? prev.occupancy : null,
    },
    trend: trend.map((t) => ({
      month: t.month,
      revenueKurus: Number(t.revenue_kurus),
      activeMembers: t.active_members,
      sessionsHeld: t.sessions_held,
    })),
    pendingPayments: {
      customerCount: new Set(underpaid.map((u) => u.customerId)).size,
      totalKurus: underpaid.reduce((sum, u) => sum + Number(u.remainingKurus), 0),
    },
    lapsed: await lapsedCustomers(admin.studio_id, today, db),
  };
}
