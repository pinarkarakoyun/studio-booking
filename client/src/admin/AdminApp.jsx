import { useState } from 'react';
import Sheet from '../components/Sheet.jsx';
import Toast from '../components/Toast.jsx';
import { useToast } from '../components/useToast.js';
import { formatDay } from '../format.js';
import CredentialsPage from './CredentialsPage.jsx';
import CustomerDetailPage from './CustomerDetailPage.jsx';
import CustomersPage from './CustomersPage.jsx';
import GroupDetailPage from './GroupDetailPage.jsx';
import GroupFormPage from './GroupFormPage.jsx';
import PaymentsPage from './PaymentsPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import GroupsPage from './GroupsPage.jsx';
import NewCustomerPage from './NewCustomerPage.jsx';
import SessionRosterPage from './SessionRosterPage.jsx';
import TodayPage from './TodayPage.jsx';
import styles from './Admin.module.css';

// Yönetici panelinin beş bölümü: masaüstünde yan menü, telefonda alt çubuk. Hazır olmayanlar "hazırlanıyor" gösterir.
const TABS = [
  { id: 'today', label: 'Bugün' },
  { id: 'customers', label: 'Müşteriler' },
  { id: 'groups', label: 'Gruplar' },
  { id: 'payments', label: 'Ödemeler' },
  { id: 'settings', label: 'Ayarlar' },
];

// Her sekmenin içinde hangi ekranın açık olduğu: { name, ...parametreler }.
// Sekmeye dokununca o sekmenin ilk ekranına dönülür.
const START = { name: 'start' };

export default function AdminApp({ user, studio, onStudioChange, onLogout }) {
  const [tab, setTab] = useState('today');
  const [view, setView] = useState(START);
  const [accountOpen, setAccountOpen] = useState(false);
  // Başarı mesajları tek bir yerden: alt sayfalar showToast(tone, text) çağırır, toast burada bir kez çizilir.
  const { toast, showToast } = useToast();
  // Bugün sekmesinde bakılan gün (null = bugün). Ders detayından geri dönünce aynı gün açılır.
  const [day, setDay] = useState(null);
  // "Bugün"deki şube süzgeci burada tutulur: o ekran her gün değişiminde yeniden kurulur (key), seçim kaybolmasın.
  const [branchFilter, setBranchFilter] = useState('');
  const goTo = (next) => setView(next);
  // Grup detayındaki bir üyeye dokununca Müşteriler sekmesinde o müşterinin sayfası açılır.
  const openCustomer = (id) => {
    setTab('customers');
    setView({ name: 'detail', id });
  };

  let content;
  if (tab === 'today') {
    content =
      view.name === 'session' ? (
        <SessionRosterPage
          studio={studio}
          sessionId={view.id}
          backLabel={day ? formatDay(day) : 'Bugün'}
          onBack={() => goTo(START)}
          showToast={showToast}
        />
      ) : (
        <TodayPage
          key={day ?? 'today'}
          user={user}
          studio={studio}
          date={day}
          onChangeDate={setDay}
          branchFilter={branchFilter}
          onBranchFilterChange={setBranchFilter}
          onOpenSession={(id) => goTo({ name: 'session', id })}
          onOpenAccount={() => setAccountOpen(true)}
        />
      );
  } else if (tab === 'customers') {
    if (view.name === 'detail') {
      content = (
        <CustomerDetailPage
          key={view.id}
          studio={studio}
          customerId={view.id}
          onBack={() => goTo(START)}
          showToast={showToast}
          onCredentials={(credentials) => goTo({ name: 'credentials', credentials, backTo: { name: 'detail', id: view.id } })}
        />
      );
    } else if (view.name === 'new') {
      content = (
        <NewCustomerPage
          studio={studio}
          onCancel={() => goTo(START)}
          onCreated={(credentials) => goTo({ name: 'credentials', credentials, backTo: START })}
        />
      );
    } else if (view.name === 'credentials') {
      content = <CredentialsPage studio={studio} credentials={view.credentials} onDone={() => goTo(view.backTo)} />;
    } else {
      content = <CustomersPage studio={studio} onOpen={(id) => goTo({ name: 'detail', id })} onAdd={() => goTo({ name: 'new' })} />;
    }
  } else if (tab === 'groups') {
    if (view.name === 'detail') {
      content = (
        <GroupDetailPage
          studio={studio}
          groupId={view.id}
          onBack={() => goTo(START)}
          onEdit={(group) => goTo({ name: 'edit', group })}
          onOpenCustomer={openCustomer}
          showToast={showToast}
        />
      );
    } else if (view.name === 'edit' || view.name === 'new') {
      content = (
        <GroupFormPage
          studio={studio}
          onStudioChange={onStudioChange}
          group={view.group}
          onCancel={() => goTo(view.group ? { name: 'detail', id: view.group.id } : START)}
          onSaved={(id, notice) => {
            if (notice) showToast('success', notice);
            goTo({ name: 'detail', id });
          }}
        />
      );
    } else {
      content = <GroupsPage studio={studio} onOpen={(id) => goTo({ name: 'detail', id })} onAdd={() => goTo({ name: 'new' })} />;
    }
  } else if (tab === 'payments') {
    content = <PaymentsPage studio={studio} onOpenCustomer={openCustomer} />;
  } else if (tab === 'settings') {
    content = <SettingsPage onStudioChange={onStudioChange} showToast={showToast} />;
  } else {
    content = (
      <main className={styles.page}>
        <h1 className={styles.title}>{TABS.find((t) => t.id === tab).label}</h1>
        <p className={styles.muted}>Bu bölüm hazırlanıyor.</p>
      </main>
    );
  }

  // Aynı sekme düğmeleri iki yerde: masaüstünde yan menüde, telefonda alt çubukta (CSS hangisinin görüneceğini seçer).
  const tabButtons = (className, activeClassName) =>
    TABS.map((item) => (
      <button
        key={item.id}
        type="button"
        className={`${className} ${tab === item.id ? activeClassName : ''}`}
        aria-current={tab === item.id ? 'page' : undefined}
        onClick={() => {
          setTab(item.id);
          setView(START);
          setDay(null);
        }}
      >
        {item.label}
      </button>
    ));

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <span className={styles.sidebarName}>{studio.name}</span>
          <span className={styles.sidebarSub}>Yönetim</span>
        </div>
        <nav className={styles.sideNav} aria-label="Yönetici paneli">
          {tabButtons(styles.sideTab, styles.sideTabActive)}
        </nav>
        <button type="button" className={styles.sidebarAccount} onClick={() => setAccountOpen(true)}>
          {user.fullName}
        </button>
      </aside>

      <div className={styles.content}>{content}</div>

      <nav className={styles.tabBar} aria-label="Yönetici paneli">
        {tabButtons(styles.tab, styles.tabActive)}
      </nav>

      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title={user.fullName}>
        <button type="button" className={styles.sheetAction} onClick={onLogout}>
          Çıkış yap
        </button>
      </Sheet>

      <Toast toast={toast} />
    </div>
  );
}
