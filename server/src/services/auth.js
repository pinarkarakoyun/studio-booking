import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { AppError } from '../errors.js';
import { normalizePhone } from '../utils/phone.js';

export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;

// bcrypt'in "maliyet" çarpanı: her +1 hash süresini ikiye katlar. 12 ≈ birkaç yüz ms;
// kullanıcı fark etmez ama saldırganın saniyede deneyebileceği şifre sayısı çok düşer.
// Testler yüzlerce hash ürettiği için orada düşük bir değer verilir (npm test: BCRYPT_COST=4).
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 12;

// Bilinmeyen telefonla giriş denendiğinde de aynı süre harcansın diye karşılaştırılacak sahte hash
// (bkz. login). Değeri önemsiz; sadece geçerli bir bcrypt hash'i olması gerekiyor.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

const INVALID_CREDENTIALS = () =>
  new AppError('INVALID_CREDENTIALS', 'Telefon numarası veya şifre hatalı.', 401);

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

function assertPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError('WEAK_PASSWORD', `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`, 400);
  }
}

// Token'ın kendisi cookie'de, özeti veritabanında. Token 32 rastgele bayt (256 bit): tahmin
// edilemez. Bu kadar rastgele bir değer için hızlı bir özet (SHA-256) yeterli; bcrypt gibi yavaş
// hash'ler insanların seçtiği, tahmin edilebilir şifreler için gerekiyor.
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// --- Giriş denemesi sınırı ----------------------------------------------------------------------
// Aynı telefon için 15 dakikada en fazla 5 hatalı deneme. Yoksa biri bir numarayı alıp
// şifreleri tek tek deneyebilirdi (brute force).
// Bellekte tutuluyor: sunucu yeniden başlarsa sıfırlanır ve birden fazla sunucuda ortak değildir.
// Tek sunuculu küçük bir stüdyo için yeterli; büyürse veritabanına taşınır.
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map(); // anahtar: telefon -> { count, firstAt }

function assertNotRateLimited(key) {
  const entry = failedAttempts.get(key);
  if (!entry) return;
  if (Date.now() - entry.firstAt > ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(key);
    return;
  }
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    throw new AppError('TOO_MANY_ATTEMPTS', 'Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar dene.', 429);
  }
}

function recordFailedAttempt(key) {
  const entry = failedAttempts.get(key);
  if (entry && Date.now() - entry.firstAt <= ATTEMPT_WINDOW_MS) {
    entry.count += 1;
  } else {
    failedAttempts.set(key, { count: 1, firstAt: Date.now() });
  }
}

// Testler için: denemeler arasında sayacı sıfırlar.
export function resetLoginAttempts() {
  failedAttempts.clear();
}

// --- Oturumlar ----------------------------------------------------------------------------------

// Dışarı açık olmasının tek sebebi testler: şifreyle giriş adımını atlayıp doğrudan oturum açabilmek.
export async function createSession(userId, db = pool) {
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `
    INSERT INTO user_sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, now() + make_interval(days => $3))
    `,
    [hashToken(token), userId, SESSION_DAYS],
  );
  return token;
}

// Cookie'deki token'a ait geçerli oturumun kullanıcısını döndürür (yoksa null).
// Kullanıcının durumu HER istekte kontrol ediliyor: müşteri "ayrıldı" yapıldığı anda,
// açık oturumu olsa bile bir sonraki isteği reddedilir (BR-22).
export async function findSessionUser(token, { db = pool } = {}) {
  if (!token) return null;
  const { rows: [user] } = await db.query(
    `
    SELECT u.id, u.studio_id, u.role, u.full_name, u.must_change_password, us.id AS session_id
    FROM user_sessions us
    JOIN users u ON u.id = us.user_id
    WHERE us.token_hash = $1
      AND us.expires_at > now()
      AND u.status <> 'left'
    `,
    [hashToken(token)],
  );
  return user ?? null;
}

export async function revokeSession(token, { db = pool } = {}) {
  if (!token) return;
  await db.query('DELETE FROM user_sessions WHERE token_hash = $1', [hashToken(token)]);
}

// Kullanıcının tüm oturumlarını kapatır; exceptSessionId verilirse o oturum açık kalır.
export async function revokeAllSessions(userId, { exceptSessionId = null, db = pool } = {}) {
  await db.query(
    'DELETE FROM user_sessions WHERE user_id = $1 AND id IS DISTINCT FROM $2',
    [userId, exceptSessionId],
  );
}

// --- Giriş --------------------------------------------------------------------------------------

export async function login({ phone, password }, { db = pool } = {}) {
  const normalized = normalizePhone(phone);
  // Geçersiz numaralar da sayaca girsin diye ham değeri anahtar olarak kullanıyoruz.
  const attemptKey = normalized ?? String(phone);
  assertNotRateLimited(attemptKey);

  const { rows: [user] } = normalized
    ? await db.query(
      'SELECT id, password_hash, status FROM users WHERE phone = $1',
      [normalized],
    )
    : { rows: [] };

  // Kullanıcı yoksa da bir bcrypt karşılaştırması yapıyoruz. Yapmasaydık "kayıtlı olmayan numara"
  // cevabı ~0 ms, "kayıtlı numara, yanlış şifre" cevabı ~250 ms sürerdi; saldırgan cevap süresine
  // bakarak hangi numaraların kayıtlı olduğunu öğrenebilirdi (timing attack).
  const passwordOk = await bcrypt.compare(
    typeof password === 'string' ? password : '',
    user?.password_hash ?? DUMMY_HASH,
  );

  if (!user || !passwordOk) {
    recordFailedAttempt(attemptKey);
    // Hangisinin yanlış olduğunu söylemiyoruz: kayıtlı numaralar sızmasın.
    throw INVALID_CREDENTIALS();
  }
  failedAttempts.delete(attemptKey);

  // Şifre doğruysa kişi kimliğini kanıtladı; hesabın kapalı olduğunu söylemek artık bilgi sızdırmaz.
  if (user.status === 'left') {
    throw new AppError('ACCOUNT_CLOSED', 'Hesabın kapatılmış. Stüdyoyla iletişime geç.', 403);
  }

  const token = await createSession(user.id, db);
  return { token, user: await findSessionUser(token, { db }) };
}

// --- Şifre --------------------------------------------------------------------------------------

// Müşteri kendi şifresini değiştirir (ilk girişte zorunlu, BR-20). Diğer cihazlardaki oturumlar
// kapanır; şifresini başkası öğrendiği için değiştiriyorsa, o kişi de dışarıda kalır.
export async function changePassword({ userId, sessionId, currentPassword, newPassword }, { db = pool } = {}) {
  const { rows: [user] } = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const currentOk = await bcrypt.compare(
    typeof currentPassword === 'string' ? currentPassword : '',
    user.password_hash,
  );
  if (!currentOk) {
    throw new AppError('INVALID_CURRENT_PASSWORD', 'Mevcut şifren hatalı.', 400);
  }
  assertPasswordStrength(newPassword);
  if (newPassword === currentPassword) {
    throw new AppError('SAME_PASSWORD', 'Yeni şifre eskisiyle aynı olamaz.', 400);
  }

  await db.query(
    'UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1',
    [userId, await hashPassword(newPassword)],
  );
  await revokeAllSessions(userId, { exceptSessionId: sessionId, db });
}

// Yönetici bir müşteriye geçici şifre verir (unutulan şifre, BR-21). Müşteri bir sonraki girişte
// yeni şifre belirlemek zorunda; tüm açık oturumları kapanır.
export async function resetPassword({ userId, temporaryPassword }, { db = pool } = {}) {
  assertPasswordStrength(temporaryPassword);
  await db.query(
    'UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1',
    [userId, await hashPassword(temporaryPassword)],
  );
  await revokeAllSessions(userId, { db });
}

// Yönetici yeni hesap açar (BR-18). Telefon normalleştirilir; şifre geçicidir.
export async function createUser({ studioId, role, fullName, phone, temporaryPassword }, { db = pool } = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new AppError('INVALID_PHONE', 'Telefon numarası geçersiz.', 400);
  }
  assertPasswordStrength(temporaryPassword);

  const { rows } = await db.query(
    `
    INSERT INTO users (studio_id, role, full_name, phone, password_hash, must_change_password)
    VALUES ($1, $2, $3, $4, $5, true)
    ON CONFLICT (phone) DO NOTHING
    RETURNING id
    `,
    [studioId, role, fullName, normalized, await hashPassword(temporaryPassword)],
  );
  if (rows.length === 0) {
    throw new AppError('PHONE_TAKEN', 'Bu telefon numarasıyla kayıtlı bir hesap var.', 409);
  }
  return rows[0].id;
}
