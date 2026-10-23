import pool from '../db/pool.js';
import { AppError } from '../errors.js';

// Yönetici panelinin "Bugün" ekranı için sorgular. Hepsi yöneticinin kendi stüdyosuyla sınırlı.

const sortByName = (a, b) => a.fullName.localeCompare(b.fullName, 'tr');

// Hakkı olmayan müşteriyi yönetici derse eklerken oluşan, hemen kullanılmış hak kaydının notu.
const ADDED_BY_ADMIN = 'Yönetici ekledi';

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
    -- Başka gruplardan bu derse telafiyle gelenler ("yönetici ekledi" hak kullanmadan eklenenler).
    SELECT u.id, u.full_name, 'makeup', CASE WHEN c.note = $2 THEN 'added' END
    FROM credits c
    JOIN users u ON u.id = c.user_id
    WHERE c.used_session_id = $1
    `,
    [sessionId, ADDED_BY_ADMIN],
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

// --- Yönetici derse kişi ekliyor / telafiden çıkarıyor ------------------------------------------
// Ders bitene kadar (kapıdan gelen de kaydedilebilsin). Müşterinin telafi kuralları (kaç gün ileri,
// kapanış dakikası, aylık sınır) yöneticiyi bağlamaz: bilerek ekliyor. Hakkı varsa süresi ilk dolacak
// geçerli hakkı kullanılır; yoksa "Yönetici ekledi" notlu, hemen kullanılmış bir hak kaydı oluşur
// (doluluk ve kayıtlar tutarlı kalsın). Ders doluysa uyarılır, confirmFull ile eklenir.
export async function addToSession(admin, sessionId, { userId, confirmFull = false }, { db = pool } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Ders kilitlenir: aynı anda bir müşteri telafiye yazılıyorsa doluluk ikisini birden görür.
    const { rows: [session] } = await client.query(
      `
      SELECT s.id, s.group_id, s.date, s.status, s.starts_at,
             s.starts_at + make_interval(mins => g.duration_minutes) <= now() AS has_ended
      FROM sessions s JOIN groups g ON g.id = s.group_id
      WHERE s.id = $1 AND g.studio_id = $2
      FOR UPDATE OF s
      `,
      [sessionId, admin.studio_id],
    );
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404);
    if (session.status === 'cancelled') throw new AppError('SESSION_CANCELLED', 'Bu ders iptal edilmiş.', 409);
    if (session.has_ended) throw new AppError('SESSION_ENDED', 'Bitmiş bir derse kişi eklenemez.', 409);

    const { rows: [customer] } = await client.query(
      `SELECT id, full_name, status FROM users WHERE id = $1 AND studio_id = $2 AND role = 'customer'`,
      [userId, admin.studio_id],
    );
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.', 404);
    if (customer.status === 'left') throw new AppError('CUSTOMER_LEFT', 'Bu müşteri stüdyodan ayrılmış.', 409);

    const { rows: [relation] } = await client.query(
      `
      SELECT
        EXISTS (SELECT 1 FROM group_members gm
                WHERE gm.user_id = $1 AND gm.group_id = $2
                  AND gm.joined_on <= $3 AND (gm.left_on IS NULL OR $3 < gm.left_on)) AS is_member,
        EXISTS (SELECT 1 FROM credits c WHERE c.user_id = $1 AND c.used_session_id = $4) AS is_makeup
      `,
      [userId, session.group_id, session.date, sessionId],
    );
    if (relation.is_member) {
      throw new AppError('ALREADY_MEMBER', `${customer.full_name} bu grubun üyesi; bu ders zaten onun dersi.`, 409);
    }
    if (relation.is_makeup) throw new AppError('ALREADY_IN_SESSION', `${customer.full_name} bu derse zaten geliyor.`, 409);

    const { rows: [occupancy] } = await client.query(
      'SELECT booked_count, capacity FROM session_occupancy WHERE session_id = $1',
      [sessionId],
    );
    if (occupancy.booked_count >= occupancy.capacity && !confirmFull) {
      throw new AppError('SESSION_FULL', `Ders dolu (${occupancy.booked_count}/${occupancy.capacity}).`, 409);
    }

    const { rows: [credit] } = await client.query(
      `
      SELECT c.id FROM credits c
      WHERE c.user_id = $1 AND c.used_session_id IS NULL AND c.forfeited_at IS NULL AND c.expires_at >= $2
        AND (c.source_session_id IS NULL OR c.source_session_id <> $3)
      ORDER BY c.expires_at, c.id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
      `,
      [userId, session.starts_at, sessionId],
    );
    if (credit) {
      await client.query('UPDATE credits SET used_session_id = $2, used_at = now() WHERE id = $1', [credit.id, sessionId]);
    } else {
      await client.query(
        `INSERT INTO credits (user_id, used_session_id, used_at, expires_at, note) VALUES ($1, $2, now(), $3, $4)`,
        [userId, sessionId, session.starts_at, ADDED_BY_ADMIN],
      );
    }
    await client.query('COMMIT');
    return { usedCredit: Boolean(credit) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Telafi misafirini dersten çıkarır: hakkı geri döner; hak kullanmadan eklendiyse o kayıt silinir.
export async function removeMakeupFromSession(admin, sessionId, userId, { db = pool } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [session] } = await client.query(
      `
      SELECT s.id, s.starts_at + make_interval(mins => g.duration_minutes) <= now() AS has_ended
      FROM sessions s JOIN groups g ON g.id = s.group_id
      WHERE s.id = $1 AND g.studio_id = $2
      FOR UPDATE OF s
      `,
      [sessionId, admin.studio_id],
    );
    if (!session) throw new AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404);
    if (session.has_ended) throw new AppError('SESSION_ENDED', 'Bitmiş bir dersten kişi çıkarılamaz.', 409);

    const { rowCount: removed } = await client.query(
      'DELETE FROM credits WHERE user_id = $1 AND used_session_id = $2 AND note = $3',
      [userId, sessionId, ADDED_BY_ADMIN],
    );
    const { rowCount: refunded } = removed
      ? { rowCount: 0 }
      : await client.query(
        'UPDATE credits SET used_session_id = NULL, used_at = NULL WHERE user_id = $1 AND used_session_id = $2',
        [userId, sessionId],
      );
    if (!removed && !refunded) throw new AppError('NOT_IN_SESSION', 'Bu kişi bu derse telafiyle gelmiyor.', 404);
    await client.query('COMMIT');
    return { refundedCredit: refunded > 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
