import cookieParser from 'cookie-parser';
import express from 'express';
import { AppError } from './errors.js';
import { loadUser } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';

// Uygulama burada kuruluyor ama dinlemeye (listen) başlamıyor. Böylece testler uygulamayı
// rastgele bir portta kendileri başlatabiliyor; index.js ise gerçek sunucuyu başlatıyor.
export function createApp() {
  const app = express();
  // Gelen isteklerin JSON gövdesini çözüp req.body içine koyar.
  app.use(express.json());
  // Cookie başlığını çözüp req.cookies içine koyar.
  app.use(cookieParser());
  app.use(loadUser);

  app.use(healthRouter);
  app.use(authRouter);

  // Hata yakalayıcı: 4 parametreli olduğu için Express bunu hata middleware'i olarak tanır.
  // Express 5'te async route'lardaki hatalar da otomatik buraya gelir.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    }
    // Bozuk JSON gibi istemci kaynaklı hatalar (body-parser 4xx status ile fırlatır).
    if (err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: 'Geçersiz istek.' } });
    }
    // Beklenmeyen hata: ayrıntı sadece logda, istemciye genel mesaj (health.js'teki ilke).
    console.error(err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu.' } });
  });

  return app;
}
