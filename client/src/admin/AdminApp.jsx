import { useState } from 'react';
import Sheet from '../components/Sheet.jsx';
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

// Yönetici panelinin beş bölümü (alt çubuk). Hazır olmayanlar "hazırlanıyor" gösterir.
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
  // Bugün sekmesinde bakılan gün (null = bugün). Ders detayından geri dönünce aynı gün açılır.
  const [day, setDay] = useState(null);
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
        />
      ) : (
        <TodayPage
          key={day ?? 'today'}
          user={user}
          studio={studio}
          date={day}
          onChangeDate={setDay}
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
      content = <CustomersPage onOpen={(id) => goTo({ name: 'detail', id })} onAdd={() => goTo({ name: 'new' })} />;
    }
  } else if (tab === 'groups') {
    if (view.name === 'detail') {
      content = (
        <GroupDetailPage
          groupId={view.id}
          initialNotice={view.notice}
          onBack={() => goTo(START)}
          onEdit={(group) => goTo({ name: 'edit', group })}
          onOpenCustomer={openCustomer}
        />
      );
    } else if (view.name === 'edit' || view.name === 'new') {
      content = (
        <GroupFormPage
          studio={studio}
          group={view.group}
          onCancel={() => goTo(view.group ? { name: 'detail', id: view.group.id } : START)}
          onSaved={(id, notice) => goTo({ name: 'detail', id, notice })}
        />
      );
    } else {
      content = <GroupsPage onOpen={(id) => goTo({ name: 'detail', id })} onAdd={() => goTo({ name: 'new' })} />;
    }
  } else if (tab === 'payments') {
    content = <PaymentsPage onOpenCustomer={openCustomer} />;
  } else if (tab === 'settings') {
    content = <SettingsPage onStudioChange={onStudioChange} />;
  } else {
    content = (
      <main className={styles.page}>
        <h1 className={styles.title}>{TABS.find((t) => t.id === tab).label}</h1>
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
              setView(START);
              setDay(null);
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
