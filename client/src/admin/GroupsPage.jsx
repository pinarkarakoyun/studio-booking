import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { daysText } from './groupDays.js';
import styles from './Admin.module.css';

export default function GroupsPage({ onOpen, onAdd }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    api('/api/admin/groups').then(({ groups: list }) => setGroups(list), (err) => setError(err.message));
  }, []);

  const open = groups?.filter((g) => g.isActive) ?? [];
  const closed = groups?.filter((g) => !g.isActive) ?? [];
  const members = open.reduce((sum, g) => sum + g.memberCount, 0);
  const seats = open.reduce((sum, g) => sum + g.capacity, 0);

  return (
    <main className={styles.page}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Gruplar</h1>
        <button type="button" className={styles.addLink} onClick={onAdd}>
          + Ekle
        </button>
      </div>
      {groups && (
        <p className={styles.subtitle}>
          {open.length} grup, {members} üye, {seats} kişilik yer
        </p>
      )}
      {error && <p className={styles.muted}>{error}</p>}
      {groups && open.length === 0 && <p className={styles.muted}>Henüz grup yok. İlk grubu ekleyerek başla.</p>}

      <ul className={styles.list}>
        {open.map((group) => (
          <li key={group.id}>
            <GroupRow group={group} onOpen={() => onOpen(group.id)} />
          </li>
        ))}
      </ul>

      {closed.length > 0 && (
        <>
          <button type="button" className={styles.closedToggle} onClick={() => setShowClosed((v) => !v)}>
            Kapalı gruplar ({closed.length}) {showClosed ? '▾' : '›'}
          </button>
          {showClosed && (
            <ul className={styles.list}>
              {closed.map((group) => (
                <li key={group.id}>
                  <GroupRow group={group} onOpen={() => onOpen(group.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function GroupRow({ group, onOpen }) {
  const full = group.memberCount >= group.capacity;
  const fill = Math.min(100, Math.round((group.memberCount / group.capacity) * 100));
  return (
    <button type="button" className={`${styles.groupRow} ${group.isActive ? '' : styles.inactive}`} onClick={onOpen}>
      <span className={styles.groupTop}>
        <strong>{group.name}</strong>
        {group.isActive && (
          <strong className={full ? styles.full : undefined}>
            {group.memberCount}/{group.capacity}
          </strong>
        )}
      </span>
      <span className={styles.customerMeta}>
        {daysText(group.weekdays)}, {group.startTime}, {group.durationMinutes} dk
      </span>
      {group.isActive && (
        <span className={`${styles.bar} ${styles.groupBar}`} aria-hidden="true">
          <span style={{ width: `${fill}%` }} />
        </span>
      )}
    </button>
  );
}
