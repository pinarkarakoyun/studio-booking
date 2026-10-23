import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { generateTemporaryPassword } from '../utils/tempPassword.js';
import { createUser, resetPassword, revokeAllSessions } from './auth.js';
import { listMySessions } from './schedule.js';

// Yönetici panelinin "Müşteriler" bölümü. Her fonksiyon yöneticinin kendi stüdyosuyla sınırlı;
// başka stüdyonun müşterisi "bulunamadı" (IDOR kuralı).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value, label) {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new AppError('INVALID_DATE', `${label} geçersiz.`, 400);
  }
}

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

// Müşteri satırının ortak sorgusu: bugünkü grubu, ileri tarihte başlayacak grubu (grup değişikliği ya da
// yeni başlayan müşteri), şu anki ya da yaklaşan dondurma, kullanılabilir haklar.
// "Bugünkü grup" ile "açık üyelik" aynı şey değil: 16 Kasım'dan itibaren başka gruba geçecek biri,
// o tarihe kadar hâlâ eski grubundadır.
const CUSTOMER_SELECT = `
  SELECT u.id, u.full_name, u.phone, u.status,
         g.id AS group_id, g.name AS group_name,
         ng.id AS next_group_id, ng.name AS next_group_name, ngm.joined_on AS next_group_starts_on,
         fz.starts_on AS freeze_starts_on, fz.ends_on AS freeze_ends_on,
         (fz.starts_on IS NOT NULL AND fz.starts_on <= today.date) AS is_frozen,
         (SELECT count(*)::int FROM credits c
          WHERE c.user_id = u.id AND c.used_session_id IS NULL AND c.forfeited_at IS NULL
            AND c.expires_at > now()) AS unused_credits
  FROM users u
  JOIN studios st ON st.id = u.studio_id
  CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE st.timezone)::date AS date) AS today
  LEFT JOIN group_members gm ON gm.user_id = u.id
                            AND gm.joined_on <= today.date AND (gm.left_on IS NULL OR today.date < gm.left_on)
  LEFT JOIN groups g ON g.id = gm.group_id
  LEFT JOIN LATERAL (
    SELECT m.group_id, m.joined_on FROM group_members m
    WHERE m.user_id = u.id AND m.joined_on > today.date
    ORDER BY m.joined_on
    LIMIT 1
  ) AS ngm ON true
  LEFT JOIN groups ng ON ng.id = ngm.group_id
  -- Bitmemiş tek dondurma (dönemler çakışamadığı için en fazla bir tane bugünü ya da geleceği kapsar).
  LEFT JOIN LATERAL (
    SELECT f.starts_on, f.ends_on FROM freezes f
    WHERE f.user_id = u.id AND (f.ends_on IS NULL OR f.ends_on >= today.date)
    ORDER BY f.starts_on
    LIMIT 1
  ) AS fz ON true
  WHERE u.studio_id = $1 AND u.role = 'customer'
`;

function toCustomerDto(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    status: row.status,
    group: row.group_id ? { id: row.group_id, name: row.group_name } : null,
    upcomingGroup: row.next_group_id
      ? { id: row.next_group_id, name: row.next_group_name, startsOn: row.next_group_starts_on }
      : null,
    freeze: row.freeze_starts_on
      ? { startsOn: row.freeze_starts_on, endsOn: row.freeze_ends_on, active: row.is_frozen }
      : null,
    unusedCredits: row.unused_credits,
  };
}

// Tüm müşteriler. Küçük bir stüdyo için hepsini tek seferde göndermek yeterli; arama ve filtre ekranda.
export async function listCustomers(admin, { db = pool } = {}) {
  const { rows } = await db.query(CUSTOMER_SELECT, [admin.studio_id]);
  return rows.map(toCustomerDto).sort((a, b) => a.fullName.localeCompare(b.fullName, 'tr'));
}

async function findCustomer(admin, customerId, db) {
  const { rows: [row] } = await db.query(`${CUSTOMER_SELECT} AND u.id = $2`, [admin.studio_id, customerId]);
  if (!row) throw new AppError('CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.', 404);
  return row;
}

// Müşteri detayı: liste satırındaki bilgiler + kullanılabilir haklar + sıradaki dersi.
export async function getCustomer(admin, customerId, { db = pool } = {}) {
  const row = await findCustomer(admin, customerId, db);
  const { rows: credits } = await db.query(
    `
    SELECT id, expires_at FROM credits
    WHERE user_id = $1 AND used_session_id IS NULL AND forfeited_at IS NULL AND expires_at > now()
    ORDER BY expires_at
    `,
    [customerId],
  );
  // Müşterinin kendi ekranındaki listeyi kullanıyoruz: "sıradaki ders" her iki tarafta aynı hesaplansın.
  const sessions = await listMySessions({ id: customerId, studio_id: admin.studio_id }, { db });
  const next = sessions.find(
    (s) => s.status === 'scheduled' && (s.myStatus === 'attending' || s.myStatus === 'makeup'),
  );
  return {
    ...toCustomerDto(row),
    credits: credits.map((c) => ({ id: c.id, expiresAt: c.expires_at })),
    nextSession: next ? { id: next.id, date: next.date, startsAt: next.startsAt, makeup: next.myStatus === 'makeup' } : null,
  };
}

// Grup seçimi için: her grubun kapasitesi ve verilen tarihteki üye sayısı (o tarihte dondurulmuş olanlar
// yer tutmaz, BR-12; doluluk hesabıyla aynı kural).
const GROUPS_WITH_MEMBERS = `
  SELECT g.id, g.name, g.capacity,
         (SELECT count(*)::int FROM group_members gm
          WHERE gm.group_id = g.id
            AND gm.joined_on <= $2::date AND (gm.left_on IS NULL OR $2::date < gm.left_on)
            AND NOT EXISTS (SELECT 1 FROM freezes f
                            WHERE f.user_id = gm.user_id
                              AND daterange(f.starts_on, f.ends_on, '[]') @> $2::date)) AS member_count
  FROM groups g
  WHERE g.studio_id = $1 AND g.is_active
`;

async function studioToday(studioId, db) {
  const { rows: [row] } = await db.query(
    'SELECT (now() AT TIME ZONE timezone)::date AS today FROM studios WHERE id = $1',
    [studioId],
  );
  return row.today;
}

// Gruplar ve verilen tarihteki (varsayılan: bugün) üye sayıları.
export async function listGroups(admin, { date, db = pool } = {}) {
  const onDate = date ?? (await studioToday(admin.studio_id, db));
  const { rows } = await db.query(`${GROUPS_WITH_MEMBERS} ORDER BY g.start_time, g.name`, [admin.studio_id, onDate]);
  return rows.map((g) => ({ id: g.id, name: g.name, capacity: g.capacity, memberCount: g.member_count }));
}

// --- Yeni müşteri (BR-18) -----------------------------------------------------------------------

// Seçilen grup doluysa yönetici uyarılır ama isterse yine de ekler (Pınar'ın kararı; BR-16 ile aynı mantık).
// İlk istekte confirmFull=false ise 409 GROUP_FULL döner; ekran uyarıyı gösterip confirmFull=true ile tekrar gönderir.
export async function createCustomer(admin, { fullName, phone, groupId, startsOn, confirmFull = false }, { db = pool } = {}) {
  const name = typeof fullName === 'string' ? fullName.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2) throw new AppError('INVALID_NAME', 'Ad soyad yaz.', 400);
  assertDate(startsOn, 'İlk ders tarihi');

  return withTransaction(db, async (client) => {
    const groups = await listGroups(admin, { date: startsOn, db: client });
    const group = groups.find((g) => g.id === Number(groupId));
    if (!group) throw new AppError('GROUP_NOT_FOUND', 'Grup bulunamadı.', 404);
    if (group.memberCount >= group.capacity && !confirmFull) {
      throw new AppError(
        'GROUP_FULL',
        `${group.name} grubu dolu (${group.memberCount}/${group.capacity}). Yine de eklersen derslerde kapasite aşılır.`,
        409,
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const customerId = await createUser(
      { studioId: admin.studio_id, role: 'customer', fullName: name, phone, temporaryPassword },
      { db: client },
    );
    await client.query(
      'INSERT INTO group_members (group_id, user_id, joined_on) VALUES ($1, $2, $3)',
      [group.id, customerId, startsOn],
    );
    // Şifre sadece bu cevapta, bir kez döner; veritabanında yalnızca hash'i var.
    return { customerId, temporaryPassword };
  });
}

// --- Şifre sıfırlama (BR-21) --------------------------------------------------------------------

export async function resetCustomerPassword(admin, customerId, { db = pool } = {}) {
  await findCustomer(admin, customerId, db);
  const temporaryPassword = generateTemporaryPassword();
  await resetPassword({ userId: customerId, temporaryPassword }, { db });
  return { temporaryPassword };
}

// --- Dondurma (BR-10, BR-11) --------------------------------------------------------------------

export async function freezeCustomer(admin, customerId, { startsOn, endsOn = null }, { db = pool } = {}) {
  const customer = await findCustomer(admin, customerId, db);
  if (customer.status === 'left') throw new AppError('CUSTOMER_LEFT', 'Bu müşteri stüdyodan ayrılmış.', 409);
  assertDate(startsOn, 'Başlangıç tarihi');
  if (endsOn !== null && endsOn !== '') {
    assertDate(endsOn, 'Bitiş tarihi');
    if (endsOn < startsOn) throw new AppError('INVALID_DATE', 'Bitiş tarihi başlangıçtan önce olamaz.', 400);
  }
  try {
    await db.query(
      'INSERT INTO freezes (user_id, starts_on, ends_on) VALUES ($1, $2, $3)',
      [customerId, startsOn, endsOn || null],
    );
  } catch (err) {
    // freezes_no_overlap (EXCLUDE kısıtı): aynı müşterinin iki dondurma dönemi çakışamaz.
    if (err.constraint === 'freezes_no_overlap') {
      throw new AppError('FREEZE_OVERLAP', 'Bu tarihlerle çakışan bir dondurma zaten var.', 409);
    }
    throw err;
  }
}

// Yöneticinin kendi kararıyla verdiği telafi hakları (son dakika aksiliği, stüdyonun iptali, jest...).
// Hak bir dersten doğmaz (source_session_id boş); seçilen günün sonuna kadar (stüdyonun saatiyle) geçerlidir.
// Bitiş 23:59:59 olarak saklanır: gece yarısı (ertesi gün 00:00) saklansaydı ekranda bir gün sonrası görünürdü.
export async function grantCredits(admin, customerId, { count, expiresOn, note }, { db = pool } = {}) {
  const customer = await findCustomer(admin, customerId, db);
  if (customer.status === 'left') throw new AppError('CUSTOMER_LEFT', 'Bu müşteri stüdyodan ayrılmış.', 409);
  if (!Number.isInteger(count) || count < 1 || count > 5) {
    throw new AppError('INVALID_COUNT', 'Bir seferde 1 ile 5 arasında hak verebilirsin.', 400);
  }
  assertDate(expiresOn, 'Son geçerlilik günü');
  const today = await studioToday(admin.studio_id, db);
  if (expiresOn < today) throw new AppError('INVALID_DATE', 'Son geçerlilik günü geçmişte olamaz.', 400);
  const { rows: [limit] } = await db.query(`SELECT ($1::date + interval '1 year')::date AS max`, [today]);
  if (expiresOn > limit.max) throw new AppError('INVALID_DATE', 'Hak en fazla bir yıl geçerli olabilir.', 400);
  if (note != null && typeof note !== 'string') throw new AppError('INVALID_NOTE', 'Not geçersiz.', 400);
  const cleanNote = note?.trim() || null;
  if (cleanNote && cleanNote.length > 200) throw new AppError('INVALID_NOTE', 'Not en fazla 200 karakter olabilir.', 400);

  await db.query(
    `
    INSERT INTO credits (user_id, expires_at, note)
    SELECT $1, (($2::date + 1)::timestamp AT TIME ZONE st.timezone) - interval '1 second', $3
    FROM studios st CROSS JOIN generate_series(1, $4::int)
    WHERE st.id = $5
    `,
    [customerId, expiresOn, cleanNote, count, admin.studio_id],
  );
}

// Dondurmayı bugünden itibaren bitirir: müşteri bugünkü dersine de gelebilir. Henüz başlamamış (ileri tarihli)
// dondurma tamamen silinir. Grubu bu arada dolduysa yönetici uyarılır (BR-16), karar onda.
export async function endFreeze(admin, customerId, { db = pool } = {}) {
  const customer = await findCustomer(admin, customerId, db);
  if (!customer.freeze_starts_on) throw new AppError('NOT_FROZEN', 'Bu müşterinin dondurması yok.', 409);
  const today = await studioToday(admin.studio_id, db);

  await withTransaction(db, async (client) => {
    await client.query('DELETE FROM freezes WHERE user_id = $1 AND starts_on >= $2', [customerId, today]);
    await client.query(
      `UPDATE freezes SET ends_on = $2::date - 1
       WHERE user_id = $1 AND starts_on < $2 AND (ends_on IS NULL OR ends_on >= $2)`,
      [customerId, today],
    );
  });

  // Müşteri artık sayılıyor; grup kapasitesinin üstüne çıktıysa söyle.
  const groups = customer.group_id ? await listGroups(admin, { date: today, db }) : [];
  const group = groups.find((g) => g.id === customer.group_id);
  return { groupOverCapacity: Boolean(group && group.memberCount > group.capacity) };
}

// --- Stüdyodan ayrılma (BR-14, BR-22, BR-23) ----------------------------------------------------

// Onay ekranı için: ayrılınca iptal edilecek gelecek telafi kayıtlarının sayısı.
// (Düzenli dersler zaten grup üyeliği kapanınca kendiliğinden düşüyor.)
export async function previewLeave(admin, customerId, { db = pool } = {}) {
  await findCustomer(admin, customerId, db);
  const { rows: [row] } = await db.query(
    `SELECT count(*)::int AS makeups FROM credits c JOIN sessions s ON s.id = c.used_session_id
     WHERE c.user_id = $1 AND s.starts_at > now()`,
    [customerId],
  );
  return { futureMakeups: row.makeups };
}

export async function markLeft(admin, customerId, { db = pool } = {}) {
  const customer = await findCustomer(admin, customerId, db);
  if (customer.status === 'left') throw new AppError('CUSTOMER_LEFT', 'Bu müşteri zaten ayrılmış.', 409);
  const today = await studioToday(admin.studio_id, db);

  await withTransaction(db, async (client) => {
    // Müşteri silinmez, durumu değişir (geçmiş kayıtlar korunur, BR-14).
    await client.query(`UPDATE users SET status = 'left' WHERE id = $1`, [customerId]);
    // Grup üyeliği bugün kapanır: bugünden itibaren derslerde sayılmaz, yeri boşalır.
    // İleri tarihli bir grup değişikliği bekliyorsa o üyelik hiç başlamadığı için silinir (bugünden
    // kapatılamaz: bitiş, başlangıçtan önce olurdu). İleride kapanacak üyelik de bugüne çekilir.
    await client.query('DELETE FROM group_members WHERE user_id = $1 AND joined_on > $2', [customerId, today]);
    await client.query(
      'UPDATE group_members SET left_on = $2 WHERE user_id = $1 AND (left_on IS NULL OR left_on > $2)',
      [customerId, today],
    );
    // Gelecekteki telafi kayıtları iptal: yerler başkalarına açılır. Haklar yakılır (artık kullanamaz).
    await client.query(
      `UPDATE credits c SET used_session_id = NULL, used_at = NULL, forfeited_at = now()
       FROM sessions s
       WHERE s.id = c.used_session_id AND c.user_id = $1 AND s.starts_at > now()`,
      [customerId],
    );
    // Açık oturumları kapat (zaten her istekte durum kontrol ediliyor; bu, tabloyu da temiz tutar).
    await revokeAllSessions(customerId, { db: client });
  });
}

