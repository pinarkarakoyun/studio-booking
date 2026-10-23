import { useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Monogram from '../components/Monogram.jsx';
import TextField from '../components/TextField.jsx';
import styles from './AuthPage.module.css';

const MIN_LENGTH = 8; // sunucudaki MIN_PASSWORD_LENGTH ile aynı

// Çubuktaki dolu parça sayısı (0-3). Sadece yol gösterici; asıl kural sunucuda (en az 8 karakter).
function strengthOf(password) {
  if (!password) return 0;
  if (password.length < MIN_LENGTH) return 1;
  const variety = [/[a-zçğıöşü]/, /[A-ZÇĞİÖŞÜ]/, /\d/, /[^\w\sçğıöşüÇĞİÖŞÜ]/].filter((re) => re.test(password)).length;
  return password.length >= 12 || variety >= 3 ? 3 : 2;
}

const STRENGTH_HINT = ['En az 8 karakter', 'En az 8 karakter', 'Yeterli', 'Güçlü'];

// İlk girişte (veya yönetici şifreyi sıfırladıktan sonra) zorunlu ekran (BR-20).
// currentPassword: girişte yazılan geçici şifre. Sayfa yenilenmişse elimizde olmaz; o zaman sorarız.
export default function ChangePasswordPage({ user, currentPassword, onChanged, onLogout }) {
  const [temporary, setTemporary] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const needsTemporary = !currentPassword;
  const strength = strengthOf(password);
  const firstName = user.fullName.split(' ')[0];

  // Alan düzenlenince o alanın hata mesajı kalkar.
  function update(setter, field) {
    return (event) => {
      setter(event.target.value);
      setErrors((current) => ({ ...current, [field]: null }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = {
      temporary: needsTemporary && !temporary ? 'Stüdyonun verdiği geçici şifreyi yaz.' : null,
      password: password.length < MIN_LENGTH ? `Şifre en az ${MIN_LENGTH} karakter olmalı.` : null,
      repeat: password !== repeat ? 'İki şifre aynı değil.' : null,
    };
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }

    setErrors({});
    setBusy(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: currentPassword ?? temporary, newPassword: password },
      });
      await onChanged();
    } catch (err) {
      // Mevcut şifre hatalıysa ilgili alanın altında, diğer her şey yeni şifrenin altında.
      setErrors(
        err.code === 'INVALID_CURRENT_PASSWORD' ? { temporary: err.message } : { password: err.message },
      );
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <Monogram size="small" />
      <h1 className={styles.title}>Hoş geldin, {firstName}</h1>
      <p className={styles.lead}>
        Stüdyonun verdiği geçici şifreyi kendi şifrenle değiştir. Bundan sonra bununla gireceksin.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {needsTemporary && (
          <TextField
            label="Geçici şifre"
            type="password"
            autoComplete="current-password"
            value={temporary}
            onChange={update(setTemporary, 'temporary')}
            error={errors.temporary}
          />
        )}
        <TextField
          label="Yeni şifre"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={update(setPassword, 'password')}
          error={errors.password}
          hint={STRENGTH_HINT[strength]}
        >
          <div className={styles.strength} aria-hidden="true">
            {[1, 2, 3].map((level) => (
              <span key={level} className={strength >= level ? styles.filled : undefined} />
            ))}
          </div>
        </TextField>
        <TextField
          label="Yeni şifre (tekrar)"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={update(setRepeat, 'repeat')}
          error={errors.repeat}
        />
        <Button type="submit" busy={busy} busyLabel="Kaydediliyor…">
          Şifremi kaydet
        </Button>
      </form>

      <p className={styles.footer}>
        <Button variant="quiet" type="button" onClick={onLogout}>
          Bu ben değilim, çıkış yap
        </Button>
      </p>
    </main>
  );
}
