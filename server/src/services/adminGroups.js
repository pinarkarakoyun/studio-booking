import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { generateSessions } from './sessionGenerator.js';

// Yönetici panelinin "Gruplar" bölümü ve müşterinin grubunu değiştirme.
// Her fonksiyon yöneticinin kendi stüdyosuyla sınırlı; başka stüdyonun grubu "bulunamadı".

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function withTransaction(db, work, { rollback = false } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    // Önizleme: aynı kod çalışır, sonuç hesaplanır, hiçbir değişiklik kalıcı olmaz.
    await client.query(rollback ? 'ROLLBACK' : 'COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function studioToday(studioId, db) {
  const { rows: [row] } = await db.query(
    'SELECT (now() AT TIME ZONE timezone)::date AS today FROM studios WHERE id = $1',
    [studioId],
  );
  return row.today;
}

// --- Doğrulama ----------------------------------------------------------------------------------

function validateGroupInput({ name, weekdays, startTime, durationMinutes, capacity }) {
  const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (cleanName.length < 2 || cleanName.length > 60) throw new AppError('INVALID_NAME', 'Grup adı yaz.', 400);
  const days = Array.isArray(weekdays) ? [...new Set(weekdays.map(Number))].sort() : [];
  if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
    throw new AppError('INVALID_DAYS', 'En az bir gün seç.', 400);
  }
  if (typeof startTime !== 'string' || !TIME_RE.test(startTime)) {
    throw new AppError('INVALID_TIME', 'Saat geçersiz.', 400);
  }
  const duration = Number(durationMinutes);
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) {
    throw new AppError('INVALID_DURATION', 'Süre 15 ile 240 dakika arasında olmalı.', 400);
  }
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100) {
    throw new AppError('INVALID_CAPACITY', 'Kapasite 1 ile 100 arasında olmalı.', 400);
  }
  return { name: cleanName, weekdays: days, startTime, durationMinutes: duration, capacity: cap };
}

// --- Okuma --------------------------------------------------------------------------------------

// Gruplar (açık ve kapalı) + bugünkü üye sayısı (dondurulmuşlar yer tutmaz, BR-12).
const GROUP_SELECT = `
  SELECT g.id, g.name, to_char(g.start_time, 'HH24:MI') AS start_time, g.duration_minutes, g.capacity,
         g.is_active, g.schedule_starts_on,
         ARRAY(SELECT gd.weekday FROM group_days gd WHERE gd.group_id = g.id ORDER BY gd.weekday) AS weekdays,
         (SELECT count(*)::int FROM group_members gm
          WHERE gm.group_id = g.id
            AND gm.joined_on <= today.date AND (gm.left_on IS NULL OR today.date < gm.left_on)
            AND NOT EXISTS (SELECT 1 FROM freezes f
                            WHERE f.user_id = gm.user_id
                              AND daterange(f.starts_on, f.ends_on, '[]') @> today.date)) AS member_count
  FROM groups g
  JOIN studios st ON st.id = g.studio_id
  CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE st.timezone)::date AS date) AS today
  WHERE g.studio_id = $1
`;

function toGroupDto(row) {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    isActive: row.is_active,
    weekdays: row.weekdays,
    scheduleStartsOn: row.schedule_starts_on,
    memberCount: row.member_count,
  };
}

export async function listAllGroups(admin, { db = pool } = {}) {
  const { rows } = await db.query(`${GROUP_SELECT} ORDER BY g.start_time, g.name`, [admin.studio_id]);
  return rows.map(toGroupDto);
}

async function findGroup(admin, groupId, db, { lock = false } = {}) {
  const { rows: [row] } = await db.query(`${GROUP_SELECT} AND g.id = $2`, [admin.studio_id, groupId]);
  if (!row) throw new AppError('GROUP_NOT_FOUND', 'Grup bulunamadı.', 404);
  // Aynı grubu aynı anda iki kişi düzenlerse ikinci beklesin.
  if (lock) await db.query('SELECT 1 FROM groups WHERE id = $1 FOR UPDATE', [groupId]);
  return row;
}

// Grup detayı: bilgiler + üyeler. Bugünkü üyeler ve ileri tarihte katılacaklar listelenir; ileri tarihte
// ayrılacak ya da katılacak olanların tarihi de döner (ekran "16 Kasım tarihinde ayrılıyor" diye gösterir).
export async function getGroup(admin, groupId, { db = pool } = {}) {
  const row = await findGroup(admin, groupId, db);
  const { rows: members } = await db.query(
    `
    SELECT u.id, u.full_name,
           CASE WHEN gm.joined_on > today.date THEN gm.joined_on END AS joins_on,
           CASE WHEN gm.left_on IS NOT NULL THEN gm.left_on END AS leaves_on,
           EXISTS (SELECT 1 FROM freezes f
                   WHERE f.user_id = u.id AND daterange(f.starts_on, f.ends_on, '[]') @> today.date) AS is_frozen
    FROM group_members gm
    JOIN users u    ON u.id = gm.user_id
    JOIN studios st ON st.id = u.studio_id
    CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE st.timezone)::date AS date) AS today
    WHERE gm.group_id = $1
      AND (gm.left_on IS NULL OR today.date < gm.left_on)
      AND (gm.left_on IS NULL OR gm.left_on > gm.joined_on)
    `,
    [groupId],
  );
  return {
    ...toGroupDto(row),
    members: members
      .map((m) => ({
        id: m.id, fullName: m.full_name, joinsOn: m.joins_on, leavesOn: m.leaves_on, isFrozen: m.is_frozen,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr')),
  };
}

// --- Ders kaldırma / taşıma yardımcıları --------------------------------------------------------

// Bir derse yazılmış telafileri iptal eder, haklar müşteriye geri döner. Kaç telafi iade edildi?
async function refundMakeups(client, sessionId) {
  const { rowCount } = await client.query(
    'UPDATE credits SET used_session_id = NULL, used_at = NULL WHERE used_session_id = $1',
    [sessionId],
  );
  return rowCount;
}

// Artık var olmayacak bir dersi kaldırır. Bu dersi iptal etmiş üyelerin kullanılmamış hakları silinir
// (ders hiç olmayacak, iptalin anlamı kalmadı); hak zaten kullanıldıysa telafi kaydı korunur, sadece
// kaynağı boşalır. Bu derse gelen telafiler iade edilir.
async function removeSession(client, sessionId) {
  const refunded = await refundMakeups(client, sessionId);
  await client.query(
    'DELETE FROM credits WHERE source_session_id = $1 AND used_session_id IS NULL AND forfeited_at IS NULL',
    [sessionId],
  );
  await client.query('UPDATE credits SET source_session_id = NULL WHERE source_session_id = $1', [sessionId]);
  await client.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  return refunded;
}

// --- Yeni grup ----------------------------------------------------------------------------------

export async function createGroup(admin, input, { db = pool } = {}) {
  const group = validateGroupInput(input);
  return withTransaction(db, async (client) => {
    const { rows: [row] } = await client.query(
      `INSERT INTO groups (studio_id, name, start_time, duration_minutes, capacity)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [admin.studio_id, group.name, group.startTime, group.durationMinutes, group.capacity],
    );
    for (const day of group.weekdays) {
      await client.query('INSERT INTO group_days (group_id, weekday) VALUES ($1, $2)', [row.id, day]);
    }
    // Yeni grubun önümüzdeki dersleri hemen oluşsun (günlük işi beklemesin).
    await generateSessions({ db: client });
    return { groupId: row.id };
  });
}

// --- Grup düzenleme -----------------------------------------------------------------------------

// Değişiklikleri uygular ve neler olduğunu özetler. preview=true ise aynı kod çalışır ama geri alınır:
// ekrandaki "şu kadar ders taşınacak, şu kadar telafi iade edilecek" notu gerçek sonuçla birebir aynıdır.
//   - Ad, süre: sadece güncellenir.
//   - Kapasite: bugünden sonraki bütün derslere uygulanır (Pınar'ın kararı).
//   - Günler / saat: effectiveFrom tarihinden itibaren (Pınar'ın kararı). O tarihten sonra
//       * gün aynı kaldıysa ama saat değiştiyse ders yeni saate taşınır, telafiler iade edilir
//         (telafi yapan kişi belirli bir saati seçmişti);
//       * günü programdan çıkan dersler kaldırılır;
//       * yeni eklenen günlerin dersleri üretilir.
export async function updateGroup(admin, groupId, input, { preview = false, db = pool } = {}) {
  const next = validateGroupInput(input);

  return withTransaction(
    db,
    async (client) => {
      const current = await findGroup(admin, groupId, client, { lock: true });
      if (!current.is_active) throw new AppError('GROUP_CLOSED', 'Bu grup kapalı.', 409);

      const today = await studioToday(admin.studio_id, client);
      const scheduleChanged =
        next.startTime !== current.start_time || next.weekdays.join(',') !== current.weekdays.join(',');
      const summary = { scheduleChanged, movedSessions: 0, removedSessions: 0, addedSessions: 0, refundedMakeups: 0 };

      let effectiveFrom = null;
      if (scheduleChanged) {
        effectiveFrom = input.effectiveFrom;
        if (typeof effectiveFrom !== 'string' || !DATE_RE.test(effectiveFrom)) {
          throw new AppError('INVALID_DATE', 'Değişikliğin başlayacağı tarihi seç.', 400);
        }
        if (effectiveFrom < today) {
          throw new AppError('INVALID_DATE', 'Değişiklik geçmiş bir tarihten başlayamaz.', 400);
        }

        // Etkilenen gelecek dersler: effectiveFrom ve sonrası, henüz başlamamış olanlar.
        const { rows: affected } = await client.query(
          `SELECT id, date, EXTRACT(ISODOW FROM date)::int AS weekday
           FROM sessions WHERE group_id = $1 AND date >= $2 AND starts_at > now()`,
          [groupId, effectiveFrom],
        );
        for (const session of affected) {
          if (!next.weekdays.includes(session.weekday)) {
            summary.refundedMakeups += await removeSession(client, session.id);
            summary.removedSessions += 1;
          } else if (next.startTime !== current.start_time) {
            await client.query(
              `UPDATE sessions s SET starts_at = (s.date + $2::time) AT TIME ZONE st.timezone
               FROM groups g JOIN studios st ON st.id = g.studio_id
               WHERE s.id = $1 AND g.id = s.group_id`,
              [session.id, next.startTime],
            );
            summary.refundedMakeups += await refundMakeups(client, session.id);
            summary.movedSessions += 1;
          }
        }

        await client.query('DELETE FROM group_days WHERE group_id = $1', [groupId]);
        for (const day of next.weekdays) {
          await client.query('INSERT INTO group_days (group_id, weekday) VALUES ($1, $2)', [groupId, day]);
        }
      }

      await client.query(
        `UPDATE groups
         SET name = $2, start_time = $3, duration_minutes = $4, capacity = $5,
             schedule_starts_on = COALESCE($6::date, schedule_starts_on)
         WHERE id = $1`,
        [groupId, next.name, next.startTime, next.durationMinutes, next.capacity, effectiveFrom],
      );

      // Kapasite bugünden sonraki bütün derslere (azaltılırsa kayıtlılar çıkarılmaz; yeni telafi alınmaz).
      if (next.capacity !== current.capacity) {
        await client.query(
          'UPDATE sessions SET capacity = $2 WHERE group_id = $1 AND starts_at > now()',
          [groupId, next.capacity],
        );
      }

      if (scheduleChanged) summary.addedSessions = await generateSessions({ db: client });
      return summary;
    },
    { rollback: preview },
  );
}

// --- Grubu kapatma ------------------------------------------------------------------------------

// Üyesi olan grup kapatılamaz: önce üyeler başka gruplara taşınır (Pınar'ın kararı).
// Kapanınca gelecekteki dersleri kaldırılır, bu derslere yazılmış telafiler iade edilir.
export async function closeGroup(admin, groupId, { db = pool } = {}) {
  return withTransaction(db, async (client) => {
    const group = await findGroup(admin, groupId, client, { lock: true });
    if (!group.is_active) throw new AppError('GROUP_CLOSED', 'Bu grup zaten kapalı.', 409);
    const { rows: [{ members }] } = await client.query(
      'SELECT count(*)::int AS members FROM group_members WHERE group_id = $1 AND left_on IS NULL',
      [groupId],
    );
    if (members > 0) {
      throw new AppError(
        'GROUP_HAS_MEMBERS',
        `Bu grupta ${members} üye var. Grubu kapatmadan önce onları başka gruplara taşı.`,
        409,
      );
    }

    const { rows: future } = await client.query(
      'SELECT id FROM sessions WHERE group_id = $1 AND starts_at > now()',
      [groupId],
    );
    let refundedMakeups = 0;
    for (const session of future) refundedMakeups += await removeSession(client, session.id);
    await client.query('UPDATE groups SET is_active = false WHERE id = $1', [groupId]);
    return { removedSessions: future.length, refundedMakeups };
  });
}

// --- Müşterinin grubunu değiştirme --------------------------------------------------------------

// Müşteri effectiveFrom tarihinden itibaren yeni grubunda sayılır. Yeni grup doluysa önce uyarılır
// (confirmFull ile yine de taşınır; yeni müşteri eklemeyle aynı akış).
//   - Eski gruptaki, o tarihten sonraki dersler için yaptığı kullanılmamış iptaller silinir
//     (o derslerin üyesi değil artık; hak doğuran bir kaçırma yok).
//   - Yeni grubun o tarihten sonraki derslerine yaptığı telafiler iade edilir
//     (artık zaten düzenli üye olarak geliyor; iki kez sayılmasın).
export async function changeCustomerGroup(admin, customerId, { groupId, effectiveFrom, confirmFull = false }, { db = pool } = {}) {
  if (typeof effectiveFrom !== 'string' || !DATE_RE.test(effectiveFrom)) {
    throw new AppError('INVALID_DATE', 'Geçişin başlayacağı tarihi seç.', 400);
  }

  return withTransaction(db, async (client) => {
    const today = await studioToday(admin.studio_id, client);
    if (effectiveFrom < today) throw new AppError('INVALID_DATE', 'Geçiş geçmiş bir tarihten başlayamaz.', 400);

    const { rows: [customer] } = await client.query(
      `SELECT u.id, u.status, gm.id AS membership_id, gm.group_id, gm.joined_on
       FROM users u
       LEFT JOIN group_members gm ON gm.user_id = u.id AND gm.left_on IS NULL
       WHERE u.id = $1 AND u.studio_id = $2 AND u.role = 'customer'
       FOR UPDATE OF u`,
      [customerId, admin.studio_id],
    );
    if (!customer) throw new AppError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.', 404);
    if (customer.status === 'left') throw new AppError('CUSTOMER_LEFT', 'Bu müşteri stüdyodan ayrılmış.', 409);

    const target = await findGroup(admin, Number(groupId), client, { lock: true });
    if (!target.is_active) throw new AppError('GROUP_CLOSED', 'Bu grup kapalı.', 409);
    if (customer.group_id === target.id) throw new AppError('SAME_GROUP', 'Müşteri zaten bu grupta.', 409);
    if (customer.joined_on && effectiveFrom < customer.joined_on) {
      throw new AppError('INVALID_DATE', 'Geçiş, müşterinin şu anki grubuna katıldığı tarihten önce olamaz.', 400);
    }

    // Yeni grubun o tarihteki doluluğu (dondurulmuşlar yer tutmaz).
    const { rows: [{ count }] } = await client.query(
      `SELECT count(*)::int AS count FROM group_members gm
       WHERE gm.group_id = $1 AND gm.joined_on <= $2::date AND (gm.left_on IS NULL OR $2::date < gm.left_on)
         AND NOT EXISTS (SELECT 1 FROM freezes f WHERE f.user_id = gm.user_id
                         AND daterange(f.starts_on, f.ends_on, '[]') @> $2::date)`,
      [target.id, effectiveFrom],
    );
    if (count >= target.capacity && !confirmFull) {
      throw new AppError(
        'GROUP_FULL',
        `${target.name} grubu dolu (${count}/${target.capacity}). Yine de taşırsan derslerde kapasite aşılır.`,
        409,
      );
    }

    if (customer.membership_id) {
      // Aynı gün katılıp aynı gün taşınıyorsa eski üyelik hiç başlamamış sayılır (left_on = joined_on).
      await client.query('UPDATE group_members SET left_on = $2 WHERE id = $1', [customer.membership_id, effectiveFrom]);
      await client.query(
        `DELETE FROM credits c USING sessions s
         WHERE c.source_session_id = s.id AND c.user_id = $1 AND s.group_id = $2 AND s.date >= $3
           AND c.used_session_id IS NULL AND c.forfeited_at IS NULL`,
        [customerId, customer.group_id, effectiveFrom],
      );
    }
    await client.query(
      'INSERT INTO group_members (group_id, user_id, joined_on) VALUES ($1, $2, $3)',
      [target.id, customerId, effectiveFrom],
    );
    const { rowCount: refundedMakeups } = await client.query(
      `UPDATE credits c SET used_session_id = NULL, used_at = NULL
       FROM sessions s
       WHERE s.id = c.used_session_id AND c.user_id = $1 AND s.group_id = $2 AND s.date >= $3`,
      [customerId, target.id, effectiveFrom],
    );
    return { refundedMakeups };
  });
}
