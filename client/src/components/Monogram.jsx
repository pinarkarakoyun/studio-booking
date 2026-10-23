import styles from './Monogram.module.css';

// Stüdyonun "İN" monogramı. Gerçek logo dosyası gelince buradaki yazı bir <img> ile değişecek;
// kullanan ekranların hiçbiri değişmeyecek.
export default function Monogram({ size = 'large' }) {
  return (
    <div className={`${styles.monogram} ${styles[size]}`} aria-hidden="true">
      İN
    </div>
  );
}
