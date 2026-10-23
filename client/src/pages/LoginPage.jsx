import { useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Monogram from '../components/Monogram.jsx';
import TextField from '../components/TextField.jsx';
import styles from './AuthPage.module.css';

// Şifresini unutan müşteri stüdyoya WhatsApp'tan hazır bir mesajla yazar; şifreyi yönetici sıfırlar (BR-21).
function forgotPasswordLink(whatsappPhone) {
  const text = encodeURIComponent('Merhaba, uygulama şifremi unuttum.');
  return `https://wa.me/${whatsappPhone.replace('+', '')}?text=${text}`;
}

export default function LoginPage({ studio, onLoggedIn }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Alan düzenlenince o alanın hata mesajı kalkar: kullanıcı düzelttiği şeyin hâlâ "hatalı" yazmasını görmesin.
  function update(setter, field) {
    return (event) => {
      setter(event.target.value);
      setErrors((current) => ({ ...current, [field]: null }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    // Boş alanları sunucuya gitmeden yakala; asıl kontroller (biçim, şifre) sunucuda.
    const missing = {
      phone: phone.trim() ? null : 'Telefon numaranı yaz.',
      password: password ? null : 'Şifreni yaz.',
    };
    if (missing.phone || missing.password) {
      setErrors(missing);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { phone, password } });
      // Şifre, ilk girişteki "yeni şifre" ekranına aktarılır (orada mevcut şifre bir daha sorulmasın).
      onLoggedIn(user, password);
    } catch (err) {
      // "Telefon veya şifre hatalı", "çok fazla deneme", "sunucuya ulaşılamıyor": hepsi şifre alanının altında.
      setErrors({ password: err.message });
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <Monogram />
        <h1 className={styles.studioName}>{studio?.name}</h1>
        <p className={styles.lead}>Derslerini görmek için giriş yap</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <TextField
          label="Telefon numarası"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0532 123 45 67"
          value={phone}
          onChange={update(setPhone, 'phone')}
          error={errors.phone}
        />
        <TextField
          label="Şifre"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={update(setPassword, 'password')}
          error={errors.password}
        />
        <Button type="submit" busy={busy} busyLabel="Giriş yapılıyor…">
          Giriş yap
        </Button>
      </form>

      <p className={styles.footer}>
        {studio?.whatsappPhone ? (
          <>
            Şifreni mi unuttun?{' '}
            <a href={forgotPasswordLink(studio.whatsappPhone)} target="_blank" rel="noreferrer">
              Stüdyoya WhatsApp'tan yaz
            </a>
          </>
        ) : (
          'Şifreni unuttuysan stüdyoya haber ver.'
        )}
      </p>
    </main>
  );
}
