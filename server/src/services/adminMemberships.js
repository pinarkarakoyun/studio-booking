import pool from '../db/pool.js';
import { AppError } from '../errors.js';

// Üyelik dönemleri ve ödeme kayıtları (BR-31…BR-37). Her fonksiyon yöneticinin kendi stüdyosuyla sınırlı.
// Para her yerde kuruş cinsinden tamsayı (1.500 ₺ = 150000).
// Saklanmayan, hesaplanan bilgiler: dondurma uzaması, ödenen toplam, kalan, dönemin durumu.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ['cash', 'transfer', 'card'];

function assertDate(value, label) {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new AppError('INVALID_DATE', `${label} geçersiz.`, 400);
  }
}

function cleanNote(note) {
  if (note == null) return null;
  if (typeof note !== 'string') throw new AppError('INVALID_NOTE', 'Not geçersiz.', 400);
  const text = note.trim();
  if (text.length > 200) throw new AppError('INVALID_NOTE', 'Not en fazla 200 karakter olabilir.', 400);
  return text || null;
}

async function withTransaction(db, work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function studioToday(studioId, db) {
  const { rows: [row] } = await db.query(
    'SELECT (now() AT TIME ZONE timezone)::date AS today FROM studios WHERE id = $1',
    [studioId],
  );
  return row.today;
}

// Dönemler ($2 = stüdyonun bugünü; WHERE çağıran yerde eklenir). Dondurma uzaması: dönemin (dondurmasız) tarihlerine denk gelen dondurma
// günleri kadar bitiş ileri kayar (BR-36). Bitişi belirsiz dondurma bugüne kadar sayılır.
const MEMBERSHIP_SELECT = `
  SELECT m.id, m.user_id, m.starts_on, m.ends_on, m.fee_kurus, m.note,
         (m.ends_on + ext.days) AS effective_ends_on, ext.days AS freeze_days,
         COALESCE(paid.total, 0)::bigint AS paid_kurus
  FROM memberships m
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(GREATEST(0,
             LEAST(m.ends_on, COALESCE(f.ends_on, $2::date)) - GREATEST(m.starts_on, f.starts_on) + 1
           )), 0)::int AS days
    FROM freezes f WHERE f.user_id = m.user_id
  ) AS ext
  LEFT JOIN LATERAL (SELECT SUM(amount_kurus) AS total FROM payments p WHERE p.membership_id = m.id) AS paid ON true`;

function toDto(row, payments, today) {
  let status = 'active';
  if (row.starts_on > today) status = 'upcoming';
  else if (row.effective_ends_on < today) status = 'ended';
  return {
    id: row.id,
    startsOn: row.starts_on,
    endsOn: row.effective_ends_on,
    baseEndsOn: row.ends_on,
    freezeDays: row.freeze_days,
    feeKurus: row.fee_kurus,
    paidKurus: row.paid_kurus,
    remainingKurus: Math.max(0, row.fee_kurus - row.paid_kurus),
    note: row.note,
    status,
    payments: payments
      .filter((p) => p.membership_id === row.id)
      .map((p) => ({ id: p.id, amountKurus: p.amount_kurus, paidOn: p.paid_on, method: p.method, note: p.note })),
  };
}

// Müşteri yöneticinin stüdyosunda mı? lock: aynı müşteriye aynı anda iki dönem açılmasın diye satırı kilitler.
async function findCustomerId(admin, customerId, db, { lock = false } = {}) {
  const { rows: [row] } = await db.query(
    `SELECT id, status FROM users WHERE id = $2 AND studio_id = $1 AND role = 'customer' ${lock ? 'FOR UPDATE' : ''}`,
    [admin.studio_id, customerId],
  );
  if (!row) throw new AppError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.', 404);
  return row;
}

async function loadMemberships(userId, today, db) {
  const { rows } = await db.query(`${MEMBERSHIP_SELECT} WHERE m.user_id = $1 ORDER BY m.starts_on DESC`, [userId, today]);
  const { rows: payments } = await db.query(
    `SELECT p.id, p.membership_id, p.amount_kurus, p.paid_on, p.method, p.note
     FROM payments p JOIN memberships m ON m.id = p.membership_id
     WHERE m.user_id = $1 ORDER BY p.paid_on, p.id`,
    [userId],
  );
  return rows.map((row) => toDto(row, payments, today));
}

// Yeni dönem önerisi: son dönemin (dondurmayla uzamış) bitişinin ertesi günü; hiç dönem yoksa bugün.
// Geç ödeyen müşteri ödeme gününü kaydırmaz.
function suggestStart(memberships, today) {
  const latest = memberships[0];
  if (!latest) return today;
  const next = new Date(`${latest.endsOn}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export async function getMemberships(admin, customerId, { db = pool } = {}) {
  await findCustomerId(admin, customerId, db);
  const today = await studioToday(admin.studio_id, db);
  const memberships = await loadMemberships(customerId, today, db);
  return { memberships, suggestedStartsOn: suggestStart(memberships, today) };
}

export async function createMembership(admin, customerId, { startsOn, endsOn, feeKurus, note }, { db = pool } = {}) {
  assertDate(startsOn, 'Başlangıç tarihi');
  assertDate(endsOn, 'Bitiş tarihi');
  if (endsOn < startsOn) throw new AppError('INVALID_DATE', 'Bitiş, başlangıçtan önce olamaz.', 400);
  if (!Number.isSafeInteger(feeKurus) || feeKurus < 0) throw new AppError('INVALID_AMOUNT', 'Ücreti yaz.', 400);
  const cleanedNote = cleanNote(note);

  return withTransaction(db, async (client) => {
    const customer = await findCustomerId(admin, customerId, client, { lock: true });
    if (customer.status === 'left') {
      throw new AppError('CUSTOMER_LEFT', 'Ayrılmış bir müşteriye üyelik dönemi açılamaz.', 409);
    }
    // Veritabanı kısıtı dondurmasız tarihleri karşılaştırır; dondurmayla uzamış bitişi burada kontrol ediyoruz.
    const today = await studioToday(admin.studio_id, client);
    const existing = await loadMemberships(customerId, today, client);
    if (existing.some((m) => startsOn <= m.endsOn && endsOn >= m.startsOn)) {
      throw new AppError('MEMBERSHIP_OVERLAP', 'Bu tarihler başka bir üyelik dönemiyle çakışıyor.', 409);
    }
    const { rows: [row] } = await client.query(
      `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, note) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [customerId, startsOn, endsOn, feeKurus, cleanedNote],
    );
    const memberships = await loadMemberships(customerId, today, client);
    return memberships.find((m) => m.id === row.id);
  });
}

// Dönem yöneticinin stüdyosunda mı? Ödeme eklerken iki ödeme aynı anda ücreti aşmasın diye dönemi kilitler.
async function findMembership(admin, membershipId, db) {
  const { rows: [row] } = await db.query(
    `SELECT m.id, m.user_id FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.id = $2 AND u.studio_id = $1 FOR UPDATE OF m`,
    [admin.studio_id, membershipId],
  );
  if (!row) throw new AppError('MEMBERSHIP_NOT_FOUND', 'Üyelik dönemi bulunamadı.', 404);
  return row;
}

export async function addPayment(admin, membershipId, { amountKurus, paidOn, method, note }, { db = pool } = {}) {
  if (!Number.isSafeInteger(amountKurus) || amountKurus <= 0) throw new AppError('INVALID_AMOUNT', 'Tutarı yaz.', 400);
  assertDate(paidOn, 'Ödeme tarihi');
  if (!METHODS.includes(method)) throw new AppError('INVALID_METHOD', 'Ödeme yöntemini seç.', 400);
  const cleanedNote = cleanNote(note);

  return withTransaction(db, async (client) => {
    const membership = await findMembership(admin, membershipId, client);
    const today = await studioToday(admin.studio_id, client);
    const before = (await loadMemberships(membership.user_id, today, client)).find((m) => m.id === membership.id);
    // Fazla ödeme çoğunlukla yazım hatasıdır (15000 yerine 150000); kaydetmeden önce durdur.
    if (amountKurus > before.remainingKurus) {
      throw new AppError('PAYMENT_EXCEEDS_FEE', 'Bu tutar dönemin kalan borcundan fazla.', 409);
    }
    await client.query(
      `INSERT INTO payments (membership_id, amount_kurus, paid_on, method, note) VALUES ($1, $2, $3, $4, $5)`,
      [membership.id, amountKurus, paidOn, method, cleanedNote],
    );
    return (await loadMemberships(membership.user_id, today, client)).find((m) => m.id === membership.id);
  });
}

// Yanlış girilen ödemeyi silmek için. Ödeme gerçek bir para hareketi değil, yöneticinin kaydı.
export async function deletePayment(admin, paymentId, { db = pool } = {}) {
  return withTransaction(db, async (client) => {
    const { rows: [row] } = await client.query(
      `DELETE FROM payments p USING memberships m, users u
       WHERE p.id = $2 AND m.id = p.membership_id AND u.id = m.user_id AND u.studio_id = $1
       RETURNING m.id AS membership_id, m.user_id`,
      [admin.studio_id, paymentId],
    );
    if (!row) throw new AppError('PAYMENT_NOT_FOUND', 'Ödeme bulunamadı.', 404);
    const today = await studioToday(admin.studio_id, client);
    return (await loadMemberships(row.user_id, today, client)).find((m) => m.id === row.membership_id);
  });
}

// İki takvim günü arasındaki gün farkı (b - a).
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

// Ödemeler sekmesi: sadece ilgilenilmesi gerekenler. Ayrılmış müşteriler dahil değil.
// Her müşterinin en yeni dönemine bakılır; sonraki dönemi açılmış biri "yaklaşıyor"da görünmez.
export async function getPaymentOverview(admin, { db = pool } = {}) {
  const { rows: [studio] } = await db.query(
    `SELECT (now() AT TIME ZONE st.timezone)::date AS today, ss.payment_reminder_days
     FROM studios st JOIN studio_settings ss ON ss.studio_id = st.id WHERE st.id = $1`,
    [admin.studio_id],
  );
  const { today } = studio;
  const { rows: customers } = await db.query(
    `SELECT id, full_name FROM users WHERE studio_id = $1 AND role = 'customer' AND status <> 'left'`,
    [admin.studio_id],
  );
  const { rows: periods } = await db.query(
    `${MEMBERSHIP_SELECT}
     JOIN users u ON u.id = m.user_id
     WHERE u.studio_id = $1 AND u.role = 'customer' AND u.status <> 'left'
     ORDER BY m.starts_on DESC`,
    [admin.studio_id, today],
  );

  const expired = [];
  const endingSoon = [];
  const underpaid = [];
  const noMembership = [];
  for (const customer of customers) {
    const person = { customerId: customer.id, fullName: customer.full_name };
    const own = periods.filter((p) => p.user_id === customer.id);
    if (own.length === 0) {
      noMembership.push(person);
      continue;
    }
    const latest = own[0];
    const left = daysBetween(today, latest.effective_ends_on);
    if (left < 0) expired.push({ ...person, endsOn: latest.effective_ends_on, daysAgo: -left });
    else if (left <= studio.payment_reminder_days) endingSoon.push({ ...person, endsOn: latest.effective_ends_on, daysLeft: left });
    for (const period of own) {
      const remaining = period.fee_kurus - period.paid_kurus;
      if (remaining > 0) {
        underpaid.push({
          ...person, startsOn: period.starts_on, endsOn: period.effective_ends_on, feeKurus: period.fee_kurus, remainingKurus: remaining,
        });
      }
    }
  }

  const { rows: [month] } = await db.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(p.amount_kurus), 0)::bigint AS total
     FROM payments p JOIN memberships m ON m.id = p.membership_id JOIN users u ON u.id = m.user_id
     WHERE u.studio_id = $1 AND date_trunc('month', p.paid_on) = date_trunc('month', $2::date)`,
    [admin.studio_id, today],
  );

  const byName = (a, b) => a.fullName.localeCompare(b.fullName, 'tr');
  return {
    reminderDays: studio.payment_reminder_days,
    expired: expired.sort((a, b) => a.daysAgo - b.daysAgo || byName(a, b)),
    endingSoon: endingSoon.sort((a, b) => a.daysLeft - b.daysLeft || byName(a, b)),
    underpaid: underpaid.sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : byName(a, b))),
    noMembership: noMembership.sort(byName),
    thisMonth: { count: month.count, totalKurus: month.total },
  };
}
