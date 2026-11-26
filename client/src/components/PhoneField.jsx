import { useLayoutEffect, useRef } from 'react';
import { caretAfterDigits, formatPhoneDigits, phoneDigits } from '../phoneInput.js';
import TextField from './TextField.jsx';

// Telefon alanı: başta silinemeyen "0", kullanıcı yalnızca rakamları yazar, alan "0 (532) 123 45 67" olur.
// Üye "başa 0 koyayım mı?" diye düşünmesin; yazdığı ya da yapıştırdığı 0 / +90 yutulur.
// value tam numaradır ("05321234567", boşsa ""); formlar ve sunucu bu biçimi zaten tanıyor. onChange, sıradan bir
// metin alanı gibi { target: { value } } alır; formlardaki update('phone') yardımcıları değişmeden kullanılır.
// autoComplete: giriş sayfasında "tel-national" (tarayıcı kendi numaranı önerir); yöneticinin başkası adına
// doldurduğu formlarda "off".
export default function PhoneField({ label, value, onChange, error, hint, autoFocus, autoComplete = 'tel-national' }) {
  const inputRef = useRef(null);
  // Biçim değişince imleci yazılan rakamın arkasına koymak için (ortadan düzeltme yapılabilsin).
  const caretRef = useRef(null);
  const digits = phoneDigits(value);
  const formatted = formatPhoneDigits(digits);

  useLayoutEffect(() => {
    if (caretRef.current === null || document.activeElement !== inputRef.current) return;
    const position = caretAfterDigits(formatted, caretRef.current);
    inputRef.current.setSelectionRange(position, position);
    caretRef.current = null;
  });

  function handleChange(event) {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    let typedBefore = raw.slice(0, caret).replace(/\D/g, '').length;
    let next = phoneDigits(raw);
    // Yalnızca bir biçim karakteri silindiyse (")" ya da boşluk) rakamlar değişmez; kullanıcı silmek istemişti:
    // imlecin solundaki rakamı sil.
    if (next === digits && raw.length < formatted.length && typedBefore > 0) {
      next = digits.slice(0, typedBefore - 1) + digits.slice(typedBefore);
      typedBefore -= 1;
    }
    // Yapıştırılan +90 / 0 yutulduysa imleç sona.
    caretRef.current = Math.min(typedBefore, next.length);
    onChange({ target: { value: next ? `0${next}` : '' } });
  }

  return (
    <TextField
      ref={inputRef}
      label={label}
      prefix="0"
      type="tel"
      inputMode="numeric"
      autoComplete={autoComplete}
      value={formatted}
      onChange={handleChange}
      error={error}
      hint={hint}
      autoFocus={autoFocus}
    />
  );
}
