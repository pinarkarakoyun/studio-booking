import { rateLimit } from 'express-rate-limit';

// IP başına istek sınırları. Telefon başına deneme sınırı (services/auth.js) tek bir hesabı korur;
// bu sınırlar ise tek bir kaynaktan gelen saldırıyı durdurur: bir numara listesinde yaygın şifreleri
// denemek (password spraying) ya da her biri ~250 ms bcrypt işi olan giriş isteğiyle işlemciyi doldurmak.
//
// Bellekte tutulur (tek sunucu için yeterli; sunucu yeniden başlarsa sıfırlanır). Proxy arkasında
// doğru IP'yi görmek için TRUST_PROXY ayarlanmalı (bkz. app.js); yoksa herkes proxy'nin IP'sinden gelir.
export const DEFAULT_RATE_LIMITS = {
  // Başarılı girişler sayılmaz: stüdyonun ortak Wi-Fi'ında aynı IP'den giren müşteriler etkilenmez.
  loginFailuresPer15Min: 20,
  // Bir telefon ekranının normal kullanımı dakikada birkaç düzine istek; bu, ondan çok yukarıda.
  apiRequestsPerMinute: 300,
};

const tooMany = (req, res) =>
  res.status(429).json({
    error: { code: 'TOO_MANY_REQUESTS', message: 'Çok fazla istek gönderildi. Biraz sonra tekrar dene.' },
  });

export function createRateLimiters(limits = DEFAULT_RATE_LIMITS) {
  return {
    login: rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: limits.loginFailuresPer15Min,
      skipSuccessfulRequests: true,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: tooMany,
    }),
    api: rateLimit({
      windowMs: 60 * 1000,
      limit: limits.apiRequestsPerMinute,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: tooMany,
    }),
  };
}
