import { useId, useState } from 'react';
import styles from './TextField.module.css';

// Etiketli metin alanı. Hata mesajı alanın hemen altında gösterilir ve ekran okuyucuya
// aria-describedby ile bağlanır. type="password" ise "Göster / Gizle" düğmesi eklenir.
// prefix: alanın solunda silinemeyen kısa metin (telefon alanındaki "0"). Ekran okuyucu onu etiketle birlikte okur.
export default function TextField({ label, type = 'text', error, hint, prefix, children, ...inputProps }) {
  const id = useId();
  const messageId = `${id}-message`;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const message = error || hint;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={`${styles.control} ${error ? styles.invalid : ''}`}>
        {prefix && (
          <span className={styles.prefix} aria-hidden="true">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={isPassword && revealed ? 'text' : type}
          className={`${styles.input} ${prefix ? styles.afterPrefix : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.reveal}
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
          >
            {revealed ? 'Gizle' : 'Göster'}
          </button>
        )}
      </div>
      {children}
      {message && (
        <p id={messageId} className={error ? styles.error : styles.hint}>
          {message}
        </p>
      )}
    </div>
  );
}
