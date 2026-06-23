import { useEffect, useState } from 'react';
import type { FiscalYear, Account, JournalFilters } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { applyFilters } from '../lib/journalFilters';
import type { EntryWithLines } from '../lib/journalFilters';
import JournalFiltersBar from '../components/JournalFilters';
import EntryFormModal from '../components/EntryFormModal';
import ConfirmDialog from '../components/ConfirmDialog';
import styles from './JournalPage.module.css';

type ModalState =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; entry: EntryWithLines };

export default function JournalPage() {
  const [years,        setYears]        = useState<FiscalYear[]>([]);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [entries,      setEntries]      = useState<EntryWithLines[]>([]);
  const [filters,      setFilters]      = useState<JournalFilters>(DEFAULT_FILTERS);
  const [modal,        setModal]        = useState<ModalState>(null);
  const [confirmEntry, setConfirmEntry] = useState<EntryWithLines | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getFiscalYears(),
      window.api.getActiveAccounts(),
    ]).then(([ys, accs]) => {
      setYears(ys);
      setAccounts(accs);
      const open = ys.find(y => !y.is_closed) ?? ys[0];
      if (open) setSelectedYear(open.year);
    }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const fy = years.find(y => y.year === selectedYear);
    if (!fy) return;
    window.api.getJournalEntries(fy.id)
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, [selectedYear, years]);

  async function reloadEntries() {
    const fy = years.find(y => y.year === selectedYear);
    if (!fy) return;
    try {
      setEntries(await window.api.getJournalEntries(fy.id));
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmEntry) return;
    try {
      await window.api.deleteJournalEntry(confirmEntry.id);
      setConfirmEntry(null);
      await reloadEntries();
    } catch (e: unknown) {
      setError((e as Error).message);
      setConfirmEntry(null);
    }
  }

  const currentFiscalYear = years.find(y => y.year === selectedYear);
  const filtered = applyFilters(entries, filters);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.h1}>Journal</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="year-select" className={styles.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYear ?? ''}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className={styles.select}
            >
              {years.map(y => (
                <option key={y.id} value={y.year}>
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
      ) : (
        <>
          {!currentFiscalYear?.is_closed && (
            <div className={styles.newEntryBar}>
              <button onClick={() => setModal({ mode: 'create' })} className={styles.btn}>
                + Nouvelle écriture
              </button>
            </div>
          )}

          {entries.length > 0 && (
            <JournalFiltersBar filters={filters} accounts={accounts} onChange={setFilters} />
          )}

          {filtered.length === 0 ? (
            <p className={styles.empty}>{entries.length === 0 ? 'Aucune écriture pour cet exercice.' : 'Aucune écriture ne correspond aux filtres.'}</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr className={styles.theadRow}>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Libellé</th>
                  <th className={styles.th}>Pièce</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Débit</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Crédit</th>
                  {!currentFiscalYear?.is_closed && <th className={styles.th} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry =>
                  entry.lines.map((line, i) => {
                    const acc = accounts.find(a => a.id === line.account_id);
                    return (
                      <tr key={`${entry.id}-${line.id}`} className={styles.row}>
                        <td className={styles.td}>{i === 0 ? formatDate(entry.date) : ''}</td>
                        <td className={styles.td}>{i === 0 ? entry.description : ''}</td>
                        <td className={styles.td}>{i === 0 ? (entry.piece ?? '') : ''}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.debit != null ? formatCHF(line.debit) : ''}
                          {line.debit != null && acc ? <span className={styles.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.credit != null ? formatCHF(line.credit) : ''}
                          {line.credit != null && acc ? <span className={styles.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        {!currentFiscalYear?.is_closed && (
                          <td className={styles.td}>
                            {i === 0 && (
                              <div className={styles.actions}>
                                <button
                                  onClick={() => setModal({ mode: 'edit', entry })}
                                  className={styles.actionBtn}
                                  aria-label="Modifier"
                                >
                                  Modifier
                                </button>
                                <button
                                  onClick={() => setConfirmEntry(entry)}
                                  className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                                  aria-label="Supprimer"
                                >
                                  Supprimer
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </>
      )}

      {modal !== null && currentFiscalYear && (
        <EntryFormModal
          fiscalYear={currentFiscalYear}
          accounts={accounts}
          editEntry={modal.mode === 'edit' ? modal.entry : undefined}
          onSaved={async () => { setModal(null); await reloadEntries(); }}
          onClose={() => setModal(null)}
        />
      )}

      {confirmEntry && (
        <ConfirmDialog
          message={`Supprimer l'écriture "${confirmEntry.description}" ? Cette action est irréversible.`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmEntry(null)}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function formatCHF(centimes: number): string {
  return (centimes / 100).toFixed(2);
}
