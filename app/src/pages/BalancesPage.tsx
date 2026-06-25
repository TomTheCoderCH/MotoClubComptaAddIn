import { useEffect, useState } from 'react';
import type { FiscalYear, AccountBalance } from '../types';
import { formatCHF as fmt } from '../lib/format';
import styles from './BalancesPage.module.css';

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

interface BalancesPageProps {
  onOpenLedger?: (accountId: number, fiscalYearId: number) => void;
}

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

export default function BalancesPage({ onOpenLedger }: BalancesPageProps) {
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
      <div className={styles.header}>
        <h1 className={styles.h1}>Soldes</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="year-select" className={styles.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYearId ?? ''}
              onChange={e => setSelectedYearId(Number(e.target.value))}
              className={styles.select}
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

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p className={styles.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : balances.length === 0 ? (
        <p className={styles.empty}>Aucun mouvement pour cet exercice.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr className={styles.theadRow}>
              <th className={styles.th}>N°</th>
              <th className={styles.th}>Compte</th>
              <th className={`${styles.th} ${styles.thRight}`}>Débit CHF</th>
              <th className={`${styles.th} ${styles.thRight}`}>Crédit CHF</th>
              <th className={`${styles.th} ${styles.thRight}`}>Solde CHF</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <GroupRows
                key={group.class}
                group={group}
                selectedYearId={selectedYearId}
                onOpenLedger={onOpenLedger}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupRows({
  group,
  selectedYearId,
  onOpenLedger,
}: {
  group: BalanceGroup;
  selectedYearId: number | null;
  onOpenLedger?: (accountId: number, fiscalYearId: number) => void;
}) {
  const clickable = !!onOpenLedger;
  return (
    <>
      <tr>
        <td colSpan={5} className={styles.groupCell}>{group.label}</td>
      </tr>
      {group.rows.map(row => (
        <tr
          key={row.number}
          className={`${styles.dataRow}${clickable ? ` ${styles.dataRowClickable}` : ''}`}
          onClick={() => clickable && selectedYearId != null && onOpenLedger!(row.id, selectedYearId)}
        >
          <td className={`${styles.td} ${styles.tdMono}`}>{row.number}</td>
          <td className={styles.td}>{row.name}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.total_debit)}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.total_credit)}</td>
          <td className={`${styles.td} ${styles.tdRight}`} data-negative={row.solde < 0 || undefined}>
            {fmt(row.solde)}
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={2} className={`${styles.subtotalCell} ${styles.subtotalCellItalic}`}>
          Sous-total {group.label}
        </td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`}>{fmt(group.totalDebit)}</td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`}>{fmt(group.totalCredit)}</td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`} data-negative={group.totalSolde < 0 || undefined}>
          {fmt(group.totalSolde)}
        </td>
      </tr>
    </>
  );
}
