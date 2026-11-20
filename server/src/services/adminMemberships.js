import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { membershipModelOf } from './adminPackages.js';
import { MEMBERSHIP_SELECT } from './membershipPeriods.js';
import { packageUsage } from './packageUsage.js';

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

// usage: paket dönemi için { used, remaining, burned } (packageUsage); süreye bağlı dönemde yok.
function toDto(row, payments, today, usage) {
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
    // Paket döneminde dolu (paket modeli); süreye bağlı dönemde null.
    sessionCount: row.session_count,
    packageName: row.package_name,
    used: usage?.used ?? null,
    remaining: usage?.remaining ?? null,
    burned: usage?.burned ?? null,
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
  const usage = rows.some((row) => row.session_count !== null) ? await packageUsage(userId, db) : { packages: [] };
  const usageOf = (row) => usage.packages.find((p) => p.membershipId === row.id);
  return rows.map((row) => toDto(row, payments, today, usageOf(row)));
}

// Yeni dönem önerisi: son dönemin (dondurmayla uzamış) bitişinin ertesi günü; hiç dönem yoksa bugün.
// Geç ödeyen müşteri ödeme gününü kaydırmaz.
function suggestStart(memberships, today) {
  const latest = memberships[0];
  return latest ? addDays(latest.endsOn, 1) : today;
}

export async function getMemberships(admin, customerId, { db = pool } = {}) {
  await findCustomerId(admin, customerId, db);
  const today = await studioToday(admin.studio_id, db);
  const memberships = await loadMemberships(customerId, today, db);
  const result = { memberships, suggestedStartsOn: suggestStart(memberships, today) };
  // Paket modelinde: hiçbir pakete sığmayan (paketsiz) ders sayısı; yönetici yeni paket satarken görür.
  if ((await membershipModelOf(admin.studio_id, db)) === 'package') {
    result.unpackaged = (await packageUsage(customerId, db)).unpackaged;
  }
  return result;
}

// Yeni dönem. Grup modelinde gövde { startsOn, endsOn, feeKurus, note }; paket modelinde { packageId, startsOn,
// feeKurus?, note? }: seans sayısı, ad ve fiyat katalogdan kopyalanır, bitiş = başlangıç + geçerlilik - 1.
// feeKurus verilirse katalog fiyatının yerine geçer (indirim). Katalog sonradan değişse de satılmış paket değişmez.
export async function createMembership(admin, customerId, input, { db = pool } = {}) {
  const model = await membershipModelOf(admin.studio_id, db);
  if (model === 'package') return sellPackage(admin, customerId, input, db);
  if (input.packageId != null) {
    throw new AppError('NOT_AVAILABLE_FOR_MODEL', 'Bu stüdyoda paket satılmıyor; dönem tarihlerini yaz.', 400);
  }

  const { startsOn, endsOn, feeKurus, note } = input;
  assertDate(startsOn, 'Başlangıç tarihi');
  assertDate(endsOn, 'Bitiş tarihi');
  if (endsOn < startsOn) throw new AppError('INVALID_DATE', 'Bitiş, başlangıçtan önce olamaz.', 400);
  assertFee(feeKurus);
  const period = { startsOn, endsOn, feeKurus, note: cleanNote(note), sessionCount: null, packageName: null };
  return withTransaction(db, (client) => insertPeriod(admin, customerId, period, client));
}

function assertFee(feeKurus) {
  if (!Number.isSafeInteger(feeKurus) || feeKurus < 0) throw new AppError('INVALID_AMOUNT', 'Ücreti yaz.', 400);
}

const PACKAGE_NOT_FOUND = () => new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı.', 404);

async function sellPackage(admin, customerId, { packageId, startsOn, feeKurus, note }, db) {
  if (packageId == null) throw new AppError('PACKAGE_REQUIRED', 'Satılacak paketi seç.', 400);
  if (!Number.isSafeInteger(packageId) || packageId <= 0) throw PACKAGE_NOT_FOUND();
  assertDate(startsOn, 'Başlangıç tarihi');
  if (feeKurus != null) assertFee(feeKurus);
  const cleanedNote = cleanNote(note);

  return withTransaction(db, async (client) => {
    const { rows: [pkg] } = await client.query(
      'SELECT name, session_count, price_kurus, validity_days, is_active FROM packages WHERE id = $1 AND studio_id = $2',
      [packageId, admin.studio_id],
    );
    if (!pkg) throw PACKAGE_NOT_FOUND();
    if (!pkg.is_active) throw new AppError('PACKAGE_CLOSED', 'Bu paket satışa kapalı; açık bir paket seç.', 400);
    const period = {
      startsOn,
      endsOn: addDays(startsOn, pkg.validity_days - 1),
      feeKurus: feeKurus ?? Number(pkg.price_kurus),
      note: cleanedNote,
      sessionCount: pkg.session_count,
      packageName: pkg.name,
    };
    return insertPeriod(admin, customerId, period, client);
  });
}

// "YYYY-MM-DD" + n gün. Öğlen UTC: saat dilimi geçişleri tarihi kaydırmasın.
function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// İki model için ortak: müşteri kontrolü, çakışma kontrolü ve kayıt. Transaction içinde çağrılır.
async function insertPeriod(admin, customerId, period, client) {
  const customer = await findCustomerId(admin, customerId, client, { lock: true });
  if (customer.status === 'left') {
    throw new AppError('CUSTOMER_LEFT', 'Ayrılmış bir müşteriye üyelik dönemi açılamaz.', 409);
  }
  // Veritabanı kısıtı dondurmasız tarihleri karşılaştırır; dondurmayla uzamış bitişi burada kontrol ediyoruz.
  const today = await studioToday(admin.studio_id, client);
  const existing = await loadMemberships(customerId, today, client);
  if (existing.some((m) => period.startsOn <= m.endsOn && period.endsOn >= m.startsOn)) {
    throw new AppError('MEMBERSHIP_OVERLAP', 'Bu tarihler başka bir üyelik dönemiyle çakışıyor.', 409);
  }
  const { rows: [row] } = await client.query(
    `INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus, note, session_count, package_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [customerId, period.startsOn, period.endsOn, period.feeKurus, period.note, period.sessionCount, period.packageName],
  );
  const memberships = await loadMemberships(customerId, today, client);
  return memberships.find((m) => m.id === row.id);
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
  // Şube adı bugünkü grubundan (grubu yoksa null); ekran yalnızca çok şubeli stüdyoda gösterir.
  const { rows: customers } = await db.query(
    `SELECT u.id, u.full_name, b.name AS branch_name
     FROM users u
     LEFT JOIN group_members gm ON gm.user_id = u.id
                               AND gm.joined_on <= $2 AND (gm.left_on IS NULL OR $2 < gm.left_on)
     LEFT JOIN groups g ON g.id = gm.group_id
     LEFT JOIN branches b ON b.id = g.branch_id
     WHERE u.studio_id = $1 AND u.role = 'customer' AND u.status <> 'left'`,
    [admin.studio_id, today],
  );
  const { rows: periods } = await db.query(
    `${MEMBERSHIP_SELECT}
     JOIN users u ON u.id = m.user_id
     WHERE u.studio_id = $1 AND u.role = 'customer' AND u.status <> 'left'
     ORDER BY m.starts_on DESC`,
    [admin.studio_id, today],
  );

  const isPackageModel = (await membershipModelOf(admin.studio_id, db)) === 'package';
  const packageFinished = [];
  const expired = [];
  const endingSoon = [];
  const underpaid = [];
  const noMembership = [];
  for (const customer of customers) {
    const person = { customerId: customer.id, fullName: customer.full_name, branchName: customer.branch_name };
    const own = periods.filter((p) => p.user_id === customer.id);
    if (own.length === 0) {
      noMembership.push(person);
      continue;
    }
    const latest = own[0];
    // Paket modeli: en yeni paketi bitmiş (kalan 0: seansları dolmuş ya da son günü geçip kalanı yanmış) ve
    // yenisi açılmamış üye "Paketi bitti" listesine girer; "süresi doldu"da ikinci kez görünmez.
    let finished = false;
    if (isPackageModel && latest.session_count !== null) {
      const usage = await packageUsage(customer.id, db);
      if (usage.packages.find((p) => p.membershipId === latest.id)?.remaining === 0) {
        finished = true;
        packageFinished.push({ ...person, endsOn: latest.effective_ends_on, unpackaged: usage.unpackaged });
      }
    }
    const left = daysBetween(today, latest.effective_ends_on);
    if (!finished && left < 0) expired.push({ ...person, endsOn: latest.effective_ends_on, daysAgo: -left });
    else if (!finished && left <= studio.payment_reminder_days) {
      endingSoon.push({ ...person, endsOn: latest.effective_ends_on, daysLeft: left });
    }
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
    ...(isPackageModel ? { packageFinished: packageFinished.sort(byName) } : {}),
  };
}

// Müşterinin kendi ekranı (Derslerim) için üyelik bilgisi.
// Bitiş: bugünü kapsayan dönemden başlayıp arkasından kesintisiz gelen dönemler izlenir (yönetici sonraki dönemi
// önceden açtıysa müşteri en son tarihi görür). Bugün dönem yoksa ilerideki ilk dönem, o da yoksa en son biten.
// Tutarlar sadece stüdyo "Üyeler ödeme bilgisini görsün" ayarını açtıysa gönderilir (BR-37, 25 Ekim güncellemesi);
// kapalıyken hiç gönderilmez. Yöneticinin ödeme notları hiçbir zaman gönderilmez. Hiç dönem yoksa null.
export async function getMyMembership(user, { db = pool } = {}) {
  const today = await studioToday(user.studio_id, db);
  const { rows } = await db.query(`${MEMBERSHIP_SELECT} WHERE m.user_id = $1 ORDER BY m.starts_on`, [user.id, today]);
  if (rows.length === 0) return null;

  let index = rows.findIndex((m) => m.starts_on <= today && m.effective_ends_on >= today);
  if (index === -1) index = rows.findIndex((m) => m.starts_on > today);
  const ended = index === -1;
  if (ended) index = rows.length - 1;

  // Paket: kendi son günü, kalan seans ve paketsiz ders sayısı. Ardışık dönemleri birleştirmek pakette anlamsız
  // (her paketin kendi seans sayısı var).
  const current = rows[index];
  if (current.session_count !== null) {
    const usage = await packageUsage(user.id, db);
    const own = usage.packages.find((p) => p.membershipId === current.id);
    return withPayments(user, current, db, {
      endsOn: current.effective_ends_on,
      ended,
      packageName: current.package_name,
      sessionCount: current.session_count,
      used: own.used,
      remaining: own.remaining,
      unpackaged: usage.unpackaged,
    });
  }

  let endsOn = rows[index].effective_ends_on;
  if (!ended) {
    for (const next of rows.slice(index + 1)) {
      if (daysBetween(endsOn, next.starts_on) > 1) break;
      if (next.effective_ends_on > endsOn) endsOn = next.effective_ends_on;
    }
  }
  return withPayments(user, rows[index], db, { endsOn, ended });
}

// Stüdyo "Üyeler ödeme bilgisini görsün" ayarını açtıysa dönemin ücret ve ödemelerini ekler.
async function withPayments(user, period, db, result) {
  const { rows: [setting] } = await db.query(
    'SELECT show_payments_to_customers FROM studio_settings WHERE studio_id = $1',
    [user.studio_id],
  );
  if (!setting?.show_payments_to_customers) return result;

  const { rows: payments } = await db.query(
    'SELECT paid_on, amount_kurus, method FROM payments WHERE membership_id = $1 ORDER BY paid_on, id',
    [period.id],
  );
  return {
    ...result,
    period: {
      startsOn: period.starts_on,
      endsOn: period.effective_ends_on,
      feeKurus: period.fee_kurus,
      paidKurus: period.paid_kurus,
      remainingKurus: Math.max(0, period.fee_kurus - period.paid_kurus),
      payments: payments.map((p) => ({ paidOn: p.paid_on, amountKurus: p.amount_kurus, method: p.method })),
    },
  };
}
