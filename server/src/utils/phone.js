// Kullanıcının yazdığı telefon numarasını veritabanındaki tek biçime (E.164) çevirir.
// "0532 123 45 67", "532-123-4567", "+90 (532) 123 45 67" -> "+905321234567"
// Geçersizse null döner. Veritabanındaki users_phone_e164 kısıtı ile aynı biçim.
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;

  const hasPlus = input.trim().startsWith('+');
  // Boşluk, tire, parantez, nokta gibi her şeyi at; sadece rakamlar kalsın.
  const digits = input.replace(/\D/g, '');

  // "+" ile yazılmışsa ülke kodu zaten var: +44 7911 123456 -> +447911123456
  if (hasPlus) {
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }

  // Türkiye numaraları: 90 5321234567 / 0 5321234567 / 5321234567 (10 hane, 5 ile başlayan cep veya
  // 2-4 ile başlayan sabit hat). Stüdyonun müşterilerinin neredeyse tamamı bu biçimde yazacak.
  const national = digits.replace(/^(90|0)(?=\d{10}$)/, '');
  return /^[2-5]\d{9}$/.test(national) ? `+90${national}` : null;
}
