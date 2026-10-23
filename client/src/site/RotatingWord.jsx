import { useEffect, useState } from 'react';
import styles from './PublicSite.module.css';

const WORDS = ['Esne.', 'Güçlen.', 'Sıkılaş.', 'Nefes al.'];
const HOLD_MS = 2600;

// Girişteki dönen kelime: her kelime dar başlar, Archivo'nun genişlik ekseninde genişler (pilatesteki esneme).
// Sayfanın tek "gösterişli" öğesi. Ekran okuyucu her değişimi okumasın diye kelime aria-hidden;
// onlar için cümlenin tamamı bir kez, görünmez olarak yazılı. "Hareketi azalt" açıksa kelime sabit kalır.
export default function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let widenTimer;
    const widen = () => {
      // İki kare bekle: tarayıcı önce dar hali çizsin, sonra genişleme geçişi başlasın.
      widenTimer = requestAnimationFrame(() => requestAnimationFrame(() => setWide(true)));
    };
    widen();
    const interval = setInterval(() => {
      setWide(false);
      setIndex((i) => (i + 1) % WORDS.length);
      widen();
    }, HOLD_MS);
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(widenTimer);
    };
  }, []);

  return (
    <p className={styles.wordLine}>
      <span className={styles.srOnly}>Esne, güçlen, sıkılaş, nefes al.</span>
      <span aria-hidden="true" key={index} className={`${styles.word} ${wide ? styles.wordWide : ''}`}>
        {WORDS[index]}
      </span>
    </p>
  );
}
