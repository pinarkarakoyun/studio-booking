// Şubeler. Her stüdyo bir şubeyle açılır; yönetici sonra yeni şube ekleyebilir (Task 2: şube uçları).

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
