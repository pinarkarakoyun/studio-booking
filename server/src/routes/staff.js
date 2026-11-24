import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { can, requireStaff } from '../middleware/staff.js';
import { listBranches } from '../services/adminBranches.js';
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
import { createMembership, getMemberships } from '../services/adminMemberships.js';
import { listPackages } from '../services/adminPackages.js';
import {
  addToSession,
  cancelSessionByStudio,
  getDay,
  getSessionRoster,
  getToday,
  removeMakeupFromSession,
  setAbsent,
  takeOverSession,
} from '../services/adminSchedule.js';
import { customerId, groupId, groupInput, parseId, sessionId } from './params.js';

// Personel uçları: yöneticiye ve (yetkisine göre) eğitmene açık. Her uç tam olarak bir can(...) koruyucusu taşır.
// Burada olmayan bütün /api/admin uçları routes/admin.js'te ve yalnızca yöneticiye açıktır: yeni bir uç
// eklenip buraya taşınmazsa eğitmen ona giremez (varsayılan kapalı). Bu yönlendirici admin.js'ten önce bağlanır.
// Şubeye göre süzme (eğitmen yalnızca kendi şubelerini görür) servislerde yapılır.
const router = Router();

router.use('/api/admin', requireAuth(), requireStaff());

// --- Dersler ------------------------------------------------------------------------------------

router.get('/api/admin/today', can(null), async (req, res) => {
  res.json(await getToday(req.user));
});

router.get('/api/admin/day', can(null), async (req, res) => {
  res.json(await getDay(req.user, req.query.date));
});

router.get('/api/admin/sessions/:id', can(null), async (req, res) => {
  res.json(await getSessionRoster(req.user, sessionId(req)));
});

router.post('/api/admin/sessions/:id/attendees', can('manage_attendees'), async (req, res) => {
  const userId = parseId(req.body?.userId, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  res.status(201).json(await addToSession(req.user, sessionId(req), { userId, confirmFull: req.body?.confirmFull === true }));
});

router.delete('/api/admin/sessions/:id/attendees/:userId', can('manage_attendees'), async (req, res) => {
  const userId = parseId(req.params.userId, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  res.json(await removeMakeupFromSession(req.user, sessionId(req), userId));
});

// Yoklama: PUT "gelmedi" işaretler, DELETE işareti kaldırır. Yanıt: güncel katılımcı listesi.
router.put('/api/admin/sessions/:id/attendance/:userId', can('attendance'), async (req, res) => {
  const userId = parseId(req.params.userId, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  res.json(await setAbsent(req.user, sessionId(req), userId, true));
});

router.delete('/api/admin/sessions/:id/attendance/:userId', can('attendance'), async (req, res) => {
  const userId = parseId(req.params.userId, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  res.json(await setAbsent(req.user, sessionId(req), userId, false));
});

// Başka eğitmenin bugünkü dersine giren eğitmen: "Bu dersi ben veriyorum".
router.post('/api/admin/sessions/:id/take-over', can('attendance'), async (req, res) => {
  res.json(await takeOverSession(req.user, sessionId(req)));
});

// Önce "kaç kişi etkilenir?" (aynı kod, sonunda geri alınır), sonra kesin iptal.
router.post('/api/admin/sessions/:id/cancel/preview', can('cancel_own_sessions'), async (req, res) => {
  res.json(await cancelSessionByStudio(req.user, sessionId(req), { reason: req.body?.reason }, { preview: true }));
});

router.post('/api/admin/sessions/:id/cancel', can('cancel_own_sessions'), async (req, res) => {
  res.json(await cancelSessionByStudio(req.user, sessionId(req), { reason: req.body?.reason }));
});

// --- Müşteriler ---------------------------------------------------------------------------------

router.get('/api/admin/customers', can('view_customers'), async (req, res) => {
  res.json({ customers: await listCustomers(req.user) });
});

router.post('/api/admin/customers', can('edit_customers'), async (req, res) => {
  const result = await createCustomer(req.user, {
    fullName: req.body?.fullName,
    phone: req.body?.phone,
    groupId: req.body?.groupId,
    startsOn: req.body?.startsOn,
    confirmFull: req.body?.confirmFull === true,
  });
  res.status(201).json(result);
});

router.get('/api/admin/customers/:id', can('view_customers'), async (req, res) => {
  res.json({ customer: await getCustomer(req.user, customerId(req)) });
});

router.post('/api/admin/customers/:id/reset-password', can('edit_customers'), async (req, res) => {
  res.json(await resetCustomerPassword(req.user, customerId(req)));
});

router.post('/api/admin/customers/:id/freeze', can('customer_status'), async (req, res) => {
  await freezeCustomer(req.user, customerId(req), {
    startsOn: req.body?.startsOn,
    endsOn: req.body?.endsOn ?? null,
  });
  res.status(204).end();
});

router.post('/api/admin/customers/:id/credits', can('memberships'), async (req, res) => {
  await grantCredits(req.user, customerId(req), {
    count: req.body?.count,
    expiresOn: req.body?.expiresOn,
    note: req.body?.note,
  });
  res.status(204).end();
});

router.post('/api/admin/customers/:id/end-freeze', can('customer_status'), async (req, res) => {
  res.json(await endFreeze(req.user, customerId(req)));
});

router.get('/api/admin/customers/:id/leave-preview', can('customer_status'), async (req, res) => {
  res.json(await previewLeave(req.user, customerId(req)));
});

router.post('/api/admin/customers/:id/leave', can('customer_status'), async (req, res) => {
  await markLeft(req.user, customerId(req));
  res.status(204).end();
});

router.post('/api/admin/customers/:id/change-group', can('customer_status'), async (req, res) => {
  res.json(
    await changeCustomerGroup(req.user, customerId(req), {
      groupId: req.body?.groupId,
      effectiveFrom: req.body?.effectiveFrom,
      confirmFull: req.body?.confirmFull === true,
    }),
  );
});

// --- Üyelik dönemleri (fiyatlar eğitmene gösterilmez; ödemeler admin.js'te) ------------------------

router.get('/api/admin/customers/:id/memberships', can('memberships'), async (req, res) => {
  res.json(await getMemberships(req.user, customerId(req)));
});

router.post('/api/admin/customers/:id/memberships', can('memberships'), async (req, res) => {
  // Paket modelinde packageId (endsOn yok); grup modelinde startsOn-endsOn. Hangisinin geçerli olduğuna servis karar verir.
  const { packageId, startsOn, endsOn, feeKurus, note } = req.body ?? {};
  res.status(201).json({
    membership: await createMembership(req.user, customerId(req), { packageId, startsOn, endsOn, feeKurus, note }),
  });
});

router.get('/api/admin/packages', can('memberships'), async (req, res) => {
  res.json({ packages: await listPackages(req.user) });
});

// --- Gruplar ------------------------------------------------------------------------------------

// Açık ve kapalı bütün gruplar (yeni müşteri formu da bunu kullanır, kapalıları ayıklar).
router.get('/api/admin/groups', can('manage_groups'), async (req, res) => {
  res.json({ groups: await listAllGroups(req.user) });
});

router.post('/api/admin/groups', can('manage_groups'), async (req, res) => {
  res.status(201).json(await createGroup(req.user, groupInput(req.body)));
});

router.get('/api/admin/groups/:id', can('manage_groups'), async (req, res) => {
  res.json({ group: await getGroup(req.user, groupId(req)) });
});

router.put('/api/admin/groups/:id', can('manage_groups'), async (req, res) => {
  res.json(await updateGroup(req.user, groupId(req), groupInput(req.body)));
});

// Kaydetmeden önce "neler olacak?": aynı kod çalışır, sonuç döner, hiçbir şey kalıcı olmaz.
router.post('/api/admin/groups/:id/preview', can('manage_groups'), async (req, res) => {
  res.json(await updateGroup(req.user, groupId(req), groupInput(req.body), { preview: true }));
});

router.post('/api/admin/groups/:id/close', can('manage_groups'), async (req, res) => {
  res.json(await closeGroup(req.user, groupId(req)));
});

// --- Şubeler (yalnızca liste; formlardaki şube seçimi için) ---------------------------------------

router.get('/api/admin/branches', can(null), async (req, res) => {
  res.json({ branches: await listBranches(req.user) });
});

export default router;
