import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppError } from './errors.js';
import { loadUser } from './middleware/auth.js';
import { createRateLimiters, DEFAULT_RATE_LIMITS } from './middleware/rateLimits.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import sessionsRouter from './routes/sessions.js';
import studioRouter from './routes/studio.js';

// TRUST_PROXY: uygulama bir ters vekil sunucunun (Caddy, Nginx) arkasındaysa, gerçek ziyaretçi IP'sini
// X-Forwarded-For başlığından okumak için. Ayarlanmazsa IP sınırları herkesi proxy'nin IP'si sanır.
// Örnekler: "1" (önünde tek proxy var), "loopback" (proxy aynı makinede). Boşsa kapalı.
function trustProxySetting(value) {
  if (!value) return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

// Uygulama burada kuruluyor ama dinlemeye (listen) başlamıyor. Böylece testler uygulamayı
// rastgele bir portta kendileri başlatabiliyor; index.js ise gerçek sunucuyu başlatıyor.
// rateLimits: testler kendi sınırlarını verir (aynı IP'den yüzlerce istek atıyorlar).
export function createApp({ rateLimits = DEFAULT_RATE_LIMITS } = {}) {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));

  // Güvenlik başlıkları. CSP: sayfa yalnızca kendi adresinden script, stil, yazı tipi ve görsel yükler;
  // başka bir sitenin içine çerçeveyle gömülemez (clickjacking). HSTS: tarayıcı bu adrese bir daha
  // yalnızca HTTPS ile gelir. X-Powered-By kaldırılır (sunucu hangi yazılım olduğunu söylemez).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'"],
          // Geliştirmede localhost HTTP: HTTPS'e yükseltme isteği orada işleri bozar.
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  const limiters = createRateLimiters(rateLimits);
  app.use('/api', limiters.api);
  app.post('/api/auth/login', limiters.login);

  // Gelen isteklerin JSON gövdesini çözüp req.body içine koyar (varsayılan sınır 100 KB).
  app.use(express.json());
  // Cookie başlığını çözüp req.cookies içine koyar.
  app.use(cookieParser());
  app.use(loadUser);

  // Stüdyonun marka dosyaları (logo vb.) repo dışındaki bir klasörden sunulur: gerçek stüdyonun markası
  // koda girmez, her kurulum kendi klasörünü BRAND_DIR ile gösterir. studios.logo_url "/brand/logo.png" gibi
  // bu adrese işaret eder. Klasördeki HER dosya herkese açıktır: oraya yalnızca sitede görünecek dosyalar
  // konmalı (demo verisi, notlar vb. başka bir yerde durmalı).
  if (process.env.BRAND_DIR) {
    app.use('/brand', express.static(process.env.BRAND_DIR, { maxAge: '1d', fallthrough: false }));
  }

  app.use(healthRouter);
  app.use(studioRouter);
  app.use(authRouter);
  app.use(sessionsRouter);
  app.use(adminRouter);

  // Bilinmeyen bir API adresi HTML sayfası değil JSON hata alsın (aşağıdaki React yönlendirmesine düşmesin).
  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } });
  });

  // Üretimde derlenmiş React uygulaması da buradan sunulur (CLIENT_DIR, ör. ../client/dist): site ve API
  // aynı adreste olur, cookie'ler ve CSP basit kalır, CORS gerekmez. /giris gibi adresler React'te
  // çözüldüğü için bilinmeyen her GET isteğine index.html döner.
  const clientDir = process.env.CLIENT_DIR && path.resolve(process.env.CLIENT_DIR);
  if (clientDir && existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

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
