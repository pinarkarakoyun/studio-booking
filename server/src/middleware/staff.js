import { AppError } from '../errors.js';

// Personel = yönetici ya da eğitmen. requireAuth'tan sonra kullanılır.
export function requireStaff() {
  return (req, res, next) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'instructor') {
      throw new AppError('FORBIDDEN', 'Bu işlem için yetkin yok.', 403);
    }
    next();
  };
}

// Bir personel ucunun koruyucusu. Yönetici her zaman geçer. Eğitmen:
//   can(null)          -> her eğitmen (ör. derslerin listesi; kapsamı servis daraltır)
//   can('attendance')  -> yalnızca bu yetkisi açık eğitmen
// routes/staff.js'teki her uç tam olarak bir koruyucu taşır; "guard" işareti bunu test etmek için
// (staffRoutes.test.js). Koruyucusu unutulan uç testte yakalanır.
export function can(permission) {
  const guard = (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (req.user.role === 'instructor' && (permission === null || req.user.permissions?.[permission] === true)) {
      return next();
    }
    throw new AppError('FORBIDDEN', 'Bu işlem için yetkin yok.', 403);
  };
  guard.guard = true;
  return guard;
}
