-- Stüdyonun bir dersi iptal etmesi (bayram, hocanın hastalığı). sessions.status = 'cancelled' baştan beri var;
-- eksik olan, müşteriye gösterilecek isteğe bağlı sebep ve iptalin sonucunu belirleyen ayar.
ALTER TABLE sessions ADD COLUMN cancel_reason text;

-- Stüdyo dersi iptal edince o derse gelecek düzenli üyelere otomatik telafi hakkı verilsin mi?
ALTER TABLE studio_settings ADD COLUMN credit_on_studio_cancel boolean NOT NULL DEFAULT true;
