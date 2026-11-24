import styles from './Admin.module.css';

// Eğitmenin şubeleri: birden çok seçilebilen hap düğmeler (grup formundaki gün seçimi gibi).
export default function BranchChoices({ branches, selected, onChange, error }) {
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((b) => b !== id) : [...selected, id]);
  return (
    <fieldset className={styles.choiceGroup}>
      <legend>Şubeler</legend>
      <div className={styles.choices}>
        {branches.map((branch) => {
          const on = selected.includes(branch.id);
          return (
            <button
              key={branch.id}
              type="button"
              className={`${styles.choice} ${on ? styles.choiceOn : ''}`}
              aria-pressed={on}
              onClick={() => toggle(branch.id)}
            >
              {branch.name}
            </button>
          );
        })}
      </div>
      {error && <p className={styles.formError}>{error}</p>}
    </fieldset>
  );
}
