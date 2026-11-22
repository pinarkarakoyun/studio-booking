import { useState } from 'react';
import styles from './PublicSite.module.css';

// Fotoğraf geldiyse fotoğraf, gelmediyse ya da dosya açılamadıysa kesik çizgili yer tutucu (stüdyonun fotoğrafı
// gelince yerine oturur). shape: "arch" (üstü kemerli, girişteki), "leafShape" (bir köşesi büyük yuvarlak,
// eğitmen) ya da düz kart.
export default function PhotoSlot({ photo, label, shape, className = '' }) {
  const [failed, setFailed] = useState(false);
  const classes = `${styles.photo} ${shape ? styles[shape] : ''} ${className}`;
  if (photo?.url && !failed) {
    return <img className={classes} src={photo.url} alt={photo.alt ?? ''} loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <div className={`${classes} ${styles.photoEmpty}`} role="img" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}
