import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import CashCountModal from '../components/CashCountModal';
import ConfirmDialog  from '../components/ConfirmDialog';
import Toast          from '../components/Toast';
import { formatCHF, formatDate } from '../lib/format';
import type { FiscalYear, CashCount, CashContext } from '../types';
import styles from './CaissePage.module.css';

const CONTEXT_LABELS: Record<CashContext, string> = {
  LIBRE: 'Libre', AVANT: 'Avant', FONDS: 'Fonds de caisse', APRES: 'Après',
};

type Tab = 'counts' | 'sessions';

export default function CaissePage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [counts,         setCounts]         = useState<CashCount[]>([]);
  const [activeTab,      setActiveTab]      = useState<Tab>('counts');
  const [showModal,      setShowModal]      = useState(false);
  const [deleteId,       setDeleteId]       = useState<number | null>(null);
  const [toast,          setToast]          = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [loading,        setLoading]        = useState(false);

  useEffect(() => {
    window.api.getFiscalYears().then(ys => {
      setYears(ys);
      const open = ys.find(y => !y.is_closed) ?? ys[0];
      if (open) setSelectedYearId(open.id);
    });
  }, []);

  const loadCounts = useCallback(() => {
    if (!selectedYearId) return;
    setLoading(true);
    window.api.getCashCounts(selectedYearId)
      .then(setCounts)
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const handleSaved = () => {
    setShowModal(false);
    setToast({ message: 'Comptage enregistré', variant: 'success' });
    loadCounts();
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.api.deleteCashCount(deleteId);
      setToast({ message: 'Comptage supprimé', variant: 'success' });
      loadCounts();
    } catch {
      setToast({ message: 'Erreur lors de la suppression', variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  };

  const selectedYear = years.find(y => y.id === selectedYearId);

  if (years.length === 0) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Aucun exercice trouvé. Créez un exercice d&apos;abord.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Caisse</h1>
          <select
            value={selectedYearId ?? ''}
            onChange={e => setSelectedYearId(Number(e.target.value))}
            className={styles.yearSelect}
          >
            {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
          </select>
        </div>
        {activeTab === 'counts' && (
          <button
            className={styles.btnPrimary}
            onClick={() => setShowModal(true)}
            disabled={!selectedYear || !!selectedYear.is_closed}
          >
            <Plus size={16} /> Nouveau comptage
          </button>
        )}
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'counts'}
          className={activeTab === 'counts' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('counts')}
        >
          Comptages
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'sessions'}
          className={activeTab === 'sessions' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('sessions')}
        >
          Manifestations
        </button>
      </div>

      {activeTab === 'counts' && (
        loading ? <p className={styles.empty}>Chargement…</p> :
        counts.length === 0 ? (
          <p className={styles.empty}>Aucun comptage de caisse pour cet exercice.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th>Contexte</th>
                <th className={styles.num}>Total compté</th>
                <th className={styles.num}>Solde théorique</th>
                <th className={styles.num}>Écart</th>
                <th>Session</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {counts.map(c => {
                const ecart = c.total - c.theoretical_balance;
                return (
                  <tr key={c.id} className={styles.row}>
                    <td>{formatDate(c.date)}</td>
                    <td>{c.label}</td>
                    <td>{CONTEXT_LABELS[c.context]}</td>
                    <td className={styles.num}>{formatCHF(c.total)}</td>
                    <td className={styles.num}>{formatCHF(c.theoretical_balance)}</td>
                    <td
                      className={styles.num}
                      data-negative={ecart !== 0 || undefined}
                      data-testid={`ecart-${c.id}`}
                    >
                      {formatCHF(Math.abs(ecart))}{ecart === 0 ? ' ✓' : ecart > 0 ? ' ▲' : ' ▼'}
                    </td>
                    <td className={styles.session}>{c.session_label ?? '—'}</td>
                    <td>
                      <button
                        className={styles.btnDanger}
                        onClick={() => setDeleteId(c.id)}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {activeTab === 'sessions' && (
        <p className={styles.empty}>
          La gestion des sessions de manifestation sera disponible dans une prochaine version.
        </p>
      )}

      {showModal && selectedYearId && (
        <CashCountModal
          fiscalYearId={selectedYearId}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {deleteId !== null && (
        <ConfirmDialog
          message="Supprimer ce comptage de caisse ? Cette action est irréversible."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
