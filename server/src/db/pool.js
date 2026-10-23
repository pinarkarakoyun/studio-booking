// Pool, .env'deki bağlantı bilgilerine ihtiyaç duyan modül; .env'i kendisi yükler.
// Böylece pool'u hangi dosya (sunucu, migrate, test) önce import ederse etsin ayarlar hazır olur.
import 'dotenv/config';
import pg from 'pg';

// pg bir CommonJS paketi; Pool sınıfını default export içinden alıyoruz.
const { Pool, types } = pg;

// PostgreSQL'in DATE tipi (OID 1082) saatsiz bir takvim günüdür ("2026-10-26").
// pg varsayılan olarak onu sunucunun yerel gece yarısında bir JS Date'e çevirir; Date UTC'ye
// çevrilince (ör. JSON'a yazılırken) Türkiye'de bir gün geriye kayar ("2026-10-25T21:00Z").
// Bu yüzden tarihleri olduğu gibi metin olarak alıyoruz.
types.setTypeParser(1082, (value) => value);

// bigint (OID 20): id'lerimiz ve count() sonuçları. pg bunları varsayılan olarak metin ("1") getirir,
// çünkü JS sayıları 2^53'ten büyük tamsayıları kayıpsız tutamaz. Bizim değerlerimiz o kadar büyümez;
// sayıya çeviriyoruz ama büyürse sessizce yanlış sayı üretmek yerine hata veriyoruz.
types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`bigint value ${value} does not fit in a JavaScript number`);
  }
  return number;
});

// Pool: her sorguda yeni bağlantı açmak yerine hazır bağlantıları tekrar kullanır.
const pool = new Pool({
  host: process.env.DB_HOST,
  // Ortam değişkenleri her zaman string gelir; portu sayıya çeviriyoruz.
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Boştaki bir bağlantıda hata olursa (ör. veritabanı yeniden başlarsa) pool 'error' olayı yayar;
// dinleyici olmazsa bu yakalanmamış hata Node sürecini çökertir.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

export default pool;
