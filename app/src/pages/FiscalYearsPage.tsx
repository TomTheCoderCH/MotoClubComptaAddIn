import { useEffect, useState } from 'react';
import { Plus, ClipboardList, Lock, LockOpen, FileSpreadsheet } from 'lucide-react';
import type { FiscalYear, OpeningBalanceSuggestion, ClosingPreview } from '../types';
import OpeningBalanceModal from '../components/OpeningBalanceModal';
import ClosingModal from '../components/ClosingModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate } from '../lib/format';
import styles from './FiscalYearsPage.module.css';

export default function FiscalYearsPage() {
  const [years,    setYears]    = useState<FiscalYear[]>([]);
  const [newYear,  setNewYear]  = useState<number>(new Date().getFullYear());
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [modalFiscalYear, setModalFiscalYear] = useState<{ id: number; year: number } | null>(null);
  const [suggestions,     setSuggestions]     = useState<OpeningBalanceSuggestion[]>([]);
  const [closingModal,  setClosingModal]  = useState<{ id: number; year: number; preview: ClosingPreview } | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<{ id: number; year: number } | null>(null);
  const [exportStatus,  setExportStatus]  = useState<{ id: number; msg: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load(): Promise<FiscalYear[]> {
    try {
      const data = await window.api.getFiscalYears();
      setYears(data);
      return data;
    } catch (e: unknown) {
      setError((e as Error).message);
      return [];
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await window.api.createFiscalYear(newYear);
      const updatedYears = await load();
      setNewYear(n => n + 1);

      const prevYear = updatedYears.find(y => y.year === newYear - 1);
      if (prevYear) {
        const sugg = await window.api.getOpeningBalanceSuggestions(created.id);
        setSuggestions(sugg);
        setModalFiscalYear({ id: created.id, year: newYear });
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenModal(y: FiscalYear) {
    try {
      const sugg = await window.api.getOpeningBalanceSuggestions(y.id);
      setSuggestions(sugg);
      setModalFiscalYear({ id: y.id, year: y.year });
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  function handleModalClose() {
    setModalFiscalYear(null);
    setSuggestions([]);
  }

  function handleModalSuccess() {
    setModalFiscalYear(null);
    setSuggestions([]);
    load();
  }

  async function handleCloseExercise(y: FiscalYear) {
    try {
      const preview = await window.api.getClosingPreview(y.id);
      setClosingModal({ id: y.id, year: y.year, preview });
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  function handleReopenClick(y: FiscalYear) {
    setConfirmReopen({ id: y.id, year: y.year });
  }

  async function handleReopenConfirm() {
    if (!confirmReopen) return;
    try {
      await window.api.reopenFiscalYear(confirmReopen.id);
      setConfirmReopen(null);
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
      setConfirmReopen(null);
    }
  }

  function handleClosingSuccess() {
    setClosingModal(null);
    load();
  }

  async function handleExportExcel(y: FiscalYear) {
    setExportStatus(null);
    try {
      const result = await window.api.exportExcel(y.id);
      if (result && 'path' in result) {
        setExportStatus({ id: y.id, msg: `Fichier exporté : ${result.path}` });
      } else if (result && 'error' in result) {
        setError(result.error);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  const yearAlreadyExists = years.some(y => y.year === newYear);

  return (
    <div>
      <h1 className={styles.h1}>Exercices</h1>

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      <section className={styles.section}>
        <h2 className={styles.h2}>Créer un exercice</h2>
        <form onSubmit={handleCreate} className={styles.form}>
          <label htmlFor="year-input" className={styles.label}>Année</label>
          <input
            id="year-input"
            type="number"
            value={newYear}
            onChange={e => setNewYear(Number(e.target.value))}
            min={2000}
            max={2100}
            className={styles.input}
          />
          {yearAlreadyExists && (
            <span className={styles.warn}>L'exercice {newYear} existe déjà</span>
          )}
          <button
            type="submit"
            disabled={creating || yearAlreadyExists}
            className={styles.btn}
          >
            <Plus size={15} />{creating ? 'Création…' : `Créer l'exercice ${newYear}`}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Exercices enregistrés</h2>
        {years.length === 0 ? (
          <p className={styles.empty}>Aucun exercice créé pour l'instant.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={styles.th}>Année</th>
                <th className={styles.th}>Début</th>
                <th className={styles.th}>Fin</th>
                <th className={styles.th}>Statut</th>
                <th className={styles.th}>Soldes à nouveau</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => (
                <tr key={y.id} className={styles.row}>
                  <td className={`${styles.td} ${styles.tdBold}`}>{y.year}</td>
                  <td className={styles.td}>{formatDate(y.start_date)}</td>
                  <td className={styles.td}>{formatDate(y.end_date)}</td>
                  <td className={styles.td}>
                    <span className={y.is_closed ? styles.badgeClosed : styles.badgeOpen}>
                      {y.is_closed ? 'Clôturé' : 'Ouvert'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    {y.hasOpeningBalance ? (
                      <span className={styles.badgeOb}>Saisis</span>
                    ) : !y.is_closed ? (
                      <button
                        onClick={() => handleOpenModal(y)}
                        className={styles.btnSmall}
                      >
                        <ClipboardList size={13} />Saisir les soldes à nouveau
                      </button>
                    ) : null}
                  </td>
                  <td className={styles.td}>
                    {!y.is_closed ? (
                      <button
                        onClick={() => handleCloseExercise(y)}
                        className={styles.btnSmall}
                      >
                        <Lock size={13} />Clôturer l&apos;exercice
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReopenClick(y)}
                        className={styles.btnReopen}
                      >
                        <LockOpen size={13} />Rouvrir
                      </button>
                    )}
                    {' '}
                    <button
                      onClick={() => handleExportExcel(y)}
                      className={styles.btnExport}
                    >
                      <FileSpreadsheet size={13} />Exporter Excel
                    </button>
                    {exportStatus?.id === y.id && (
                      <p role="status" className={styles.exportSuccess}>{exportStatus.msg}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modalFiscalYear && (
        <OpeningBalanceModal
          fiscalYearId={modalFiscalYear.id}
          year={modalFiscalYear.year}
          suggestions={suggestions}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
      {closingModal && (
        <ClosingModal
          fiscalYearId={closingModal.id}
          year={closingModal.year}
          preview={closingModal.preview}
          onClose={() => setClosingModal(null)}
          onSuccess={handleClosingSuccess}
        />
      )}
      {confirmReopen && (
        <ConfirmDialog
          message={`Rouvrir l'exercice ${confirmReopen.year} ? Les écritures de clôture seront supprimées et l'exercice repassera en statut ouvert.`}
          onConfirm={handleReopenConfirm}
          onCancel={() => setConfirmReopen(null)}
        />
      )}
    </div>
  );
}

