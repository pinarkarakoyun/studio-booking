// Tarih ve saat biçimlendirme. İki tür değerle çalışıyoruz:
//   date     "2026-10-26"                 takvim günü, saat dilimi yok (sessions.date)
//   instant  "2026-10-26T06:00:00.000Z"   dünya üzerinde tek bir an (startsAt, son tarihler)
// Takvim günleri UTC öğlen olarak yorumlanır; böylece hangi ülkede açılırsa açılsın gün kaymaz.
// Anlar ise stüdyonun saat diliminde gösterilir (müşteri yurt dışındayken bile ders saati 09:00 görünür).

const asCalendarDay = (date) => new Date(`${date}T12:00:00Z`);

function parts(date, options) {
  const values = {};
  for (const part of new Intl.DateTimeFormat('tr-TR', { ...options, timeZone: 'UTC' }).formatToParts(asCalendarDay(date))) {
    values[part.type] = part.value;
  }
  return values;
}

// "Pazartesi 26 Ekim" (Türkçe'nin varsayılan sırası "26 Ekim Pazartesi"; taslaktaki sırayı kuruyoruz)
export function formatDay(date) {
  const { weekday, day, month } = parts(date, { weekday: 'long', day: 'numeric', month: 'long' });
  return `${weekday} ${day} ${month}`;
}

// Takvim günü için "2 Kasım" (dondurma bitişi gibi saatsiz tarihler)
export function formatDateDayMonth(date) {
  const { day, month } = parts(date, { day: 'numeric', month: 'long' });
  return `${day} ${month}`;
}

// "Cumartesi"
export function formatWeekday(date) {
  return parts(date, { weekday: 'long' }).weekday;
}

// Gün şeridi için: { weekday: "Pzt", day: "26" }
export function formatDayShort(date) {
  const { weekday, day } = parts(date, { weekday: 'short', day: 'numeric' });
  return { weekday, day };
}

// "09:00"
export function formatTime(instant, timeZone) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(instant));
}

// "Pazartesi 07:00": iptal son saati gibi yakın tarihler için
export function formatWeekdayTime(instant, timeZone) {
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(instant),
  );
}

// "4 Kasım": hak bitiş tarihi gibi
export function formatDayMonth(instant, timeZone) {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone }).format(new Date(instant));
}

// "+905334445566" -> "0533 444 55 66" (Türkiye numaraları); diğerleri olduğu gibi.
export function formatPhone(e164) {
  const match = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164 ?? '');
  return match ? `0${match[1]} ${match[2]} ${match[3]} ${match[4]}` : e164;
}

// Stüdyonun saat dilimine göre bugünün takvim günü: "2026-10-23"
export function todayIn(timeZone) {
  // en-CA biçimi YYYY-MM-DD verir.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

function mondayOf(date) {
  const day = asCalendarDay(date);
  const offset = (day.getUTCDay() + 6) % 7; // Pazartesi = 0
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
}

// "Bu hafta" / "Gelecek hafta" / "Daha sonra" (hafta Pazartesi başlar)
export function weekLabel(date, today) {
  const weeks = Math.round((mondayOf(date) - mondayOf(today)) / (7 * 24 * 60 * 60 * 1000));
  if (weeks <= 0) return 'Bu hafta';
  if (weeks === 1) return 'Gelecek hafta';
  return 'Daha sonra';
}

// Bir takvim gününe gün ekleyip anı döndürür (hak bitişi: ders başlangıcı + N gün).
export function addDays(instant, days) {
  const result = new Date(instant);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}
