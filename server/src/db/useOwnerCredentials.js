// Migration gibi tablo yapısını değiştiren işler, uygulamanın kendi rolüyle değil tablo sahibi rolle çalışır.
// Uygulamanın rolü (DB_USER) yalnızca okuyup yazabilir; tablo oluşturamaz, silemez (bkz. db/roles/app-role.sql).
// DB_OWNER_USER verilmişse bağlantı bilgileri onunla değiştirilir. Bu dosya pool.js'ten ÖNCE import edilmeli:
// pool, ortam değişkenlerini yüklendiği anda okur.
import 'dotenv/config';

if (process.env.DB_OWNER_USER) {
  process.env.DB_USER = process.env.DB_OWNER_USER;
  process.env.DB_PASSWORD = process.env.DB_OWNER_PASSWORD ?? '';
}
