import { useEffect, useId, useState } from 'react';
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
  BRANCH_REQUIRED: 'branchId',
  BRANCH_NOT_FOUND: 'branchId',
  BRANCH_CLOSED: 'branchId',
  INVALID_INSTRUCTOR: 'instructorId',
};

// group verilmezse "Yeni grup", verilirse "Grubu düzenle".
// user: eğitmen seçimi yalnızca yöneticide (eğitmen listesini yalnızca yönetici okuyabilir; manage_groups yetkili
// eğitmenin düzenlemesinde alan gönderilmez, grubun eğitmeni aynı kalır).
export default function GroupFormPage({ user, studio, group, onStudioChange, onCancel, onSaved }) {
  const today = todayIn(studio.timezone);
  // Şube seçimi yalnızca çok şubeli stüdyoda; tek şubede sunucu grubu o şubeye bağlar.
  const multiBranch = studio.branchCount > 1;
  const branchFieldId = useId();
  const instructorFieldId = useId();
  const pickInstructor = user.role === 'admin';
  const [branches, setBranches] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [form, setForm] = useState({
    name: group?.name ?? '',
    branchId: group?.branch ? String(group.branch.id) : '',
    weekdays: group?.weekdays ?? [],
    startTime: group?.startTime ?? '09:00',
    durationMinutes: String(group?.durationMinutes ?? 50),
    capacity: String(group?.capacity ?? 8),
    effectiveFrom: nextMonday(today),
    instructorId: group?.instructor ? String(group.instructor.id) : '',
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const weekdays = [...form.weekdays].sort();
  const scheduleChanged =
    Boolean(group) && (form.startTime !== group.startTime || weekdays.join(',') !== group.weekdays.join(','));
  const capacityChanged = Boolean(group) && Number(form.capacity) !== group.capacity;
  // Grup detayındaki "Üyeler (N)" ile aynı sayı: bugünkü üyeler ve katılacak olanlar.
  const memberCount = group?.members.length ?? 0;
  const capacityBelowMembers = capacityChanged && Number(form.capacity) >= 1 && Number(form.capacity) < memberCount;

  const branchChanged = Boolean(group) && multiBranch && form.branchId !== String(group.branch.id);

  const body = {
    name: form.name,
    // Tek şubede hiç gönderilmez (düzenlemede şube değişmez, yeni grupta sunucu tek şubeyi seçer).
    branchId: multiBranch ? (form.branchId ? Number(form.branchId) : null) : undefined,
    weekdays,
    startTime: form.startTime,
    durationMinutes: Number(form.durationMinutes),
    capacity: Number(form.capacity),
    effectiveFrom: scheduleChanged ? form.effectiveFrom : undefined,
    instructorId: pickInstructor ? (form.instructorId ? Number(form.instructorId) : null) : undefined,
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

  // Açık şubeler (seçim kutusu için).
  useEffect(() => {
    if (!multiBranch) return;
    api('/api/admin/branches').then(
      ({ branches: list }) => setBranches(list.filter((branch) => branch.isActive)),
      (err) => setErrors((current) => ({ ...current, branchId: err.message })),
    );
  }, [multiBranch]);

  // Yönetici: hesabı açık eğitmenler. Seçim kutusunda seçili şubeye atanmış olanlar görünür.
  useEffect(() => {
    if (!pickInstructor) return;
    api('/api/admin/instructors').then(
      ({ instructors: list }) => setInstructors(list.filter((i) => i.status === 'active')),
      () => setInstructors([]),
    );
  }, [pickInstructor]);
  const branchForInstructors = multiBranch ? Number(form.branchId) : branches?.[0]?.id ?? group?.branch?.id;
  const instructorOptions = instructors.filter(
    (i) => !multiBranch || i.branches.some((b) => b.id === branchForInstructors),
  );

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
        const branchNote = summary.branchChange ? ` Şube: ${summary.branchChange.from} → ${summary.branchChange.to}.` : '';
        onSaved(
          group.id,
          (summary.scheduleChanged ? `Kaydedildi. ${describe(summary, { done: true })}` : 'Kaydedildi.') + branchNote,
        );
      } else {
        const result = await api('/api/admin/groups', { method: 'POST', body });
        onSaved(result.groupId, 'Grup oluşturuldu, önümüzdeki dersleri hazır.');
      }
    } catch (err) {
      const field = FIELD_FOR_CODE[err.code] ?? 'form';
      if (field === 'branchId' && !multiBranch) {
        // Bu ekran tek şube sanıyor ama sunucuda artık birden çok şube var (ör. başka bir cihazdan şube açıldı).
        // Şube alanı hiç çizilmediği için hata görünmezdi: mesajı formun altına yaz ve şube sayısını tazele ki
        // şube seçimi belirsin.
        setErrors({ form: 'Şubeler değişmiş. Şube seçip yeniden dene.' });
        api('/api/studio').then(
          ({ studio: fresh }) => fresh && onStudioChange({ branchCount: fresh.branchCount }),
          () => {},
        );
      } else {
        setErrors({ [field]: err.message });
      }
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <button type="button" className={styles.back} onClick={onCancel}>
        ‹ Vazgeç
      </button>
      <h1 className={styles.rosterTitle}>{group ? 'Grubu düzenle' : 'Yeni grup'}</h1>

      <form className={styles.formCard} onSubmit={submit} noValidate>
        <TextField label="Grup adı" value={form.name} onChange={update('name')} error={errors.name} placeholder="Pzt-Çar-Cum sabah" />

        {multiBranch && (
          <div className={fieldStyles.field}>
            <label htmlFor={branchFieldId} className={fieldStyles.label}>
              Şube
            </label>
            <div className={`${fieldStyles.control} ${errors.branchId ? fieldStyles.invalid : ''}`}>
              <select id={branchFieldId} className={fieldStyles.input} value={form.branchId} onChange={update('branchId')}>
                <option value="">Şube seç</option>
                {branches?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            {errors.branchId && <p className={fieldStyles.error}>{errors.branchId}</p>}
          </div>
        )}
        {pickInstructor && (instructors.length > 0 || form.instructorId) && (
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
                {/* Şube değişince eski eğitmen yeni şubeye atanmamış olabilir: yine de seçili görünsün, sunucu uyarır. */}
                {group?.instructor && !instructorOptions.some((i) => i.id === group.instructor.id) && (
                  <option value={group.instructor.id}>{group.instructor.name}</option>
                )}
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
        {branchChanged && (
          <div className={styles.warning} role="status">
            <p>Şube değişikliği hemen geçerli olur; grubun geçmiş dersleri de yeni şubede görünür.</p>
          </div>
        )}

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
        {capacityBelowMembers && (
          <div className={styles.warning} role="status">
            <p>
              Bu grupta {memberCount} üye var, kapasite {form.capacity} olursa dersler dolu görünür. Üyeler gruptan
              çıkarılmaz ama bu derslere telafi yazılamaz.
            </p>
          </div>
        )}

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
          <Button size="lg" type="submit" busy={busy} busyLabel="Kaydediliyor…">
            {group ? 'Kaydet' : 'Grubu oluştur'}
          </Button>
        </div>
      </form>
    </main>
  );
}
