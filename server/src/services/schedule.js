import pool from '../db/pool.js';
import { SESSION_WINDOW_DAYS } from './sessionGenerator.js';

// Müşterinin ekranında gösterilecek ders listeleri. Her ders için doluluk ve
// "bu derste benim durumum ne?" bilgisi birlikte dönüyor; ekran ayrıca hesap yapmak zorunda kalmıyor.
//
// my_status:
//   'attending' - düzenli grubum, geliyorum
//   'cancelled' - düzenli grubum, iptal ettim
//   'frozen'    - düzenli grubum ama o tarihte üyeliğim dondurulmuş
//   'makeup'    - telafiyle geliyorum
//   null        - bu dersle bir ilgim yok
//
// Son tarihler (cancel_deadline_at, makeup_deadline_at) mutlak zaman olarak dönüyor; ekran
// "iptal et" butonunu göstermek için bunu şimdiki zamanla karşılaştırıyor. Asıl kontrol yine sunucuda.
const SESSIONS_WITH_MY_STATUS = `
  SELECT s.id,
         s.date,
         s.starts_at,
         s.status AS session_status,
         g.name AS group_name,
         g.duration_minutes,
         o.capacity,
         o.booked_count,
         GREATEST(o.free_spots, 0) AS free_spots,
         s.starts_at - make_interval(hours => ss.cancellation_deadline_hours) AS cancel_deadline_at,
         s.starts_at - make_interval(mins => ss.makeup_booking_cutoff_minutes) AS makeup_deadline_at,
         CASE
           WHEN me.is_makeup                    THEN 'makeup'
           WHEN me.is_member AND me.is_frozen    THEN 'frozen'
           WHEN me.is_member AND me.is_cancelled THEN 'cancelled'
           WHEN me.is_member                     THEN 'attending'
         END AS my_status
  FROM sessions s
  JOIN groups g             ON g.id = s.group_id
  JOIN studios st           ON st.id = g.studio_id
  JOIN studio_settings ss   ON ss.studio_id = st.id
  JOIN session_occupancy o  ON o.session_id = s.id
  CROSS JOIN LATERAL (
    SELECT
      EXISTS (SELECT 1 FROM group_members gm
              WHERE gm.user_id = $1 AND gm.group_id = s.group_id
                AND gm.joined_on <= s.date AND (gm.left_on IS NULL OR s.date < gm.left_on)) AS is_member,
      EXISTS (SELECT 1 FROM freezes f
              WHERE f.user_id = $1 AND daterange(f.starts_on, f.ends_on, '[]') @> s.date) AS is_frozen,
      EXISTS (SELECT 1 FROM credits c WHERE c.user_id = $1 AND c.source_session_id = s.id) AS is_cancelled,
      EXISTS (SELECT 1 FROM credits c WHERE c.user_id = $1 AND c.used_session_id = s.id)   AS is_makeup
  ) AS me
  WHERE g.studio_id = $2
    AND s.starts_at > now()
`;

function toSessionDto(row) {
  return {
    id: row.id,
    date: row.date,
    startsAt: row.starts_at,
    status: row.session_status,
    groupName: row.group_name,
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    bookedCount: row.booked_count,
    freeSpots: row.free_spots,
    cancelDeadlineAt: row.cancel_deadline_at,
    makeupDeadlineAt: row.makeup_deadline_at,
    myStatus: row.my_status,
  };
}

// Müşterinin önümüzdeki dersleri: düzenli grubunun dersleri (iptal ettikleri dahil) ve telafileri.
// Stüdyonun iptal ettiği dersler de görünür (status = 'cancelled') ki müşteri haberdar olsun.
export async function listMySessions(user, { db = pool } = {}) {
  const { rows } = await db.query(
    `
    SELECT * FROM (${SESSIONS_WITH_MY_STATUS}
      -- ::int şart: "tarih + ?" ifadesinde Postgres parametrenin tipini tahmin edemiyor (gün mü, aralık mı?).
      AND s.date <= (now() AT TIME ZONE st.timezone)::date + $3::int
    ) AS sessions
    WHERE my_status IS NOT NULL
    ORDER BY starts_at
    `,
    [user.id, user.studio_id, SESSION_WINDOW_DAYS],
  );
  return rows.map(toSessionDto);
}

// Telafi seçilebilecek dersler: stüdyonun rezervasyon penceresindeki tüm planlı dersler.
// Dolu olanlar da listede (freeSpots = 0); ekran onları "dolu" diye gösterebilir.
export async function listBookableSessions(user, { db = pool } = {}) {
  const { rows } = await db.query(
    `
    ${SESSIONS_WITH_MY_STATUS}
      AND s.status = 'scheduled'
      AND s.date <= (now() AT TIME ZONE st.timezone)::date + ss.booking_window_days
    ORDER BY s.starts_at
    `,
    [user.id, user.studio_id],
  );
  return rows.map(toSessionDto);
}

// Kullanılabilir telafi hakları: kullanılmamış, yanmamış, süresi dolmamış.
export async function listMyCredits(user, { db = pool } = {}) {
  const { rows } = await db.query(
    `
    SELECT c.id, c.expires_at, s.date AS source_date
    FROM credits c
    LEFT JOIN sessions s ON s.id = c.source_session_id
    WHERE c.user_id = $1
      AND c.used_session_id IS NULL
      AND c.forfeited_at IS NULL
      AND c.expires_at > now()
    ORDER BY c.expires_at
    `,
    [user.id],
  );
  // sourceDate null ise hak yöneticiden elle verilmiş demektir.
  return rows.map((row) => ({ id: row.id, expiresAt: row.expires_at, sourceDate: row.source_date }));
}
