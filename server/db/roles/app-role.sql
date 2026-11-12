-- Uygulamanın veritabanına bağlanacağı, en az yetkili rol.
-- Süper kullanıcı değildir; tablo oluşturamaz, silemez, başka veritabanına bağlanamaz. Yalnızca
-- uygulamanın ihtiyacı olan okuma/yazma yetkisi vardır. Böylece kodda bir hata olsa bile zarar sınırlı kalır.
--
-- Migration'lar ve bu dosya tablo sahibi rolle (DB_OWNER_USER) çalıştırılır. Kullanım (şifre komut
-- satırına yazılmasın diye ortam değişkeninden okunur):
--
--   read -s APP_DB_PASSWORD; export APP_DB_PASSWORD
--   psql -h HOST -U SAHIP_ROL -d VERITABANI -v app_role=studio_app -v app_password="$APP_DB_PASSWORD" -f db/roles/app-role.sql
--
-- Sonra .env'de: DB_USER=studio_app, DB_PASSWORD=<aynı şifre>, DB_OWNER_USER=<sahip rol>, DB_OWNER_PASSWORD=<...>
-- Dosya tekrar çalıştırılabilir: rol varsa şifresini günceller, yetkileri yeniden verir.

\set ON_ERROR_STOP on

SELECT format('CREATE ROLE %I LOGIN', :'app_role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec

ALTER ROLE :"app_role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD :'app_password';

-- Varsayılan olarak herkese (PUBLIC) açık olan yetkileri kapat; sadece bu veritabanına bağlanabilsin.
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_role') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app_role";

-- Var olan tablolar ve id üreticileri (identity sütunlarının sequence'leri).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";

-- Bundan sonra migration'larla (bu rolü çalıştıran sahip tarafından) eklenecek tablolar da otomatik yetki alsın.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

-- Migration kayıt tablosu yalnızca okunabilsin: uygulama hangi migration'ın uygulandığını değiştiremez.
REVOKE INSERT, UPDATE, DELETE ON schema_migrations FROM :"app_role";
