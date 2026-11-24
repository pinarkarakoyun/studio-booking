// Bu import en üstte olmalı: diğer modüller (ör. pool.js) yüklenmeden önce .env okunur.
import 'dotenv/config';
import { createApp } from './app.js';
import pool from './db/pool.js';
import { startServer } from './listen.js';
import { DEFAULT_HOST } from './network.js';
import { generateSessions } from './services/sessionGenerator.js';
import { checkStartup } from './startupChecks.js';

// Önce yapılandırma kontrolü: üretimde güvensiz bir ayar varsa sunucu açılmaz (bkz. startupChecks.js).
const { problems, warnings } = await checkStartup({ db: pool });
for (const warning of warnings) console.warn(`Uyarı: ${warning}`);
if (problems.length > 0) {
  console.error('Sunucu başlatılmadı:');
  for (const problem of problems) console.error(`- ${problem}`);
  await pool.end();
  process.exit(1);
}

const app = createApp();

// PORT tanımlı değilse 3000 kullanılır. HOST tanımlı değilse yalnızca bu makineden bağlanılır (bkz. network.js).
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || DEFAULT_HOST;

// Port alınamazsa (ör. başka bir sunucu zaten 3000'de) açıkça söyleyip kapanır; sessizce açık kalmaz (bkz. listen.js).
try {
  await startServer(app, PORT, HOST);
  console.log(`Server running at http://${HOST}:${PORT} (${process.env.NODE_ENV})`);
} catch (err) {
  console.error(
    err.code === 'EADDRINUSE'
      ? `Sunucu başlatılmadı: ${HOST}:${PORT} zaten kullanımda. Başka bir sunucu açık olabilir; onu kapatıp yeniden dene.`
      : `Sunucu başlatılmadı: ${err.message}`,
  );
  await pool.end();
  process.exit(1);
}

// Ders üretimini açılışta ve sonra günde bir kez çalıştırıyoruz; pencere her gün bir gün ileri kayar.
// İşlem idempotent olduğu için fazladan çalışması zararsız, sunucu yeniden başlarsa da eksik kalmaz.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function runSessionGeneration() {
  try {
    const created = await generateSessions();
    console.log(`Session generation: ${created} new session(s).`);
  } catch (err) {
    // Üretim başarısız olsa bile sunucu çalışmaya devam etmeli; bir sonraki denemede tamamlanır.
    console.error('Session generation failed:', err);
  }
}

runSessionGeneration();
setInterval(runSessionGeneration, ONE_DAY_MS);
