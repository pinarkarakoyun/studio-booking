import { useEffect, useState } from 'react';
import { api } from '../api.js';
import styles from './PrivacyPage.module.css';

export const PRIVACY_PATH = '/aydinlatma';

// KVKK aydınlatma metni. Metni veri sorumlusu olan stüdyo belirler; marka klasöründeki site.json'dan gelir
// (privacyNotice). Paragraflar boş satırla ayrılır. Metin yoksa sayfa bunu açıkça söyler, uydurmaz.
export default function PrivacyPage() {
  const [site, setSite] = useState(null);

  useEffect(() => {
    api('/api/site').then(({ site: data }) => setSite(data), () => setSite({}));
  }, []);

  useEffect(() => {
    document.title = site?.studioName ? `Aydınlatma metni · ${site.studioName}` : 'Aydınlatma metni';
  }, [site]);

  if (!site) return null;
  const notice = site.privacyNotice;

  return (
    <main className={styles.page}>
      <a className={styles.back} href="/">
        ← {site.studioName ?? 'Ana sayfa'}
      </a>
      <h1 className={styles.title}>Kişisel verilerin korunması hakkında aydınlatma metni</h1>
      {notice ? (
        <>
          {notice.updatedOn && <p className={styles.muted}>Son güncelleme: {formatDate(notice.updatedOn)}</p>}
          {notice.sections.map((section) => (
            <section key={section.title} className={styles.section}>
              <h2>{section.title}</h2>
              {section.text.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </section>
          ))}
        </>
      ) : (
        <p>Aydınlatma metni henüz eklenmedi. Sorularınız için stüdyoyla iletişime geçebilirsiniz.</p>
      )}
    </main>
  );
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}
