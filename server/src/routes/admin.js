import { Router } from 'express';
import { AppError } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createCustomer,
  endFreeze,
  freezeCustomer,
  grantCredits,
  getCustomer,
  listCustomers,
  markLeft,
  previewLeave,
  resetCustomerPassword,
} from '../services/adminCustomers.js';
import {
  changeCustomerGroup,
  closeGroup,
  createGroup,
  getGroup,
  listAllGroups,
  updateGroup,
} from '../services/adminGroups.js';
import { addPayment, createMembership, deletePayment, getMemberships, getPaymentOverview } from '../services/adminMemberships.js';
import { cancelSessionByStudio, getSessionRoster, getToday } from '../services/adminSchedule.js';
import { getSettings, updateSettings } from '../services/adminSettings.js';

const router = Router();

// Bu dosyadaki her uç giriş yapmış bir yönetici ister. Müşteri bu uçlara gelirse 403 alır.
router.use('/api/admin', requireAuth(), requireRole('admin'));

// URL'deki id'yi pozitif tamsayıya çevirir; geçersizse veritabanına gitmeden 404.
function parseId(value, code, message) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError(code, message, 404);
  return id;
}
const sessionId = (req) => parseId(req.params.id, 'SESSION_NOT_FOUND', 'Ders bulunamadı.');
const customerId = (req) => parseId(req.params.id, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
const membershipId = (req) => parseId(req.params.id, 'MEMBERSHIP_NOT_FOUND', 'Üyelik dönemi bulunamadı.');
const paymentId = (req) => parseId(req.params.id, 'PAYMENT_NOT_FOUND', 'Ödeme bulunamadı.');
const groupId = (req) => parseId(req.params.id, 'GROUP_NOT_FOUND', 'Grup bulunamadı.');

// Grup formundan gelen alanlar (düzenleme ve önizleme aynı gövdeyi kullanır).
const groupInput = (body) => ({
  name: body?.name,
  weekdays: body?.weekdays,
  startTime: body?.startTime,
  durationMinutes: body?.durationMinutes,
  capacity: body?.capacity,
  effectiveFrom: body?.effectiveFrom,
});

// --- Bugün --------------------------------------------------------------------------------------

router.get('/api/admin/today', async (req, res) => {
  res.json(await getToday(req.user));
});

router.get('/api/admin/sessions/:id', async (req, res) => {
  res.json(await getSessionRoster(req.user, sessionId(req)));
});

// Önce "kaç kişi etkilenir?" (aynı kod, sonunda geri alınır), sonra kesin iptal.
router.post('/api/admin/sessions/:id/cancel/preview', async (req, res) => {
  res.json(await cancelSessionByStudio(req.user, sessionId(req), { reason: req.body?.reason }, { preview: true }));
});

router.post('/api/admin/sessions/:id/cancel', async (req, res) => {
  res.json(await cancelSessionByStudio(req.user, sessionId(req), { reason: req.body?.reason }));
});

// --- Müşteriler ---------------------------------------------------------------------------------

router.get('/api/admin/customers', async (req, res) => {
  res.json({ customers: await listCustomers(req.user) });
});

router.post('/api/admin/customers', async (req, res) => {
  const result = await createCustomer(req.user, {
    fullName: req.body?.fullName,
    phone: req.body?.phone,
    groupId: req.body?.groupId,
    startsOn: req.body?.startsOn,
    confirmFull: req.body?.confirmFull === true,
  });
  res.status(201).json(result);
});

router.get('/api/admin/customers/:id', async (req, res) => {
  res.json({ customer: await getCustomer(req.user, customerId(req)) });
});

router.post('/api/admin/customers/:id/reset-password', async (req, res) => {
  res.json(await resetCustomerPassword(req.user, customerId(req)));
});

router.post('/api/admin/customers/:id/freeze', async (req, res) => {
  await freezeCustomer(req.user, customerId(req), {
    startsOn: req.body?.startsOn,
    endsOn: req.body?.endsOn ?? null,
  });
  res.status(204).end();
});

router.post('/api/admin/customers/:id/credits', async (req, res) => {
  await grantCredits(req.user, customerId(req), {
    count: req.body?.count,
    expiresOn: req.body?.expiresOn,
    note: req.body?.note,
  });
  res.status(204).end();
});

router.post('/api/admin/customers/:id/end-freeze', async (req, res) => {
  res.json(await endFreeze(req.user, customerId(req)));
});

router.get('/api/admin/customers/:id/leave-preview', async (req, res) => {
  res.json(await previewLeave(req.user, customerId(req)));
});

router.post('/api/admin/customers/:id/leave', async (req, res) => {
  await markLeft(req.user, customerId(req));
  res.status(204).end();
});

router.post('/api/admin/customers/:id/change-group', async (req, res) => {
  res.json(
    await changeCustomerGroup(req.user, customerId(req), {
      groupId: req.body?.groupId,
      effectiveFrom: req.body?.effectiveFrom,
      confirmFull: req.body?.confirmFull === true,
    }),
  );
});

// --- Gruplar ------------------------------------------------------------------------------------

// Açık ve kapalı bütün gruplar (yeni müşteri formu da bunu kullanır, kapalıları ayıklar).
router.get('/api/admin/groups', async (req, res) => {
  res.json({ groups: await listAllGroups(req.user) });
});

router.post('/api/admin/groups', async (req, res) => {
  res.status(201).json(await createGroup(req.user, groupInput(req.body)));
});

router.get('/api/admin/groups/:id', async (req, res) => {
  res.json({ group: await getGroup(req.user, groupId(req)) });
});

router.put('/api/admin/groups/:id', async (req, res) => {
  res.json(await updateGroup(req.user, groupId(req), groupInput(req.body)));
});

// Kaydetmeden önce "neler olacak?": aynı kod çalışır, sonuç döner, hiçbir şey kalıcı olmaz.
router.post('/api/admin/groups/:id/preview', async (req, res) => {
  res.json(await updateGroup(req.user, groupId(req), groupInput(req.body), { preview: true }));
});

router.post('/api/admin/groups/:id/close', async (req, res) => {
  res.json(await closeGroup(req.user, groupId(req)));
});

// --- Üyelik ve ödemeler -------------------------------------------------------------------------

router.get('/api/admin/customers/:id/memberships', async (req, res) => {
  res.json(await getMemberships(req.user, customerId(req)));
});

router.post('/api/admin/customers/:id/memberships', async (req, res) => {
  const { startsOn, endsOn, feeKurus, note } = req.body ?? {};
  res.status(201).json({ membership: await createMembership(req.user, customerId(req), { startsOn, endsOn, feeKurus, note }) });
});

router.get('/api/admin/payments', async (req, res) => {
  res.json(await getPaymentOverview(req.user));
});

router.post('/api/admin/memberships/:id/payments', async (req, res) => {
  const { amountKurus, paidOn, method, note } = req.body ?? {};
  res.status(201).json({ membership: await addPayment(req.user, membershipId(req), { amountKurus, paidOn, method, note }) });
});

router.delete('/api/admin/payments/:id', async (req, res) => {
  res.json({ membership: await deletePayment(req.user, paymentId(req)) });
});

// --- Ayarlar ------------------------------------------------------------------------------------

router.get('/api/admin/settings', async (req, res) => {
  res.json({ settings: await getSettings(req.user) });
});

router.put('/api/admin/settings', async (req, res) => {
  res.json({ settings: await updateSettings(req.user, req.body) });
});

export default router;
