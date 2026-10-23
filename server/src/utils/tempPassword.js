import { randomInt } from 'node:crypto';

// Geçici şifre: iki kelime + iki basamaklı sayı, ör. "kiraz-deniz-47".
// Telefonda yazması ve WhatsApp'tan okuyup girmesi kolay olsun diye okunur kelimeler seçildi; hepsi
// Türkçe karaktersiz (ı, ş, ğ, ü, ö, ç bazı klavyelerde ve şifre alanlarında sorun çıkarır).
// Güç: 40 x 40 x 90 = 144.000 olasılık. Uzun süreli bir şifre için zayıf, ama bu şifre sadece ilk giriş
// içindir, ilk girişte değiştirilmek zorundadır ve 15 dakikada 5 hatalı deneme sınırı tahmini pratikte
// imkânsız kılar (tek bir telefon için 144.000 / 5 x 15 dk ≈ 300 gün).
const WORDS = [
  'badem', 'bulut', 'dalga', 'defne', 'deniz', 'elma', 'fidan', 'gonca', 'hilal', 'incir',
  'kiraz', 'lale', 'lavanta', 'limon', 'mavi', 'mercan', 'nane', 'nar', 'nehir', 'orman',
  'papatya', 'pembe', 'reyhan', 'sahil', 'sedef', 'safran', 'tarih', 'yaprak', 'yonca', 'zeytin',
  'akasya', 'ayva', 'bahar', 'damla', 'ekin', 'filiz', 'kumsal', 'kekik', 'palmiye', 'umut',
];

export function generateTemporaryPassword() {
  const first = WORDS[randomInt(WORDS.length)];
  let second = WORDS[randomInt(WORDS.length)];
  while (second === first) second = WORDS[randomInt(WORDS.length)];
  return `${first}-${second}-${randomInt(10, 100)}`;
}
