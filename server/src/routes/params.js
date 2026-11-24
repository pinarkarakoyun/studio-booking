import { AppError } from '../errors.js';

// routes/admin.js ve routes/staff.js'in ortak yardımcıları.

// URL'deki id'yi pozitif tamsayıya çevirir; geçersizse veritabanına gitmeden 404.
export function parseId(value, code, message) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError(code, message, 404);
  return id;
}
export const sessionId = (req) => parseId(req.params.id, 'SESSION_NOT_FOUND', 'Ders bulunamadı.');
export const customerId = (req) => parseId(req.params.id, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
export const membershipId = (req) => parseId(req.params.id, 'MEMBERSHIP_NOT_FOUND', 'Üyelik dönemi bulunamadı.');
export const paymentId = (req) => parseId(req.params.id, 'PAYMENT_NOT_FOUND', 'Ödeme bulunamadı.');
export const groupId = (req) => parseId(req.params.id, 'GROUP_NOT_FOUND', 'Grup bulunamadı.');
export const branchId = (req) => parseId(req.params.id, 'BRANCH_NOT_FOUND', 'Şube bulunamadı.');
export const packageId = (req) => parseId(req.params.id, 'PACKAGE_NOT_FOUND', 'Paket bulunamadı.');

// Grup formundan gelen alanlar (düzenleme ve önizleme aynı gövdeyi kullanır).
export const groupInput = (body) => ({
  name: body?.name,
  weekdays: body?.weekdays,
  startTime: body?.startTime,
  durationMinutes: body?.durationMinutes,
  capacity: body?.capacity,
  effectiveFrom: body?.effectiveFrom,
  // undefined = gönderilmedi (düzenlemede şube değişmez); null = seçilmedi.
  branchId: body?.branchId,
});
