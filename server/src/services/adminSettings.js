import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { normalizePhone } from '../utils/phone.js';

// Yönetici panelinin "Ayarlar" bölümü: stüdyonun işleyiş kuralları (studio_settings) ve
// stüdyonun adı / WhatsApp hattı (studios). Değişiklik sadece bundan sonrasını etkiler:
// verilmiş hakların son tarihi (credits.expires_at) verildiği anda saklandığı için değişmez.

// Sayısal kurallar: API'deki ad -> sütun ve izin verilen aralık. Hata kodu sütundan türer
// (ör. INVALID_CREDIT_VALIDITY_DAYS), istemci hatayı doğru alanın altında gösterir.
const NUMBER_RULES = {
  cancellationDeadlineHours: { column: 'cancellation_deadline_hours', min: 0, max: 72, message: 'İptal süresi 0 ile 72 saat arasında olmalı.' },
  creditValidityDays: { column: 'credit_validity_days', min: 1, max: 365, message: 'Hak geçerliliği 1 ile 365 gün arasında olmalı.' },
  bookingWindowDays: { column: 'booking_window_days', min: 1, max: 90, message: 'Telafi en fazla 1 ile 90 gün ileriye açılabilir.' },
  makeupBookingCutoffMinutes: { column: 'makeup_booking_cutoff_minutes', min: 0, max: 240, message: 'Telafi kapanışı 0 ile 240 dakika arasında olmalı.' },
  paymentReminderDays: { column: 'payment_reminder_days', min: 0, max: 60, message: 'Hatırlatma 0 ile 60 gün arasında olmalı.' },
};

const BOOLEAN_RULES = {
  allowUndoCancel: 'allow_undo_cancel',
  allowMakeupBeforeMissed: 'allow_makeup_before_missed',
  refundCreditOnMakeupCancel: 'refund_credit_on_makeup_cancel',
};

function toDto(row) {
  const dto = {
    studioName: row.name,
    whatsappPhone: row.whatsapp_phone,
    maxMakeupsPerMonth: row.max_makeups_per_month,
  };
  for (const [key, rule] of Object.entries(NUMBER_RULES)) dto[key] = row[rule.column];
  for (const [key, column] of Object.entries(BOOLEAN_RULES)) dto[key] = row[column];
  return dto;
}

function validate(input) {
  const studioName = typeof input.studioName === 'string' ? input.studioName.trim().replace(/\s+/g, ' ') : '';
  if (studioName.length < 2 || studioName.length > 80) throw new AppError('INVALID_STUDIO_NAME', 'Stüdyo adını yaz.', 400);

  // WhatsApp boş bırakılabilir (o zaman "WhatsApp'tan yaz" bağlantısı görünmez); yazıldıysa geçerli olmalı.
  let whatsappPhone = null;
  if (typeof input.whatsappPhone === 'string' && input.whatsappPhone.trim() !== '') {
    whatsappPhone = normalizePhone(input.whatsappPhone);
    if (!whatsappPhone) throw new AppError('INVALID_WHATSAPP', 'WhatsApp numarası geçerli değil.', 400);
  }

  const values = { studioName, whatsappPhone };
  for (const [key, rule] of Object.entries(NUMBER_RULES)) {
    const value = input[key];
    if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
      throw new AppError(`INVALID_${rule.column.toUpperCase()}`, rule.message, 400);
    }
    values[key] = value;
  }

  // Boş (null) = sınırsız.
  const max = input.maxMakeupsPerMonth;
  if (max !== null && (!Number.isInteger(max) || max < 1 || max > 31)) {
    throw new AppError('INVALID_MAX_MAKEUPS_PER_MONTH', 'Aylık telafi sınırı 1 ile 31 arasında olmalı ya da boş kalmalı.', 400);
  }
  values.maxMakeupsPerMonth = max;

  for (const key of Object.keys(BOOLEAN_RULES)) {
    if (typeof input[key] !== 'boolean') throw new AppError('INVALID_SETTING', 'Ayar açık ya da kapalı olmalı.', 400);
    values[key] = input[key];
  }
  return values;
}

const SELECT = `
  SELECT st.name, st.whatsapp_phone, ss.*
  FROM studios st JOIN studio_settings ss ON ss.studio_id = st.id
  WHERE st.id = $1`;

export async function getSettings(admin, { db = pool } = {}) {
  const { rows: [row] } = await db.query(SELECT, [admin.studio_id]);
  return toDto(row);
}

export async function updateSettings(admin, input, { db = pool } = {}) {
  const v = validate(input ?? {});
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE studios SET name = $2, whatsapp_phone = $3 WHERE id = $1', [
      admin.studio_id, v.studioName, v.whatsappPhone,
    ]);
    const columns = [
      ...Object.entries(NUMBER_RULES).map(([key, rule]) => [rule.column, v[key]]),
      ...Object.entries(BOOLEAN_RULES).map(([key, column]) => [column, v[key]]),
      ['max_makeups_per_month', v.maxMakeupsPerMonth],
    ];
    await client.query(
      `UPDATE studio_settings SET ${columns.map(([column], i) => `${column} = $${i + 2}`).join(', ')} WHERE studio_id = $1`,
      [admin.studio_id, ...columns.map(([, value]) => value)],
    );
    const { rows: [row] } = await client.query(SELECT, [admin.studio_id]);
    await client.query('COMMIT');
    return toDto(row);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
