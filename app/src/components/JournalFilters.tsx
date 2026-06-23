import type { Account, JournalFilters as Filters } from '../types';
import { DEFAULT_FILTERS } from '../types';
import styles from './JournalFilters.module.css';

interface JournalFiltersProps {
  filters:   Filters;
  accounts:  Account[];
  onChange:  (filters: Filters) => void;
}

export default function JournalFilters({ filters, accounts, onChange }: JournalFiltersProps) {
  return (
    <div className={styles.bar}>
      <input
        type="text"
        value={filters.text}
        onChange={e => onChange({ ...filters, text: e.target.value })}
        placeholder="Rechercher dans le libellé ou la pièce…"
        aria-label="Recherche dans le libellé ou la pièce"
        className={styles.input}
      />
      <select
        value={filters.accountId ?? ''}
        onChange={e => onChange({ ...filters, accountId: e.target.value ? Number(e.target.value) : null })}
        aria-label="Filtrer par compte"
        className={styles.input}
      >
        <option value="">Tous les comptes</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.number} — {a.name}</option>
        ))}
      </select>
      <label className={styles.label}>
        Date de début
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
          className={styles.dateInput}
        />
      </label>
      <label className={styles.label}>
        Date de fin
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })}
          className={styles.dateInput}
        />
      </label>
      <button onClick={() => onChange(DEFAULT_FILTERS)} className={styles.resetBtn}>
        Réinitialiser
      </button>
    </div>
  );
}
