import { useEffect, useId, useRef } from 'react';
import styles from './Sheet.module.css';

// Alttan açılan panel. Tarayıcının kendi <dialog> elemanı üzerine kurulu: showModal() ile açılınca
// arka plan tıklanamaz olur, klavye odağı panelin içinde kalır ve Esc ile kapanır; bunları
// kendimiz yazmak zorunda kalmıyoruz (erişilebilirlik için en güvenilir yol).
export default function Sheet({ open, onClose, title, children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby={titleId}
      onClose={onClose}
      // Panelin dışına (karartılmış alana) tıklayınca kapanır. İçerik tamamen .body'nin içinde olduğu için
      // tıklamanın hedefi <dialog>'un kendisiyse dışarıya tıklanmış demektir.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.body}>
        <div className={styles.handle} aria-hidden="true" />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {open && children}
      </div>
    </dialog>
  );
}
