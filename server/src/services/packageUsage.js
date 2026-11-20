import { MEMBERSHIP_SELECT } from './membershipPeriods.js';

// Seans paketi modeli: üyenin hangi dersleri paketinden düştü ve paketlerinde kaç seans kaldı?
// Hiçbiri saklanmaz, her seferinde hesaplanır (doluluk hesabıyla aynı ilke). Kurallar:
// docs/superpowers/specs/2026-11-20-session-packages-design.md, "Seansın düşmesi".

// Üyenin düşen dersleri, zaman sırasıyla. Bir ders şu koşulların hepsi tutuyorsa düşer:
//   1. Üyenin o tarihteki grubunun dersi ya da yönetici onu bu derse eklemiş (credits.used_session_id).
//   2. Ders bitti (başlangıç + süre <= şimdi) ve stüdyo iptal etmedi.
//   3. Üye o tarihte dondurulmuş değil.
//   4. Üye iptal etmediyse düşer: geldi de, yoklamada "gelmedi" işaretli de (Pınar'ın kararı: haber vermeden
//      gelmemek geç iptalden avantajlı olmamalı). Bu yüzden yoklama tablosuna hiç bakılmaz.
//   5. İptal ettiyse: son iptal saatinden önce -> düşmez; sonra (geç iptal) -> late_cancel_burns_session ayarına göre.
// Son iptal saati ve geç iptal ayarı stüdyonun bugünkü ayarlarıdır.
export async function chargeableSessions(userId, db) {
  const { rows } = await db.query(
    `
    SELECT s.id, s.date, s.starts_at
    FROM users u
    JOIN studio_settings ss ON ss.studio_id = u.studio_id
    JOIN groups g           ON g.studio_id = u.studio_id
    JOIN sessions s         ON s.group_id = g.id
    WHERE u.id = $1
      AND s.status = 'scheduled'
      AND s.starts_at + make_interval(mins => g.duration_minutes) <= now()
      AND (
        EXISTS (SELECT 1 FROM group_members gm
                WHERE gm.user_id = u.id AND gm.group_id = s.group_id
                  AND gm.joined_on <= s.date AND (gm.left_on IS NULL OR s.date < gm.left_on))
        OR EXISTS (SELECT 1 FROM credits c WHERE c.user_id = u.id AND c.used_session_id = s.id)
      )
      AND NOT EXISTS (SELECT 1 FROM freezes f
                      WHERE f.user_id = u.id AND daterange(f.starts_on, f.ends_on, '[]') @> s.date)
      -- Düşmeyen iptal: zamanında yapılmış ya da geç iptal ayarı kapalı.
      AND NOT EXISTS (
        SELECT 1 FROM credits c
        WHERE c.user_id = u.id AND c.source_session_id = s.id
          AND (c.created_at <= s.starts_at - make_interval(hours => ss.cancellation_deadline_hours)
               OR NOT ss.late_cancel_burns_session)
      )
    ORDER BY s.starts_at, s.id
    `,
    [userId],
  );
  return rows.map((row) => ({ sessionId: row.id, date: row.date, startsAt: row.starts_at }));
}

// Düşen derslerin paketlere dağılımı. Dersler zaman sırasıyla işlenir:
//   - Her ders, başlangıcı o dersin günü ya da öncesi olan, son günü geçmemiş ve boş yeri olan en eski pakete yazılır.
//   - Hiçbir pakete sığmayan ders "paketsiz" bekler; üyenin bir sonraki paketi (başlangıç tarihinden bağımsız)
//     önce bekleyenleri alır.
//   - Son günü geçmiş paketin kalan seansları yanar.
// Son gün: dondurmayla uzamış bitiş (üyelik ekranlarıyla aynı). Süreye bağlı dönemler pakete dahil değil.
// Dönüş: { packages: [{ membershipId, used, remaining, burned }] (başlangıca göre sıralı), unpackaged }.
export async function packageUsage(userId, db) {
  const { rows: [{ today }] } = await db.query(
    `SELECT (now() AT TIME ZONE st.timezone)::date AS today
     FROM users u JOIN studios st ON st.id = u.studio_id WHERE u.id = $1`,
    [userId],
  );
  const { rows: periods } = await db.query(
    `${MEMBERSHIP_SELECT} WHERE m.user_id = $1 AND m.session_count IS NOT NULL ORDER BY m.starts_on, m.id`,
    [userId, today],
  );
  const packages = periods.map((p) => ({
    membershipId: p.id, startsOn: p.starts_on, endsOn: p.effective_ends_on, size: p.session_count, used: 0,
  }));
  const sessions = await chargeableSessions(userId, db);

  const waiting = []; // paketsiz dersler
  let opened = 0; // başlangıcına gelinmiş paket sayısı (packages başlangıca göre sıralı)
  // Yeni başlayan paket önce bekleyen paketsiz dersleri alır.
  const open = (pkg) => {
    while (waiting.length > 0 && pkg.used < pkg.size) {
      waiting.shift();
      pkg.used += 1;
    }
  };

  for (const session of sessions) {
    while (opened < packages.length && packages[opened].startsOn <= session.date) open(packages[opened++]);
    const pkg = packages
      .slice(0, opened)
      .find((p) => session.date <= p.endsOn && p.used < p.size);
    if (pkg) pkg.used += 1;
    else waiting.push(session);
  }
  // Henüz başlamamış (ileri tarihli) paketler de bekleyen paketsiz dersleri alır.
  while (opened < packages.length) open(packages[opened++]);

  return {
    packages: packages.map((p) => {
      const left = p.size - p.used;
      const ended = p.endsOn < today;
      return { membershipId: p.membershipId, used: p.used, remaining: ended ? 0 : left, burned: ended ? left : 0 };
    }),
    unpackaged: waiting.length,
  };
}
