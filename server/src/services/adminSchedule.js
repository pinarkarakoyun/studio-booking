import pool from '../db/pool.js';
import { AppError } from '../errors.js';

// Yönetici panelinin "Bugün" ekranı için sorgular. Hepsi yöneticinin kendi stüdyosuyla sınırlı.

const sortByName = (a, b) => a.fullName.localeCompare(b.fullName, 'tr');

// Stüdyonun saat dilimine göre bugünün ve yarının takvim günü.
async function studioDates(studioId, db) {
  const { rows: [row] } = await db.query(
    `
    SELECT (now() AT TIME ZONE timezone)::date AS today,
           (now() AT TIME ZONE timezone)::date + 1 AS tomorrow
    FROM studios WHERE id = $1
    `,
    [studioId],
  );
  return row;
}

// Bir günün dersleri: doluluk, o derse gelen telafi ve iptal sayıları.
async function sessionsOn(studioId, date, db) {
  const { rows } = await db.query(
    `
    SELECT s.id, s.date, s.starts_at, s.status,
           g.name AS group_name, g.duration_minutes,
           o.capacity, o.booked_count, o.makeup_count,
           (SELECT count(*)::int FROM credits c WHERE c.source_session_id = s.id) AS cancelled_count,
           s.starts_at + make_interval(mins => g.duration_minutes) <= now() AS has_ended
    FROM sessions s
    JOIN groups g            ON g.id = s.group_id
    JOIN session_occupancy o ON o.session_id = s.id
    WHERE g.studio_id = $1 AND s.date = $2
    ORDER BY s.starts_at
    `,
    [studioId, date],
  );
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    startsAt: row.starts_at,
    status: row.status,
    groupName: row.group_name,
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    bookedCount: row.booked_count,
    makeupCount: row.makeup_count,
    cancelledCount: row.cancelled_count,
    hasEnded: row.has_ended,
  }));
}

// "Dikkat edilecekler" notu (Pınar'ın seçimi): bu haftanın dolu dersleri ve son 24 saatin iptalleri.
async function alerts(studioId, today, db) {
  const { rows: fullSessions } = await db.query(
    `
    SELECT s.id, s.date, s.starts_at, g.name AS group_name
    FROM sessions s
    JOIN groups g            ON g.id = s.group_id
    JOIN session_occupancy o ON o.session_id = s.id
    WHERE g.studio_id = $1
      AND s.status = 'scheduled'
      AND s.starts_at > now()
      AND s.date <= $2::date + 6
      AND o.free_spots <= 0
    ORDER BY s.starts_at
    `,
    [studioId, today],
  );
  const { rows: recentCancellations } = await db.query(
    `
    SELECT u.full_name, s.id AS session_id, s.date, s.starts_at, c.created_at
    FROM credits c
    JOIN sessions s ON s.id = c.source_session_id
    JOIN groups g   ON g.id = s.group_id
    JOIN users u    ON u.id = c.user_id
    WHERE g.studio_id = $1 AND c.created_at > now() - interval '24 hours'
      -- Stüdyonun iptal ettiği dersten doğan haklar müşterinin iptali değildir; uyarıda görünmez.
      AND s.status = 'scheduled'
    ORDER BY c.created_at DESC
    LIMIT 5
    `,
    [studioId],
  );
  return {
    fullSessions: fullSessions.map((row) => ({
      id: row.id, date: row.date, startsAt: row.starts_at, groupName: row.group_name,
    })),
    recentCancellations: recentCancellations.map((row) => ({
      fullName: row.full_name, sessionId: row.session_id, date: row.date, startsAt: row.starts_at,
    })),
  };
}

// "Bugün" ekranının tamamı tek istekte: günün dersleri, yarının ders sayısı, uyarılar.
export async function getToday(admin, { db = pool } = {}) {
  const { today, tomorrow } = await studioDates(admin.studio_id, db);
  const [sessions, tomorrowSessions, notices] = await Promise.all([
    sessionsOn(admin.studio_id, today, db),
    sessionsOn(admin.studio_id, tomorrow, db),
    alerts(admin.studio_id, today, db),
  ]);
  return {
    date: today,
    sessions,
    tomorrow: { date: tomorrow, sessionCount: tomorrowSessions.filter((s) => s.status === 'scheduled').length },
    alerts: notices,
  };
}

// Başka bir günün dersleri (ileri tarihli bir dersi açmak, örneğin bayramda iptal etmek için; geçmiş de olur).
// Uyarılar sadece "Bugün" ekranında; burada sadece o günün dersleri.
export async function getDay(admin, date, { db = pool } = {}) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new AppError('INVALID_DATE', 'Tarih geçersiz.', 400);
  }
  return { date, sessions: await sessionsOn(admin.studio_id, date, db) };
}

// Bir dersin katılımcı listesi: kim geliyor, kim gelmiyor ve neden.
//   attending: düzenli üye (geliyor) ya da telafi
//   notAttending: iptal etti (hakkının durumuyla) ya da o tarihte dondurulmuş
export async function getSessionRoster(admin, sessionId, { db = pool } = {}) {
  const [session] = (await db.query(
    `
    SELECT s.id, s.date, s.starts_at, s.status, s.cancel_reason, g.name AS group_name, g.duration_minutes,
           o.capacity, o.booked_count, GREATEST(o.free_spots, 0) AS free_spots
    FROM sessions s
    JOIN groups g            ON g.id = s.group_id
    JOIN session_occupancy o ON o.session_id = s.id
    WHERE s.id = $1 AND g.studio_id = $2
    `,
    [sessionId, admin.studio_id],
  )).rows;
  // Başka stüdyonun dersi de "bulunamadı" (müşteri tarafındaki IDOR kuralıyla aynı).
  if (!session) throw new AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404);

  const { rows: people } = await db.query(
    `
    -- Düzenli üyeler: o tarihte grupta olanlar (session_occupancy ile aynı tarih kuralı).
    SELECT u.id, u.full_name,
           CASE
             WHEN EXISTS (SELECT 1 FROM freezes f
                          WHERE f.user_id = u.id AND daterange(f.starts_on, f.ends_on, '[]') @> s.date)
               THEN 'frozen'
             WHEN c.id IS NOT NULL THEN 'cancelled'
             ELSE 'regular'
           END AS state,
           CASE
             WHEN c.id IS NULL THEN NULL
             WHEN c.forfeited_at IS NOT NULL THEN 'forfeited'
             WHEN c.used_session_id IS NOT NULL THEN 'used'
             ELSE 'unused'
           END AS credit_state
    FROM sessions s
    JOIN group_members gm ON gm.group_id = s.group_id
                         AND gm.joined_on <= s.date AND (gm.left_on IS NULL OR s.date < gm.left_on)
    JOIN users u ON u.id = gm.user_id
    LEFT JOIN credits c ON c.user_id = u.id AND c.source_session_id = s.id
    WHERE s.id = $1
    UNION ALL
    -- Başka gruplardan bu derse telafiyle gelenler.
    SELECT u.id, u.full_name, 'makeup', NULL
    FROM credits c
    JOIN users u ON u.id = c.user_id
    WHERE c.used_session_id = $1
    `,
    [sessionId],
  );

  const toPerson = (row) => ({ id: row.id, fullName: row.full_name, state: row.state, creditState: row.credit_state });
  const all = people.map(toPerson);
  return {
    session: {
      id: session.id,
      date: session.date,
      startsAt: session.starts_at,
      status: session.status,
      cancelReason: session.cancel_reason,
      groupName: session.group_name,
      durationMinutes: session.duration_minutes,
      capacity: session.capacity,
      bookedCount: session.booked_count,
      freeSpots: session.free_spots,
    },
    attending: all.filter((p) => p.state === 'regular' || p.state === 'makeup').sort(sortByName),
    notAttending: all.filter((p) => p.state === 'cancelled' || p.state === 'frozen').sort(sortByName),
  };
}

// --- Stüdyonun dersi iptal etmesi ---------------------------------------------------------------
// Bayram, hocanın hastalığı... İptal kesindir (geri alınmaz); önizleme aynı kodu çalıştırıp geri alır,
// onay panelinde gerçek sayılar görünür.
//   - Bu derse telafiyle gelenlerin hakları iade edilir (başka derse yazılabilirler).
//   - Ayar açıksa (credit_on_studio_cancel) derse gelecek düzenli üyelere, normal iptaldeki gibi
//     dersin başlangıcından sayılan bir hak verilir. Dersi zaten iptal etmiş (hakkı var) ya da o tarihte
//     dondurulmuş üyeye ikinci hak verilmez.
export async function cancelSessionByStudio(admin, sessionId, { reason } = {}, { db = pool, preview = false } = {}) {
  if (reason != null && typeof reason !== 'string') throw new AppError('INVALID_REASON', 'Sebep geçersiz.', 400);
  const cleanReason = reason?.trim() || null;
  if (cleanReason && cleanReason.length > 120) {
    throw new AppError('INVALID_REASON', 'Sebep en fazla 120 karakter olabilir.', 400);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Ders kilitlenir: aynı anda bir müşteri telafiye yazılıyorsa önce o biter, sonra iptal onu da görür.
    const { rows: [session] } = await client.query(
      `
      SELECT s.id, s.status, s.starts_at <= now() AS started, ss.credit_validity_days, ss.credit_on_studio_cancel
      FROM sessions s
      JOIN groups g ON g.id = s.group_id
      JOIN studio_settings ss ON ss.studio_id = g.studio_id
      WHERE s.id = $1 AND g.studio_id = $2
      FOR UPDATE OF s
      `,
      [sessionId, admin.studio_id],
    );
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404);
    if (session.status === 'cancelled') throw new AppError('SESSION_ALREADY_CANCELLED', 'Bu ders zaten iptal edilmiş.', 409);
    if (session.started) throw new AppError('SESSION_STARTED', 'Başlamış ya da geçmiş bir ders iptal edilemez.', 409);

    const { rowCount: refundedMakeups } = await client.query(
      'UPDATE credits SET used_session_id = NULL, used_at = NULL WHERE used_session_id = $1',
      [sessionId],
    );

    let creditedMembers = 0;
    if (session.credit_on_studio_cancel) {
      ({ rowCount: creditedMembers } = await client.query(
        `
        INSERT INTO credits (user_id, source_session_id, expires_at, note)
        SELECT gm.user_id, s.id, s.starts_at + make_interval(days => $2), 'Stüdyo dersi iptal etti'
        FROM sessions s
        JOIN group_members gm ON gm.group_id = s.group_id
                             AND gm.joined_on <= s.date AND (gm.left_on IS NULL OR s.date < gm.left_on)
        WHERE s.id = $1
          AND NOT EXISTS (SELECT 1 FROM freezes f
                          WHERE f.user_id = gm.user_id AND daterange(f.starts_on, f.ends_on, '[]') @> s.date)
        ON CONFLICT (user_id, source_session_id) DO NOTHING
        `,
        [sessionId, session.credit_validity_days],
      ));
    }

    await client.query(`UPDATE sessions SET status = 'cancelled', cancel_reason = $2 WHERE id = $1`, [sessionId, cleanReason]);
    await client.query(preview ? 'ROLLBACK' : 'COMMIT');
    return { creditedMembers, refundedMakeups, creditsEnabled: session.credit_on_studio_cancel };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
