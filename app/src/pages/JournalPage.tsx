import { useEffect, useState } from 'react';
import type { FiscalYear, Account, JournalFilters } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { applyFilters } from '../lib/journalFilters';
import type { EntryWithLines } from '../lib/journalFilters';
import JournalFiltersBar from '../components/JournalFilters';
import EntryFormModal from '../components/EntryFormModal';
import ConfirmDialog from '../components/ConfirmDialog';

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
    setEntries(await window.api.getJournalEntries(fy.id));
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
      <div style={s.header}>
        <h1 style={s.h1}>Journal</h1>
        {years.length > 0 && (
          <div style={s.yearSelector}>
            <label htmlFor="year-select" style={s.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYear ?? ''}
              onChange={e => setSelectedYear(Number(e.target.value))}
              style={s.select}
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

      {error && <div role="alert" style={s.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p style={s.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : (
        <>
          {!currentFiscalYear?.is_closed && (
            <div style={{ marginBottom: '1rem' }}>
              <button onClick={() => setModal({ mode: 'create' })} style={s.btn}>
                + Nouvelle écriture
              </button>
            </div>
          )}

          {entries.length > 0 && (
            <JournalFiltersBar filters={filters} accounts={accounts} onChange={setFilters} />
          )}

          {filtered.length === 0 ? (
            <p style={s.empty}>{entries.length === 0 ? 'Aucune écriture pour cet exercice.' : 'Aucune écriture ne correspond aux filtres.'}</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr style={s.theadRow}>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Libellé</th>
                  <th style={s.th}>Pièce</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Débit</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Crédit</th>
                  {!currentFiscalYear?.is_closed && <th style={s.th} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry =>
                  entry.lines.map((line, i) => {
                    const acc = accounts.find(a => a.id === line.account_id);
                    return (
                      <tr key={`${entry.id}-${line.id}`} style={s.row}>
                        <td style={s.td}>{i === 0 ? formatDate(entry.date) : ''}</td>
                        <td style={s.td}>{i === 0 ? entry.description : ''}</td>
                        <td style={s.td}>{i === 0 ? (entry.piece ?? '') : ''}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                          {line.debit != null ? formatCHF(line.debit) : ''}
                          {line.debit != null && acc ? <span style={s.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                          {line.credit != null ? formatCHF(line.credit) : ''}
                          {line.credit != null && acc ? <span style={s.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        {!currentFiscalYear?.is_closed && (
                          <td style={s.td}>
                            {i === 0 && (
                              <div style={s.actions}>
                                <button
                                  onClick={() => setModal({ mode: 'edit', entry })}
                                  style={s.actionBtn}
                                  aria-label="Modifier"
                                >
                                  Modifier
                                </button>
                                <button
                                  onClick={() => setConfirmEntry(entry)}
                                  style={{ ...s.actionBtn, color: '#dc2626' }}
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

const s = {
  header:      { display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' as const },
  h1:          { margin: 0, fontSize: '1.5rem', color: '#0f172a' },
  yearSelector:{ display: 'flex', alignItems: 'center', gap: '0.5rem' },
  label:       { fontWeight: 500, fontSize: '0.875rem', color: '#475569' },
  select:      { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff' },
  error:       { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' },
  empty:       { color: '#64748b', fontSize: '0.875rem' },
  btn:         { padding: '0.45rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 as const },
  table:       { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow:    { background: '#f1f5f9' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  row:         { borderBottom: '1px solid #f1f5f9' },
  td:          { padding: '0.4rem 1rem', color: '#334155' },
  acctLabel:   { color: '#94a3b8', fontSize: '0.75rem' },
  actions:     { display: 'flex', gap: '0.5rem' },
  actionBtn:   { padding: '0.2rem 0.5rem', background: 'none', border: '1px solid #e2e8f0', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', color: '#475569' },
} as const;
