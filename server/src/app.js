import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppError } from './errors.js';
import { loadUser } from './middleware/auth.js';
import { createRateLimiters, DEFAULT_RATE_LIMITS } from './middleware/rateLimits.js';
import { requireStudio, resolveStudio } from './middleware/studio.js';
import { trustProxySetting } from './network.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import sessionsRouter from './routes/sessions.js';
import studioRouter from './routes/studio.js';

// Uygulama burada kuruluyor ama dinlemeye (listen) başlamıyor. Böylece testler uygulamayı
// rastgele bir portta kendileri başlatabiliyor; index.js ise gerçek sunucuyu başlatıyor.
// rateLimits: testler kendi sınırlarını verir (aynı IP'den yüzlerce istek atıyorlar).
export function createApp({ rateLimits = DEFAULT_RATE_LIMITS } = {}) {
  // Stüdyo adresten belirlenir (ornek.BASE_DOMAIN). Kodda varsayılan alan adı yok: eksikse sunucu açılmaz.
  if (!process.env.BASE_DOMAIN) {
    throw new Error('BASE_DOMAIN tanımlı değil (geliştirmede "localhost", üretimde ürünün alan adı). Bkz. server/.env.example.');
  }
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  // Gerçek ziyaretçi IP'si (IP sınırları için); ayrıntı network.js'te. Ayarlanmazsa herkes proxy'nin IP'si sanılır.
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
  // Önce stüdyo (adresten), sonra kullanıcı: oturum ileride stüdyoyla eşleştirilecek.
  app.use(resolveStudio);
  app.use(loadUser);

  // Stüdyonun marka dosyaları (logo vb.) repo dışındaki bir klasörden sunulur: gerçek stüdyonun markası
  // koda girmez, her stüdyonun klasörü BRAND_DIR/<slug>/. studios.logo_url "/brand/logo.png" gibi bu adrese
  // işaret eder ve isteğin geldiği stüdyonun klasöründen sunulur. Klasör yolu yalnızca veritabanındaki slug'dan
  // kurulur (biçimi CHECK ile sınırlı), istekten gelen bir değer yol oluşturmaz. Klasördeki HER dosya herkese
  // açıktır: oraya yalnızca sitede görünecek dosyalar konmalı (demo verisi, notlar vb. başka bir yerde durmalı).
  const brandHandlers = new Map();
  app.use('/brand', (req, res, next) => {
    if (!process.env.BRAND_DIR || !req.studio) {
      throw new AppError('NOT_FOUND', 'Bulunamadı.', 404);
    }
    const dir = path.join(process.env.BRAND_DIR, req.studio.slug);
    // Her klasör için tek bir static middleware'i saklıyoruz; her istekte yeniden kurmaya gerek yok.
    if (!brandHandlers.has(dir)) {
      brandHandlers.set(dir, express.static(dir, { maxAge: '1d', fallthrough: false }));
    }
    return brandHandlers.get(dir)(req, res, next);
  });

  app.use(healthRouter);
  app.use(studioRouter);
  // Bundan sonraki bütün API uçları (giriş, müşteri, yönetici) bir stüdyo adresi ister. Yalnızca /api altında:
  // kök adreste de derlenmiş React uygulaması (ürün sayfası) sunulabilmeli.
  app.use('/api', requireStudio);
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
