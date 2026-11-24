import { AppError } from '../errors.js';

// Eğitmenler. Yönetici ekranının uçları Görev 6'da bu dosyaya eklenir.

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
