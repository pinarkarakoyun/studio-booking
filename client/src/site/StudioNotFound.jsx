import { useEffect } from 'react';
import styles from './HostMessage.module.css';

// Adres bir stüdyoya ait değil (yanlış yazılmış ya da kayıtlı olmayan bir ad). Sunucu bu adreste hiçbir
// stüdyonun verisini döndürmez (fail closed); ekran da yalnızca adresin kontrol edilmesini ister.
export default function StudioNotFound() {
  useEffect(() => {
    document.title = 'Stüdyo bulunamadı';
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Stüdyo bulunamadı</h1>
        <p className={styles.text}>
          <span className={styles.address}>{window.location.host}</span> adresinde bir stüdyo yok. Yazımı kontrol et
          ya da stüdyondan doğru bağlantıyı iste.
        </p>
      </div>
    </main>
  );
}
