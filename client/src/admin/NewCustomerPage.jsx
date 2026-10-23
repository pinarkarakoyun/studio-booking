import { useEffect, useId, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import fieldStyles from '../components/TextField.module.css';
import { todayIn } from '../format.js';
import styles from './Admin.module.css';

export default function NewCustomerPage({ studio, onCancel, onCreated }) {
  const [groups, setGroups] = useState(null);
  const [form, setForm] = useState({ fullName: '', phone: '', groupId: '', startsOn: todayIn(studio.timezone) });
  const [errors, setErrors] = useState({});
  // Grup doluysa sunucu GROUP_FULL döner; mesajı gösterip "Yine de ekle" ile onay alıyoruz.
  const [fullWarning, setFullWarning] = useState(null);
  const [busy, setBusy] = useState(false);
  const groupFieldId = useId();

  useEffect(() => {
    api('/api/admin/groups').then(({ groups: list }) => setGroups(list), () => setGroups([]));
  }, []);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: null }));
      setFullWarning(null);
    };
  }

  async function submit(confirmFull) {
    const found = {
      fullName: form.fullName.trim().length < 2 ? 'Ad soyad yaz.' : null,
      phone: form.phone.trim() ? null : 'Telefon numarası yaz.',
      groupId: form.groupId ? null : 'Bir grup seç.',
    };
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }
    setBusy(true);
    try {
      const result = await api('/api/admin/customers', {
        method: 'POST',
        body: { ...form, groupId: Number(form.groupId), confirmFull },
      });
      onCreated({ fullName: form.fullName.trim(), phone: form.phone, temporaryPassword: result.temporaryPassword });
    } catch (err) {
      if (err.code === 'GROUP_FULL') setFullWarning(err.message);
      else if (err.code === 'PHONE_TAKEN' || err.code === 'INVALID_PHONE') setErrors({ phone: err.message });
      else if (err.code === 'INVALID_NAME') setErrors({ fullName: err.message });
      else setErrors({ form: err.message });
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={onCancel}>
        ‹ Vazgeç
      </button>
      <h1 className={styles.rosterTitle}>Yeni müşteri</h1>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
      >
        <TextField label="Ad soyad" autoComplete="off" value={form.fullName} onChange={update('fullName')} error={errors.fullName} />
        <TextField
          label="Telefon"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="0532 123 45 67"
          value={form.phone}
          onChange={update('phone')}
          error={errors.phone}
        />

        <div className={fieldStyles.field}>
          <label htmlFor={groupFieldId} className={fieldStyles.label}>
            Grup
          </label>
          <div className={`${fieldStyles.control} ${errors.groupId ? fieldStyles.invalid : ''}`}>
            <select id={groupFieldId} className={fieldStyles.input} value={form.groupId} onChange={update('groupId')}>
              <option value="">Grup seç</option>
              {groups?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} ({group.memberCount}/{group.capacity}
                  {group.memberCount >= group.capacity ? ', dolu' : ''})
                </option>
              ))}
            </select>
          </div>
          {errors.groupId && <p className={fieldStyles.error}>{errors.groupId}</p>}
        </div>

        <TextField
          label="İlk dersi"
          type="date"
          value={form.startsOn}
          onChange={update('startsOn')}
          hint="Bu tarihten itibaren grubun derslerinde yer alır."
        />

        {errors.form && <p className={styles.formError}>{errors.form}</p>}

        {fullWarning ? (
          <div className={styles.warning} role="alert">
            <p>{fullWarning}</p>
            <Button type="button" busy={busy} busyLabel="Kaydediliyor…" onClick={() => submit(true)}>
              Yine de ekle
            </Button>
          </div>
        ) : (
          <div className={styles.formSubmit}>
            <Button type="submit" busy={busy} busyLabel="Kaydediliyor…">
              Müşteriyi kaydet
            </Button>
          </div>
        )}
      </form>
    </main>
  );
}
