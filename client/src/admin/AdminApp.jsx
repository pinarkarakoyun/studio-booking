import { useState } from 'react';
import Sheet from '../components/Sheet.jsx';
import SessionRosterPage from './SessionRosterPage.jsx';
import TodayPage from './TodayPage.jsx';
import styles from './Admin.module.css';

// Yönetici panelinin beş bölümü (alt çubuk). Şimdilik sadece "Bugün" hazır; diğerleri sırayla gelecek.
const TABS = [
  { id: 'today', label: 'Bugün' },
  { id: 'customers', label: 'Müşteriler' },
  { id: 'groups', label: 'Gruplar' },
  { id: 'payments', label: 'Ödemeler' },
  { id: 'settings', label: 'Ayarlar' },
];

export default function AdminApp({ user, studio, onLogout }) {
  const [tab, setTab] = useState('today');
  // "Bugün" içinde bir derse dokununca katılımcı listesi açılır.
  const [sessionId, setSessionId] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const openAccount = () => setAccountOpen(true);

  let content;
  if (tab === 'today' && sessionId) {
    content = <SessionRosterPage studio={studio} sessionId={sessionId} onBack={() => setSessionId(null)} />;
  } else if (tab === 'today') {
    content = <TodayPage user={user} studio={studio} onOpenSession={setSessionId} onOpenAccount={openAccount} />;
  } else {
    const label = TABS.find((t) => t.id === tab).label;
    content = (
      <main className={styles.page}>
        <h1 className={styles.title}>{label}</h1>
        <p className={styles.muted}>Bu bölüm hazırlanıyor.</p>
      </main>
    );
  }

  return (
    <>
      {content}

      <nav className={styles.tabBar} aria-label="Yönetici paneli">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
            aria-current={tab === item.id ? 'page' : undefined}
            onClick={() => {
              setTab(item.id);
              setSessionId(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title={user.fullName}>
        <button type="button" className={styles.sheetAction} onClick={onLogout}>
          Çıkış yap
        </button>
      </Sheet>
    </>
  );
}
