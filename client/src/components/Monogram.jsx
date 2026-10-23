import styles from './Monogram.module.css';

// Stüdyonun logosu. Stüdyo ayarında logo varsa (logoUrl) onu yuvarlak olarak gösterir;
// yoksa yer tutucu olarak "İN" monogramını. Logo dosyası koda değil stüdyo ayarına bağlı:
// her stüdyo kendi logosuyla açılır.
export default function Monogram({ size = 'large', logoUrl }) {
  if (logoUrl) {
    // Yanında zaten stüdyo adı yazdığı için ekran okuyucuya ayrıca okutmuyoruz (alt="").
    return <img src={logoUrl} alt="" className={`${styles.monogram} ${styles.image} ${styles[size]}`} />;
  }
  return (
    <div className={`${styles.monogram} ${styles[size]}`} aria-hidden="true">
      İN
    </div>
  );
}
