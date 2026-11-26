// Eğitmen yetkileri: ekranın neyi göstereceği. Asıl karar sunucuda (routes/staff.js); burası yalnızca
// yetkisi olmayan düğmeyi hiç çizmemek için. Yönetici her şeyi yapabilir.

export const isInstructor = (user) => user.role === 'instructor';

// can(user, 'attendance') -> bu kullanıcı bu işi yapabilir mi?
export const can = (user, permission) => user.role === 'admin' || user.permissions?.[permission] === true;

// Yönetici ekranındaki yetki anahtarları (spec 5.2 tablosuyla aynı sıra ve gruplar).
// needsViewCustomers: "Üyeleri görmek" kapalıyken açılamaz (sunucu da kapatır).
export const PERMISSION_GROUPS = [
  {
    title: 'Dersler',
    items: [
      { key: 'attendance', label: 'Yoklama almak', hint: 'Gerekirse başka eğitmenin dersini devralarak.' },
      { key: 'cancel_own_sessions', label: 'Kendi dersini iptal etmek' },
      { key: 'create_extra_sessions', label: 'Ek ders açmak' },
      { key: 'manage_attendees', label: 'Derse elle üye eklemek, dersten çıkarmak', hint: 'Üye eklemek için üyeleri görmesi de gerekir.' },
    ],
  },
  {
    title: 'Üyeler (kendi şubelerinde)',
    items: [
      { key: 'view_customers', label: 'Üyeleri ve telefonlarını görmek' },
      { key: 'edit_customers', label: 'Yeni üye eklemek, şifresini sıfırlamak', needsViewCustomers: true },
      { key: 'customer_status', label: 'Dondurmak, ayrıldı işaretlemek, grubunu değiştirmek', needsViewCustomers: true },
      { key: 'memberships', label: 'Paket tanımlamak, telafi hakkı vermek', hint: 'Fiyatları görmez.', needsViewCustomers: true },
    ],
  },
  {
    title: 'Gruplar',
    items: [{ key: 'manage_groups', label: 'Grup açmak, düzenlemek, kapatmak' }],
  },
];

// Paneldeki bölümler. Eğitmen: Bugün her zaman; Müşteriler ve Gruplar yetkisine göre; Ödemeler, Ayarlar ve
// Eğitmenler hiç.
const ALL_TABS = [
  { id: 'today', label: 'Bugün' },
  // Analiz fiyat içerir: yalnızca yönetici (eğitmen kümesine hiç eklenmez).
  { id: 'dashboard', label: 'Analiz' },
  { id: 'customers', label: 'Müşteriler' },
  { id: 'groups', label: 'Gruplar' },
  { id: 'instructors', label: 'Eğitmenler' },
  { id: 'payments', label: 'Ödemeler' },
  { id: 'settings', label: 'Ayarlar' },
];

export function visibleTabs(user) {
  if (!isInstructor(user)) return ALL_TABS;
  const allowed = new Set(['today']);
  if (can(user, 'view_customers')) allowed.add('customers');
  if (can(user, 'manage_groups')) allowed.add('groups');
  return ALL_TABS.filter((tab) => allowed.has(tab.id));
}
