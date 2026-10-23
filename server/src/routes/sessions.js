import { Router } from 'express';
import { AppError } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  bookMakeup,
  cancelMakeup,
  cancelSession,
  swapSession,
  undoCancel,
} from '../services/booking.js';
import { listBookableSessions, listMyCredits, listMySessions } from '../services/schedule.js';

const router = Router();

// Bu dosyadaki her uç giriş yapmış bir müşteri ister. Yönetici ekranları ayrı uçlardan gelecek.
router.use('/api/me', requireAuth(), requireRole('customer'));
router.use('/api/sessions', requireAuth(), requireRole('customer'));

// URL'deki id'yi (her zaman metin gelir) pozitif tamsayıya çevirir. "abc" ya da "-1" gibi değerler
// veritabanına hiç gitmeden "bulunamadı" olur.
function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError('SESSION_NOT_FOUND', 'Ders bulunamadı.', 404);
  }
  return id;
}

// --- Okuma --------------------------------------------------------------------------------------

router.get('/api/me/sessions', async (req, res) => {
  res.json({ sessions: await listMySessions(req.user) });
});

router.get('/api/me/credits', async (req, res) => {
  res.json({ credits: await listMyCredits(req.user) });
});

router.get('/api/sessions', async (req, res) => {
  res.json({ sessions: await listBookableSessions(req.user) });
});

// --- İşlemler -----------------------------------------------------------------------------------
// Her işlem "kim yapıyor?" bilgisini istemciden değil, oturumdan (req.user) alır. İstemci başka birinin
// id'sini gönderemez; gönderilen tek şey hangi ders üzerinde işlem yapılacağı.

// Dersi iptal et (telafi hakkı doğar).
router.post('/api/sessions/:id/cancel', async (req, res) => {
  const result = await cancelSession({ userId: req.user.id, sessionId: parseId(req.params.id) });
  res.json(result);
});

// İptali geri al.
router.post('/api/sessions/:id/undo-cancel', async (req, res) => {
  await undoCancel({ userId: req.user.id, sessionId: parseId(req.params.id) });
  res.status(204).end();
});

// "Bu ders yerine şuna gel": :id iptal edilen ders, gövdedeki toSessionId telafi dersi.
router.post('/api/sessions/:id/swap', async (req, res) => {
  const result = await swapSession({
    userId: req.user.id,
    fromSessionId: parseId(req.params.id),
    toSessionId: parseId(req.body?.toSessionId),
  });
  res.json(result);
});

// Telafi rezervasyonu yap / telafiden vazgeç. Aynı adres, farklı HTTP metodu:
// PUT "bu derste telafi kaydım olsun", DELETE "olmasın".
router.put('/api/sessions/:id/makeup', async (req, res) => {
  const result = await bookMakeup({ userId: req.user.id, sessionId: parseId(req.params.id) });
  res.json(result);
});

router.delete('/api/sessions/:id/makeup', async (req, res) => {
  const result = await cancelMakeup({ userId: req.user.id, sessionId: parseId(req.params.id) });
  res.json(result);
});

export default router;
