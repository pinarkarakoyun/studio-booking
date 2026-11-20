// Üyelik dönemlerini okuyan ortak sorgu. Hem üyelik ekranları (adminMemberships) hem seans paketi hesabı
// (packageUsage) aynı bitiş tarihini (dondurmayla uzamış) kullansın diye tek yerde.

// Dönemler ($2 = stüdyonun bugünü; WHERE çağıran yerde eklenir). Dondurma uzaması: dönemin (dondurmasız) tarihlerine denk gelen dondurma
// günleri kadar bitiş ileri kayar (BR-36). Bitişi belirsiz dondurma bugüne kadar sayılır.
export const MEMBERSHIP_SELECT = `
  SELECT m.id, m.user_id, m.starts_on, m.ends_on, m.fee_kurus, m.note, m.session_count, m.package_name,
         (m.ends_on + ext.days) AS effective_ends_on, ext.days AS freeze_days,
         COALESCE(paid.total, 0)::bigint AS paid_kurus
  FROM memberships m
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(GREATEST(0,
             LEAST(m.ends_on, COALESCE(f.ends_on, $2::date)) - GREATEST(m.starts_on, f.starts_on) + 1
           )), 0)::int AS days
    FROM freezes f WHERE f.user_id = m.user_id
  ) AS ext
  LEFT JOIN LATERAL (SELECT SUM(amount_kurus) AS total FROM payments p WHERE p.membership_id = m.id) AS paid ON true`;
