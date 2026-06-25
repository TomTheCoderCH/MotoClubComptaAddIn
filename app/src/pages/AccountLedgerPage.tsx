import { useEffect, useState } from 'react';
import type { AccountLedgerData } from '../types';
import { formatCHF as fmt, formatDate } from '../lib/format';
import Tooltip from '../components/Tooltip';
import styles from './AccountLedgerPage.module.css';

interface AccountLedgerPageProps {
  accountId:    number;
  fiscalYearId: number;
  onBack:       () => void;
}

export default function AccountLedgerPage({ accountId, fiscalYearId, onBack }: AccountLedgerPageProps) {
  const [data,    setData]    = useState<AccountLedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.api.getAccountLedger(fiscalYearId, accountId)
      .then(d => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fiscalYearId, accountId]);

  const isBilan = data ? data.account.class <= 2 : false;

  const totalDebit  = data?.lines.reduce((s, l) => s + (l.debit  ?? 0), 0) ?? 0;
  const totalCredit = data?.lines.reduce((s, l) => s + (l.credit ?? 0), 0) ?? 0;
  const totalSolde  = data
    ? (data.account.normal_balance === 'DEBIT' ? totalDebit - totalCredit : totalCredit - totalDebit)
    : 0;

  return (
    <div>
      <button onClick={onBack} className={styles.backBtn}>← Retour aux soldes</button>

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : data && (
        <>
          <h1 className={styles.h1}>{data.account.number} {data.account.name}</h1>

          {data.lines.length === 0 ? (
            <p className={styles.empty}>Aucun mouvement pour ce compte dans cet exercice.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr className={styles.theadRow}>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Pièce</th>
                  <th className={styles.th}>Libellé</th>
                  <th className={styles.th}>Contrepartie</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Débit CHF</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Crédit CHF</th>
                  {isBilan && <th className={`${styles.th} ${styles.thRight}`}>Solde CHF</th>}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = 0;
                  return data.lines.map((line, i) => {
                    if (isBilan) {
                      running += data.account.normal_balance === 'DEBIT'
                        ? (line.debit ?? 0) - (line.credit ?? 0)
                        : (line.credit ?? 0) - (line.debit ?? 0);
                    }
                    const rowClass =
                      line.isOpeningBalance ? styles.rowOpening :
                      line.isClosingEntry   ? styles.rowClosing :
                      styles.dataRow;
                    return (
                      <tr key={`${line.entryId}-${i}`} className={rowClass}>
                        <td className={styles.td}>{formatDate(line.date)}</td>
                        <td className={styles.td}>{line.piece ?? ''}</td>
                        <td className={styles.td}>{line.description}</td>
                        <td className={styles.td}>
                          <CounterpartCell counterparts={line.counterparts} />
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.debit != null ? fmt(line.debit) : ''}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.credit != null ? fmt(line.credit) : ''}
                        </td>
                        {isBilan && (
                          <td
                            className={`${styles.td} ${styles.tdRight}`}
                            data-negative={running < 0 || undefined}
                          >
                            {fmt(running)}
                          </td>
                        )}
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={4} className={styles.totalLabel}>Total</td>
                  <td className={`${styles.totalCell} ${styles.tdRight}`}>{fmt(totalDebit)}</td>
                  <td className={`${styles.totalCell} ${styles.tdRight}`}>{fmt(totalCredit)}</td>
                  {isBilan && (
                    <td
                      className={`${styles.totalCell} ${styles.tdRight}`}
                      data-negative={totalSolde < 0 || undefined}
                    >
                      {fmt(totalSolde)}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function CounterpartCell({ counterparts }: { counterparts: Array<{ number: string; name: string }> }) {
  if (counterparts.length === 0) return <span className={styles.counterpartNone}>—</span>;
  if (counterparts.length === 1) {
    return <span>{counterparts[0].number} {counterparts[0].name}</span>;
  }
  return (
    <Tooltip
      content={
        <ul className={styles.tooltipList}>
          {counterparts.map(cp => (
            <li key={cp.number}>{cp.number} {cp.name}</li>
          ))}
        </ul>
      }
    >
      <span className={styles.divers}>Divers</span>
    </Tooltip>
  );
}
