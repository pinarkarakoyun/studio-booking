import { Router } from 'express';
import { AppError } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  createCustomer,
  endFreeze,
  freezeCustomer,
  getCustomer,
  listCustomers,
  listGroups,
  markLeft,
  previewLeave,
  resetCustomerPassword,
} from '../services/adminCustomers.js';
import { getSessionRoster, getToday } from '../services/adminSchedule.js';

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

// --- Bugün --------------------------------------------------------------------------------------

router.get('/api/admin/today', async (req, res) => {
  res.json(await getToday(req.user));
});

router.get('/api/admin/sessions/:id', async (req, res) => {
  res.json(await getSessionRoster(req.user, sessionId(req)));
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

// Yeni müşteri formundaki grup seçimi için.
router.get('/api/admin/groups', async (req, res) => {
  res.json({ groups: await listGroups(req.user) });
});

export default router;
