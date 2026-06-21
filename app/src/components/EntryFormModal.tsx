import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import EntryForm from './EntryForm';

interface EntryFormModalProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  editEntry?: JournalEntry & { lines: JournalEntryLine[] };
  onSaved:    () => void;
  onClose:    () => void;
}

export default function EntryFormModal({ fiscalYear, accounts, editEntry, onSaved, onClose }: EntryFormModalProps) {
  const title = editEntry
    ? `Modifier l'écriture — exercice ${fiscalYear.year}`
    : `Nouvelle écriture — exercice ${fiscalYear.year}`;

  return (
    <div style={s.overlay} data-testid="modal-overlay">
      <div style={s.card} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div style={s.header}>
          <h2 id="modal-title" style={s.h2}>{title}</h2>
          <button onClick={onClose} style={s.closeBtn} aria-label="Fermer">✕</button>
        </div>
        <EntryForm
          fiscalYear={fiscalYear}
          accounts={accounts}
          editEntry={editEntry}
          hideTitle
          onCreated={onSaved}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  card:    { background: '#fff', borderRadius: '12px', width: '720px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 8px 32px rgba(0,0,0,.2)', position: 'relative' as const },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem 0' },
  h2:      { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' },
  closeBtn:{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b', lineHeight: 1, padding: '0.25rem 0.5rem' },
} as const;
