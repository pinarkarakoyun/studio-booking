import { AppError } from '../errors.js';
import { findSessionUser } from '../services/auth.js';

export const SESSION_COOKIE = 'sid';

// Cookie'deki oturumu çözer; giriş yapılmışsa req.user'ı doldurur. Kimseyi engellemez,
// engellemeyi requireAuth yapar. Her isteğin başında bir kez çalışır.
export async function loadUser(req, res, next) {
  req.sessionToken = req.cookies?.[SESSION_COOKIE] ?? null;
  req.user = await findSessionUser(req.sessionToken);
  next();
}

// Giriş zorunlu. Geçici şifreyle giren kullanıcı, şifresini değiştirene kadar sadece
// izin verilen uçlara (ör. şifre değiştirme) erişebilir. Bu kontrol sunucuda: ekranda butonu
// gizlemek yetmez, kullanıcı isteği elle de gönderebilir (BR-20).
export function requireAuth({ allowPendingPasswordChange = false } = {}) {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError('NOT_AUTHENTICATED', 'Lütfen giriş yapın.', 401);
    }
    if (req.user.must_change_password && !allowPendingPasswordChange) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Devam etmek için yeni bir şifre belirleyin.', 403);
    }
    next();
  };
}

// Belirli bir rol zorunlu (ör. yönetici ekranları). requireAuth'tan sonra kullanılır.
// 401 = "kim olduğunu bilmiyorum", 403 = "kim olduğunu biliyorum ama buna iznin yok".
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      throw new AppError('FORBIDDEN', 'Bu işlem için yetkiniz yok.', 403);
    }
    next();
  };
}
