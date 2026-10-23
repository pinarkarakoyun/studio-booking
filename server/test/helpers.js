import 'dotenv/config';
import pool from '../src/db/pool.js';

if (!process.env.DB_NAME?.endsWith('_test')) {
  throw new Error('Tests must run against a *_test database. Use "npm test".');
}

export { pool };

// Her testten önce tüm tabloları boşaltır; testler birbirinin verisinden etkilenmez.
// RESTART IDENTITY: id'ler yeniden 1'den başlar. CASCADE: bağlı tablolar da boşalır.
export async function resetDb() {
  await pool.query(`
    TRUNCATE studios, studio_settings, users, groups, group_days, group_members,
             sessions, credits, freezes, user_sessions
    RESTART IDENTITY CASCADE
  `);
}

export async function createStudio(settings = {}) {
  const { rows: [studio] } = await pool.query(`INSERT INTO studios (name) VALUES ('Test') RETURNING id`);
  await pool.query(
    `
    INSERT INTO studio_settings (studio_id, credit_validity_days, cancellation_deadline_hours,
                                 booking_window_days, refund_credit_on_makeup_cancel, max_makeups_per_month,
                                 allow_undo_cancel, allow_makeup_before_missed, makeup_booking_cutoff_minutes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      studio.id,
      settings.creditValidityDays ?? 7,
      settings.cancellationDeadlineHours ?? 2,
      settings.bookingWindowDays ?? 14,
      settings.refundCreditOnMakeupCancel ?? true,
      settings.maxMakeupsPerMonth ?? null,
      settings.allowUndoCancel ?? true,
      settings.allowMakeupBeforeMissed ?? true,
      settings.makeupBookingCutoffMinutes ?? 0,
    ],
  );
  return studio.id;
}

export async function createGroup(studioId, { capacity = 3 } = {}) {
  const { rows: [group] } = await pool.query(
    `
    INSERT INTO groups (studio_id, name, start_time, duration_minutes, capacity)
    VALUES ($1, 'G', '09:00', 60, $2) RETURNING id
    `,
    [studioId, capacity],
  );
  return group.id;
}

// Şu andan `hoursFromNow` saat sonra başlayan bir ders. Testler gerçek saate göre çalışır,
// bu yüzden sabit tarih yerine "şimdiye göre" ders oluşturuyoruz.
export async function createSession(groupId, hoursFromNow, { capacity } = {}) {
  const { rows: [session] } = await pool.query(
    `
    INSERT INTO sessions (group_id, date, starts_at, capacity)
    -- $2 * interval '1 hour': make_interval tam sayı ister; bu yazım 0.5 (30 dk) gibi değerlere de izin verir.
    SELECT g.id,
           ((now() + $2::float8 * interval '1 hour') AT TIME ZONE st.timezone)::date,
           now() + $2::float8 * interval '1 hour',
           COALESCE($3, g.capacity)
    FROM groups g JOIN studios st ON st.id = g.studio_id
    WHERE g.id = $1
    RETURNING id
    `,
    [groupId, hoursFromNow, capacity ?? null],
  );
  return session.id;
}

let phoneCounter = 0;

// Gruba üye olan aktif bir müşteri oluşturur (groupId verilmezse grupsuz).
export async function createCustomer(studioId, groupId = null) {
  phoneCounter += 1;
  const { rows: [user] } = await pool.query(
    `
    INSERT INTO users (studio_id, role, full_name, phone, password_hash)
    VALUES ($1, 'customer', 'Müşteri', $2, 'x') RETURNING id
    `,
    [studioId, `+90530${String(phoneCounter).padStart(7, '0')}`],
  );
  if (groupId) {
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, joined_on) VALUES ($1, $2, current_date - 30)`,
      [groupId, user.id],
    );
  }
  return user.id;
}

// Elle verilmiş (kaynağı olmayan) bir telafi hakkı.
export async function grantCredit(userId, daysValid = 30) {
  await pool.query(
    `INSERT INTO credits (user_id, expires_at) VALUES ($1, now() + make_interval(days => $2))`,
    [userId, daysValid],
  );
}

export async function occupancy(sessionId) {
  const { rows: [row] } = await pool.query(
    'SELECT regular_count, makeup_count, booked_count, free_spots FROM session_occupancy WHERE session_id = $1',
    [sessionId],
  );
  return row;
}
