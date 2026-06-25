import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import EntryForm from './EntryForm';
import Modal from './Modal';
import styles from './EntryFormModal.module.css';

interface EntryFormModalProps {
  fiscalYear:  FiscalYear;
  accounts:    Account[];
  editEntry?:  JournalEntry & { lines: JournalEntryLine[] };
  onSaved:     () => void;
  onSavedNew?: () => void;
  onClose:     () => void;
}

export default function EntryFormModal({ fiscalYear, accounts, editEntry, onSaved, onSavedNew, onClose }: EntryFormModalProps) {
  const title = editEntry
    ? `Modifier l'écriture — exercice ${fiscalYear.year}`
    : `Nouvelle écriture — exercice ${fiscalYear.year}`;

  return (
    <Modal
      ariaLabelledby="modal-title"
      onClose={onClose}
      className={styles.card}
      data-testid="modal-overlay"
    >
      <div className={styles.header}>
        <h2 id="modal-title" className={styles.h2}>{title}</h2>
        <button onClick={onClose} className={styles.closeBtn} aria-label="Fermer">✕</button>
      </div>
      <EntryForm
        fiscalYear={fiscalYear}
        accounts={accounts}
        editEntry={editEntry}
        hideTitle
        onCreated={onSaved}
        onCancel={onClose}
        onSavedNew={onSavedNew}
      />
    </Modal>
  );
}
