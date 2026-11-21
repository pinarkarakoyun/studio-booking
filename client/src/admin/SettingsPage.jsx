import { useEffect, useId, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import TextField from '../components/TextField.jsx';
import { formatPhone } from '../format.js';
import styles from './Admin.module.css';
import BranchesSection from './BranchesSection.jsx';
import PackagesSection from './PackagesSection.jsx';

// Sunucunun hata kodu -> hatanın gösterileceği alan.
const FIELD_FOR_CODE = {
  INVALID_STUDIO_NAME: 'studioName',
  INVALID_WHATSAPP: 'whatsappPhone',
  INVALID_CANCELLATION_DEADLINE_HOURS: 'cancellationDeadlineHours',
  INVALID_CREDIT_VALIDITY_DAYS: 'creditValidityDays',
  INVALID_BOOKING_WINDOW_DAYS: 'bookingWindowDays',
  INVALID_MAKEUP_BOOKING_CUTOFF_MINUTES: 'makeupBookingCutoffMinutes',
  INVALID_MAX_MAKEUPS_PER_MONTH: 'maxMakeupsPerMonth',
  INVALID_PAYMENT_REMINDER_DAYS: 'paymentReminderDays',
};

const NUMBER_FIELDS = [
  'cancellationDeadlineHours',
  'creditValidityDays',
  'bookingWindowDays',
  'makeupBookingCutoffMinutes',
  'maxMakeupsPerMonth',
  'paymentReminderDays',
];

// Sunucudan gelen ayarlar -> form (sayılar metin kutusunda metin olarak durur).
function toForm(settings) {
  const form = { ...settings, whatsappPhone: settings.whatsappPhone ? formatPhone(settings.whatsappPhone) : '' };
  for (const key of NUMBER_FIELDS) form[key] = settings[key] === null ? '' : String(settings[key]);
  return form;
}

// Form -> sunucuya gidecek gövde. Boş "aylık telafi" = sınırsız (null).
function toBody(form) {
  const body = { ...form };
  for (const key of NUMBER_FIELDS) body[key] = form[key].trim() === '' ? null : Number(form[key]);
  return body;
}

// Bir kural satırı: solda ne olduğu, sağda küçük sayı kutusu ve birimi.
function NumberRow({ label, hint, unit, error, ...inputProps }) {
  const id = useId();
  return (
    <div className={styles.settingRow}>
      <label htmlFor={id} className={styles.settingText}>
        {label}
        {hint && <small>{hint}</small>}
      </label>
      <span className={styles.settingNumber}>
        <input id={id} type="number" inputMode="numeric" aria-invalid={error ? true : undefined} {...inputProps} />
        {/* Birim sabit genişlikte: "saat", "gün", "dk" farklı uzunlukta olsa da kutular alt alta hizalı kalsın. */}
        <span className={styles.settingUnit}>{unit}</span>
      </span>
      {error && <p className={styles.settingError}>{error}</p>}
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange }) {
  const id = useId();
  return (
    <div className={styles.settingRow}>
      <label htmlFor={id} className={styles.settingText}>
        {label}
        {hint && <small>{hint}</small>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

// showToast: "Kaydedildi" mesajı AdminApp'teki ortak toast'ta.
export default function SettingsPage({ onStudioChange, showToast }) {
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  // Açık şube sayısı: "diğer şubelerde telafi" anahtarı yalnızca çok şubeli stüdyoda görünür.
  const [branchCount, setBranchCount] = useState(null);

  useEffect(() => {
    api('/api/admin/settings').then(
      ({ settings }) => {
        setForm(toForm(settings));
        setBranchCount(settings.branchCount);
      },
      (err) => setLoadError(err.message),
    );
  }, []);

  if (!form) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Ayarlar</h1>
        <p className={styles.muted}>{loadError ?? 'Yükleniyor…'}</p>
      </main>
    );
  }

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null, form: null }));
  }

  const number = (field) => ({
    value: form[field],
    error: errors[field],
    onChange: (event) => set(field, event.target.value),
  });
  const toggle = (field) => ({ checked: form[field], onChange: (value) => set(field, value) });
  // Model kurulumda seçilir, buradan değişmez. Paket modelinde telafi ayarları yerine paketler ve geç iptal ayarı.
  const packageModel = form.membershipModel === 'package';

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const { settings } = await api('/api/admin/settings', { method: 'PUT', body: toBody(form) });
      setForm(toForm(settings));
      onStudioChange({
        name: settings.studioName,
        whatsappPhone: settings.whatsappPhone,
        creditValidityDays: settings.creditValidityDays,
      });
      showToast('success', 'Kaydedildi. Yeni kurallar bundan sonraki işlemlerde geçerli.');
    } catch (err) {
      setErrors({ [FIELD_FOR_CODE[err.code] ?? 'form']: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Ayarlar</h1>
      <p className={styles.subtitle}>Bu kurallar bütün müşteriler için geçerli.</p>
      <p className={styles.muted}>Üyelik modeli: {packageModel ? 'Seans paketi' : 'Grup + telafi'}</p>

      <form onSubmit={submit} noValidate>
        <section className={styles.settingCard}>
          <h2 className={styles.settingSection}>İptal</h2>
          {packageModel ? (
            <>
              <NumberRow label="İptal için son süre" hint="Dersten önce; sonrası geç iptal" unit="saat" min="0" max="72" {...number('cancellationDeadlineHours')} />
              <SwitchRow label="Geç iptalde seans yansın" hint="Kapalıysa geç iptal de paketten düşmez" {...toggle('lateCancelBurnsSession')} />
            </>
          ) : (
            <>
              <NumberRow label="İptal için son süre" hint="Dersten önce" unit="saat" min="0" max="72" {...number('cancellationDeadlineHours')} />
              <SwitchRow label="İptali geri alma" hint="Yer hâlâ boşsa" {...toggle('allowUndoCancel')} />
              <SwitchRow label="Stüdyo iptalinde telafi hakkı" hint="Stüdyo dersi iptal edince gelecek olanlara" {...toggle('creditOnStudioCancel')} />
            </>
          )}
        </section>

        {/* Paket modelinde telafi yok: bu kart yalnızca grup modelinde. */}
        {!packageModel && (
          <section className={styles.settingCard}>
            <h2 className={styles.settingSection}>Telafi</h2>
            <NumberRow label="Telafi hakkı geçerliliği" hint="Kaçırılan dersten itibaren" unit="gün" min="1" max="365" {...number('creditValidityDays')} />
            <NumberRow label="En fazla ne kadar ileriye" hint="Telafi seçerken" unit="gün" min="1" max="90" {...number('bookingWindowDays')} />
            <NumberRow label="Telafi kaydının kapanışı" hint="0: ders başlayana kadar" unit="dk" min="0" max="240" {...number('makeupBookingCutoffMinutes')} />
            <NumberRow label="Ayda en fazla telafi" hint="Boş: sınırsız" min="1" max="31" placeholder="–" {...number('maxMakeupsPerMonth')} />
            <SwitchRow label="Kaçırılacak dersten önce telafi" hint="Cuma yerine Perşembe gibi" {...toggle('allowMakeupBeforeMissed')} />
            <SwitchRow label="Telafiden vazgeçince hak geri gelsin" hint="Kapalıysa hak yanar" {...toggle('refundCreditOnMakeupCancel')} />
            {branchCount > 1 && (
              <SwitchRow label="Diğer şubelerde telafi" hint="Kapalıysa üye yalnızca kendi şubesine telafiye gelir" {...toggle('makeupOtherBranches')} />
            )}
          </section>
        )}

        <section className={styles.settingCard}>
          <h2 className={styles.settingSection}>Ödeme</h2>
          <NumberRow label="Bitişe kaç gün kala uyar" hint="Ödemeler'de “Bitişi yaklaşıyor”" unit="gün" min="0" max="60" {...number('paymentReminderDays')} />
          <SwitchRow label="Üyeler ödeme bilgisini görsün" hint="Derslerim'de ücret, ödenen ve kalan" {...toggle('showPaymentsToCustomers')} />
        </section>

        <section className={`${styles.settingCard} ${styles.formCard}`}>
          <h2 className={styles.settingSection}>Stüdyo</h2>
          <TextField
            label="Stüdyo adı"
            value={form.studioName}
            onChange={(event) => set('studioName', event.target.value)}
            error={errors.studioName}
          />
          <TextField
            label="WhatsApp numarası"
            type="tel"
            inputMode="tel"
            value={form.whatsappPhone}
            onChange={(event) => set('whatsappPhone', event.target.value)}
            error={errors.whatsappPhone}
            hint="Müşterilerin “Stüdyoya WhatsApp'tan yaz” bağlantısı bu numaraya gider."
          />
        </section>

        {errors.form && <p className={styles.formError}>{errors.form}</p>}
        <div className={styles.formSubmit}>
          <Button size="lg" type="submit" busy={busy} busyLabel="Kaydediliyor…">
            Kaydet
          </Button>
        </div>
      </form>

      {packageModel && <PackagesSection />}

      <BranchesSection
        onCountChange={(count) => {
          setBranchCount(count);
          // Panelin geri kalanı (gruplar, Bugün, listeler) şube adlarını buna göre gösterir.
          onStudioChange({ branchCount: count });
        }}
      />
    </main>
  );
}
