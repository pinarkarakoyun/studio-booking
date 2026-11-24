import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getAppearance, previewAppearance, updateAppearance } from '../services/adminAppearance.js';
import { closeBranch, createBranch, listBranches, reopenBranch, updateBranch } from '../services/adminBranches.js';
import { closePackage, createPackage, listPackages, reopenPackage, updatePackage } from '../services/adminPackages.js';
import { addPayment, deletePayment, getPaymentOverview } from '../services/adminMemberships.js';
import { getSettings, updateSettings } from '../services/adminSettings.js';
import { branchId, membershipId, packageId, paymentId } from './params.js';

const router = Router();

// Yalnızca yöneticiye açık uçlar. Eğitmene de açılabilen uçlar routes/staff.js'te; o yönlendirici bundan önce
// bağlanır. Buraya eklenen yeni bir uç, staff.js'e taşınmadıkça eğitmene kapalıdır. Müşteri 403 alır.
router.use('/api/admin', requireAuth(), requireRole('admin'));

// Şube formundan gelen alanlar (ekleme ve düzenleme aynı gövdeyi kullanır).
const branchInput = (body) => ({ name: body?.name, address: body?.address, mapsUrl: body?.mapsUrl });

// Paket formundan gelen alanlar (ekleme ve düzenleme aynı gövdeyi kullanır).
const packageInput = (body) => ({
  name: body?.name,
  sessionCount: body?.sessionCount,
  priceKurus: body?.priceKurus,
  validityDays: body?.validityDays,
});

// --- Şubeler (liste staff.js'te) ----------------------------------------------------------------

router.post('/api/admin/branches', async (req, res) => {
  res.status(201).json(await createBranch(req.user, branchInput(req.body)));
});

router.put('/api/admin/branches/:id', async (req, res) => {
  res.json({ branch: await updateBranch(req.user, branchId(req), branchInput(req.body)) });
});

router.post('/api/admin/branches/:id/close', async (req, res) => {
  await closeBranch(req.user, branchId(req));
  res.json({ branches: await listBranches(req.user) });
});

router.post('/api/admin/branches/:id/reopen', async (req, res) => {
  await reopenBranch(req.user, branchId(req));
  res.json({ branches: await listBranches(req.user) });
});

// --- Paket kataloğu (yalnızca seans paketi modeli; liste staff.js'te) ----------------------------

router.post('/api/admin/packages', async (req, res) => {
  res.status(201).json(await createPackage(req.user, packageInput(req.body)));
});

router.put('/api/admin/packages/:id', async (req, res) => {
  res.json({ package: await updatePackage(req.user, packageId(req), packageInput(req.body)) });
});

router.post('/api/admin/packages/:id/close', async (req, res) => {
  await closePackage(req.user, packageId(req));
  res.json({ packages: await listPackages(req.user) });
});

router.post('/api/admin/packages/:id/reopen', async (req, res) => {
  await reopenPackage(req.user, packageId(req));
  res.json({ packages: await listPackages(req.user) });
});

// --- Ödemeler -----------------------------------------------------------------------------------

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

// --- Görünüm (renkler) -------------------------------------------------------------------------

router.get('/api/admin/appearance', async (req, res) => {
  res.json({ appearance: await getAppearance(req.user) });
});

router.put('/api/admin/appearance', async (req, res) => {
  res.json({ appearance: await updateAppearance(req.user, req.body) });
});

router.post('/api/admin/appearance/preview', (req, res) => {
  res.json({ preview: previewAppearance(req.body) });
});

export default router;
