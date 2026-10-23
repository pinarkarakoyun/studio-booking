import { Router } from 'express';
import { AppError } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSessionRoster, getToday } from '../services/adminSchedule.js';

const router = Router();

// Bu dosyadaki her uç giriş yapmış bir yönetici ister. Müşteri bu uçlara gelirse 403 alır.
router.use('/api/admin', requireAuth(), requireRole('admin'));

router.get('/api/admin/today', async (req, res) => {
  res.json(await getToday(req.user));
});

router.get('/api/admin/sessions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404);
  }
  res.json(await getSessionRoster(req.user, id));
});

export default router;
