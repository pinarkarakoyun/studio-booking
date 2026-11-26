import { AppError } from '../errors.js';
import { findSessionUser, SESSION_DAYS } from '../services/auth.js';

export const SESSION_COOKIE = 'sid';

// Cookie ayarları güvenliğin büyük kısmı:
// - httpOnly: JavaScript cookie'yi okuyamaz; sayfaya kötü niyetli bir script sızsa bile token çalınamaz.
// - sameSite 'lax': başka bir siteden gönderilen POST isteklerine cookie eklenmez (CSRF koruması).
// - secure: üretimde cookie sadece HTTPS üzerinden gider (geliştirmede localhost HTTP olduğu için kapalı).
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

// Girişte ve oturum uzadığında verilen çerez: tarayıcıda da SESSION_DAYS gün yaşar.
export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
}

// Cookie'deki oturumu çözer; giriş yapılmışsa req.user'ı doldurur. Kimseyi engellemez,
// engellemeyi requireAuth yapar. Her isteğin başında bir kez çalışır.
export async function loadUser(req, res, next) {
  req.sessionToken = req.cookies?.[SESSION_COOKIE] ?? null;
  // Oturum yalnızca adresteki stüdyoda geçerli: A stüdyosunun çerezi B'nin adresinde "giriş yok" sayılır.
  req.user = await findSessionUser(req.sessionToken, req.studio?.id);
  // Sunucudaki oturum uzadıysa çerez de uzamalı; yoksa tarayıcı çerezi eski tarihte siler ve kullanıcı çıkmış olur.
  if (req.user?.renewed) setSessionCookie(res, req.sessionToken);
  next();
}

// Giriş zorunlu. Geçici şifreyle giren kullanıcı, şifresini değiştirene kadar sadece
// izin verilen uçlara (ör. şifre değiştirme) erişebilir. Bu kontrol sunucuda: ekranda butonu
// gizlemek yetmez, kullanıcı isteği elle de gönderebilir (BR-20).
export function requireAuth({ allowPendingPasswordChange = false } = {}) {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError('NOT_AUTHENTICATED', 'Devam etmek için giriş yap.', 401);
    }
    if (req.user.must_change_password && !allowPendingPasswordChange) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Devam etmek için yeni bir şifre belirle.', 403);
    }
    next();
  };
}

// Belirli bir rol zorunlu (ör. yönetici ekranları). requireAuth'tan sonra kullanılır.
// 401 = "kim olduğunu bilmiyorum", 403 = "kim olduğunu biliyorum ama buna iznin yok".
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      throw new AppError('FORBIDDEN', 'Bu işlem için yetkin yok.', 403);
    }
    next();
  };
}
