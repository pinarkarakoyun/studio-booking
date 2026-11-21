import styles from './Button.module.css';

// variant: "primary" sayfadaki ana eylem (ana renk, ekranda bir tane olmalı); "secondary" çerçeveli ikinci seçenek;
// "danger" geri alınamayan ya da kayıp doğuran eylem (geç iptal gibi); "quiet" (ya da "text") yalnızca yazı.
// size="lg": önemli eylemlerde 48px yükseklik (alttan açılan onay pencereleri gibi).
// busy: istek sürerken buton metni değişir ve ikinci tıklama engellenir (aynı isteği iki kez göndermesin).
export default function Button({ variant = 'primary', size = 'md', busy = false, busyLabel, children, ...props }) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${size === 'lg' ? styles.lg : ''}`}
      disabled={busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
