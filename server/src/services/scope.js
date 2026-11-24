import { AppError } from '../errors.js';

// Kapsam: işlemi yapan kişi (actor) hangi kayıtları görebilir?
//   Yönetici: kendi stüdyosundaki her şey (actor.branchIds === null).
//   Eğitmen:  kendi stüdyosunda, yalnızca atandığı açık şubeler (actor.branchIds dizisi; boş dizi = hiçbir şey).
// Kapsam dışı kayıt 404 döner, 403 değil: eğitmen başka şubede böyle bir kaydın olup olmadığını öğrenemez.
// Tasarım: docs/superpowers/specs/2026-11-24-instructor-role-design.md, bölüm 5.3.

export const isInstructor = (actor) => actor.role === 'instructor';

// SQL'e eklenecek şube koşulu. Eğitmen için şube listesini params'ın sonuna ekler ve onun numarasını kullanır.
// Kullanım: const params = [studioId]; `... WHERE g.studio_id = $1 AND ${branchClause(actor, 'g.branch_id', params)}`
export function branchClause(actor, column, params) {
  if (actor.branchIds === null) return 'TRUE';
  params.push(actor.branchIds);
  return `${column} = ANY($${params.length}::bigint[])`;
}

const inScope = (actor, branchId) => actor.branchIds === null || actor.branchIds.includes(Number(branchId));

// Ders kapsamda mı? Dönüş: dersin eğitmenini ve türünü de içeren kısa bilgi.
// Dersin eğitmeni = o günkü eğitmen (sessions.instructor_id), yoksa grubun eğitmeni.
export async function assertSessionInScope(actor, sessionId, db) {
  const { rows: [row] } = await db.query(
    `
    SELECT s.id, g.branch_id, s.date, s.status, g.kind,
           COALESCE(s.instructor_id, g.instructor_id) AS instructor_id
    FROM sessions s JOIN groups g ON g.id = s.group_id
    WHERE s.id = $1 AND g.studio_id = $2
    `,
    [sessionId, actor.studio_id],
  );
  if (!row || !inScope(actor, row.branch_id)) throw new AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404);
  return {
    id: Number(row.id),
    branchId: Number(row.branch_id),
    date: row.date,
    status: row.status,
    instructorId: row.instructor_id === null ? null : Number(row.instructor_id),
    groupKind: row.kind,
  };
}

// Üye kapsamda mı? Yalnızca müşteri hesapları (yönetici ve eğitmen hesapları "üye" değildir).
// Eğitmen için üyenin şubesi, stüdyonun bugününde üyesi olduğu grubun şubesidir; grubu olmayan üye kapsam dışı.
export async function assertCustomerInScope(actor, customerId, db) {
  const { rows: [row] } = await db.query(
    `
    SELECT u.id, current_group.branch_id
    FROM users u
    JOIN studios st ON st.id = u.studio_id
    LEFT JOIN LATERAL (
      SELECT g.branch_id
      FROM group_members gm JOIN groups g ON g.id = gm.group_id
      WHERE gm.user_id = u.id
        AND gm.joined_on <= (now() AT TIME ZONE st.timezone)::date
        AND (gm.left_on IS NULL OR (now() AT TIME ZONE st.timezone)::date < gm.left_on)
      LIMIT 1
    ) current_group ON true
    WHERE u.id = $1 AND u.studio_id = $2 AND u.role = 'customer'
    `,
    [customerId, actor.studio_id],
  );
  const visible = row && (actor.branchIds === null || (row.branch_id !== null && inScope(actor, row.branch_id)));
  if (!visible) throw new AppError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.', 404);
}

export async function assertGroupInScope(actor, groupId, db) {
  const { rows: [row] } = await db.query(
    'SELECT branch_id FROM groups WHERE id = $1 AND studio_id = $2',
    [groupId, actor.studio_id],
  );
  if (!row || !inScope(actor, row.branch_id)) throw new AppError('GROUP_NOT_FOUND', 'Grup bulunamadı.', 404);
  return { branchId: Number(row.branch_id) };
}

// Şubenin stüdyoya ait olduğu ayrıca (veritabanındaki birleşik anahtarlarla ya da servisteki sorguyla) denetlenir;
// burada yalnızca eğitmenin şubesi mi diye bakılır.
export function assertBranchInScope(actor, branchId) {
  if (!inScope(actor, branchId)) throw new AppError('BRANCH_NOT_FOUND', 'Şube bulunamadı.', 404);
}

// Eğitmen fiyat görmez: cevaptan tutar alanlarını derinlemesine çıkarır (girdiyi değiştirmez).
// Silinen anahtarlar: "...Kurus" ile bitenler, price/fee/amount ile başlayanlar ve ödeme listeleri.
const PRICE_KEY = /Kurus$|^(price|fee|amount)|^payments$/;

export function redactPrices(value) {
  if (Array.isArray(value)) return value.map(redactPrices);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRICE_KEY.test(key))
      .map(([key, v]) => [key, redactPrices(v)]),
  );
}
