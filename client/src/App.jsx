import { useEffect, useState } from 'react';
import { api } from './api.js';
import Button from './components/Button.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MySessionsPage from './pages/MySessionsPage.jsx';
import styles from './pages/AuthPage.module.css';

// Açılışta gereken iki bilgi: stüdyo (isim, WhatsApp) ve giriş yapmış kullanıcı (yoksa null).
// Sadece veri getirir, state'e dokunmaz; sonucu bileşen kendisi işler.
async function fetchInitialData() {
  const [studioData, me] = await Promise.all([
    api('/api/studio'),
    // 401 = giriş yapılmamış; bu bir hata değil, giriş ekranını göstermek demek.
    api('/api/auth/me').catch((err) => {
      if (err.status === 401) return { user: null };
      throw err;
    }),
  ]);
  return { studio: studioData.studio, user: me.user };
}

// Hangi ekranın gösterileceğine oturum durumu karar verir (henüz sayfa yönlendirme kütüphanesi yok):
//   giriş yok                 -> Giriş
//   geçici şifreyle girilmiş  -> Yeni şifre (sunucu da başka hiçbir şeye izin vermiyor)
//   normal                    -> Derslerim
function App() {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [studio, setStudio] = useState(null);
  const [user, setUser] = useState(null);
  // Girişte yazılan şifre, sadece "yeni şifre" ekranında mevcut şifre olarak kullanılmak üzere bellekte.
  const [loginPassword, setLoginPassword] = useState(null);

  function load() {
    return fetchInitialData().then(
      (data) => {
        setStudio(data.studio);
        setUser(data.user);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sadece açılışta bir kez
  }, []);

  useEffect(() => {
    if (studio?.name) document.title = studio.name;
  }, [studio]);

  async function refreshUser() {
    const { user: fresh } = await api('/api/auth/me');
    setLoginPassword(null);
    setUser(fresh);
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setLoginPassword(null);
    setUser(null);
  }

  // İlk yükleme genelde göz açıp kapayana kadar biter; ekranı titretmemek için boş bırakıyoruz.
  if (status === 'loading') return null;

  if (status === 'error') {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Bağlantı kurulamadı</h1>
        <p className={styles.lead}>Sunucuya ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene.</p>
        <p className={styles.footer}>
          <Button
            type="button"
            onClick={() => {
              setStatus('loading');
              load();
            }}
          >
            Tekrar dene
          </Button>
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <LoginPage
        studio={studio}
        onLoggedIn={(loggedIn, password) => {
          setLoginPassword(password);
          setUser(loggedIn);
        }}
      />
    );
  }

  if (user.mustChangePassword) {
    return (
      <ChangePasswordPage
        user={user}
        currentPassword={loginPassword}
        onChanged={refreshUser}
        onLogout={logout}
      />
    );
  }

  return <MySessionsPage user={user} studio={studio} onLogout={logout} />;
}

export default App;
