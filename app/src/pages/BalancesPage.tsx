import { useEffect, useState } from 'react';
import type { FiscalYear, AccountBalance } from '../types';

const CLASS_LABELS: Record<number, string> = {
  1: 'Classe 1 — Actifs',
  2: 'Classe 2 — Passifs et fonds propres',
  3: 'Classe 3 — Produits',
  4: 'Classe 4 — Charges',
  9: 'Classe 9 — Clôture',
};

type BalanceGroup = {
  class: number;
  label: string;
  rows: AccountBalance[];
  totalDebit:  number;
  totalCredit: number;
  totalSolde:  number;
};

function groupBalances(balances: AccountBalance[]): BalanceGroup[] {
  const map = new Map<number, AccountBalance[]>();
  for (const b of balances) {
    const list = map.get(b.class) ?? [];
    list.push(b);
    map.set(b.class, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([cls, rows]) => ({
      class:       cls,
      label:       CLASS_LABELS[cls] ?? `Classe ${cls}`,
      rows,
      totalDebit:  rows.reduce((sum, r) => sum + r.total_debit,  0),
      totalCredit: rows.reduce((sum, r) => sum + r.total_credit, 0),
      totalSolde:  rows.reduce((sum, r) => sum + r.solde,        0),
    }));
}

function fmt(centimes: number): string {
  return (centimes / 100).toFixed(2);
}

export default function BalancesPage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [balances,       setBalances]       = useState<AccountBalance[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    window.api.getFiscalYears()
      .then(ys => {
        setYears(ys);
        const open = ys.find(y => !y.is_closed);
        if (open)           setSelectedYearId(open.id);
        else if (ys.length) setSelectedYearId(ys[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedYearId === null) return;
    setLoading(true);
    window.api.getAccountBalances(selectedYearId)
      .then(setBalances)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  const groups = groupBalances(balances);

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.h1}>Soldes</h1>
        {years.length > 0 && (
          <div style={s.yearSelector}>
            <label htmlFor="year-select" style={s.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYearId ?? ''}
              onChange={e => setSelectedYearId(Number(e.target.value))}
              style={s.select}
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>
                  {y.year}{y.is_closed ? ' (clôturé)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div role="alert" style={s.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p style={s.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : loading ? (
        <p style={s.empty}>Chargement…</p>
      ) : balances.length === 0 ? (
        <p style={s.empty}>Aucun mouvement pour cet exercice.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr style={s.theadRow}>
              <th style={s.th}>N°</th>
              <th style={s.th}>Compte</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Débit CHF</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Crédit CHF</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Solde CHF</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <GroupRows key={group.class} group={group} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupRows({ group }: { group: BalanceGroup }) {
  return (
    <>
      <tr style={s.groupRow}>
        <td colSpan={5} style={s.groupCell}>{group.label}</td>
      </tr>
      {group.rows.map(row => (
        <tr key={row.number} style={s.dataRow}>
          <td style={{ ...s.td, fontFamily: 'monospace' }}>{row.number}</td>
          <td style={s.td}>{row.name}</td>
          <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(row.total_debit)}</td>
          <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(row.total_credit)}</td>
          <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace', color: row.solde < 0 ? '#dc2626' : 'inherit' }}>
            {fmt(row.solde)}
          </td>
        </tr>
      ))}
      <tr style={s.subtotalRow}>
        <td colSpan={2} style={{ ...s.subtotalCell, fontStyle: 'italic' }}>
          Sous-total {group.label}
        </td>
        <td style={{ ...s.subtotalCell, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(group.totalDebit)}</td>
        <td style={{ ...s.subtotalCell, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(group.totalCredit)}</td>
        <td style={{ ...s.subtotalCell, textAlign: 'right', fontFamily: 'monospace', color: group.totalSolde < 0 ? '#dc2626' : 'inherit' }}>
          {fmt(group.totalSolde)}
        </td>
      </tr>
    </>
  );
}

const s = {
  header:      { display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' as const },
  h1:          { margin: 0, fontSize: '1.5rem', color: '#0f172a' },
  yearSelector:{ display: 'flex', alignItems: 'center', gap: '0.5rem' },
  label:       { fontWeight: 500, fontSize: '0.875rem', color: '#475569' },
  select:      { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff' },
  error:       { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' },
  empty:       { color: '#64748b', fontSize: '0.875rem' },
  table:       { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow:    { background: '#f1f5f9' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  groupRow:    {},
  groupCell:   { padding: '0.5rem 1rem', fontWeight: 600, color: '#334155', background: '#f1f5f9', fontSize: '0.8rem', letterSpacing: '0.02em' },
  dataRow:     { borderBottom: '1px solid #f1f5f9' },
  td:          { padding: '0.4rem 1rem', color: '#334155' },
  subtotalRow: {},
  subtotalCell:{ padding: '0.45rem 1rem', color: '#334155', background: '#e2e8f0', borderTop: '1px solid #cbd5e1' },
} as const;
