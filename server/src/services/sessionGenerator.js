import pool from '../db/pool.js';

// Kaç gün ilerisine kadar ders üretilir. Müşterinin telafi seçebileceği süreden
// (studio_settings.booking_window_days) ve iptal edebileceği en uzak dersten uzun olmalı.
export const SESSION_WINDOW_DAYS = 42;

// Aktif grupların önümüzdeki `days` gün içindeki derslerini oluşturur.
// İdempotent: zaten var olan dersler UNIQUE (group_id, date) sayesinde atlanır,
// bu yüzden kaç kez çalıştırılırsa çalıştırılsın aynı dersi iki kez oluşturmaz.
// `db` parametresi: varsayılan olarak pool; test ya da transaction içinde bir client verilebilir.
export async function generateSessions({ days = SESSION_WINDOW_DAYS, db = pool } = {}) {
  const { rowCount } = await db.query(
    `
    INSERT INTO sessions (group_id, date, starts_at, capacity)
    SELECT g.id,
           day.date,
           -- Tarih + saat = saat dilimsiz zaman; AT TIME ZONE onu stüdyonun yerel saati
           -- olarak yorumlayıp mutlak zamana (timestamptz) çevirir.
           (day.date + g.start_time) AT TIME ZONE s.timezone,
           -- Kapasite o anki grup kapasitesinden kopyalanır (sonradan tek ders için değişebilir).
           g.capacity
    FROM groups g
    JOIN studios s     ON s.id = g.studio_id
    JOIN group_days gd ON gd.group_id = g.id
    -- 0, 1, 2, ... days-1: bugünden itibaren her gün için bir satır.
    CROSS JOIN generate_series(0, $1::int - 1) AS offset_days(n)
    -- "Bugün" sunucunun değil stüdyonun saat dilimine göre hesaplanır.
    CROSS JOIN LATERAL (
      SELECT (now() AT TIME ZONE s.timezone)::date + offset_days.n AS date
    ) AS day
    WHERE g.is_active
      -- Sadece grubun toplandığı haftanın günleri (1 = Pazartesi ... 7 = Pazar).
      AND EXTRACT(ISODOW FROM day.date) = gd.weekday
      -- Bugünün saati geçmiş dersleri oluşturma.
      AND (day.date + g.start_time) AT TIME ZONE s.timezone > now()
    ON CONFLICT (group_id, date) DO NOTHING
    `,
    [days],
  );
  return rowCount;
}
