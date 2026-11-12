// Bu import en üstte olmalı: diğer modüller (ör. pool.js) yüklenmeden önce .env okunur.
import 'dotenv/config';
import { createApp } from './app.js';
import pool from './db/pool.js';
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

// PORT tanımlı değilse 3000 kullanılır.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} (${process.env.NODE_ENV})`);
});

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
