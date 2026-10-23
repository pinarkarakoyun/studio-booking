// HTTP testleri için ortak yardımcılar: uygulamayı rastgele bir portta başlatır ve
// tarayıcı gibi cookie saklayan küçük bir istemci verir.
import { after, before } from 'node:test';
import { createApp } from '../src/app.js';
import { createSession } from '../src/services/auth.js';
import { SESSION_COOKIE } from '../src/middleware/auth.js';

let server;
let baseUrl;

// Bu dosyayı import eden test dosyası için sunucuyu açıp kapatır.
export function useServer() {
  before(async () => {
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://localhost:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));
}

export function getBaseUrl() {
  return baseUrl;
}

// Set-Cookie'yi saklayıp sonraki isteklere ekleyen istemci (tarayıcının yaptığı gibi).
export function client(initialCookie = null) {
  let cookie = initialCookie;
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

// Şifre adımını atlayıp kullanıcı adına doğrudan oturum açar.
export async function clientFor(userId) {
  const token = await createSession(userId);
  return client(`${SESSION_COOKIE}=${token}`);
}
