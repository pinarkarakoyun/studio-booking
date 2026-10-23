import { Router } from 'express';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import { changePassword, login, revokeSession, SESSION_DAYS } from '../services/auth.js';

const router = Router();

// Cookie ayarları güvenliğin büyük kısmı:
// - httpOnly: JavaScript cookie'yi okuyamaz; sayfaya kötü niyetli bir script sızsa bile token çalınamaz.
// - sameSite 'lax': başka bir siteden gönderilen POST isteklerine cookie eklenmez (CSRF koruması).
// - secure: üretimde cookie sadece HTTPS üzerinden gider (geliştirmede localhost HTTP olduğu için kapalı).
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

// İstemciye sadece ihtiyacı olan alanlar gider (şifre hash'i, oturum id'si gibi şeyler asla).
function publicUser(user) {
  return {
    id: user.id,
    fullName: user.full_name,
    role: user.role,
    mustChangePassword: user.must_change_password,
  };
}

router.post('/api/auth/login', async (req, res) => {
  const { token, user } = await login({ phone: req.body?.phone, password: req.body?.password });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 });
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
