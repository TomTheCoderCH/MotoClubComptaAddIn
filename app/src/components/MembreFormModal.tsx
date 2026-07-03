import { useState } from 'react';
import Modal from './Modal';
import type { MemberWithDues, MemberPayload } from '../types';
import styles from './MembreFormModal.module.css';

interface Props {
  member?: MemberWithDues;
  onClose: () => void;
  onSaved: () => void;
}

export default function MembreFormModal({ member, onClose, onSaved }: Props) {
  const isEdit = !!member;
  const [lastName,     setLastName]     = useState(member?.last_name ?? '');
  const [firstName,    setFirstName]    = useState(member?.first_name ?? '');
  const [entryDate,    setEntryDate]    = useState(member?.entry_date ?? '');
  const [isActive,     setIsActive]     = useState(member ? member.is_active === 1 : true);
  const [inactiveNote, setInactiveNote] = useState(member?.inactive_note ?? '');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const isValid = lastName.trim().length > 0 && firstName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const payload: MemberPayload = {
        last_name:     lastName.trim(),
        first_name:    firstName.trim(),
        entry_date:    entryDate || null,
        is_active:     isActive ? 1 : 0,
        inactive_note: !isActive ? (inactiveNote.trim() || null) : null,
      };
      if (isEdit) {
        await window.api.updateMember(member!.id, payload);
      } else {
        await window.api.createMember(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal className={styles.modal} onClose={onClose}>
      <h2 className={styles.title}>{isEdit ? 'Modifier le membre' : 'Nouveau membre'}</h2>
      <div className={styles.form}>
        <label className={styles.label}>
          Nom *
          <input
            className={styles.input}
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            autoFocus={!isEdit}
          />
        </label>
        <label className={styles.label}>
          Prénom *
          <input
            className={styles.input}
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
          />
        </label>
        <label className={styles.label}>
          Date d&apos;entrée
          <input
            type="date"
            className={styles.input}
            value={entryDate ?? ''}
            onChange={e => setEntryDate(e.target.value)}
          />
        </label>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Statut</legend>
          <label className={styles.radio}>
            <input type="radio" name="status" checked={isActive}  onChange={() => setIsActive(true)}  /> Actif
          </label>
          <label className={styles.radio}>
            <input type="radio" name="status" checked={!isActive} onChange={() => setIsActive(false)} /> Inactif
          </label>
        </fieldset>
        {!isActive && (
          <label className={styles.label}>
            Note
            <textarea
              className={styles.textarea}
              value={inactiveNote ?? ''}
              onChange={e => setInactiveNote(e.target.value)}
              placeholder="Ex. Démission 2026"
              rows={2}
            />
          </label>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>Annuler</button>
        <button
          className={styles.btnSave}
          onClick={handleSubmit}
          disabled={!isValid || saving}
        >
          {isEdit ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}
