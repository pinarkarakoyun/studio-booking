import { formatDateDayMonth } from './format.js';

// Üye ana ekranındaki tek satırlık uyarı şeridi: yalnızca bir şey yapılması gerektiğinde (yenileme zamanı) çıkar.
// Ayrıntılar Üyeliğim sayfasında; şeride dokununca o sayfa açılır. Saf fonksiyon: testleri
// server/test/membershipNotice.test.js'te.
// membership: /api/me/membership yanıtı (yoksa null). reminderDays: stüdyonun "bitişe kaç gün kala" ayarı.
// Dönüş: gösterilecek metin ya da null.

const daysUntil = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

function inDays(days) {
  if (days === 0) return 'bugün';
  if (days === 1) return 'yarın';
  return `${days} gün sonra`;
}

export function membershipNotice({ membership, packageModel, reminderDays, today }) {
  if (packageModel) {
    if (!membership) return 'Henüz bir paketin yok.';
    if (membership.ended) return `Paketinin son günü ${formatDateDayMonth(membership.endsOn)} tarihinde geçti.`;
    if (membership.remaining === 0) return 'Paketindeki seanslar bitti.';
    const left = daysUntil(today, membership.endsOn);
    return left <= reminderDays ? `Paketinin son günü ${inDays(left)}.` : null;
  }
  if (!membership) return null;
  if (membership.ended) return `Üyeliğin ${formatDateDayMonth(membership.endsOn)} tarihinde bitti.`;
  const left = daysUntil(today, membership.endsOn);
  return left <= reminderDays ? `Üyeliğin ${inDays(left)} bitiyor.` : null;
}
