import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Button from '../components/Button.jsx';
import Sheet from '../components/Sheet.jsx';
import { formatDateDayMonth } from '../format.js';
import { WEEKDAYS } from './groupDays.js';
import styles from './Admin.module.css';

export default function GroupDetailPage({ groupId, initialNotice = null, onBack, onEdit, onOpenCustomer }) {
  const [group, setGroup] = useState(null);
  const [error, setError] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Düzenlemeden dönünce "Kaydedildi…" bildirimi burada gösterilir.
  const [notice, setNotice] = useState(initialNotice);

  function load() {
    return api(`/api/admin/groups/${groupId}`).then(({ group: data }) => setGroup(data), (err) => setError(err.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- grup değişince yeniden yüklenir
  }, [groupId]);

  async function close() {
    setBusy(true);
    setCloseError(null);
    try {
      const result = await api(`/api/admin/groups/${groupId}/close`, { method: 'POST' });
      setClosing(false);
      setNotice(
        result.refundedMakeups > 0
          ? `Grup kapatıldı. ${result.refundedMakeups} telafi kaydı iptal edildi, hakları iade edildi.`
          : 'Grup kapatıldı.',
      );
      await load();
    } catch (err) {
      setCloseError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <button type="button" className={styles.back} onClick={onBack}>
      ‹ Gruplar
    </button>
  );
  if (error || !group) {
    return (
      <main className={styles.page}>
        {back}
        {error && <p className={styles.muted}>{error}</p>}
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {back}
      <h1 className={styles.rosterTitle}>{group.name}</h1>

      <div className={styles.days} aria-label="Günler">
        {WEEKDAYS.map((day) => (
          <span
            key={day.value}
            className={`${styles.day} ${group.weekdays.includes(day.value) ? styles.dayOn : ''}`}
            aria-label={`${day.long}${group.weekdays.includes(day.value) ? '' : ' (yok)'}`}
          >
            {day.short}
          </span>
        ))}
      </div>
      <p className={styles.subtitle}>
        {group.startTime}, {group.durationMinutes} dk, {group.capacity} kişilik
        {group.scheduleStartsOn && ` (bu program ${formatDateDayMonth(group.scheduleStartsOn)} tarihinden itibaren)`}
        {!group.isActive && ', grup kapalı'}
      </p>

      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {group.isActive && (
        <div className={styles.formSubmit}>
          <Button variant="quiet" type="button" onClick={() => onEdit(group)}>
            Düzenle
          </Button>
        </div>
      )}

      <h2 className={styles.listLabel}>Üyeler ({group.members.length})</h2>
      {group.members.length === 0 ? (
        <p className={styles.muted}>Bu grupta üye yok.</p>
      ) : (
        <ul className={styles.people}>
          {group.members.map((member) => (
            <li key={member.id}>
              <button type="button" className={styles.memberRow} onClick={() => onOpenCustomer(member.id)}>
                <span>{member.fullName}</span>
                {member.joinsOn ? (
                  <span className={styles.tagMakeup}>{formatDateDayMonth(member.joinsOn)} tarihinde katılıyor</span>
                ) : member.leavesOn ? (
                  <span className={styles.tagCancel}>{formatDateDayMonth(member.leavesOn)} tarihinde ayrılıyor</span>
                ) : (
                  member.isFrozen && <span className={styles.tagCancel}>Dondurulmuş</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {group.isActive && (
        <ul className={styles.people}>
          <li>
            <button type="button" className={`${styles.actionRow} ${styles.danger}`} onClick={() => setClosing(true)}>
              <span>Grubu kapat</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
      )}

      <Sheet open={closing} onClose={() => setClosing(false)} title="Grubu kapat">
        <p className={styles.sheetText}>
          Grup kapanınca gelecekteki dersleri kaldırılır; bu derslere yazılmış telafiler iptal edilir ve hakları iade
          edilir. Geçmiş kayıtlar silinmez.
        </p>
        {closeError && <p className={styles.formError}>{closeError}</p>}
        <div className={styles.dangerButton}>
          <Button type="button" busy={busy} busyLabel="Kapatılıyor…" onClick={close}>
            Grubu kapat
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
