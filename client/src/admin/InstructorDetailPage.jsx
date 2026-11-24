import { useEffect, useId, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import { formatPhone } from '../format.js';
import BranchChoices from './BranchChoices.jsx';
import styles from './Admin.module.css';
import { PERMISSION_GROUPS } from './permissions.js';

// Yönetici: bir eğitmenin şubeleri, yetkileri, şifresi ve "ayrıldı".
// Yetki anahtarı değişince hemen kaydedilir (Ayarlar'daki anahtarlar gibi tek tek değil, her biri kendi isteği).
export default function InstructorDetailPage({ studio, instructorId, onBack, onCredentials, showToast }) {
  const [instructor, setInstructor] = useState(null);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null); // kaydedilmekte olan yetki anahtarı
  const [panel, setPanel] = useState(null); // 'branches' | 'reset' | 'leave' | null

  useEffect(() => {
    api(`/api/admin/instructors/${instructorId}`).then(
      ({ instructor: data }) => setInstructor(data),
      (err) => setError(err.message),
    );
    api('/api/admin/branches').then(({ branches: list }) => setBranches(list.filter((b) => b.isActive)), () => {});
  }, [instructorId]);

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      ‹ Eğitmenler
    </button>
  );

  if (!instructor) {
    return (
      <main className={styles.page}>
        {back}
        {error && <p className={styles.muted}>{error}</p>}
      </main>
    );
  }

  const left = instructor.status === 'left';
  const firstName = instructor.fullName.split(' ')[0];
  const multiBranch = studio.branchCount > 1;

  async function togglePermission(key, value) {
    setSaving(key);
    setError(null);
    try {
      const { instructor: data } = await api(`/api/admin/instructors/${instructorId}`, {
        method: 'PUT',
        body: { permissions: { [key]: value } },
      });
      setInstructor(data);
      showToast('success', 'Kaydedildi.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className={styles.page}>
      {back}
      <h1 className={styles.rosterTitle}>{instructor.fullName}</h1>
      <p className={styles.subtitle}>
        {formatPhone(instructor.phone)}
        {left && ' · ayrıldı'}
      </p>

      {multiBranch && (
        <>
          <h2 className={styles.listLabel}>Şubeler</h2>
          <div className={styles.membershipCard}>
            <p className={styles.periodMeta}>
              {instructor.branches.length > 0 ? instructor.branches.map((b) => b.name).join(', ') : 'Açık şubesi yok'}
            </p>
            {!left && (
              <div className={styles.formSubmit}>
                <Button variant="secondary" type="button" onClick={() => setPanel('branches')}>
                  Şubeleri değiştir
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {!left && (
        <>
          <h2 className={styles.listLabel}>Yetkiler</h2>
          <p className={styles.muted}>
            Eğitmen yalnızca kendi şubelerinde çalışır. Ödemeleri, fiyatları ve ayarları hiçbir zaman görmez.
          </p>
          {error && <p className={styles.formError}>{error}</p>}
          {PERMISSION_GROUPS.map((group) => (
            <section key={group.title} className={styles.settingCard} aria-label={group.title}>
              <h3 className={styles.settingSection}>{group.title}</h3>
              {group.items.map((item) => (
                <PermissionRow
                  key={item.key}
                  item={item}
                  checked={instructor.permissions[item.key]}
                  disabled={saving !== null || (item.needsViewCustomers && !instructor.permissions.view_customers)}
                  onChange={(value) => togglePermission(item.key, value)}
                />
              ))}
            </section>
          ))}

          <h2 className={styles.listLabel}>İşlemler</h2>
          <ul className={styles.people}>
            <li>
              <button type="button" className={styles.actionRow} onClick={() => setPanel('reset')}>
                <span>Şifresini sıfırla</span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
            <li>
              <button type="button" className={`${styles.actionRow} ${styles.danger}`} onClick={() => setPanel('leave')}>
                <span>Stüdyodan ayrıldı</span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          </ul>
        </>
      )}

      <Sheet open={panel === 'branches'} onClose={() => setPanel(null)} title="Şubeleri değiştir">
        {panel === 'branches' && (
          <BranchesForm
            instructorId={instructorId}
            branches={branches}
            current={instructor.branches.map((b) => b.id)}
            onDone={(data) => {
              setInstructor(data);
              setPanel(null);
              showToast('success', 'Şubeler kaydedildi.');
            }}
          />
        )}
      </Sheet>

      <Sheet open={panel === 'reset'} onClose={() => setPanel(null)} title="Şifresini sıfırla">
        <Confirm
          text={`${firstName} için yeni bir geçici şifre oluşturulacak. Açık oturumları kapanır; ilk girişte kendi şifresini belirler.`}
          button="Yeni şifre oluştur"
          request={() => api(`/api/admin/instructors/${instructorId}/reset-password`, { method: 'POST' })}
          onDone={(result) => {
            setPanel(null);
            onCredentials({ fullName: instructor.fullName, phone: instructor.phone, temporaryPassword: result.temporaryPassword });
          }}
        />
      </Sheet>

      <Sheet open={panel === 'leave'} onClose={() => setPanel(null)} title="Stüdyodan ayrıldı">
        <Confirm
          danger
          text={`${firstName} artık giriş yapamaz, açık oturumları kapanır. Gruplarının eğitmen kaydı kalır; o grupları yeni bir eğitmene atayabilirsin.`}
          button="Ayrıldı olarak işaretle"
          request={() => api(`/api/admin/instructors/${instructorId}/leave`, { method: 'POST' })}
          onDone={({ instructor: data }) => {
            setInstructor(data);
            setPanel(null);
            showToast('success', `${firstName} ayrıldı olarak işaretlendi.`);
          }}
        />
      </Sheet>
    </main>
  );
}

function PermissionRow({ item, checked, disabled, onChange }) {
  const id = useId();
  return (
    <div className={styles.settingRow}>
      <label htmlFor={id} className={styles.settingText}>
        {item.label}
        {item.hint && <small>{item.hint}</small>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

function BranchesForm({ instructorId, branches, current, onDone }) {
  const [selected, setSelected] = useState(current);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (selected.length === 0) {
      setError('En az bir şube seç.');
      return;
    }
    setBusy(true);
    try {
      const { instructor } = await api(`/api/admin/instructors/${instructorId}`, {
        method: 'PUT',
        body: { branchIds: selected },
      });
      onDone(instructor);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <BranchChoices branches={branches} selected={selected} onChange={setSelected} error={error} />
      <p className={styles.sheetText}>Şubesinden çıkarılan eğitmen o şubenin derslerini ve üyelerini hemen görmez.</p>
      <div className={styles.formSubmit}>
        <Button size="lg" type="button" busy={busy} busyLabel="Kaydediliyor…" onClick={save}>
          Kaydet
        </Button>
      </div>
    </>
  );
}

function Confirm({ text, button, request, onDone, danger = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onDone(await request());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <p className={styles.sheetText}>{text}</p>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.formSubmit}>
        <Button variant={danger ? 'danger' : 'primary'} size="lg" type="button" busy={busy} busyLabel="Kaydediliyor…" onClick={run}>
          {button}
        </Button>
      </div>
    </>
  );
}
