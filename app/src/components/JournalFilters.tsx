import type { Account, JournalFilters as Filters } from '../types';
import { DEFAULT_FILTERS } from '../types';

interface JournalFiltersProps {
  filters:   Filters;
  accounts:  Account[];
  onChange:  (filters: Filters) => void;
}

export default function JournalFilters({ filters, accounts, onChange }: JournalFiltersProps) {
  return (
    <div style={s.bar}>
      <input
        type="text"
        value={filters.text}
        onChange={e => onChange({ ...filters, text: e.target.value })}
        placeholder="Rechercher dans le libellé ou la pièce…"
        aria-label="Recherche dans le libellé ou la pièce"
        style={s.input}
      />
      <select
        value={filters.accountId ?? ''}
        onChange={e => onChange({ ...filters, accountId: e.target.value ? Number(e.target.value) : null })}
        aria-label="Filtrer par compte"
        style={s.input}
      >
        <option value="">Tous les comptes</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.number} — {a.name}</option>
        ))}
      </select>
      <label style={s.label}>
        Date de début
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
          style={s.dateInput}
        />
      </label>
      <label style={s.label}>
        Date de fin
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })}
          style={s.dateInput}
        />
      </label>
      <button onClick={() => onChange(DEFAULT_FILTERS)} style={s.resetBtn}>
        Réinitialiser
      </button>
    </div>
  );
}

const s = {
  bar:      { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' },
  input:    { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.8rem', color: '#0f172a', background: '#fff', minWidth: '180px' },
  label:    { display: 'flex', flexDirection: 'column' as const, gap: '0.2rem', fontSize: '0.75rem', color: '#64748b' },
  dateInput:{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: '#0f172a', background: '#fff' },
  resetBtn: { padding: '0.35rem 0.75rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' as const },
} as const;
