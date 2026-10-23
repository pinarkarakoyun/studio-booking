-- Giriş oturumları. Tarayıcıdaki cookie'de rastgele bir token durur; burada onun yalnızca
-- SHA-256 özeti (hash) saklanır. Veritabanı sızsa bile özetten token geri üretilemez,
-- yani sızan kayıtlarla kimse başkasının yerine giriş yapamaz.
CREATE TABLE user_sessions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash   text NOT NULL UNIQUE,
  user_id      bigint NOT NULL REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

-- "Bu kullanıcının tüm oturumlarını kapat" (şifre değişince, müşteri ayrılınca) için.
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
