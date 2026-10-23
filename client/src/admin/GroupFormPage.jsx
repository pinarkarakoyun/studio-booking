import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import fieldStyles from '../components/TextField.module.css';
import { formatDateDayMonth, todayIn } from '../format.js';
import { WEEKDAYS } from './groupDays.js';
import styles from './Admin.module.css';

// Program değişikliği için varsayılan başlangıç: gelecek pazartesi (bu hafta için plan yapanlar etkilenmesin).
function nextMonday(today) {
  const date = new Date(`${today}T12:00:00Z`);
  const daysAhead = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

// Sunucunun özetini cümleye çevirir; sıfır olan parçalar söylenmez.
// Önizlemede gelecek zaman ("taşınacak"), kaydettikten sonra geçmiş zaman ("taşındı").
function describe(summary, { done = false } = {}) {
  const verb = (future, past) => (done ? past : future);
  const parts = [];
  if (summary.movedSessions) parts.push(`${summary.movedSessions} ders yeni saate ${verb('taşınacak', 'taşındı')}`);
  if (summary.removedSessions) parts.push(`${summary.removedSessions} ders ${verb('kaldırılacak', 'kaldırıldı')}`);
  if (summary.addedSessions) parts.push(`${summary.addedSessions} yeni ders ${verb('eklenecek', 'eklendi')}`);
  let text = parts.length
    ? `${parts.join(', ')}.`
    : `Önümüzdeki derslerde değişiklik ${verb('olmayacak', 'olmadı')}.`;
  if (summary.refundedMakeups) {
    text += ` ${summary.refundedMakeups} telafi kaydı iptal edilip hakkı iade ${verb('edilecek', 'edildi')}.`;
  }
  return text;
}

const FIELD_FOR_CODE = {
  INVALID_NAME: 'name',
  INVALID_DAYS: 'weekdays',
  INVALID_TIME: 'startTime',
  INVALID_DURATION: 'durationMinutes',
  INVALID_CAPACITY: 'capacity',
  INVALID_DATE: 'effectiveFrom',
};

// group verilmezse "Yeni grup", verilirse "Grubu düzenle".
export default function GroupFormPage({ studio, group, onCancel, onSaved }) {
  const today = todayIn(studio.timezone);
  const [form, setForm] = useState({
    name: group?.name ?? '',
    weekdays: group?.weekdays ?? [],
    startTime: group?.startTime ?? '09:00',
    durationMinutes: String(group?.durationMinutes ?? 50),
    capacity: String(group?.capacity ?? 8),
    effectiveFrom: nextMonday(today),
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const weekdays = [...form.weekdays].sort();
  const scheduleChanged =
    Boolean(group) && (form.startTime !== group.startTime || weekdays.join(',') !== group.weekdays.join(','));
  const capacityChanged = Boolean(group) && Number(form.capacity) !== group.capacity;

  const body = {
    name: form.name,
    weekdays,
    startTime: form.startTime,
    durationMinutes: Number(form.durationMinutes),
    capacity: Number(form.capacity),
    effectiveFrom: scheduleChanged ? form.effectiveFrom : undefined,
  };
  // Önizleme hangi değerler için alındı? Değerler değişince eski önizleme gösterilmez.
  const previewKey = JSON.stringify(body);

  // Program değiştiyse kaydetmeden önce "neler olacak?" diye sunucuya sor (yazmayı bitirmesini bekleyerek).
  useEffect(() => {
    if (!scheduleChanged || weekdays.length === 0 || !form.effectiveFrom) return undefined;
    const timer = setTimeout(() => {
      api(`/api/admin/groups/${group.id}/preview`, { method: 'POST', body: JSON.parse(previewKey) }).then(
        (summary) => setPreview({ key: previewKey, text: describe(summary) }),
        (err) => setPreview({ key: previewKey, error: err.message }),
      );
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewKey tüm ilgili alanları içeriyor
  }, [previewKey, scheduleChanged]);

  const shownPreview = scheduleChanged && preview?.key === previewKey ? preview : null;

  function update(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setErrors((current) => ({ ...current, [field]: null, form: null }));
    };
  }

  function toggleDay(value) {
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(value)
        ? current.weekdays.filter((d) => d !== value)
        : [...current.weekdays, value],
    }));
    setErrors((current) => ({ ...current, weekdays: null }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (group) {
        const summary = await api(`/api/admin/groups/${group.id}`, { method: 'PUT', body });
        onSaved(group.id, summary.scheduleChanged ? `Kaydedildi. ${describe(summary, { done: true })}` : 'Kaydedildi.');
      } else {
        const result = await api('/api/admin/groups', { method: 'POST', body });
        onSaved(result.groupId, 'Grup oluşturuldu, önümüzdeki dersleri hazır.');
      }
    } catch (err) {
      const field = FIELD_FOR_CODE[err.code] ?? 'form';
      setErrors({ [field]: err.message });
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={onCancel}>
        ‹ Vazgeç
      </button>
      <h1 className={styles.rosterTitle}>{group ? 'Grubu düzenle' : 'Yeni grup'}</h1>

      <form onSubmit={submit} noValidate>
        <TextField label="Grup adı" value={form.name} onChange={update('name')} error={errors.name} placeholder="Pzt-Çar-Cum sabah" />

        <fieldset className={styles.dayPicker}>
          <legend className={fieldStyles.label}>Günler</legend>
          <div className={styles.days}>
            {WEEKDAYS.map((day) => {
              const on = form.weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  className={`${styles.day} ${styles.dayLarge} ${on ? styles.dayOn : ''}`}
                  aria-pressed={on}
                  aria-label={day.long}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
          {errors.weekdays && <p className={fieldStyles.error}>{errors.weekdays}</p>}
        </fieldset>

        <div className={styles.twoColumns}>
          <TextField label="Saat" type="time" value={form.startTime} onChange={update('startTime')} error={errors.startTime} />
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
        </div>
        <TextField
          label="Kapasite"
          type="number"
          inputMode="numeric"
          min="1"
          max="100"
          value={form.capacity}
          onChange={update('capacity')}
          error={errors.capacity}
          hint={capacityChanged ? `Bugünden sonraki bütün derslerde ${form.capacity} kişi olacak.` : undefined}
        />

        {scheduleChanged && (
          <>
            <TextField
              label="Yeni program ne zamandan itibaren?"
              type="date"
              min={today}
              value={form.effectiveFrom}
              onChange={update('effectiveFrom')}
              error={errors.effectiveFrom}
            />
            <div className={styles.warning} role="status" aria-live="polite">
              <p>
                {formatDateDayMonth(form.effectiveFrom)} tarihinden itibaren yeni program geçerli.{' '}
                {shownPreview ? shownPreview.text ?? shownPreview.error : 'Etkisi hesaplanıyor…'}
              </p>
            </div>
          </>
        )}

        {errors.form && <p className={styles.formError}>{errors.form}</p>}
        <div className={styles.formSubmit}>
          <Button type="submit" busy={busy} busyLabel="Kaydediliyor…">
            {group ? 'Kaydet' : 'Grubu oluştur'}
          </Button>
        </div>
      </form>
    </main>
  );
}
