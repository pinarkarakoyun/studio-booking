// Geliştirme veritabanını gerçekçi deneme verisiyle doldurur: stüdyo, gruplar, dolu sayılabilecek
// kadar üye, önümüzdeki dersler ve giriş yapılabilecek bir deneme müşterisi + yönetici.
//
// Kullanım: ALLOW_DEMO_SEED=1 npm run seed:dev
//           ALLOW_DEMO_SEED=1 DEMO_SEED_FILE=/yol/demo-seed.json npm run seed:dev   (bir stüdyoya özel sunum verisi)
//
// DEMO_SEED_FILE verilirse stüdyo adı, renk, logo, gruplar, üye adları ve örnek ücretler o dosyadan
// gelir; verilmeyen her alan aşağıdaki varsayılanlarla dolar. Dosya repo dışında, stüdyonun marka
// klasöründe durur (gerçek stüdyo bilgisi koda girmez).
//
// Buradaki şifreler sadece geliştirme bilgisayarındaki deneme hesapları içindir; gerçek bir
// stüdyoda asla kullanılmaz. Script üretim ortamında ve dolu bir veritabanında çalışmayı reddeder.
import { readFile } from 'node:fs/promises';
import pool from '../db/pool.js';
import { createUser } from '../services/auth.js';
import { generateSessions } from '../services/sessionGenerator.js';
import { assertDemoSeedAllowed } from './demoSeedGuard.js';
import { seedDemoPayments } from './seedDemoPayments.js';

// Bu dosya import edilince değil, çalıştırılınca iş yapar; o yüzden buradan bir şey dışarı açılmıyor.
const DEV_ACCOUNTS = {
  customer: { fullName: 'Ayşe Deneme', phone: '0500 000 00 01', password: 'deneme-musteri-1' },
  admin: { fullName: 'Deneme Yönetici', phone: '0500 000 00 00', password: 'deneme-yonetici-1' },
};

assertDemoSeedAllowed('seed:dev');

const demo = process.env.DEMO_SEED_FILE ? JSON.parse(await readFile(process.env.DEMO_SEED_FILE, 'utf8')) : {};

const STUDIO = { name: 'Deneme Pilates Stüdyosu', whatsappPhone: '+905000000000', brandColor: null, logoUrl: null, ...demo.studio };

// Haftanın günleri: 1 = Pazartesi ... 7 = Pazar
const DEFAULT_GROUPS = [
  { name: 'Pzt-Çar-Cum sabah', time: '09:00', days: [1, 3, 5], capacity: 8, members: 7 },
  { name: 'Sal-Per akşam', time: '18:30', days: [2, 4], capacity: 6, members: 6 },
  { name: 'Pzt-Çar-Cum akşam', time: '19:00', days: [1, 3, 5], capacity: 8, members: 4 },
];

// Doluluğu gerçekçi göstermek için uydurma üye adları (kadınlara özel stüdyo).
const DEFAULT_MEMBER_NAMES = [
  'Elif Demir', 'Merve Şahin', 'Selin Aksoy', 'Derya Koç', 'Zeynep Kaya', 'Büşra Yıldız',
  'Gizem Arslan', 'Ece Çelik', 'Sena Öztürk', 'Damla Aydın', 'Esra Kılıç', 'Tuğba Polat',
  'Hande Kurt', 'İrem Doğan', 'Ceren Yalçın', 'Nazlı Güneş',
];

const GROUPS = demo.groups ?? DEFAULT_GROUPS;
const MEMBER_NAMES = demo.memberNames ?? DEFAULT_MEMBER_NAMES;

// Aşağıdaki "gerçekçi hareket" bölümü ilk üç grubun belirli üyelerini kullanır (sabah grubundan 4. üye
// dondurulur vb.). Eksik grupla yarıda patlayıp anlaşılmaz bir hata vermek yerine baştan söylüyoruz.
const MIN_MEMBERS = [4, 1, 2];
if (GROUPS.length < MIN_MEMBERS.length || MIN_MEMBERS.some((min, i) => GROUPS[i].members < min)) {
  throw new Error(`En az 3 grup gerekli; ilk üçünün üye sayısı en az ${MIN_MEMBERS.join(', ')} olmalı.`);
}

const client = await pool.connect();
try {
  const { rowCount } = await client.query('SELECT 1 FROM studios');
  if (rowCount > 0) {
    throw new Error('Veritabanında zaten stüdyo var; deneme verisi eklenmedi.');
  }
  await client.query('BEGIN');

  const { rows: [studio] } = await client.query(
    `INSERT INTO studios (name, whatsapp_phone, brand_color, logo_url) VALUES ($1, $2, $3, $4) RETURNING id`,
    [STUDIO.name, STUDIO.whatsappPhone, STUDIO.brandColor, STUDIO.logoUrl],
  );
  await client.query('INSERT INTO studio_settings (studio_id) VALUES ($1)', [studio.id]);

  const { admin, customer } = DEV_ACCOUNTS;
  const adminId = await createUser(
    { studioId: studio.id, role: 'admin', fullName: admin.fullName, phone: admin.phone, temporaryPassword: admin.password },
    { db: client },
  );
  // Deneme yöneticisi yeni şifre ekranına takılmasın: panel tarayıcıda hemen denenebilsin.
  // Müşteri hesabı ilk giriş akışını denemek için zorunlulukla kalır.
  await client.query('UPDATE users SET must_change_password = false WHERE id = $1', [adminId]);

  let fillerNumber = 100;
  const groupIds = [];
  const membersByGroup = [];
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
          fullName: MEMBER_NAMES[fillerNumber - 101] ?? `Üye ${fillerNumber}`,
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
    groupIds.push(row.id);
    membersByGroup.push(memberIds);
  }

  const sessions = await generateSessions({ db: client });
  // Üretici sadece gelecekteki dersleri oluşturur. Gerçek bir stüdyoda bugünün sabah dersi de (bitmiş olarak)
  // durur; panelin "Bugün" ekranı gerçekçi görünsün diye bugünün geçmiş derslerini de ekliyoruz.
  await client.query(`
    INSERT INTO sessions (group_id, date, starts_at, capacity)
    SELECT g.id, today.date, (today.date + g.start_time) AT TIME ZONE st.timezone, g.capacity
    FROM groups g
    JOIN studios st     ON st.id = g.studio_id
    JOIN group_days gd  ON gd.group_id = g.id
    CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE st.timezone)::date AS date) AS today
    WHERE gd.weekday = EXTRACT(ISODOW FROM today.date)
    ON CONFLICT (group_id, date) DO NOTHING
  `);

  // Yönetici panelinde boş bir gün görünmesin diye biraz gerçekçi hareket: iptaller, bir telafi, bir dondurma.
  // (Deneme müşterisi, kendi akışını temiz deneyebilsin diye bunların dışında.)
  const nextSession = async (groupId) =>
    (await client.query(
      'SELECT id FROM sessions WHERE group_id = $1 AND starts_at > now() ORDER BY starts_at LIMIT 1',
      [groupId],
    )).rows[0].id;
  const cancel = (userId, sessionId, usedSessionId = null) =>
    client.query(
      `INSERT INTO credits (user_id, source_session_id, used_session_id, used_at, expires_at)
       SELECT $1, s.id, $3::bigint, CASE WHEN $3::bigint IS NULL THEN NULL ELSE now() END,
              s.starts_at + interval '30 days'
       FROM sessions s WHERE s.id = $2`,
      [userId, sessionId, usedSessionId],
    );
  const [morning, tuesdayEvening, evening] = groupIds;
  const eveningNext = await nextSession(evening);
  await cancel(membersByGroup[2][1], eveningNext); // akşam grubundan biri iptal etti
  await cancel(membersByGroup[1][0], await nextSession(tuesdayEvening), eveningNext); // Sal-Per'den biri akşama telafiye geliyor
  await cancel(membersByGroup[0][2], await nextSession(morning)); // sabah grubundan biri iptal etti
  await client.query(
    `INSERT INTO freezes (user_id, starts_on, ends_on) VALUES ($1, current_date, current_date + 10)`,
    [membersByGroup[0][3]],
  );
  await seedDemoPayments(client, studio.id, { fees: demo.fees });
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
