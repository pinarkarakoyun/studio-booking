import { useEffect } from 'react';
import styles from './HostMessage.module.css';

// Ürünün kök adresi (BASE_DOMAIN, ör. siteadi.com): hiçbir stüdyoya ait değil. Giriş ve site stüdyonun kendi
// adresinde (ornek.siteadi.com) olduğu için burada yalnızca nereye gidileceği söylenir.
// Alan adı koda yazılmaz: ziyaretçinin bulunduğu adresten (window.location.host) gösterilir.
export default function RootPage() {
  useEffect(() => {
    document.title = 'Pilates Rezervasyon';
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Stüdyonun adresiyle gir</h1>
        <p className={styles.text}>
          Her stüdyonun kendi adresi var: <span className={styles.address}>stüdyon.{window.location.host}</span>.
          Bağlantıyı stüdyondan alabilirsin.
        </p>
      </div>
    </main>
  );
}
