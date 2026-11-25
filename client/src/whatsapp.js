import { formatDay, formatTime } from './format.js';

// WhatsApp'ı hazır metinle açan bağlantı (alıcı seçilmemiş; kişi gruba ya da kişiye kendisi gönderir).
// Sistem hiçbir mesaj göndermez, metin sunucuya da gitmez.
export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// Ek ders duyurusu: "Ek ders açtım: Cumartesi 29 Kasım, 10:40, Kuzey şubesi. Gelmek isteyenler sistemden yerini
// ayırsın: https://…". Saate ek yapıştırmıyoruz ("10:00'da" ama "10:40'ta"); cümle eksiz kuruldu.
// Şube adı yalnızca çok şubeli stüdyoda verilir.
export function extraSessionMessage({ date, startsAt, timeZone, branchName, url }) {
  const parts = [formatDay(date), formatTime(startsAt, timeZone), branchName && `${branchName} şubesi`].filter(Boolean);
  return `Ek ders açtım: ${parts.join(', ')}. Gelmek isteyenler sistemden yerini ayırsın: ${url}`;
}
