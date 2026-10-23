import { useState } from 'react';
import Button from '../components/Button.jsx';
import { formatPhone } from '../format.js';
import styles from './Admin.module.css';

// Yeni müşteri ya da şifre sıfırlama sonrası: geçici şifre burada BİR KEZ gösterilir (sunucuda sadece hash'i var).
// Yönetici şifreyi yazmaz, ezberlemez: tek dokunuşla WhatsApp'tan hazır mesaj olarak gönderir.
export default function CredentialsPage({ studio, credentials, onDone }) {
  const [copied, setCopied] = useState(false);
  const { fullName, phone, temporaryPassword } = credentials;
  const firstName = fullName.split(' ')[0];
  const displayPhone = formatPhone(phone.startsWith('+') ? phone : normalizeForDisplay(phone));

  const message = [
    `Merhaba ${firstName},`,
    `${studio.name} uygulamasına giriş bilgilerin:`,
    `Telefon: ${displayPhone}`,
    `Geçici şifre: ${temporaryPassword}`,
    'İlk girişte kendi şifreni belirleyeceksin.',
    window.location.origin,
  ].join('\n');
  const digits = displayPhone.replace(/\D/g, '').replace(/^0/, '90');
  const whatsapp = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.rosterTitle}>{firstName} için giriş bilgileri</h1>
      {/* İsme ek yapıştırmıyoruz ("Nazlı'ya" ama "Elif'e"): cümle eksiz kuruldu. */}
      <p className={styles.subtitle}>Bu bilgileri {firstName} ile paylaş. İlk girişte kendi şifresini belirleyecek.</p>

      <dl className={styles.credentials}>
        <dt>Telefon</dt>
        <dd>{displayPhone}</dd>
        <dt>Geçici şifre</dt>
        <dd className={styles.password}>{temporaryPassword}</dd>
      </dl>

      <a className={styles.whatsappButton} href={whatsapp} target="_blank" rel="noreferrer">
        WhatsApp'tan gönder
      </a>
      <Button variant="quiet" type="button" onClick={copy}>
        {copied ? 'Kopyalandı' : 'Şifreyi kopyala'}
      </Button>

      <p className={styles.fineprint}>
        Bu şifre bir daha gösterilmeyecek. Kaybolursa "Şifresini sıfırla" ile yenisi verilir.
      </p>
      <Button variant="quiet" type="button" onClick={onDone}>
        Tamam
      </Button>
    </main>
  );
}

// Formda yazılan "0533 444 55 66" gibi numarayı gösterim için +90 biçimine getirir.
function normalizeForDisplay(phone) {
  const digits = phone.replace(/\D/g, '').replace(/^(90|0)(?=\d{10}$)/, '');
  return digits.length === 10 ? `+90${digits}` : phone;
}
