import { useState } from 'react';
import Monogram from '../components/Monogram.jsx';
import { LOGIN_PATH } from './siteParts.js';
import styles from './PublicSite.module.css';

// Üst menü (prototip): solda logo ve stüdyo adı, sağda yalnızca sayfada görünen bölümlerin bağlantıları ve
// "Üye Girişi" hapı. Telefonda bağlantılar menü düğmesiyle açılır.
export default function SiteNav({ logoUrl, studioName, sections }) {
  const [open, setOpen] = useState(false);
  const links = sections.filter((section) => section.label);
  return (
    <header className={styles.navBar}>
      <nav className={styles.nav} aria-label="Sayfa bölümleri">
        <a href="#ust" className={styles.navBrand} aria-label="Sayfanın başına dön">
          <Monogram size="small" logoUrl={logoUrl} name={studioName} />
          {studioName && <span className={styles.navName}>{studioName}</span>}
        </a>
        <ul className={`${styles.navLinks} ${open ? styles.navOpen : ''}`} id="site-menu">
          {links.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} onClick={() => setOpen(false)}>
                {section.label}
              </a>
            </li>
          ))}
        </ul>
        <a href={LOGIN_PATH} className={styles.navLogin}>
          Üye Girişi
        </a>
        {links.length > 0 && (
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
        )}
      </nav>
    </header>
  );
}
