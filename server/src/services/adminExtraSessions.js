import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { cleanGroupName, resolveBranch, validateTiming } from './adminGroups.js';
import { assertBranchInstructor } from './adminInstructors.js';
import { getSessionRoster } from './adminSchedule.js';
import { isInstructor } from './scope.js';

// Ek ders: haftalık programın dışında tek seferlik ders (ör. cumartesi 10:00). Gizli, tek seferlik bir grup
// (groups.kind = 'extra', haftalık günü ve üyesi yok) ve onun tek dersi olarak tutulur; böylece süre, kapasite
// ve şube bugünkü gibi gruptan okunur, doluluk ve telafi kodları değişmeden çalışır. Grup listelerinde görünmez.
// Duyuruyu eğitmen WhatsApp'tan kendisi yapar; sistem kimseye mesaj göndermez.
// Tasarım: docs/superpowers/specs/2026-11-24-instructor-role-design.md, bölüm 5.5.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_EXTRA_TITLE = 'Ek ders';

// Açan: yönetici her zaman; eğitmen create_extra_sessions yetkisiyle ve yalnızca kendi şubelerinde.
// Eğitmen açınca ders ona atanır; başka birini seçemez. Ek ders düzenlenmez, yanlışsa iptal edilir.
export async function createExtraSession(actor, input, { db = pool } = {}) {
  const { date, title } = input;
  if (typeof date !== 'string' || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    throw new AppError('INVALID_DATE', 'Tarih geçersiz.', 400);
  }
  const timing = validateTiming(input);
  const name = title == null || (typeof title === 'string' && title.trim() === '') ? DEFAULT_EXTRA_TITLE : cleanGroupName(title);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const branch = await resolveBranch(actor, input.branchId, client);
    const instructorId = await resolveExtraInstructor(actor, input.instructorId, branch.id, client);

    // Ders başlangıcı stüdyonun saat dilimine göre; geçmişe ek ders açılmaz.
    const { rows: [when] } = await client.query(
      `SELECT ($1::date + $2::time) AT TIME ZONE timezone AS starts_at,
              ($1::date + $2::time) AT TIME ZONE timezone > now() AS is_future
       FROM studios WHERE id = $3`,
      [date, timing.startTime, actor.studio_id],
    );
    if (!when.is_future) throw new AppError('IN_THE_PAST', 'Geçmiş bir zamana ek ders açılamaz.', 400);

    const { rows: [group] } = await client.query(
      `INSERT INTO groups (studio_id, branch_id, name, start_time, duration_minutes, capacity, instructor_id, kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'extra') RETURNING id`,
      [actor.studio_id, branch.id, name, timing.startTime, timing.durationMinutes, timing.capacity, instructorId],
    );
    const { rows: [session] } = await client.query(
      'INSERT INTO sessions (group_id, date, starts_at, capacity) VALUES ($1, $2, $3, $4) RETURNING id',
      [group.id, date, when.starts_at, timing.capacity],
    );
    await client.query('COMMIT');
    return getSessionRoster(actor, session.id, { db });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function resolveExtraInstructor(actor, instructorId, branchId, db) {
  if (isInstructor(actor)) {
    if (instructorId != null && instructorId !== actor.id) {
      throw new AppError('INVALID_INSTRUCTOR', 'Ek dersi açan eğitmen dersin eğitmeni olur.', 400);
    }
    return actor.id;
  }
  if (instructorId == null) return null;
  if (!Number.isSafeInteger(instructorId) || instructorId <= 0) {
    throw new AppError('INVALID_INSTRUCTOR', 'Bu şubede böyle bir eğitmen yok.', 400);
  }
  await assertBranchInstructor(actor.studio_id, instructorId, branchId, db);
  return instructorId;
}
