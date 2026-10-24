import { useState } from 'react';
import Monogram from '../components/Monogram.jsx';
import styles from './PublicSite.module.css';

const SECTIONS = [
  { id: 'neden-biz', label: 'Neden biz' },
  { id: 'isleyis', label: 'İşleyişimiz' },
  { id: 'pilates', label: 'Pilates' },
  { id: 'sss', label: 'SSS' },
  { id: 'iletisim', label: 'İletişim' },
];

// Hap şeklinde üst menü. Geniş ekranda bağlantılar görünür; telefonda menü düğmesi açılır bir liste açar.
export default function SiteNav({ logoUrl, loginPath }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className={styles.nav} aria-label="Sayfa bölümleri">
      <a href="#ust" className={styles.navLogo} aria-label="Sayfanın başına dön">
        <Monogram size="small" logoUrl={logoUrl} />
      </a>
      <ul className={`${styles.navLinks} ${open ? styles.navOpen : ''}`} id="site-menu">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} onClick={() => setOpen(false)}>
              {section.label}
            </a>
          </li>
        ))}
      </ul>
      <a href={loginPath} className={styles.navLogin}>
        Üye girişi
      </a>
      <button
        type="button"
        className={styles.navToggle}
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.srOnly}>{open ? 'Menüyü kapat' : 'Menüyü aç'}</span>
        <span aria-hidden="true">{open ? '×' : '≡'}</span>
      </button>
    </nav>
  );
}
