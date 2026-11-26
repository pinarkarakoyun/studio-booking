// Telefon alanının kuralları (PhoneField). Saf fonksiyonlar: testleri server/test/phoneInput.test.js'te.
// Alanın başında sabit bir "0" durur; kullanıcı yalnızca 10 rakamı yazar, alan "(532) 123 45 67" biçimini alır.
// Sunucu her yazımı zaten çözüyor (server/src/utils/phone.js); bu kurallar yalnızca yazmayı kolaylaştırmak için.

// Yazılan ya da yapıştırılan değerden 10 rakam: baştaki ülke kodu (90) ve sıfır atılır.
// Türkiye numaraları 9 ile başlamadığı için baştaki "90" her zaman ülke kodudur: hem "+90 532…" yapıştıran hem de
// "+90"ı tuş tuş yazan aynı sonucu görür.
export function phoneDigits(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

// "5321234567" -> "(532) 123 45 67"; eksik girişte o ana kadarki kısım ("5321" -> "(532) 1").
export function formatPhoneDigits(digits) {
  if (!digits) return '';
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  let text = `(${groups[0]}`;
  if (digits.length > 3) text += `) ${groups[1]}`;
  if (digits.length > 6) text += ` ${groups[2]}`;
  if (digits.length > 8) text += ` ${groups[3]}`;
  return text;
}

// Biçimli metinde n. rakamın hemen sonrası (imleç orada kalsın diye; ortadan düzeltme yapılabilsin).
export function caretAfterDigits(formatted, count) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) seen += 1;
    if (seen === count) return i + 1;
  }
  return formatted.length;
}
