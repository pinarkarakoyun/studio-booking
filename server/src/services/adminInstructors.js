import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { generateTemporaryPassword } from '../utils/tempPassword.js';
import { findOpenBranch } from './adminBranches.js';
import { createUser, resetPassword, revokeAllSessions } from './auth.js';
import { NEEDS_VIEW_CUSTOMERS, PERMISSION_KEYS } from './instructorPermissions.js';

// Yönetici panelinin "Eğitmenler" bölümü (yalnızca yönetici). Eğitmen, üye ekler gibi eklenir: ad, telefon,
// geçici şifre. Yönetici eğitmeni şubelere atar ve yetkilerini tek tek seçer.
// Tasarım: docs/superpowers/specs/2026-11-24-instructor-role-design.md, bölüm 5.2 ve 5.6.

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

const NOT_FOUND = () => new AppError('INSTRUCTOR_NOT_FOUND', 'Eğitmen bulunamadı.', 404);

// Eğitmenler ve açık şubeleri (kapalı şube eğitmenin şubesi sayılmaz; oturumdaki kurala uygun).
const INSTRUCTOR_SELECT = `
  SELECT u.id, u.full_name, u.phone, u.status,
         COALESCE(
           (SELECT json_agg(json_build_object('id', b.id, 'name', b.name) ORDER BY b.id)
            FROM instructor_branches ib JOIN branches b ON b.id = ib.branch_id
            WHERE ib.user_id = u.id AND b.is_active),
           '[]'
         ) AS branches
  FROM users u
  WHERE u.studio_id = $1 AND u.role = 'instructor'
`;

const toDto = (row) => ({
  id: row.id,
  fullName: row.full_name,
  phone: row.phone,
  status: row.status,
  branches: row.branches.map((b) => ({ id: Number(b.id), name: b.name })),
});

export async function listInstructors(admin, { db = pool } = {}) {
  const { rows } = await db.query(INSTRUCTOR_SELECT, [admin.studio_id]);
  return rows.map(toDto).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
}

async function findInstructor(admin, instructorId, db) {
  const { rows: [row] } = await db.query(`${INSTRUCTOR_SELECT} AND u.id = $2`, [admin.studio_id, instructorId]);
  if (!row) throw NOT_FOUND();
  return row;
}

export async function getInstructor(admin, instructorId, { db = pool } = {}) {
  const row = await findInstructor(admin, instructorId, db);
  const { rows: [perm] } = await db.query('SELECT * FROM instructor_permissions WHERE user_id = $1', [instructorId]);
  return {
    ...toDto(row),
    permissions: Object.fromEntries(PERMISSION_KEYS.map((key) => [key, perm?.[key] === true])),
  };
}

// Şube listesi: en az bir şube, hepsi bu stüdyonun açık şubeleri. Tekrarlar atılır.
async function validateBranches(admin, branchIds, db) {
  if (!Array.isArray(branchIds) || branchIds.length === 0) {
    throw new AppError('BRANCH_REQUIRED', 'En az bir şube seç.', 400);
  }
  const unique = [...new Set(branchIds.map(Number))];
  for (const id of unique) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı.', 404);
    await findOpenBranch(admin.studio_id, id, db);
  }
  return unique;
}

async function replaceBranches(admin, instructorId, branchIds, client) {
  await client.query('DELETE FROM instructor_branches WHERE user_id = $1', [instructorId]);
  for (const branchId of branchIds) {
    await client.query(
      'INSERT INTO instructor_branches (user_id, branch_id, studio_id) VALUES ($1, $2, $3)',
      [instructorId, branchId, admin.studio_id],
    );
  }
}

// --- Yeni eğitmen -------------------------------------------------------------------------------

export async function createInstructor(admin, { fullName, phone, branchIds }, { db = pool } = {}) {
  const name = typeof fullName === 'string' ? fullName.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Ad soyad yaz.', 400);

  return withTransaction(db, async (client) => {
    const branches = await validateBranches(admin, branchIds, client);
    const temporaryPassword = generateTemporaryPassword();
    const instructorId = await createUser(
      { studioId: admin.studio_id, role: 'instructor', fullName: name, phone, temporaryPassword },
      { db: client },
    );
    await replaceBranches(admin, instructorId, branches, client);
    // Yetkiler veritabanındaki varsayılanlarla başlar (migration 019).
    await client.query('INSERT INTO instructor_permissions (user_id) VALUES ($1)', [instructorId]);
    // Şifre yalnızca bu cevapta, bir kez döner.
    return { instructor: toDto(await findInstructor(admin, instructorId, client)), temporaryPassword };
  });
}

// --- Şubeler ve yetkiler ------------------------------------------------------------------------

// Gönderilen yetkiler mevcutların üzerine yazılır; gönderilmeyenler aynı kalır.
// Üyeleri görme kapalıysa ona bağlı üç yetki de kapanır (veritabanındaki kuralla aynı; hata yerine düzeltme,
// çünkü ekranda "Üyeleri görmek"i kapatan yönetici bağlıların da kapanmasını bekler).
function mergePermissions(current, changes) {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
    throw new AppError('INVALID_PERMISSION', 'Yetkiler geçersiz.', 400);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (!PERMISSION_KEYS.includes(key) || typeof value !== 'boolean') {
      throw new AppError('INVALID_PERMISSION', 'Yetkiler geçersiz.', 400);
    }
  }
  const next = { ...current, ...changes };
  if (!next.view_customers) for (const key of NEEDS_VIEW_CUSTOMERS) next[key] = false;
  return next;
}

export async function updateInstructor(admin, instructorId, { branchIds, permissions }, { db = pool } = {}) {
  return withTransaction(db, async (client) => {
    await findInstructor(admin, instructorId, client);
    if (branchIds !== undefined) {
      await replaceBranches(admin, instructorId, await validateBranches(admin, branchIds, client), client);
    }
    if (permissions !== undefined) {
      const { permissions: current } = await getInstructor(admin, instructorId, { db: client });
      const next = mergePermissions(current, permissions);
      await client.query(
        `UPDATE instructor_permissions SET ${PERMISSION_KEYS.map((key, i) => `${key} = $${i + 2}`).join(', ')}
         WHERE user_id = $1`,
        [instructorId, ...PERMISSION_KEYS.map((key) => next[key])],
      );
    }
    return getInstructor(admin, instructorId, { db: client });
  });
}

// --- Şifre ve ayrılma ---------------------------------------------------------------------------

export async function resetInstructorPassword(admin, instructorId, { db = pool } = {}) {
  await findInstructor(admin, instructorId, db);
  const temporaryPassword = generateTemporaryPassword();
  await resetPassword({ userId: instructorId, temporaryPassword }, { db });
  return { temporaryPassword };
}

// Ayrılan eğitmen giriş yapamaz, açık oturumları kapanır. Grupların eğitmen kaydı geçmiş için kalır;
// yönetici grubu yeni bir eğitmene atar.
export async function markInstructorLeft(admin, instructorId, { db = pool } = {}) {
  await findInstructor(admin, instructorId, db);
  await db.query(`UPDATE users SET status = 'left' WHERE id = $1`, [instructorId]);
  await revokeAllSessions(instructorId, { db });
  return getInstructor(admin, instructorId, { db });
}

// Bir grubun ya da dersin eğitmeni olabilir mi? Bu stüdyoda, hesabı açık ve o şubeye atanmış bir eğitmen olmalı.
export async function assertBranchInstructor(studioId, instructorId, branchId, db) {
  const { rowCount } = await db.query(
    `
    SELECT 1 FROM users u JOIN instructor_branches ib ON ib.user_id = u.id
    WHERE u.id = $1 AND u.studio_id = $2 AND u.role = 'instructor' AND u.status <> 'left' AND ib.branch_id = $3
    `,
    [instructorId, studioId, branchId],
  );
  if (!rowCount) throw new AppError('INVALID_INSTRUCTOR', 'Bu şubede böyle bir eğitmen yok.', 400);
}
