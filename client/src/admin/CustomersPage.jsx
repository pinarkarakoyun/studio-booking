import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatDateDayMonth, formatPhone } from '../format.js';
import styles from './Admin.module.css';

// Filtreler: dondurma bugün başlamışsa "dondurulmuş"; ileri tarihli dondurma hâlâ "aktif" sayılır.
const FILTERS = [
  { id: 'active', label: 'Aktif', test: (c) => c.status === 'active' && !c.freeze?.active },
  { id: 'frozen', label: 'Dondurulmuş', test: (c) => c.status === 'active' && c.freeze?.active },
  { id: 'left', label: 'Ayrıldı', test: (c) => c.status === 'left' },
];

// Aramada büyük/küçük harf ve Türkçe karakterler (İ/i, I/ı) doğru eşleşsin; telefon boşluksuz aransın.
const normalize = (text) => text.toLocaleLowerCase('tr').replace(/\s+/g, '');

function matches(customer, query) {
  if (!query) return true;
  const q = normalize(query);
  const digits = query.replace(/\D/g, '');
  return (
    normalize(customer.fullName).includes(q) ||
    (digits.length >= 3 && customer.phone.replace(/\D/g, '').includes(digits.replace(/^0/, '')))
  );
}

export default function CustomersPage({ onOpen, onAdd }) {
  const [customers, setCustomers] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');

  useEffect(() => {
    api('/api/admin/customers').then(({ customers: list }) => setCustomers(list), (err) => setError(err.message));
  }, []);

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, customers?.filter(f.test).length ?? 0]));
  const active = FILTERS.find((f) => f.id === filter);
  const visible = customers?.filter((c) => active.test(c) && matches(c, query)) ?? [];

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Müşteriler</h1>
        <button type="button" className={styles.addLink} onClick={onAdd}>
          + Ekle
        </button>
      </div>

      <input
        type="search"
        className={styles.search}
        placeholder="İsim veya telefon ara"
        aria-label="Müşteri ara"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className={styles.chips} role="group" aria-label="Durum">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.chip} ${filter === f.id ? styles.chipOn : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} {customers ? counts[f.id] : ''}
          </button>
        ))}
      </div>

      {error && <p className={styles.muted}>{error}</p>}
      {customers && visible.length === 0 && (
        <p className={styles.muted}>{query ? 'Aramana uyan müşteri yok.' : 'Bu listede müşteri yok.'}</p>
      )}

      <ul className={styles.list}>
        {visible.map((customer) => (
          <li key={customer.id}>
            <button type="button" className={styles.customerRow} onClick={() => onOpen(customer.id)}>
              <span>
                <span className={styles.customerName}>{customer.fullName}</span>
                <span className={styles.customerMeta}>
                  {customer.group?.name ??
                    (customer.upcomingGroup
                      ? `${customer.upcomingGroup.name}, ${formatDateDayMonth(customer.upcomingGroup.startsOn)} tarihinden itibaren`
                      : formatPhone(customer.phone))}
                </span>
              </span>
              <CustomerTag customer={customer} />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

// İsmin yanında sadece önemli bilgi: dondurma ya da kullanılmamış telafi hakkı.
function CustomerTag({ customer }) {
  if (customer.freeze?.active) {
    return (
      <span className={styles.tagCancel}>
        Dondurulmuş{customer.freeze.endsOn ? `, ${formatDateDayMonth(customer.freeze.endsOn)} tarihine kadar` : ''}
      </span>
    );
  }
  if (customer.freeze) {
    return <span className={styles.tagCancel}>{formatDateDayMonth(customer.freeze.startsOn)} tarihinde donacak</span>;
  }
  if (customer.unusedCredits > 0) {
    return <span className={styles.tagMakeup}>{customer.unusedCredits} telafi hakkı</span>;
  }
  return null;
}
