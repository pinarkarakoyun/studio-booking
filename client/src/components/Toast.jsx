import styles from './Toast.module.css';

// Kısa bildirimin görünümü; ne zaman gösterilip kaybolacağını useToast.js yönetir.
export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <p className={`${styles.toast} ${toast.tone === 'error' ? styles.error : ''}`} role="status" aria-live="polite">
      {toast.text}
    </p>
  );
}
