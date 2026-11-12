import styles from './Monogram.module.css';

// Logo yokken yuvarlağın içine yazılacak harfler, stüdyonun adından üretilir
// ("Ada Pilates", "Deneme Pilates Stüdyosu", "Ece Yoga" ...). Ad yoksa boş metin döner.
// Not: Türkçe büyük harf için toLocaleUpperCase('tr') gerekir; yoksa "i" → "I" olur, "İ" değil.
// Bu kelimeler stüdyonun kendisini değil işini anlatır; harf seçerken atlanır
// ("Ada Pilates" → "ADA", "Deneme Pilates Stüdyosu" → "D").
const GENERIC_WORDS = new Set(['pilates', 'reformer', 'yoga', 'fitness', 'stüdyo', 'stüdyosu', 'studio']);

function initials(name) {
  if (!name?.trim()) return '';
  const words = name.trim().split(/\s+/);
  const ownWords = words.filter((word) => !GENERIC_WORDS.has(word.toLocaleLowerCase('tr')));
  const picked = ownWords.length ? ownWords : words; // Ad sadece genel kelimelerden oluşuyorsa yine de bir şey yaz.
  // Tek ve kısa bir ad (Ada, Ela) markanın kendisidir: harflere bölünmeden yazılır.
  if (picked.length === 1 && picked[0].length <= 3) return picked[0].toLocaleUpperCase('tr');
  return picked
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase('tr');
}

// Stüdyonun logosu. Stüdyo ayarında logo varsa (logoUrl) onu yuvarlak olarak gösterir;
// yoksa yer tutucu olarak stüdyo adının baş harflerini. Logo dosyası koda değil stüdyo ayarına bağlı:
// her stüdyo kendi logosuyla açılır.
export default function Monogram({ size = 'large', logoUrl, name }) {
  if (logoUrl) {
    // Yanında zaten stüdyo adı yazdığı için ekran okuyucuya ayrıca okutmuyoruz (alt="").
    return <img src={logoUrl} alt="" className={`${styles.monogram} ${styles.image} ${styles[size]}`} />;
  }
  const letters = initials(name);
  return (
    <div className={`${styles.monogram} ${styles[size]} ${letters.length > 2 ? styles.word : ''}`} aria-hidden="true">
      {letters}
    </div>
  );
}
