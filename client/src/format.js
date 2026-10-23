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

// Para kuruş cinsinden tamsayı olarak gelir (150000 = 1.500 ₺). Küsuratı yoksa gösterilmez.
export function formatMoney(kurus) {
  const lira = kurus / 100;
  return `${lira.toLocaleString('tr-TR', { minimumFractionDigits: Number.isInteger(lira) ? 0 : 2, maximumFractionDigits: 2 })} ₺`;
}

// Yöneticinin yazdığı tutarı kuruşa çevirir; anlaşılamazsa null.
// Türkçe yazım: nokta binlik ayıracı, virgül ondalık ("1.500" = bin beş yüz, "1500,50" = bin beş yüz lira elli kuruş).
// Tek bir nokta ve arkasında 1-2 hane varsa ("1500.5") ondalık sayılır; telefon klavyesi bazen sadece nokta verir.
export function parseMoney(text) {
  const value = String(text).replace(/[\s₺]/g, '');
  let normalized;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(value) || /^\d+(,\d{1,2})?$/.test(value)) {
    normalized = value.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(value)) {
    normalized = value;
  } else {
    return null;
  }
  return Math.round(Number(normalized) * 100);
}

// Takvim gününe ay ekler ve bir gün çıkarır: 1 Kasım + 1 ay -> 30 Kasım (dönemin son günü).
// Ay sonu taşmasında ayın son gününe sabitlenir (31 Ocak + 1 ay = 28 Şubat, dönem 27 Şubat'ta biter).
// Yönetici bitiş tarihini her zaman elle değiştirebilir.
export function addMonthsInclusive(date, months) {
  const start = asCalendarDay(date);
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  target.setUTCDate(target.getUTCDate() - 1);
  return target.toISOString().slice(0, 10);
}
