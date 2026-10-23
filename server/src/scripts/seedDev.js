// Geliştirme veritabanını gerçekçi deneme verisiyle doldurur: stüdyo, gruplar, dolu sayılabilecek
// kadar üye, önümüzdeki dersler ve giriş yapılabilecek bir deneme müşterisi + yönetici.
//
// Kullanım: npm run seed:dev
//
// Buradaki şifreler sadece geliştirme bilgisayarındaki deneme hesapları içindir; gerçek bir
// stüdyoda asla kullanılmaz. Script üretim ortamında ve dolu bir veritabanında çalışmayı reddeder.
import pool from '../db/pool.js';
import { createUser } from '../services/auth.js';
import { generateSessions } from '../services/sessionGenerator.js';

// Bu dosya import edilince değil, çalıştırılınca iş yapar; o yüzden buradan bir şey dışarı açılmıyor.
const DEV_ACCOUNTS = {
  customer: { fullName: 'Ayşe Deneme', phone: '0500 000 00 01', password: 'deneme-musteri-1' },
  admin: { fullName: 'Deneme Yönetici', phone: '0500 000 00 00', password: 'deneme-yonetici-1' },
};

// Haftanın günleri: 1 = Pazartesi ... 7 = Pazar
const GROUPS = [
  { name: 'Pzt-Çar-Cum 09:00', time: '09:00', days: [1, 3, 5], capacity: 8, members: 7 },
  { name: 'Sal-Per 18:30', time: '18:30', days: [2, 4], capacity: 6, members: 6 },
  { name: 'Pzt-Çar-Cum 19:00', time: '19:00', days: [1, 3, 5], capacity: 8, members: 4 },
];

if (process.env.NODE_ENV === 'production') {
  throw new Error('seed:dev üretim ortamında çalıştırılamaz.');
}

const client = await pool.connect();
try {
  const { rowCount } = await client.query('SELECT 1 FROM studios');
  if (rowCount > 0) {
    throw new Error('Veritabanında zaten stüdyo var; deneme verisi eklenmedi.');
  }
  await client.query('BEGIN');

  const { rows: [studio] } = await client.query(
    `INSERT INTO studios (name, whatsapp_phone) VALUES ('Deneme Pilates Stüdyosu', '+905000000000') RETURNING id`,
  );
  await client.query('INSERT INTO studio_settings (studio_id) VALUES ($1)', [studio.id]);

  const { admin, customer } = DEV_ACCOUNTS;
  await createUser(
    { studioId: studio.id, role: 'admin', fullName: admin.fullName, phone: admin.phone, temporaryPassword: admin.password },
    { db: client },
  );

  let fillerNumber = 100;
  for (const [index, group] of GROUPS.entries()) {
    const { rows: [row] } = await client.query(
      `INSERT INTO groups (studio_id, name, start_time, duration_minutes, capacity)
       VALUES ($1, $2, $3, 50, $4) RETURNING id`,
      [studio.id, group.name, group.time, group.capacity],
    );
    for (const day of group.days) {
      await client.query('INSERT INTO group_days (group_id, weekday) VALUES ($1, $2)', [row.id, day]);
    }

    // Deneme müşterisi ilk grupta; diğer üyeler sadece doluluğu gerçekçi göstermek için.
    const memberIds = [];
    if (index === 0) {
      memberIds.push(await createUser(
        { studioId: studio.id, role: 'customer', fullName: customer.fullName, phone: customer.phone, temporaryPassword: customer.password },
        { db: client },
      ));
    }
    while (memberIds.length < group.members) {
      fillerNumber += 1;
      memberIds.push(await createUser(
        {
          studioId: studio.id,
          role: 'customer',
          fullName: `Üye ${fillerNumber}`,
          phone: `0500 000 0${fillerNumber}`,
          temporaryPassword: 'kullanilmayan-sifre',
        },
        { db: client },
      ));
    }
    for (const userId of memberIds) {
      await client.query(
        `INSERT INTO group_members (group_id, user_id, joined_on) VALUES ($1, $2, current_date - 60)`,
        [row.id, userId],
      );
    }
  }

  const sessions = await generateSessions({ db: client });
  await client.query('COMMIT');

  console.log(`Deneme verisi eklendi: ${GROUPS.length} grup, ${sessions} ders.`);
  console.log('Giriş bilgileri: server/src/scripts/seedDev.js içindeki DEV_ACCOUNTS.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
