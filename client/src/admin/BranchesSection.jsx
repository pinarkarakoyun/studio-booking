import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import styles from './Admin.module.css';

// Ayarlar'daki "Şubeler" bölümü. Her işlem hemen kaydedilir; Ayarlar formunun "Kaydet"ini beklemez.
// Tek şubeli stüdyoda da görünür: ikinci şubeyi açmanın yeri burası. Şube silinmez, kapatılır.
// Görünüm geçici: arayüz yenilenirken (yol haritası 4. adım) yeni tasarıma geçecek.

const EMPTY = { name: '', address: '', mapsUrl: '' };

// Sunucunun hata kodu -> hatanın gösterileceği alan.
const FIELD_FOR_CODE = {
  INVALID_BRANCH_NAME: 'name',
  BRANCH_NAME_TAKEN: 'name',
  INVALID_BRANCH_ADDRESS: 'address',
  INVALID_MAPS_URL: 'mapsUrl',
};

// onCountChange(açık şube sayısı): Ayarlar sayfası "diğer şubelerde telafi" anahtarını buna göre gösterir.
export default function BranchesSection({ onCountChange }) {
  const [branches, setBranches] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | düzenlenen şubenin id'si
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  function show(list) {
    setBranches(list);
    onCountChange(list.filter((branch) => branch.isActive).length);
  }

  useEffect(() => {
    api('/api/admin/branches').then(({ branches: list }) => show(list), (err) => setErrors({ form: err.message }));
    // Yalnızca açılışta bir kez yüklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(branch) {
    setEditing(branch ? branch.id : 'new');
    setDraft(branch ? { name: branch.name, address: branch.address ?? '', mapsUrl: branch.mapsUrl ?? '' } : EMPTY);
    setErrors({});
  }

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null, form: null }));
  }

  // Ortak hata işleme: kod bir alana aitse alanın altında, değilse formun altında.
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
    run(async () => {
      if (editing === 'new') await api('/api/admin/branches', { method: 'POST', body: draft });
      else await api(`/api/admin/branches/${editing}`, { method: 'PUT', body: draft });
      const { branches: list } = await api('/api/admin/branches');
      show(list);
      setEditing(null);
    });
  }

  // Kapat / yeniden aç. Açık grubu olan şubede ve son açık şubede sunucu nedenini söyleyerek reddeder.
  function setActive(branch, active) {
    run(async () => {
      const { branches: list } = await api(`/api/admin/branches/${branch.id}/${active ? 'reopen' : 'close'}`, { method: 'POST' });
      show(list);
      setEditing(null);
    });
  }

  if (!branches) {
    return (
      <section>
        <h2 className={styles.settingSection}>Şubeler</h2>
        <p className={styles.muted}>{errors.form ?? 'Yükleniyor…'}</p>
      </section>
    );
  }

  const current = branches.find((branch) => branch.id === editing);

  return (
    <section>
      <h2 className={styles.settingSection}>Şubeler</h2>
      <p className={styles.muted}>Birden çok şube açınca gruplarda ve ekranlarda şube adı görünür.</p>

      <ul className={styles.list}>
        {branches.map((branch) => (
          <li key={branch.id}>
            <button
              type="button"
              className={`${styles.groupRow} ${branch.isActive ? '' : styles.inactive}`}
              onClick={() => startEdit(branch)}
            >
              <span className={styles.groupTop}>
                <strong>{branch.name}</strong>
                <span className={styles.customerMeta}>
                  {branch.isActive ? `${branch.activeGroupCount} açık grup` : 'Kapalı'}
                </span>
              </span>
              <span className={styles.customerMeta}>{branch.address ?? 'Adres yok'}</span>
            </button>
          </li>
        ))}
      </ul>

      {editing === null && (
        <button type="button" className={styles.inlineButton} onClick={() => startEdit(null)}>
          + Şube ekle
        </button>
      )}

      {editing !== null && (
        <form onSubmit={save} noValidate>
          <TextField label="Şube adı" value={draft.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <TextField
            label="Adres"
            value={draft.address}
            onChange={(e) => set('address', e.target.value)}
            error={errors.address}
            hint="Sitede “Bize ulaş” bölümünde görünür."
          />
          <TextField
            label="Harita bağlantısı"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft.mapsUrl}
            onChange={(e) => set('mapsUrl', e.target.value)}
            error={errors.mapsUrl}
            hint="İsteğe bağlı. Google Haritalar'da “Paylaş” ile alınan bağlantı."
          />
          {errors.form && <p className={styles.formError}>{errors.form}</p>}
          <div className={styles.formSubmit}>
            <Button type="submit" variant="quiet" busy={busy} busyLabel="Kaydediliyor…">
              {editing === 'new' ? 'Şubeyi ekle' : 'Şubeyi kaydet'}
            </Button>
          </div>
          <p>
            <button type="button" className={styles.inlineButton} onClick={() => setEditing(null)}>
              Vazgeç
            </button>
            {current && (
              <>
                {' · '}
                <button type="button" className={styles.inlineButton} onClick={() => setActive(current, !current.isActive)}>
                  {current.isActive ? 'Şubeyi kapat' : 'Şubeyi yeniden aç'}
                </button>
              </>
            )}
          </p>
        </form>
      )}
    </section>
  );
}
