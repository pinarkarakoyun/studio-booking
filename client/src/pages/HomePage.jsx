import Button from '../components/Button.jsx';
import Monogram from '../components/Monogram.jsx';
import styles from './AuthPage.module.css';

// Geçici: giriş akışını uçtan uca görebilmek için. "Derslerim" ekranı tasarlanınca bunun yerini alacak.
export default function HomePage({ user, onLogout }) {
  return (
    <main className={styles.page}>
      <Monogram size="small" />
      <h1 className={styles.title}>Merhaba, {user.fullName.split(' ')[0]}</h1>
      <p className={styles.lead}>Derslerin çok yakında burada olacak.</p>
      <p className={styles.footer}>
        <Button variant="quiet" type="button" onClick={onLogout}>
          Çıkış yap
        </Button>
      </p>
    </main>
  );
}
