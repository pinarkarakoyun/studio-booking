import pool from '../db/pool.js';
import { AppError } from '../errors.js';

// Rezervasyon kuralı ihlalleri. 409 Conflict: istek geçerli ama mevcut durumla çelişiyor
// (ders dolu, hak yok...). API katmanı `code`a bakıp müşteriye anlamlı bir mesaj gösterecek.
export class BookingError extends AppError {
  constructor(code, message) {
    super(code, message, 409);
    this.name = 'BookingError';
  }
}

// Her işlem tek bir transaction: adımlardan biri hata verirse hiçbiri kalıcı olmaz.
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

// Dersi, stüdyo ayarlarıyla birlikte getirir; kullanıcının o stüdyoda aktif bir hesabı olduğunu da kontrol eder. Zaman karşılaştırmaları JS'te değil
// veritabanında yapılıyor: tek saat (veritabanının now()'u) ve stüdyonun saat dilimi kullanılır.
// lock = true ise ders satırı FOR UPDATE ile kilitlenir: aynı derse yer almaya çalışan diğer
// transaction'lar bu transaction bitene kadar bekler. Son yeri iki kişinin almasını engelleyen şey bu.
async function loadSession(client, sessionId, userId, { lock = false } = {}) {
  const { rows } = await client.query(
    `
    SELECT s.id, s.group_id, s.date, s.starts_at, s.status, g.studio_id,
           ss.credit_validity_days, ss.refund_credit_on_makeup_cancel, ss.max_makeups_per_month,
           ss.allow_undo_cancel, ss.allow_makeup_before_missed,
           st.timezone,
           s.starts_at > now() AS is_future,
           s.starts_at - make_interval(hours => ss.cancellation_deadline_hours) > now()
             AS is_before_deadline,
           s.starts_at - make_interval(mins => ss.makeup_booking_cutoff_minutes) > now()
             AS is_before_makeup_cutoff,
           s.date <= (now() AT TIME ZONE st.timezone)::date + ss.booking_window_days
             AS is_within_booking_window
    FROM sessions s
    JOIN groups g           ON g.id = s.group_id
    JOIN studios st         ON st.id = g.studio_id
    JOIN studio_settings ss ON ss.studio_id = st.id
    WHERE s.id = $1
    ${lock ? 'FOR UPDATE OF s' : ''}
    `,
    [sessionId],
  );
  const session = rows[0];
  if (!session) throw new BookingError('SESSION_NOT_FOUND', 'Ders bulunamadı.');
  // Stüdyo kontrolü her şeyden önce: başka stüdyonun dersi hakkında (iptal mi, dolu mu...) hiçbir şey söylemiyoruz.
  await assertActiveUserOfStudio(client, userId, session);
  if (session.status !== 'scheduled') {
    throw new BookingError('SESSION_CANCELLED', 'Bu ders stüdyo tarafından iptal edildi.');
  }
  return session;
}

// Kullanıcı aktif mi ve ders kendi stüdyosuna mı ait? Başka bir stüdyonun dersi için
// "bulunamadı" diyoruz: dersin var olduğunu bile söylemek bilgi sızdırmak olur.
async function assertActiveUserOfStudio(client, userId, session) {
  const { rows } = await client.query('SELECT status, studio_id FROM users WHERE id = $1', [userId]);
  if (rows[0]?.studio_id !== session.studio_id) {
    throw new BookingError('SESSION_NOT_FOUND', 'Ders bulunamadı.');
  }
  if (rows[0].status !== 'active') {
    throw new BookingError('USER_NOT_ACTIVE', 'Hesabınız aktif değil.');
  }
}

// Verilen tarihlerden herhangi birini kapsayan bir dondurma var mı?
async function isFrozenOnAny(client, userId, dates) {
  const { rows } = await client.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM freezes
      WHERE user_id = $1
        AND daterange(starts_on, ends_on, '[]') @> ANY ($2::date[])
    ) AS frozen
    `,
    [userId, dates],
  );
  return rows[0].frozen;
}

// Müşteri o tarihte dersin grubunun düzenli üyesi mi? (session_occupancy ile aynı tarih kuralı)
async function isRegularMember(client, userId, session) {
  const { rows } = await client.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM group_members
      WHERE user_id = $1 AND group_id = $2
        AND joined_on <= $3 AND (left_on IS NULL OR $3 < left_on)
    ) AS member
    `,
    [userId, session.group_id, session.date],
  );
  return rows[0].member;
}

async function freeSpots(client, sessionId) {
  const { rows } = await client.query(
    'SELECT free_spots FROM session_occupancy WHERE session_id = $1',
    [sessionId],
  );
  return rows[0].free_spots;
}

// --- İptal (BR-06, BR-08, BR-13, BR-27) ---------------------------------------------------------

async function cancelInTransaction(client, userId, sessionId) {
  // İptal yer açar, kapasiteyi aşma riski yok; bu yüzden dersi kilitlemiyoruz.
  const session = await loadSession(client, sessionId, userId);
  if (!session.is_before_deadline) {
    throw new BookingError('CANCELLATION_DEADLINE_PASSED', 'Bu ders için iptal süresi geçti.');
  }
  if (!(await isRegularMember(client, userId, session))) {
    throw new BookingError('NOT_A_MEMBER', 'Bu ders sizin grubunuza ait değil.');
  }
  // Dondurma dönemindeki derslerden hak doğmaz.
  if (await isFrozenOnAny(client, userId, [session.date])) {
    throw new BookingError('USER_FROZEN', 'Üyeliğiniz bu tarihte dondurulmuş.');
  }

  // Hakkın süresi kaçırılan dersin başlangıcından sayılır (BR-27).
  // starts_at'i JS'ten geri göndermek yerine SQL'de okuyoruz: JS Date milisaniyeye yuvarlar,
  // Postgres mikrosaniye tutar; gidip gelince zaman birkaç mikrosaniye kayardı.
  // ON CONFLICT: aynı ders ikinci kez iptal edilirse UNIQUE kısıtı hata yerine "satır yok" döner.
  const { rows } = await client.query(
    `
    INSERT INTO credits (user_id, source_session_id, expires_at)
    SELECT $1, s.id, s.starts_at + make_interval(days => $3)
    FROM sessions s WHERE s.id = $2
    ON CONFLICT (user_id, source_session_id) DO NOTHING
    RETURNING id, expires_at
    `,
    [userId, sessionId, session.credit_validity_days],
  );
  if (rows.length === 0) {
    throw new BookingError('ALREADY_CANCELLED', 'Bu dersi zaten iptal ettiniz.');
  }
  return { creditId: rows[0].id, expiresAt: rows[0].expires_at };
}

export function cancelSession({ userId, sessionId }, { db = pool } = {}) {
  return withTransaction(db, (client) => cancelInTransaction(client, userId, sessionId));
}

// --- Telafi (BR-02, BR-05, BR-12, BR-26) --------------------------------------------------------

async function bookMakeupInTransaction(client, userId, targetSessionId) {
  // Önce kilit: aynı derse aynı anda gelen ikinci istek burada bekler ve kapasiteyi
  // ilk işlem bittikten sonraki güncel haliyle görür.
  const target = await loadSession(client, targetSessionId, userId, { lock: true });
  if (!target.is_future) {
    throw new BookingError('SESSION_STARTED', 'Bu ders başladı veya geçti.');
  }
  if (!target.is_before_makeup_cutoff) {
    throw new BookingError('MAKEUP_BOOKING_CLOSED', 'Bu derse telafi kaydı kapandı.');
  }
  if (!target.is_within_booking_window) {
    throw new BookingError('TOO_FAR_AHEAD', 'Bu kadar ileri tarihli bir derse henüz telafi yapılamaz.');
  }

  // Dondurulmuş müşteri telafi yapamaz: bugün ya da telafi günü dondurulmuşsa engellenir.
  const { rows: [today] } = await client.query(
    'SELECT (now() AT TIME ZONE $1)::date AS date',
    [target.timezone],
  );
  if (await isFrozenOnAny(client, userId, [today.date, target.date])) {
    throw new BookingError('USER_FROZEN', 'Üyeliğiniz dondurulmuşken telafi yapılamaz.');
  }

  // Zaten bu derste mi? (Aynı derse iki kez kayıt olunamaz, BR-05.)
  if (await isRegularMember(client, userId, target)) {
    const { rows } = await client.query(
      'SELECT 1 FROM credits WHERE user_id = $1 AND source_session_id = $2',
      [userId, targetSessionId],
    );
    if (rows.length > 0) {
      throw new BookingError('USE_UNDO_CANCEL', 'Bu dersi iptal etmiştiniz; iptali geri alabilirsiniz.');
    }
    throw new BookingError('ALREADY_ATTENDING', 'Bu derse zaten kayıtlısınız.');
  }
  const { rows: existing } = await client.query(
    'SELECT 1 FROM credits WHERE user_id = $1 AND used_session_id = $2',
    [userId, targetSessionId],
  );
  if (existing.length > 0) {
    throw new BookingError('ALREADY_ATTENDING', 'Bu derse zaten telafi yazdırdınız.');
  }

  // Aylık telafi sınırı (ayar boşsa sınır yok). Ay, telafi dersinin ayıdır.
  if (target.max_makeups_per_month !== null) {
    const { rows: [usage] } = await client.query(
      `
      SELECT count(*)::int AS used
      FROM credits c
      JOIN sessions s ON s.id = c.used_session_id
      WHERE c.user_id = $1
        AND date_trunc('month', s.date) = date_trunc('month', $2::date)
      `,
      [userId, target.date],
    );
    if (usage.used >= target.max_makeups_per_month) {
      throw new BookingError('MONTHLY_MAKEUP_LIMIT', 'Bu ay için telafi hakkı sınırına ulaştınız.');
    }
  }

  if ((await freeSpots(client, targetSessionId)) <= 0) {
    throw new BookingError('SESSION_FULL', 'Bu derste boş yer yok.');
  }

  // Telafi dersinde hâlâ geçerli olacak, süresi en erken dolan krediyi kullan (müşterinin lehine).
  // Stüdyo "kaçırılan dersten önce telafi"ye izin vermiyorsa, kaynağı telafi dersinden sonra olan
  // krediler kullanılamaz (elle verilen, kaynağı olmayan krediler her zaman kullanılabilir).
  // SKIP LOCKED: aynı müşteri aynı anda iki farklı derse telafi yazdırırsa ikisi aynı krediyi
  // kapmaya çalışmaz; ikinci istek kilitli olanı atlayıp sıradaki krediyi alır.
  // OF c: LEFT JOIN'in boş olabilen tarafı kilitlenemez; sadece kredi satırını kilitliyoruz.
  const { rows: [credit] } = await client.query(
    `
    SELECT c.id
    FROM credits c
    LEFT JOIN sessions source ON source.id = c.source_session_id
    WHERE c.user_id = $1
      AND c.used_session_id IS NULL
      AND c.forfeited_at IS NULL
      AND c.expires_at >= (SELECT starts_at FROM sessions WHERE id = $2)
      AND c.source_session_id IS DISTINCT FROM $2
      AND ($3 OR source.starts_at IS NULL
              OR source.starts_at < (SELECT starts_at FROM sessions WHERE id = $2))
    ORDER BY c.expires_at, c.id
    LIMIT 1
    FOR UPDATE OF c SKIP LOCKED
    `,
    [userId, targetSessionId, target.allow_makeup_before_missed],
  );
  if (!credit) {
    throw new BookingError('NO_CREDIT', 'Kullanılabilir telafi hakkınız yok.');
  }

  await client.query(
    'UPDATE credits SET used_session_id = $2, used_at = now() WHERE id = $1',
    [credit.id, targetSessionId],
  );
  return { creditId: credit.id };
}

export function bookMakeup({ userId, sessionId }, { db = pool } = {}) {
  return withTransaction(db, (client) => bookMakeupInTransaction(client, userId, sessionId));
}

// --- "Bu ders yerine şuna gel" (BR-29) ---------------------------------------------------------

// İptal ve telafi aynı transaction'da: telafi dersinde yer yoksa iptal de geri alınır,
// müşteri "dersimi iptal ettim ama yer bulamadım" durumuna düşmez.
export function swapSession({ userId, fromSessionId, toSessionId }, { db = pool } = {}) {
  return withTransaction(db, async (client) => {
    // Stüdyo kaçırılan dersten önce telafiye izin vermiyorsa, genel "hak yok" hatası yerine
    // sebebi açıkça söylüyoruz.
    const { rows: [order] } = await client.query(
      `
      SELECT ss.allow_makeup_before_missed AS allowed, t.starts_at > f.starts_at AS is_after
      FROM sessions f
      JOIN sessions t           ON t.id = $2
      JOIN groups g             ON g.id = f.group_id
      JOIN studio_settings ss   ON ss.studio_id = g.studio_id
      WHERE f.id = $1
      `,
      [fromSessionId, toSessionId],
    );
    if (order && !order.allowed && !order.is_after) {
      throw new BookingError(
        'MAKEUP_BEFORE_MISSED_NOT_ALLOWED',
        'Telafi, kaçırılan dersten sonraki bir derse yapılmalı.',
      );
    }
    await cancelInTransaction(client, userId, fromSessionId);
    return bookMakeupInTransaction(client, userId, toSessionId);
  });
}

// --- İptali geri alma (BR-28) -------------------------------------------------------------------

export function undoCancel({ userId, sessionId }, { db = pool } = {}) {
  return withTransaction(db, async (client) => {
    // Geri dönmek yeni bir yer almak demek: kapasite kontrolü için ders kilitlenir.
    const session = await loadSession(client, sessionId, userId, { lock: true });
    if (!session.allow_undo_cancel) {
      throw new BookingError('UNDO_CANCEL_DISABLED', 'Bu stüdyoda iptal geri alınamıyor.');
    }
    if (!session.is_future) {
      throw new BookingError('SESSION_STARTED', 'Bu ders başladı veya geçti.');
    }
    const { rows: [credit] } = await client.query(
      `
      SELECT id, used_session_id, forfeited_at FROM credits
      WHERE user_id = $1 AND source_session_id = $2
      FOR UPDATE
      `,
      [userId, sessionId],
    );
    if (!credit) {
      throw new BookingError('NOT_CANCELLED', 'Bu dersi iptal etmemişsiniz.');
    }
    if (credit.used_session_id !== null || credit.forfeited_at !== null) {
      throw new BookingError('CREDIT_ALREADY_USED', 'Bu iptalden doğan hak kullanıldığı için geri alınamaz.');
    }
    if ((await freeSpots(client, sessionId)) <= 0) {
      throw new BookingError('SESSION_FULL', 'Bu sırada yeriniz doldu; iptal geri alınamıyor.');
    }
    // Kredi siliniyor: iptal hiç yapılmamış gibi olur ve müşteri tekrar düzenli üye olarak sayılır.
    await client.query('DELETE FROM credits WHERE id = $1', [credit.id]);
  });
}

// --- Telafiden vazgeçme -------------------------------------------------------------------------

export function cancelMakeup({ userId, sessionId }, { db = pool } = {}) {
  return withTransaction(db, async (client) => {
    const session = await loadSession(client, sessionId, userId);
    if (!session.is_before_deadline) {
      throw new BookingError('CANCELLATION_DEADLINE_PASSED', 'Bu ders için iptal süresi geçti.');
    }
    const { rows: [credit] } = await client.query(
      'SELECT id FROM credits WHERE user_id = $1 AND used_session_id = $2 FOR UPDATE',
      [userId, sessionId],
    );
    if (!credit) {
      throw new BookingError('NO_MAKEUP_BOOKING', 'Bu derste telafi kaydınız yok.');
    }
    // Hakkın geri gelip gelmeyeceğine stüdyonun ayarı karar verir; kapalıysa hak yanar.
    const refunded = session.refund_credit_on_makeup_cancel;
    await client.query(
      `
      UPDATE credits
      SET used_session_id = NULL,
          used_at = NULL,
          forfeited_at = CASE WHEN $2 THEN NULL ELSE now() END
      WHERE id = $1
      `,
      [credit.id, refunded],
    );
    return { refunded };
  });
}
