import styles from './Button.module.css';

// variant="primary": sayfadaki tek ana eylem (pembe). Ekranda birden fazla pembe buton olmamalı.
// busy: istek sürerken buton metni değişir ve ikinci tıklama engellenir (aynı isteği iki kez göndermesin).
export default function Button({ variant = 'primary', busy = false, busyLabel, children, ...props }) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}`}
      disabled={busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
