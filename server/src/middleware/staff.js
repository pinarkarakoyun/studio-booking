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
//   can(['a', 'b'])    -> bunlardan en az biri açık olan eğitmen
// routes/staff.js'teki her uç tam olarak bir koruyucu taşır; "guard" işareti bunu test etmek için
// (staffRoutes.test.js). Koruyucusu unutulan uç testte yakalanır.
export function can(permission) {
  const anyOf = permission === null ? null : [permission].flat();
  const guard = (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (req.user.role === 'instructor' && (anyOf === null || anyOf.some((p) => req.user.permissions?.[p] === true))) {
      return next();
    }
    throw new AppError('FORBIDDEN', 'Bu işlem için yetkin yok.', 403);
  };
  guard.guard = true;
  return guard;
}
