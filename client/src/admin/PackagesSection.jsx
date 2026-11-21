import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import { formatMoney, parseMoney } from '../format.js';
import styles from './Admin.module.css';

// Ayarlar'daki "Paketler" bölümü (yalnızca seans paketi modelindeki stüdyoda). Şubeler bölümüyle aynı düzen:
// her işlem hemen kaydedilir, paket silinmez kapatılır. Kapalı paket yeni satışta çıkmaz; satılmış paketler sürer.
// Görünüm geçici: arayüz yenilenirken (yol haritası 4. adım) yeni tasarıma geçecek.

const EMPTY = { name: '', sessionCount: '', price: '', validityDays: '' };

// Sunucunun hata kodu -> hatanın gösterileceği alan.
const FIELD_FOR_CODE = {
  INVALID_PACKAGE_NAME: 'name',
  INVALID_SESSION_COUNT: 'sessionCount',
  INVALID_PRICE: 'price',
  INVALID_VALIDITY_DAYS: 'validityDays',
};

// Kutudaki metin -> sayı; boşsa null (sunucu nedenini söyleyerek reddeder).
const toNumber = (text) => (text.trim() === '' ? null : Number(text));

export default function PackagesSection() {
  const [packages, setPackages] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | düzenlenen paketin id'si
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/admin/packages').then(
      ({ packages: list }) => setPackages(list),
      (err) => setErrors({ form: err.message }),
    );
  }, []);

  function startEdit(pkg) {
    setEditing(pkg ? pkg.id : 'new');
    setDraft(
      pkg
        ? {
            name: pkg.name,
            sessionCount: String(pkg.sessionCount),
            price: String(pkg.priceKurus / 100).replace('.', ','),
            validityDays: String(pkg.validityDays),
          }
        : EMPTY,
    );
    setErrors({});
  }

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null, form: null }));
  }

  async function run(work) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setErrors({ [FIELD_FOR_CODE[err.code] ?? 'form']: err.message });
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const priceKurus = parseMoney(draft.price);
    if (priceKurus === null) {
      setErrors({ price: 'Fiyatı yaz, ör. 2.400' });
      return;
    }
    const body = {
      name: draft.name,
      sessionCount: toNumber(draft.sessionCount),
      priceKurus,
      validityDays: toNumber(draft.validityDays),
    };
    run(async () => {
      if (editing === 'new') await api('/api/admin/packages', { method: 'POST', body });
      else await api(`/api/admin/packages/${editing}`, { method: 'PUT', body });
      const { packages: list } = await api('/api/admin/packages');
      setPackages(list);
      setEditing(null);
    });
  }

  function setActive(pkg, active) {
    run(async () => {
      const { packages: list } = await api(`/api/admin/packages/${pkg.id}/${active ? 'reopen' : 'close'}`, {
        method: 'POST',
      });
      setPackages(list);
      setEditing(null);
    });
  }

  if (!packages) {
    return (
      <section>
        <h2 className={styles.settingSection}>Paketler</h2>
        <p className={styles.muted}>{errors.form ?? 'Yükleniyor…'}</p>
      </section>
    );
  }

  const current = packages.find((pkg) => pkg.id === editing);

  return (
    <section>
      <h2 className={styles.settingSection}>Paketler</h2>
      <p className={styles.muted}>
        Müşteriye paket eklerken bu listeden seçersin. Fiyat değişikliği satılmış paketleri etkilemez.
      </p>

      {/* Prototipteki paket kartları: serif ad, serif fiyat, seans ve geçerlilik; kapalı pakette "Kapalı" rozeti. Karta dokununca düzenlenir.
          "Aktif üye" sayısı katalog verisinde yok, o yüzden kartta da yok. */}
      <ul className={styles.packageGrid}>
        {packages.map((pkg) => (
          <li key={pkg.id}>
            <button
              type="button"
              className={`${styles.packageCard} ${pkg.isActive ? '' : styles.packageClosed}`}
              onClick={() => startEdit(pkg)}
            >
              {!pkg.isActive && <span className={styles.packageBadge}>Kapalı</span>}
              <span className={styles.packageName}>{pkg.name}</span>
              <span className={styles.packagePrice}>{formatMoney(pkg.priceKurus)}</span>
              <span className={styles.muted}>
                {pkg.sessionCount} seans · Geçerlilik: {pkg.validityDays} gün
              </span>
            </button>
          </li>
        ))}
        {editing === null && (
          <li>
            <button type="button" className={styles.packageAdd} onClick={() => startEdit(null)}>
              + Yeni paket tanımla
            </button>
          </li>
        )}
      </ul>

      {editing !== null && (
        <form className={styles.formCard} onSubmit={save} noValidate>
          <TextField
            label="Paket adı"
            placeholder="ör. 8 seans"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            error={errors.name}
          />
          <TextField
            label="Seans sayısı"
            type="number"
            inputMode="numeric"
            min="1"
            max="200"
            value={draft.sessionCount}
            onChange={(e) => set('sessionCount', e.target.value)}
            error={errors.sessionCount}
          />
          <TextField
            label="Fiyat (₺)"
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => set('price', e.target.value)}
            error={errors.price}
          />
          <TextField
            label="Geçerlilik (gün)"
            type="number"
            inputMode="numeric"
            min="1"
            max="365"
            value={draft.validityDays}
            onChange={(e) => set('validityDays', e.target.value)}
            error={errors.validityDays}
            hint="Başlangıç gününden itibaren. Bu sürede kullanılmayan seanslar yanar."
          />
          {errors.form && <p className={styles.formError}>{errors.form}</p>}
          <div className={styles.formSubmit}>
            <Button size="lg" type="submit" busy={busy} busyLabel="Kaydediliyor…">
              {editing === 'new' ? 'Paketi ekle' : 'Paketi kaydet'}
            </Button>
          </div>
          <p>
            <button type="button" className={styles.inlineButton} onClick={() => setEditing(null)}>
              Vazgeç
            </button>
            {current && (
              <>
                {' · '}
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={() => setActive(current, !current.isActive)}
                >
                  {current.isActive ? 'Paketi kapat' : 'Paketi yeniden aç'}
                </button>
              </>
            )}
          </p>
        </form>
      )}
    </section>
  );
}
