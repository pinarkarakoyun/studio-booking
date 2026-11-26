import MembershipSummary from './MembershipSummary.jsx';
import styles from './MySessionsPage.module.css';
import own from './MyMembershipPage.module.css';

// Üyeliğim: ana ekrandan taşınan üyelik bilgileri (bitiş, paket, telafi hakları, ödemeler: stüdyo ayarı açıksa)
// ve hesap işleri. Sağ üstteki ad düğmesi açar. Ana ekran derslerle başlasın diye bu bilgiler burada.
export default function MyMembershipPage({ user, data, packageModel, timeZone, onBack, onPickMakeup, onChangePassword, onLogout }) {
  return (
    <main className={styles.page}>
      <button type="button" className={own.back} onClick={onBack}>
        ‹ Derslerim
      </button>
      <h1 className={styles.title}>{packageModel ? 'Paketim' : 'Üyeliğim'}</h1>
      <p className={own.who}>{user.fullName}</p>

      {/* Bitiş tarihi her zaman; tutarlar sadece stüdyo ayarı açıksa (sunucu kapalıyken hiç göndermez, BR-37). */}
      <MembershipSummary
        membership={data.membership}
        credits={data.credits}
        packageModel={packageModel}
        timeZone={timeZone}
        onPickMakeup={onPickMakeup}
      />
      {!packageModel && !data.membership && data.credits.length === 0 && (
        <p className={styles.muted}>Üyelik bilgin henüz girilmemiş. Sorun olursa stüdyoya yaz.</p>
      )}

      <h2 className={styles.weekLabel}>Hesap</h2>
      <div className={own.actions}>
        <button type="button" className={styles.option} onClick={onChangePassword}>
          <span className={styles.optionTitle}>Şifremi değiştir</span>
        </button>
        <button type="button" className={styles.option} onClick={onLogout}>
          <span className={styles.optionTitle}>Çıkış yap</span>
        </button>
      </div>
    </main>
  );
}
