import { useState } from 'react';
import { Save, X } from 'lucide-react';
import Modal from './Modal';
import type { CashSessionPayload } from '../types';
import styles from './CashSessionModal.module.css';

interface Props {
  fiscalYearId: number;
  existingGroups?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function CashSessionModal({ fiscalYearId, existingGroups = [], onClose, onSaved }: Props) {
  const [label,        setLabel]        = useState('');
  const [accountGroup, setAccountGroup] = useState('');
  const [notes,        setNotes]        = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const handleSave = async () => {
    if (!label.trim()) { setError('Le libellé est requis'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: CashSessionPayload = {
        fiscal_year_id: fiscalYearId,
        label: label.trim(),
        account_group: accountGroup.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      await window.api.createCashSession(payload);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création');
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} className={styles.modal}>
      <h2 className={styles.title}>Nouvelle session de manifestation</h2>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Libellé *</span>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="ex : Marché Villageois 2026"
            autoFocus
            aria-label="Libellé"
          />
        </label>

        <label className={styles.field}>
          <span>Groupe analytique</span>
          <input
            type="text"
            list="session-groups-datalist"
            value={accountGroup}
            onChange={e => setAccountGroup(e.target.value)}
            placeholder="ex : Marché"
            aria-label="Groupe analytique"
          />
          <datalist id="session-groups-datalist">
            {existingGroups.map(g => <option key={g} value={g} />)}
          </datalist>
        </label>

        <label className={styles.field}>
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
          />
        </label>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" onClick={onClose} className={styles.btnSecondary}>
          <X size={16} /> Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={styles.btnPrimary}
        >
          <Save size={16} /> {saving ? 'Création…' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}
