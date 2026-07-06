import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Upload, UserX, UserCheck } from 'lucide-react';
import MembreFormModal    from '../components/MembreFormModal';
import MembreDetailModal  from '../components/MembreDetailModal';
import ConfirmDialog      from '../components/ConfirmDialog';
import Toast              from '../components/Toast';
import { formatDate }     from '../lib/format';
import type { FiscalYear, MemberWithDues } from '../types';
import styles from './MembresPage.module.css';

function computeDefaultRange(years: FiscalYear[], members: MemberWithDues[]): { start: number; end: number } {
  const known = new Set<number>();
  years.forEach(y => known.add(y.year));
  members.forEach(m => m.dues.forEach(d => known.add(d.year)));
  const sorted = [...known].sort((a, b) => b - a);
  if (sorted.length === 0) {
    const current = new Date().getFullYear();
    return { start: current, end: current };
  }
  const recent = sorted.slice(0, 3);
  return { start: Math.min(...recent), end: Math.max(...recent) };
}

function isArrears(member: MemberWithDues, year: number): boolean {
  const currentYear = new Date().getFullYear();
  if (year > currentYear) return false;
  if (!member.entry_date) return true;
  const entryYear = parseInt(member.entry_date.slice(0, 4), 10);
  return year >= entryYear;
}

export default function MembresPage() {
  const [years,           setYears]           = useState<FiscalYear[]>([]);
  const [members,         setMembers]         = useState<MemberWithDues[]>([]);
  const [showInactive,    setShowInactive]    = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMember,      setEditMember]      = useState<MemberWithDues | null>(null);
  const [detailMember,    setDetailMember]    = useState<MemberWithDues | null>(null);
  const [deleteId,        setDeleteId]        = useState<number | null>(null);
  const [toast,           setToast]           = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [importing,       setImporting]       = useState(false);
  const [yearRange,       setYearRange]       = useState<{ start: number; end: number } | null>(null);
  const [startInputStr,   setStartInputStr]   = useState('');
  const [endInputStr,     setEndInputStr]     = useState('');

  const load = useCallback(() => {
    Promise.all([
      window.api.getFiscalYears(),
      window.api.getMembers(),
      window.api.getSettings(),
    ]).then(([ys, ms, settings]) => {
      setYears(ys);
      setMembers(ms);
      const range = settings?.membersYearRange ?? computeDefaultRange(ys, ms);
      setYearRange(range);
      setStartInputStr(String(range.start));
      setEndInputStr(String(range.end));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayedYears = (() => {
    if (!yearRange) return [];
    const start = Math.min(yearRange.start, yearRange.end);
    const end = Math.max(yearRange.start, yearRange.end);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  const commitRange = (next: { start: number; end: number }) => {
    setYearRange(next);
    window.api.saveMembersYearRange(next);
  };

  // Les champs conservent leur propre texte de saisie (startInputStr/endInputStr) pendant
  // la frappe ; la plage n'est validée et sauvegardée qu'au blur, pour éviter d'écrire des
  // valeurs intermédiaires invalides (ex. taper "2026" déclencherait sinon une sauvegarde
  // après chaque chiffre : "2", "20", "202"…).
  const handleStartBlur = () => {
    if (!yearRange) return;
    const n = parseInt(startInputStr, 10);
    if (!Number.isInteger(n) || n < 1900 || n > 2200) {
      setStartInputStr(String(yearRange.start));
      return;
    }
    commitRange({ start: n, end: yearRange.end });
    setStartInputStr(String(n));
  };

  const handleEndBlur = () => {
    if (!yearRange) return;
    const n = parseInt(endInputStr, 10);
    if (!Number.isInteger(n) || n < 1900 || n > 2200) {
      setEndInputStr(String(yearRange.end));
      return;
    }
    commitRange({ start: yearRange.start, end: n });
    setEndInputStr(String(n));
  };

  const visible = members.filter(m => showInactive ? true : m.is_active === 1);

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.api.deleteMember(deleteId);
      setToast({ message: 'Membre supprimé', variant: 'success' });
      load();
    } catch {
      setToast({ message: 'Impossible de supprimer : des cotisations existent', variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (m: MemberWithDues) => {
    try {
      await window.api.updateMember(m.id, {
        last_name: m.last_name, first_name: m.first_name,
        entry_date: m.entry_date, is_active: m.is_active === 1 ? 0 : 1,
        inactive_note: m.inactive_note,
      });
      load();
    } catch {
      setToast({ message: 'Impossible de modifier le statut du membre', variant: 'error' });
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.api.importMembersFromExcel();
      setToast({ message: `${result.imported} membre(s) importé(s), ${result.skipped} ignoré(s)`, variant: 'success' });
      load();
    } catch {
      setToast({ message: "Erreur lors de l'import", variant: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const isPaid = (m: MemberWithDues, year: number) =>
    m.dues.some(d => d.year === year && d.paid === 1);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Membres</h1>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Afficher les inactifs
          </label>
          {yearRange && (
            <div className={styles.rangeControl}>
              <span>Années :</span>
              <label className={styles.rangeLabel}>
                Début
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.rangeInput}
                  value={startInputStr}
                  onChange={e => setStartInputStr(e.target.value)}
                  onBlur={handleStartBlur}
                />
              </label>
              <label className={styles.rangeLabel}>
                Fin
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.rangeInput}
                  value={endInputStr}
                  onChange={e => setEndInputStr(e.target.value)}
                  onBlur={handleEndBlur}
                />
              </label>
            </div>
          )}
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.btnSecondary}
            onClick={handleImport}
            disabled={importing}
          >
            <Upload size={16} /> {importing ? 'Import…' : 'Importer depuis Excel'}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => { setEditMember(null); setShowCreateModal(true); }}
          >
            <Plus size={16} /> Nouveau membre
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>Aucun membre. Utilisez &quot;Nouveau membre&quot; ou &quot;Importer depuis Excel&quot;.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              <th>Entrée</th>
              <th>Statut</th>
              {displayedYears.map(y => <th key={y} className={styles.num}>{y}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map(m => (
              <tr
                key={m.id}
                className={`${styles.row} ${m.is_active === 0 ? styles.inactive : ''}`}
                onClick={() => setDetailMember(m)}
              >
                <td>{m.last_name}</td>
                <td>{m.first_name}</td>
                <td>{m.entry_date ? formatDate(m.entry_date) : '—'}</td>
                <td>
                  {m.is_active === 0
                    ? <span className={styles.badgeInactif}>Inactif</span>
                    : <span className={styles.badgeActif}>Actif</span>
                  }
                </td>
                {displayedYears.map(y => (
                  <td key={y} className={styles.num} data-arrears={!isPaid(m, y) && isArrears(m, y) || undefined}>
                    {isPaid(m, y)
                      ? <span className={styles.paid}>✓</span>
                      : <span className={styles.unpaid}>—</span>
                    }
                  </td>
                ))}
                <td className={styles.actions} onClick={e => e.stopPropagation()}>
                  <button
                    className={styles.btnIcon}
                    onClick={() => { setEditMember(m); setShowCreateModal(true); }}
                    aria-label="Modifier"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className={styles.btnIcon}
                    onClick={() => handleToggleActive(m)}
                    aria-label={m.is_active === 1 ? 'Désactiver' : 'Réactiver'}
                  >
                    {m.is_active === 1 ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={() => setDeleteId(m.id)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreateModal && (
        <MembreFormModal
          member={editMember ?? undefined}
          onClose={() => { setShowCreateModal(false); setEditMember(null); }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditMember(null);
            load();
            setToast({ message: editMember ? 'Membre modifié' : 'Membre créé', variant: 'success' });
          }}
        />
      )}

      {detailMember && (
        <MembreDetailModal
          member={detailMember}
          fiscalYears={years}
          onClose={() => setDetailMember(null)}
          onUpdated={() => { load(); setDetailMember(null); }}
        />
      )}

      {deleteId !== null && (
        <ConfirmDialog
          message="Supprimer ce membre ? Cette action est irréversible."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
