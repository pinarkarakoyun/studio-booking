import pg from 'pg';

// pg bir CommonJS paketi; Pool sınıfını default export içinden alıyoruz.
const { Pool } = pg;

// Pool: her sorguda yeni bağlantı açmak yerine hazır bağlantıları tekrar kullanır.
const pool = new Pool({
  host: process.env.DB_HOST,
  // Ortam değişkenleri her zaman string gelir; portu sayıya çeviriyoruz.
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export default pool;
