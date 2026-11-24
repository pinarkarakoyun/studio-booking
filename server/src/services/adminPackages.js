import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { isInstructor, redactPrices } from './scope.js';

// Paket kataloğu: stüdyonun sattığı seans paketleri ("8 seans, 45 gün geçerli, 2.400 TL").
// Yalnızca seans paketi modelindeki stüdyoda vardır. Paket silinmez, kapatılır: kapalı paket yeni satışta
// görünmez. Satılan paketin adı, seans sayısı ve fiyatı üyelik dönemine kopyalanır; katalogdaki sonraki
// değişiklikler satılmış paketleri etkilemez.

// Stüdyonun üyelik modeli: 'group' (grup + telafi) ya da 'package' (seans paketi). Kurulumda seçilir.
export async function membershipModelOf(studioId, db = pool) {
  const { rows: [row] } = await db.query(
    'SELECT membership_model FROM studio_settings WHERE studio_id = $1',
    [studioId],
  );
  return row.membership_model;
}

// Uç bu modelde yoksa 404: grup modelindeki stüdyo için paket uçları hiç yokmuş gibi davranır.
export async function assertModel(studioId, model, db = pool) {
  if ((await membershipModelOf(studioId, db)) !== model) {
    throw new AppError('NOT_AVAILABLE_FOR_MODEL', 'Bu özellik stüdyonun üyelik modelinde yok.', 404);
  }
}

const NOT_FOUND = () => new AppError('PACKAGE_NOT_FOUND', 'Paket bulunamadı.', 404);

const COLUMNS = 'id, name, session_count, price_kurus, validity_days, is_active';

function toDto(row) {
  return {
    id: row.id,
    name: row.name,
    sessionCount: row.session_count,
    // bigint, pg'den metin olarak gelir; kuruş tutarları Number'ın güvenli aralığında kalır.
    priceKurus: Number(row.price_kurus),
    validityDays: row.validity_days,
    isActive: row.is_active,
  };
}

// --- Liste ---------------------------------------------------------------------------------------

export async function listPackages(admin, { db = pool } = {}) {
  await assertModel(admin.studio_id, 'package', db);
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM packages WHERE studio_id = $1 ORDER BY id`,
    [admin.studio_id],
  );
  // Eğitmen paketleri adı ve seans sayısıyla görür, fiyatsız.
  return isInstructor(admin) ? redactPrices(rows.map(toDto)) : rows.map(toDto);
}

// --- Ekle / düzenle ------------------------------------------------------------------------------

const isIntBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// Sınırlar veritabanındaki CHECK kurallarıyla aynı (016); burada anlaşılır bir hataya çevriliyor.
function validate({ name, sessionCount, priceKurus, validityDays }) {
  const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (cleanName.length < 2 || cleanName.length > 60) {
    throw new AppError('INVALID_PACKAGE_NAME', 'Paket adı 2 ile 60 karakter arasında olmalı.', 400);
  }
  if (!isIntBetween(sessionCount, 1, 200)) {
    throw new AppError('INVALID_SESSION_COUNT', 'Seans sayısı 1 ile 200 arasında bir tam sayı olmalı.', 400);
  }
  if (!Number.isSafeInteger(priceKurus) || priceKurus < 0) {
    throw new AppError('INVALID_PRICE', 'Fiyat 0 ya da daha büyük olmalı.', 400);
  }
  if (!isIntBetween(validityDays, 1, 365)) {
    throw new AppError('INVALID_VALIDITY_DAYS', 'Geçerlilik 1 ile 365 gün arasında olmalı.', 400);
  }
  return { name: cleanName, sessionCount, priceKurus, validityDays };
}

export async function createPackage(admin, input, { db = pool } = {}) {
  await assertModel(admin.studio_id, 'package', db);
  const pkg = validate(input);
  const { rows: [row] } = await db.query(
    `INSERT INTO packages (studio_id, name, session_count, price_kurus, validity_days)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [admin.studio_id, pkg.name, pkg.sessionCount, pkg.priceKurus, pkg.validityDays],
  );
  return { packageId: row.id };
}

export async function updatePackage(admin, packageId, input, { db = pool } = {}) {
  await assertModel(admin.studio_id, 'package', db);
  const pkg = validate(input);
  const { rows: [row] } = await db.query(
    `UPDATE packages SET name = $3, session_count = $4, price_kurus = $5, validity_days = $6
     WHERE id = $1 AND studio_id = $2
     RETURNING ${COLUMNS}`,
    [packageId, admin.studio_id, pkg.name, pkg.sessionCount, pkg.priceKurus, pkg.validityDays],
  );
  if (!row) throw NOT_FOUND();
  return toDto(row);
}

// --- Kapat / aç ----------------------------------------------------------------------------------

async function setActive(admin, packageId, isActive, db) {
  await assertModel(admin.studio_id, 'package', db);
  const { rowCount } = await db.query(
    'UPDATE packages SET is_active = $3 WHERE id = $1 AND studio_id = $2',
    [packageId, admin.studio_id, isActive],
  );
  if (rowCount === 0) throw NOT_FOUND();
}

export const closePackage = (admin, packageId, { db = pool } = {}) => setActive(admin, packageId, false, db);
export const reopenPackage = (admin, packageId, { db = pool } = {}) => setActive(admin, packageId, true, db);
