import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import CashCountModal   from '../components/CashCountModal';
import CashSessionModal from '../components/CashSessionModal';
import ConfirmDialog    from '../components/ConfirmDialog';
import Toast            from '../components/Toast';
import { formatCHF, formatDate } from '../lib/format';
import type { FiscalYear, CashCount, CashContext, CashSession } from '../types';
import styles from './CaissePage.module.css';

const CONTEXT_LABELS: Record<CashContext, string> = {
  LIBRE: 'Libre', AVANT: 'Avant', FONDS: 'Fonds de caisse', APRES: 'Après',
};

const CONTEXT_ORDER: Record<CashContext, number> = {
  AVANT: 0, FONDS: 1, APRES: 2, LIBRE: 3,
};

type Tab = 'counts' | 'sessions';

function computeCA(sessionId: number, counts: CashCount[]): number {
  const linked = counts.filter(c => c.session_id === sessionId);
  const apres  = linked.filter(c => c.context === 'APRES').reduce((s, c) => s + c.total, 0);
  const avant  = linked.filter(c => c.context === 'AVANT').reduce((s, c) => s + c.total, 0);
  const fonds  = linked.filter(c => c.context === 'FONDS').reduce((s, c) => s + c.total, 0);
  return apres - avant - fonds;
}

export default function CaissePage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [counts,         setCounts]         = useState<CashCount[]>([]);
  const [sessions,       setSessions]       = useState<CashSession[]>([]);
  const [activeTab,      setActiveTab]      = useState<Tab>('counts');
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [showCountModal,  setShowCountModal]  = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editId,         setEditId]         = useState<number | null>(null);
  const [deleteId,       setDeleteId]       = useState<number | null>(null);
  const [deleteSessionId, setDeleteSessionId] = useState<number | null>(null);
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

  const loadSessions = useCallback(() => {
    if (!selectedYearId) return;
    window.api.getCashSessions(selectedYearId).then(setSessions);
  }, [selectedYearId]);

  useEffect(() => { loadCounts(); }, [loadCounts]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleCountSaved = () => {
    const wasEdit = editId !== null;
    setShowCountModal(false);
    setEditId(null);
    setToast({ message: wasEdit ? 'Comptage modifié' : 'Comptage enregistré', variant: 'success' });
    loadCounts();
  };

  const handleSessionSaved = () => {
    setShowSessionModal(false);
    setToast({ message: 'Session créée', variant: 'success' });
    loadSessions();
  };

  const handleDeleteCount = async () => {
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

  const handleDeleteSession = async () => {
    if (deleteSessionId === null) return;
    try {
      await window.api.deleteCashSession(deleteSessionId);
      setToast({ message: 'Session supprimée', variant: 'success' });
      setSessions(prev => prev.filter(s => s.id !== deleteSessionId));
      if (expandedSession === deleteSessionId) setExpandedSession(null);
    } catch {
      setToast({ message: 'Erreur lors de la suppression', variant: 'error' });
    } finally {
      setDeleteSessionId(null);
    }
  };

  const selectedYear = years.find(y => y.id === selectedYearId);
  const existingGroups = [...new Set(sessions.map(s => s.account_group).filter(Boolean) as string[])];

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
            onClick={() => { setEditId(null); setShowCountModal(true); }}
            disabled={!selectedYear || !!selectedYear.is_closed}
          >
            <Plus size={16} /> Nouveau comptage
          </button>
        )}
        {activeTab === 'sessions' && (
          <button
            className={styles.btnPrimary}
            onClick={() => setShowSessionModal(true)}
            disabled={!selectedYear || !!selectedYear.is_closed}
          >
            <Plus size={16} /> Nouvelle session
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

      {/* ─── Onglet Comptages ─────────────────────────────────────────────── */}
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
                    <td className={styles.actions}>
                      <button
                        className={styles.btnSecondary}
                        onClick={() => { setEditId(c.id); setShowCountModal(true); }}
                        disabled={!!selectedYear?.is_closed}
                        aria-label="Modifier"
                      >
                        <Pencil size={14} /> Modifier
                      </button>
                      <button
                        className={styles.btnDanger}
                        onClick={() => setDeleteId(c.id)}
                        disabled={!!selectedYear?.is_closed}
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

      {/* ─── Onglet Manifestations ─────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        sessions.length === 0 ? (
          <p className={styles.empty}>Aucune session de manifestation pour cet exercice.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th />
                <th>Session</th>
                <th>Groupe</th>
                <th>Créée le</th>
                <th className={styles.num}>Comptages</th>
                <th className={styles.num}>CA Caisse</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const isExpanded = expandedSession === s.id;
                const linkedCounts = counts
                  .filter(c => c.session_id === s.id)
                  .sort((a, b) => CONTEXT_ORDER[a.context] - CONTEXT_ORDER[b.context]);
                const ca = computeCA(s.id, counts);
                return (
                  <>
                    <tr
                      key={s.id}
                      className={`${styles.row} ${styles.sessionRow}`}
                      onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className={styles.chevron}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className={styles.sessionLabel}>{s.label}</td>
                      <td className={styles.session}>{s.account_group ?? '—'}</td>
                      <td>{formatDate(s.created_at.slice(0, 10))}</td>
                      <td className={styles.num}>{linkedCounts.length}</td>
                      <td
                        className={styles.num}
                        data-negative={ca < 0 || undefined}
                        data-testid={`ca-${s.id}`}
                      >
                        {formatCHF(ca)}
                      </td>
                      <td onClick={e => e.stopPropagation()} className={styles.actions}>
                        <button
                          className={styles.btnDanger}
                          onClick={() => setDeleteSessionId(s.id)}
                          disabled={!!selectedYear?.is_closed}
                          aria-label="Supprimer la session"
                        >
                          <Trash2 size={14} /> Supprimer
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      linkedCounts.length === 0 ? (
                        <tr key={`${s.id}-empty`}>
                          <td colSpan={7} className={styles.expandedEmpty}>
                            Aucun comptage lié à cette session.
                          </td>
                        </tr>
                      ) : (
                        linkedCounts.map(c => {
                          const ecart = c.total - c.theoretical_balance;
                          return (
                            <tr key={`${s.id}-${c.id}`} className={styles.linkedCountRow}>
                              <td />
                              <td className={styles.linkedLabel}>
                                <span className={styles.contextBadge} data-context={c.context}>
                                  {CONTEXT_LABELS[c.context]}
                                </span>
                                {c.label}
                              </td>
                              <td />
                              <td>{formatDate(c.date)}</td>
                              <td className={styles.num}>{formatCHF(c.total)}</td>
                              <td
                                className={styles.num}
                                data-negative={ecart !== 0 || undefined}
                              >
                                {formatCHF(Math.abs(ecart))}{ecart === 0 ? ' ✓' : ecart > 0 ? ' ▲' : ' ▼'}
                              </td>
                              <td />
                            </tr>
                          );
                        })
                      )
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {showCountModal && selectedYearId && (
        <CashCountModal
          fiscalYearId={selectedYearId}
          editId={editId ?? undefined}
          sessions={sessions}
          onClose={() => { setShowCountModal(false); setEditId(null); }}
          onSaved={handleCountSaved}
        />
      )}

      {showSessionModal && selectedYearId && (
        <CashSessionModal
          fiscalYearId={selectedYearId}
          existingGroups={existingGroups}
          onClose={() => setShowSessionModal(false)}
          onSaved={handleSessionSaved}
        />
      )}

      {deleteId !== null && (
        <ConfirmDialog
          message="Supprimer ce comptage de caisse ? Cette action est irréversible."
          onConfirm={handleDeleteCount}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {deleteSessionId !== null && (
        <ConfirmDialog
          message="Supprimer cette session ? Les comptages liés ne seront pas supprimés."
          onConfirm={handleDeleteSession}
          onCancel={() => setDeleteSessionId(null)}
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
