import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import PhoneField from '../components/PhoneField.jsx';
import TextField from '../components/TextField.jsx';
import BranchChoices from './BranchChoices.jsx';
import styles from './Admin.module.css';

// Yeni eğitmen: üye ekler gibi (ad, telefon, geçici şifre) + şubeler. Yetkiler varsayılanla başlar
// (yoklama, kendi dersini iptal, ek ders açık; üye ve grup işleri kapalı); eğitmenin sayfasından değişir.
export default function NewInstructorPage({ onCancel, onCreated }) {
  const [branches, setBranches] = useState(null);
  const [form, setForm] = useState({ fullName: '', phone: '', branchIds: [] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/admin/branches').then(({ branches: list }) => {
      const open = list.filter((b) => b.isActive);
      setBranches(open);
      // Tek şubede seçim gösterilmez, o şube seçilir.
      if (open.length === 1) setForm((current) => ({ ...current, branchIds: [open[0].id] }));
    }, (err) => setErrors({ form: err.message }));
  }, []);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: null }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    const found = {
      fullName: form.fullName.trim().length < 2 ? 'Ad soyad yaz.' : null,
      phone: form.phone.trim() ? null : 'Telefon numarası yaz.',
      branchIds: form.branchIds.length ? null : 'En az bir şube seç.',
    };
    if (Object.values(found).some(Boolean)) {
      setErrors(found);
      return;
    }
    setBusy(true);
    try {
      const result = await api('/api/admin/instructors', { method: 'POST', body: form });
      onCreated(
        { fullName: form.fullName.trim(), phone: form.phone, temporaryPassword: result.temporaryPassword },
        result.instructor.id,
      );
    } catch (err) {
      if (err.code === 'PHONE_TAKEN' || err.code === 'INVALID_PHONE') setErrors({ phone: err.message });
      else if (err.code === 'INVALID_NAME') setErrors({ fullName: err.message });
      else if (err.code?.startsWith('BRANCH_')) setErrors({ branchIds: err.message });
      else setErrors({ form: err.message });
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={onCancel}>
        ‹ Vazgeç
      </button>
      <h1 className={styles.rosterTitle}>Yeni eğitmen</h1>

      <form className={styles.formCard} noValidate onSubmit={submit}>
        <TextField label="Ad soyad" autoComplete="off" value={form.fullName} onChange={update('fullName')} error={errors.fullName} />
        <PhoneField
          label="Telefon"
          autoComplete="off"
          value={form.phone}
          onChange={update('phone')}
          error={errors.phone}
          hint="Eğitmen bu numara ve geçici şifreyle giriş yapar."
        />
        {branches && branches.length > 1 && (
          <BranchChoices
            branches={branches}
            selected={form.branchIds}
            onChange={(branchIds) => {
              setForm((current) => ({ ...current, branchIds }));
              setErrors((current) => ({ ...current, branchIds: null }));
            }}
            error={errors.branchIds}
          />
        )}
        {(!branches || branches.length <= 1) && errors.branchIds && <p className={styles.formError}>{errors.branchIds}</p>}
        {errors.form && <p className={styles.formError}>{errors.form}</p>}
        <div className={styles.formSubmit}>
          <Button size="lg" type="submit" busy={busy} busyLabel="Kaydediliyor…">
            Eğitmeni kaydet
          </Button>
        </div>
      </form>
    </main>
  );
}
