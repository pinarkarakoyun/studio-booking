// HTTP testleri için ortak yardımcılar: uygulamayı rastgele bir portta başlatır ve
// tarayıcı gibi cookie saklayan küçük bir istemci verir.
import { after, before } from 'node:test';
import { createApp } from '../src/app.js';
import { createSession } from '../src/services/auth.js';
import { SESSION_COOKIE } from '../src/middleware/auth.js';
import { pool } from './helpers.js';

let server;
let port;

// Testler stüdyoya gerçek alt alan adlarıyla gider (test-1.localhost): Node fetch özel Host başlığını
// dikkate almıyor, *.localhost adresleri ise bu makineye çözülüyor. resetDb sonrası ilk stüdyo "test-1".
const DEFAULT_HOST = 'test-1.localhost';

// Testler aynı IP'den çok sayıda istek atar; IP sınırları burada pratikte kapalı.
// Sınırların kendisi rateLimits.test.js'te küçük değerlerle sınanır.
const TEST_RATE_LIMITS = { loginFailuresPer15Min: 100000, apiRequestsPerMinute: 100000 };

// Bu dosyayı import eden test dosyası için sunucuyu açıp kapatır.
export function useServer({ rateLimits = TEST_RATE_LIMITS } = {}) {
  before(async () => {
    server = createApp({ rateLimits }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
  });
  after(() => new Promise((resolve) => server.close(resolve)));
}

export function getBaseUrl(host = DEFAULT_HOST) {
  return `http://${host}:${port}`;
}

// Set-Cookie'yi saklayıp sonraki isteklere ekleyen istemci (tarayıcının yaptığı gibi).
// host: isteğin gideceği adres (stüdyonun alt alan adı, kök için "localhost").
export function client(initialCookie = null, { host = DEFAULT_HOST } = {}) {
  let cookie = initialCookie;
  const baseUrl = getBaseUrl(host);
  return {
    async request(method, path, body) {
      const res = await fetch(baseUrl + path, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const json = res.status === 204 ? null : await res.json();
      return { status: res.status, body: json, setCookie };
    },
  };
}

// Şifre adımını atlayıp kullanıcı adına doğrudan oturum açar. İstekler kullanıcının kendi stüdyosunun
// adresine gider; böylece iki stüdyolu testlerde her kullanıcı doğru adresten konuşur.
export async function clientFor(userId) {
  const token = await createSession(userId);
  const { rows: [{ slug }] } = await pool.query(
    'SELECT st.slug FROM users u JOIN studios st ON st.id = u.studio_id WHERE u.id = $1',
    [userId],
  );
  return client(`${SESSION_COOKIE}=${token}`, { host: `${slug}.localhost` });
}
