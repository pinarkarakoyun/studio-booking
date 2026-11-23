import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import TextField from '../components/TextField.jsx';
import styles from './Admin.module.css';

// Ayarlar › Görünüm: stüdyonun ana rengi ve vurgu rengi. Diğer bütün tonları sunucu türetir (palette.js); panel
// renk hesaplamaz, önizlemeyi de sunucudan ister. Kaydedince sayfadaki tema dosyası yeniden yüklenir, panel
// yenilemeden yeni renge geçer. Logo bu ekranda değil: marka klasöründen gelir.
const HEX = /^#[0-9a-fA-F]{6}$/;
const isValid = (value) => value.trim() === '' || HEX.test(value.trim());
const toBody = (form) => ({ brandColor: form.brandColor.trim() || null, accentColor: form.accentColor.trim() || null });

// <link href="/brand/theme.css"> öğesini yeni adresle yeniden yükletir (tarayıcı önbelleği yerine yeni dosya).
function reloadTheme() {
  const link = document.querySelector('link[href^="/brand/theme.css"]');
  if (link) link.href = `/brand/theme.css?v=${Date.now()}`;
}

export default function AppearanceSection({ showToast }) {
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const boxRef = useRef(null);
  // Her önizleme isteğine sıra numarası: cevaplar ters sırayla gelirse yalnızca en sonuncusu uygulanır.
  const latestPreview = useRef(0);

  useEffect(() => {
    api('/api/admin/appearance').then(
      ({ appearance }) => setForm({ brandColor: appearance.brandColor ?? '', accentColor: appearance.accentColor ?? '' }),
      (err) => setError(err.message),
    );
  }, []);

  // Değer değiştikten 300 ms sonra önizleme istenir; yazılmakta olan geçersiz bir renk için istek atılmaz.
  useEffect(() => {
    if (!form || !isValid(form.brandColor) || !isValid(form.accentColor)) return undefined;
    const timer = setTimeout(() => {
      const request = ++latestPreview.current;
      api('/api/admin/appearance/preview', { method: 'POST', body: toBody(form) }).then(
        ({ preview: result }) => {
          if (request === latestPreview.current) setPreview(result);
        },
        () => {},
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [form]);

  // Önizlemenin renkleri yalnızca önizleme kutusuna uygulanır (CSSOM; güvenlik başlıkları buna izin verir).
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !preview) return;
    for (const [name, value] of Object.entries(preview.vars)) box.style.setProperty(name, value);
  }, [preview]);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function save(body) {
    setBusy(true);
    try {
      const { appearance } = await api('/api/admin/appearance', { method: 'PUT', body });
      setForm({ brandColor: appearance.brandColor ?? '', accentColor: appearance.accentColor ?? '' });
      reloadTheme();
      showToast('success', 'Renkler kaydedildi.');
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <section className={`${styles.settingCard} ${styles.formCard}`}>
        <h2 className={styles.settingSection}>Görünüm</h2>
        {error && <p className={styles.formError}>{error}</p>}
      </section>
    );
  }

  const invalid = !isValid(form.brandColor) || !isValid(form.accentColor);
  return (
    <section className={`${styles.settingCard} ${styles.formCard}`} aria-labelledby="gorunum-baslik">
      <h2 id="gorunum-baslik" className={styles.settingSection}>
        Görünüm
      </h2>
      <ColorField
        label="Ana renk"
        value={form.brandColor}
        fallback={preview?.vars['--brand']}
        onChange={(value) => set('brandColor', value)}
      />
      <ColorField
        label="Vurgu rengi"
        value={form.accentColor}
        fallback={preview?.vars['--accent']}
        onChange={(value) => set('accentColor', value)}
      />

      {/* Önizleme: sitenin ve panelin parçalarının küçük bir taklidi; ekran okuyucu atlar. */}
      <div ref={boxRef} className={styles.colorPreview} aria-hidden="true">
        <span className={styles.colorPreviewDark}>Koyu kart</span>
        <span className={styles.colorPreviewButton}>Birincil buton</span>
        <span className={styles.colorPreviewLink}>Bağlantı</span>
        <span className={styles.colorPreviewAccent}>Vurgu yazısı</span>
      </div>
      {preview?.warnings.length > 0 && (
        <div role="status">
          {preview.warnings.map((warning) => (
            <p key={warning} className={styles.colorWarning}>
              {warning}
            </p>
          ))}
        </div>
      )}

      <p className={styles.colorNote}>Logo marka klasöründen gelir.</p>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.colorActions}>
        <Button variant="secondary" type="button" onClick={() => setConfirmReset(true)} disabled={busy}>
          Varsayılana dön
        </Button>
        <Button type="button" onClick={() => save(toBody(form))} busy={busy} busyLabel="Kaydediliyor…" disabled={invalid}>
          Kaydet
        </Button>
      </div>

      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Varsayılan renklere dön">
        <p>Stüdyonun renkleri silinir; site ve paneller krem ve zeytin yeşili varsayılan renklerle görünür.</p>
        <Button
          type="button"
          busy={busy}
          busyLabel="Kaydediliyor…"
          onClick={async () => {
            if (await save({ brandColor: null, accentColor: null })) setConfirmReset(false);
          }}
        >
          Varsayılana dön
        </Button>
      </Sheet>
    </section>
  );
}

// Renk seçici ve hex metin kutusu; ikisi birbirini günceller. Metin boşsa seçici varsayılanı (fallback) gösterir.
function ColorField({ label, value, fallback, onChange }) {
  const trimmed = value.trim();
  const pickerValue = HEX.test(trimmed) ? trimmed.toLowerCase() : (fallback ?? '#000000');
  return (
    <div className={styles.colorRow}>
      <input
        type="color"
        className={styles.colorSwatch}
        value={pickerValue}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label}: renk seç`}
      />
      <TextField
        label={label}
        value={value}
        placeholder="Varsayılan"
        spellCheck={false}
        autoCapitalize="off"
        onChange={(event) => onChange(event.target.value)}
        error={isValid(value) ? null : 'Renk #rrggbb biçiminde olmalı (ör. #4b5530).'}
      />
    </div>
  );
}
