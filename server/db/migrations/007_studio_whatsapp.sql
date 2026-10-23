-- Stüdyonun WhatsApp hattı: "şifremi unuttum" ve tanıtım sitesindeki iletişim butonu buraya yönlenir.
-- Koda gömülmüyor; her stüdyo kendi numarasını ayarlardan girer. Biçim users.phone ile aynı (E.164).
ALTER TABLE studios ADD COLUMN whatsapp_phone text
  CONSTRAINT studios_whatsapp_e164 CHECK (whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$');
