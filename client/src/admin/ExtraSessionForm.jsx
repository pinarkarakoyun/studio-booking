import { useEffect, useId, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import fieldStyles from '../components/TextField.module.css';
import { addDays, todayIn } from '../format.js';
import styles from './Admin.module.css';
import { isInstructor } from './permissions.js';

const FIELD_FOR_CODE = {
  INVALID_DATE: 'date',
  IN_THE_PAST: 'date',
  INVALID_TIME: 'startTime',
  INVALID_DURATION: 'durationMinutes',
  INVALID_CAPACITY: 'capacity',
  INVALID_NAME: 'title',
  BRANCH_REQUIRED: 'branchId',
  BRANCH_NOT_FOUND: 'branchId',
  BRANCH_CLOSED: 'branchId',
  INVALID_INSTRUCTOR: 'instructorId',
};

// Ek ders formu (alttan açılan pencerede). Eğitmen açınca ders ona atanır; yönetici eğitmen seçebilir.
// Kaydedince onCreated(dersin detayı) çağrılır; ekran dersin detayına gider, WhatsApp düğmesi orada.
export default function ExtraSessionForm({ user, studio, onCreated }) {
  const instructor = isInstructor(user);
  const branchFieldId = useId();
  const instructorFieldId = useId();
  const [branches, setBranches] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const tomorrow = addDays(`${todayIn(studio.timezone)}T12:00:00Z`, 1).slice(0, 10);
  const [form, setForm] = useState({
    date: tomorrow, startTime: '10:00', durationMinutes: '50', capacity: '8', branchId: '', instructorId: '', title: '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/admin/branches').then(({ branches: list }) => {
      const open = list.filter((b) => b.isActive);
      setBranches(open);
      if (open.length === 1) setForm((current) => ({ ...current, branchId: String(open[0].id) }));
    }, (err) => setErrors({ form: err.message }));
    if (!instructor) {
      api('/api/admin/instructors').then(
        ({ instructors: list }) => setInstructors(list.filter((i) => i.status === 'active')),
        () => setInstructors([]),
      );
    }
  }, [instructor]);

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: null, form: null }));
    };
  }

  const instructorOptions = instructors.filter((i) => i.branches.some((b) => String(b.id) === form.branchId));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api('/api/admin/extra-sessions', {
        method: 'POST',
        body: {
          date: form.date,
          startTime: form.startTime,
          durationMinutes: Number(form.durationMinutes),
          capacity: Number(form.capacity),
          branchId: form.branchId ? Number(form.branchId) : null,
          instructorId: !instructor && form.instructorId ? Number(form.instructorId) : null,
          title: form.title,
        },
      });
      onCreated(result);
    } catch (err) {
      setErrors({ [FIELD_FOR_CODE[err.code] ?? 'form']: err.message });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <p className={styles.sheetText}>
        Haftalık programın dışında tek seferlik bir ders. Duyuruyu WhatsApp'tan sen yaparsın; gelmek isteyen sistemden
        yerini ayırır.
      </p>
      <div className={styles.twoColumns}>
        <TextField label="Tarih" type="date" value={form.date} onChange={update('date')} error={errors.date} />
        <TextField label="Saat" type="time" value={form.startTime} onChange={update('startTime')} error={errors.startTime} />
      </div>
      <div className={styles.twoColumns}>
        <TextField
          label="Süre (dk)"
          type="number"
          inputMode="numeric"
          min="15"
          max="240"
          value={form.durationMinutes}
          onChange={update('durationMinutes')}
          error={errors.durationMinutes}
        />
        <TextField
          label="Kapasite"
          type="number"
          inputMode="numeric"
          min="1"
          max="100"
          value={form.capacity}
          onChange={update('capacity')}
          error={errors.capacity}
        />
      </div>
      {branches && branches.length > 1 && (
        <div className={fieldStyles.field}>
          <label htmlFor={branchFieldId} className={fieldStyles.label}>
            Şube
          </label>
          <div className={`${fieldStyles.control} ${errors.branchId ? fieldStyles.invalid : ''}`}>
            <select id={branchFieldId} className={fieldStyles.input} value={form.branchId} onChange={update('branchId')}>
              <option value="">Şube seç</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          {errors.branchId && <p className={fieldStyles.error}>{errors.branchId}</p>}
        </div>
      )}
      {!instructor && instructorOptions.length > 0 && (
        <div className={fieldStyles.field}>
          <label htmlFor={instructorFieldId} className={fieldStyles.label}>
            Eğitmen
          </label>
          <div className={`${fieldStyles.control} ${errors.instructorId ? fieldStyles.invalid : ''}`}>
            <select
              id={instructorFieldId}
              className={fieldStyles.input}
              value={form.instructorId}
              onChange={update('instructorId')}
            >
              <option value="">Atanmadı</option>
              {instructorOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.fullName}
                </option>
              ))}
            </select>
          </div>
          {errors.instructorId && <p className={fieldStyles.error}>{errors.instructorId}</p>}
        </div>
      )}
      <TextField
        label="Başlık (isteğe bağlı)"
        value={form.title}
        maxLength={60}
        placeholder="Ek ders"
        onChange={update('title')}
        error={errors.title}
      />
      {errors.form && <p className={styles.formError}>{errors.form}</p>}
      <div className={styles.formSubmit}>
        <Button size="lg" type="submit" busy={busy} busyLabel="Kaydediliyor…">
          Ek dersi aç
        </Button>
      </div>
    </form>
  );
}
