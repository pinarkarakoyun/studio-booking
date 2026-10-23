import { fileURLToPath } from 'node:url';
import pool from '../db/pool.js';

// Sunum için örnek üyelik dönemleri ve ödemeler. Ödemeler sekmesinde her durumdan bir örnek görünsün:
// biten, yaklaşan, eksik ödemeli, dondurmayla uzamış, hiç girilmemiş.
// Tek başına (`npm run seed:payments`, var olan demo stüdyosuna) ya da seed:dev'in sonunda çalışır.
// Stüdyoda zaten üyelik dönemi varsa hiçbir şey eklemez; iki kez çalıştırmak zarar vermez.

// Örnek fiyatlar (kuruş): uzun kayıtta aylık fiyat düşer, yönetici her dönemin ücretini elle yazar.
const FEE = { 1: 350000, 2: 600000, 3: 900000 };
const LENGTH_DAYS = { 1: 30, 2: 60, 3: 90 };
const METHODS = ['transfer', 'cash', 'card'];

// Bugüne göre gün farkıyla dönemler. paid: ücretin ne kadarı, hangi gün (başlangıca göre) ödendi.
const SCENARIOS = [
  { label: 'yaklaşan, önceki dönemi de var', periods: [{ start: -57, months: 1 }, { start: -27, months: 1 }] }, // 2 gün kaldı
  { label: 'yaklaşan, 2 aylık', periods: [{ start: -54, months: 2 }] }, // 5 gün kaldı
  { label: 'yaklaşan, 3 aylık', periods: [{ start: -82, months: 3 }] }, // 7 gün kaldı
  { label: 'bitti, 3 gün önce', periods: [{ start: -32, months: 1 }] },
  { label: 'bitti, 8 gün önce', periods: [{ start: -37, months: 1 }] },
  { label: 'eksik, havale taksit', periods: [{ start: -20, months: 3, paid: [[0, 450000, 'transfer']] }] },
  { label: 'eksik, nakit taksit', periods: [{ start: -5, months: 3, paid: [[0, 300000, 'cash']] }] },
  { label: 'dönemi girilmemiş', periods: [] },
];

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function seedDemoPayments(db, studioId) {
  const { rows: [existing] } = await db.query(
    `SELECT COUNT(*)::int AS n FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.studio_id = $1`,
    [studioId],
  );
  if (existing.n > 0) return { added: 0, skipped: true };

  const { rows: [{ today }] } = await db.query(
    'SELECT (now() AT TIME ZONE timezone)::date AS today FROM studios WHERE id = $1',
    [studioId],
  );
  // Dondurulmuş üyeler en sona: onlara süren bir dönem düşsün, "dondurma ile N gün uzadı" görünsün.
  // Deneme müşterisi (DEV hesabı) de süren, ödenmiş bir dönem alır (müşteri ekranında bitiş tarihi için).
  const { rows: customers } = await db.query(
    `SELECT u.id, u.phone = '+905000000001' AS is_demo,
            EXISTS (SELECT 1 FROM freezes f WHERE f.user_id = u.id) AS has_freeze
     FROM users u WHERE u.studio_id = $1 AND u.role = 'customer' AND u.status <> 'left'
     ORDER BY is_demo, has_freeze, u.id`,
    [studioId],
  );

  let added = 0;
  async function addPeriod(userId, { start, months, paid }, index) {
    const startsOn = addDays(today, start);
    const endsOn = addDays(startsOn, LENGTH_DAYS[months] - 1);
    const { rows: [m] } = await db.query(
      'INSERT INTO memberships (user_id, starts_on, ends_on, fee_kurus) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, startsOn, endsOn, FEE[months]],
    );
    for (const [offset, amount, method] of paid ?? [[0, FEE[months], METHODS[index % METHODS.length]]]) {
      await db.query('INSERT INTO payments (membership_id, amount_kurus, paid_on, method) VALUES ($1, $2, $3, $4)', [
        m.id, amount, addDays(startsOn, offset), method,
      ]);
    }
    added += 1;
  }

  for (const [index, customer] of customers.entries()) {
    const scenario = !customer.is_demo && !customer.has_freeze ? SCENARIOS[index] : undefined;
    if (scenario) {
      for (const period of scenario.periods) await addPeriod(customer.id, period, index);
    } else {
      // Geri kalanlar: ödenmiş, süren dönemler; süreler ve bitişler farklı günlere yayılır.
      const months = (index % 3) + 1;
      await addPeriod(customer.id, { start: -((index * 7) % (LENGTH_DAYS[months] - 10)) - 1, months }, index);
    }
  }
  return { added, skipped: false };
}

// Doğrudan çalıştırıldıysa: var olan (tek) demo stüdyosuna ekle.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV === 'production') throw new Error('seed:payments üretim ortamında çalıştırılamaz.');
  const client = await pool.connect();
  try {
    const { rows: studios } = await client.query('SELECT id FROM studios ORDER BY id');
    if (studios.length !== 1) throw new Error(`Tek bir stüdyo bekleniyordu, ${studios.length} bulundu.`);
    await client.query('BEGIN');
    const result = await seedDemoPayments(client, studios[0].id);
    await client.query('COMMIT');
    console.log(result.skipped ? 'Stüdyoda zaten üyelik dönemi var; örnek ödeme eklenmedi.' : `${result.added} örnek üyelik dönemi eklendi.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
