// Eğitmen yetkilerinin adları: instructor_permissions tablosunun sütunlarıyla birebir aynı (migration 019).
// Sıra, yönetici ekranındaki sırayla aynıdır. Varsayılanlar veritabanında.
export const PERMISSION_KEYS = [
  'attendance',
  'cancel_own_sessions',
  'create_extra_sessions',
  'manage_attendees',
  'view_customers',
  'edit_customers',
  'customer_status',
  'memberships',
  'manage_groups',
];

// Üyeleri görmeden açılamayan yetkiler (veritabanındaki instructor_permissions_customer_dependency kuralı).
export const NEEDS_VIEW_CUSTOMERS = ['edit_customers', 'customer_status', 'memberships'];
