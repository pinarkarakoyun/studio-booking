import cookieParser from 'cookie-parser';
import express from 'express';
import { AppError } from './errors.js';
import { loadUser } from './middleware/auth.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import sessionsRouter from './routes/sessions.js';
import studioRouter from './routes/studio.js';

// Uygulama burada kuruluyor ama dinlemeye (listen) başlamıyor. Böylece testler uygulamayı
// rastgele bir portta kendileri başlatabiliyor; index.js ise gerçek sunucuyu başlatıyor.
export function createApp() {
  const app = express();
  // Gelen isteklerin JSON gövdesini çözüp req.body içine koyar.
  app.use(express.json());
  // Cookie başlığını çözüp req.cookies içine koyar.
  app.use(cookieParser());
  app.use(loadUser);

  // Stüdyonun marka dosyaları (logo vb.) repo dışındaki bir klasörden sunulur: gerçek stüdyonun markası
  // koda girmez, her kurulum kendi klasörünü BRAND_DIR ile gösterir. studios.logo_url "/brand/logo.png" gibi
  // bu adrese işaret eder. İleride yönetici panelinden yükleme gelince aynı klasör kullanılabilir.
  if (process.env.BRAND_DIR) {
    app.use('/brand', express.static(process.env.BRAND_DIR, { maxAge: '1d', fallthrough: false }));
  }

  app.use(healthRouter);
  app.use(studioRouter);
  app.use(authRouter);
  app.use(sessionsRouter);
  app.use(adminRouter);

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
