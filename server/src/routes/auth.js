import { Router } from 'express';
import { cookieOptions, requireAuth, SESSION_COOKIE, setSessionCookie } from '../middleware/auth.js';
import { changePassword, login, revokeSession } from '../services/auth.js';

const router = Router();

// İstemciye sadece ihtiyacı olan alanlar gider (şifre hash'i, oturum id'si gibi şeyler asla).
function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    role: user.role,
    mustChangePassword: user.must_change_password,
    // Eğitmen ekranı menüsünü buna göre kurar. Yalnızca kolaylık: asıl karar sunucudaki koruyucularda.
    ...(user.role === 'instructor' ? { permissions: user.permissions, branches: user.branches } : {}),
  };
}

router.post('/api/auth/login', async (req, res) => {
  // req.studio burada her zaman dolu: /api altındaki bu uç requireStudio'dan sonra gelir (app.js).
  const { token, user } = await login({ studioId: req.studio.id, phone: req.body?.phone, password: req.body?.password });
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

router.post('/api/auth/logout', async (req, res) => {
  await revokeSession(req.sessionToken);
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
});

// Ekran açılınca "kim giriş yapmış?" sorusu. Geçici şifreli kullanıcı da görebilmeli ki
// ekran onu şifre değiştirme sayfasına yönlendirebilsin.
router.get('/api/auth/me', requireAuth({ allowPendingPasswordChange: true }), (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post(
  '/api/auth/change-password',
  requireAuth({ allowPendingPasswordChange: true }),
  async (req, res) => {
    await changePassword({
      userId: req.user.id,
      sessionId: req.user.session_id,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword,
    });
    res.status(204).end();
  },
);

export default router;
