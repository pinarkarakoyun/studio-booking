import pool from '../db/pool.js';
import { AppError } from '../errors.js';

// Şubeler. Her stüdyo bir şubeyle açılır; yönetici sonra panelden yeni şube ekler, düzenler, kapatır.
// Şube silinmez, kapatılır: geçmiş derslerin şubesi kaybolmasın.

// Stüdyo açılırken otomatik açılan ilk şubenin adı. Tek şubeli stüdyoda arayüzde görünmez;
// ikinci şube açılınca yönetici bu adı değiştirebilir.
export const DEFAULT_BRANCH_NAME = 'Merkez';

// Stüdyonun ilk şubesini açar ve kimliğini döndürür. Stüdyo açan her yol (create-admin, seed:dev) bunu
// stüdyoyla aynı transaction'da çağırır: hiçbir stüdyo şubesiz kalmaz.
export async function openFirstBranch(studioId, db, name = DEFAULT_BRANCH_NAME) {
  const { rows: [branch] } = await db.query(
    'INSERT INTO branches (studio_id, name) VALUES ($1, $2) RETURNING id',
    [studioId, name],
  );
  return branch.id;
}

// Stüdyonun açık şube sayısı. 1'den fazlaysa stüdyo "çok şubeli"dir ve arayüzde şube öğeleri görünür.
export async function countActiveBranches(studioId, db) {
  const { rows: [row] } = await db.query(
    'SELECT count(*)::int AS count FROM branches WHERE studio_id = $1 AND is_active',
    [studioId],
  );
  return row.count;
}

const NOT_FOUND = () => new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı.', 404);

// Grup formunun kullandığı kontrol: şube bu stüdyonun mu ve açık mı?
export async function findOpenBranch(studioId, branchId, db) {
  const { rows: [branch] } = await db.query(
    'SELECT id, name, is_active FROM branches WHERE id = $1 AND studio_id = $2',
    [branchId, studioId],
  );
  if (!branch) throw NOT_FOUND();
  if (!branch.is_active) throw new AppError('BRANCH_CLOSED', 'Bu şube kapalı; açık bir şube seç.', 400);
  return { id: branch.id, name: branch.name };
}

// --- Liste ---------------------------------------------------------------------------------------

export async function listBranches(admin, { db = pool } = {}) {
  const { rows } = await db.query(
    `
    SELECT b.id, b.name, b.address, b.maps_url, b.is_active,
           (SELECT count(*)::int FROM groups g WHERE g.branch_id = b.id AND g.is_active) AS active_group_count
    FROM branches b
    WHERE b.studio_id = $1
    ORDER BY b.id
    `,
    [admin.studio_id],
  );
  return rows.map(toDto);
}

function toDto(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    mapsUrl: row.maps_url,
    isActive: row.is_active,
    ...(row.active_group_count === undefined ? {} : { activeGroupCount: row.active_group_count }),
  };
}

// --- Ekle / düzenle ------------------------------------------------------------------------------

// Boşluklar sadeleştirilir. Adres ve harita bağlantısı isteğe bağlı: boş metin "yok" (null) demek.
function validate({ name, address, mapsUrl }) {
  const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (cleanName.length < 2 || cleanName.length > 60) {
    throw new AppError('INVALID_BRANCH_NAME', 'Şube adı 2 ile 60 karakter arasında olmalı.', 400);
  }
  const cleanAddress = typeof address === 'string' && address.trim() ? address.trim().replace(/\s+/g, ' ') : null;
  if (cleanAddress && cleanAddress.length > 300) {
    throw new AppError('INVALID_BRANCH_ADDRESS', 'Adres en fazla 300 karakter olabilir.', 400);
  }
  const cleanMaps = typeof mapsUrl === 'string' && mapsUrl.trim() ? mapsUrl.trim() : null;
  // Yalnızca https: "javascript:" gibi bir değer sitede tıklanabilir bağlantı olarak gösterilemesin.
  if (cleanMaps && !/^https:\/\/\S+$/.test(cleanMaps)) {
    throw new AppError('INVALID_MAPS_URL', 'Harita bağlantısı https:// ile başlamalı.', 400);
  }
  return { name: cleanName, address: cleanAddress, mapsUrl: cleanMaps };
}

// Aynı ad çakışması veritabanındaki benzersiz index'ten (23505) gelir; anlaşılır bir hataya çevrilir.
async function nameSafe(work) {
  try {
    return await work();
  } catch (err) {
    if (err.code === '23505') throw new AppError('BRANCH_NAME_TAKEN', 'Bu adda bir şube zaten var.', 409);
    throw err;
  }
}

export async function createBranch(admin, input, { db = pool } = {}) {
  const branch = validate(input);
  return nameSafe(async () => {
    const { rows: [row] } = await db.query(
      'INSERT INTO branches (studio_id, name, address, maps_url) VALUES ($1, $2, $3, $4) RETURNING id',
      [admin.studio_id, branch.name, branch.address, branch.mapsUrl],
    );
    return { branchId: row.id };
  });
}

export async function updateBranch(admin, branchId, input, { db = pool } = {}) {
  const branch = validate(input);
  return nameSafe(async () => {
    const { rows: [row] } = await db.query(
      `UPDATE branches SET name = $3, address = $4, maps_url = $5
       WHERE id = $1 AND studio_id = $2
       RETURNING id, name, address, maps_url, is_active`,
      [branchId, admin.studio_id, branch.name, branch.address, branch.mapsUrl],
    );
    if (!row) throw NOT_FOUND();
    return toDto(row);
  });
}

// --- Kapat / aç ----------------------------------------------------------------------------------

// Açık grubu olan şube ve stüdyonun son açık şubesi kapatılamaz. Kontroller tek transaction'da ve stüdyonun
// şubeleri kilitlenerek yapılır: aynı anda iki şubeyi kapatan iki istek, stüdyoyu şubesiz bırakamaz.
export async function closeBranch(admin, branchId, { db = pool } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: branches } = await client.query(
      'SELECT id, is_active FROM branches WHERE studio_id = $1 ORDER BY id FOR UPDATE',
      [admin.studio_id],
    );
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) throw NOT_FOUND();

    if (branch.is_active) {
      const { rows: groups } = await client.query(
        'SELECT name FROM groups WHERE branch_id = $1 AND is_active ORDER BY name',
        [branchId],
      );
      if (groups.length > 0) {
        throw new AppError(
          'BRANCH_HAS_GROUPS',
          `Bu şubede açık gruplar var: ${groups.map((g) => g.name).join(', ')}. Önce onları başka şubeye taşı ya da kapat.`,
          409,
        );
      }
      if (branches.filter((b) => b.is_active).length <= 1) {
        throw new AppError('LAST_BRANCH', 'Stüdyonun en az bir açık şubesi olmalı.', 409);
      }
      await client.query('UPDATE branches SET is_active = false WHERE id = $1', [branchId]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function reopenBranch(admin, branchId, { db = pool } = {}) {
  const { rowCount } = await db.query(
    'UPDATE branches SET is_active = true WHERE id = $1 AND studio_id = $2',
    [branchId, admin.studio_id],
  );
  if (rowCount === 0) throw NOT_FOUND();
}
