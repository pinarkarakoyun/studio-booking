// Haftanın günleri (ISO: 1 = Pazartesi ... 7 = Pazar); grup ekranlarının ortak kısaltmaları.
export const WEEKDAYS = [
  { value: 1, short: 'Pt', long: 'Pazartesi' },
  { value: 2, short: 'Sa', long: 'Salı' },
  { value: 3, short: 'Ça', long: 'Çarşamba' },
  { value: 4, short: 'Pe', long: 'Perşembe' },
  { value: 5, short: 'Cu', long: 'Cuma' },
  { value: 6, short: 'Ct', long: 'Cumartesi' },
  { value: 7, short: 'Pz', long: 'Pazar' },
];

// [1, 3, 5] -> "Pt, Ça, Cu"
export const daysText = (weekdays) =>
  WEEKDAYS.filter((d) => weekdays.includes(d.value)).map((d) => d.short).join(', ');
