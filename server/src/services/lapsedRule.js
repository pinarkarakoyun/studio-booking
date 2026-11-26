// "Bir aydır gelmeyen" kuralı: Analiz sekmesindeki geri kazanılacak üyeler listesi.
// Saf fonksiyon (veritabanı yok): kararı test etmek ve sonradan değiştirmek kolay olsun diye ayrı dosyada.
// Listeye yalnızca ayrılmamış müşteriler gelir (status <> 'left'); onları süzmek adminDashboard.js'in işi.

// Kaç gün gelmeyen "kopmuş" sayılır?
export const LAPSED_AFTER_DAYS = 30;

// İki takvim günü arasındaki gün farkı ("2026-11-01", "2026-11-26" -> 25).
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

// lastVisitOn: son geldiği dersin günü ("2026-10-12"), hiç gelmediyse null.
// joinedOn:    hesabının açıldığı gün (stüdyo saatiyle).
// isFrozenToday: bugün dondurulmuş mu (tatil, sakatlık...).
// today:       stüdyonun bugünü.
// Dönüş: true -> listede görünür.
// Kararlar (26 Kasım):
//   - Donmuş üye listeye girmez: tatildeki ya da sakat üyeyi aramak yersiz; dondurma bitince gelmezse girer.
//   - Hiç gelmemiş üye, hesabı açılalı eşik kadar gün geçtiyse girer (büyük olasılıkla vazgeçmiştir).
//   - Eşik günü dahil: tam 30 gün önce gelen kopmuş sayılır.
export function isLapsed({ lastVisitOn, joinedOn, isFrozenToday, today }) {
  if (isFrozenToday) return false;
  return daysBetween(lastVisitOn ?? joinedOn, today) >= LAPSED_AFTER_DAYS;
}
