import { useState } from 'react';
import { Trash2, Save, Plus } from 'lucide-react';
import type { Account, AccountType, UpdateAccountPayload, CreateAccountPayload } from '../types';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import styles from './AccountFormModal.module.css';

const ACCOUNT_TYPES: AccountType[] = ['ACTIF', 'PASSIF', 'FONDS_PROPRES', 'PRODUIT', 'CHARGE'];

function normalBalanceLabel(type: AccountType): string {
  return (type === 'ACTIF' || type === 'CHARGE') ? 'DÉBIT' : 'CRÉDIT';
}

interface Props {
  account?:       Account;
  existingGroups: string[];
  onClose:        () => void;
  onSaved:        () => void;
  onDeleted?:     () => void;
}

export default function AccountFormModal({ account, existingGroups, onClose, onSaved, onDeleted }: Props) {
  const isEdit           = account !== undefined;
  const canEditStructure = isEdit && !account!.has_entries;

  const [name,         setName]         = useState(account?.name ?? '');
  const [number,       setNumber]       = useState(account?.number ?? '');
  const [type,         setType]         = useState<AccountType>(account?.type ?? 'PRODUIT');
  const [description,  setDescription]  = useState(account?.description ?? '');
  const [accountGroup, setAccountGroup] = useState(account?.account_group ?? '');
  const [isActive,     setIsActive]     = useState(account?.is_active !== false);
  const [submitting,        setSubmitting]        = useState(false);
  const [deleting,          setDeleting]          = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error,             setError]             = useState<string | null>(null);

  const canSubmit = name.trim() !== '' && number.trim() !== '' && !submitting && !deleting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        const payload: UpdateAccountPayload = {
          id:            account!.id,
          name:          name.trim(),
          description:   description.trim() || undefined,
          account_group: accountGroup.trim() || null,
          is_active:     isActive,
        };
        if (canEditStructure) {
          payload.number = number.trim();
          payload.type   = type;
        }
        await window.api.updateAccount(payload);
      } else {
        const payload: CreateAccountPayload = {
          number:        number.trim(),
          name:          name.trim(),
          type,
          description:   description.trim() || undefined,
          account_group: accountGroup.trim() || null,
        };
        await window.api.createAccount(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    setShowDeleteConfirm(false);
    setError(null);
    setDeleting(true);
    try {
      await window.api.deleteAccount(account!.id);
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  const showNumberField = !isEdit || canEditStructure;
  const showTypeSelect  = !isEdit || canEditStructure;

  return (
    <>
    <Modal onClose={onClose} className={styles.modal}>
      <div>
        <h2 className={styles.h2}>
          {isEdit
            ? `Modifier — ${account!.number} ${account!.name}`
            : 'Nouveau compte'}
        </h2>

        {error && <div className={styles.errorBox} role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {showNumberField ? (
            <div className={styles.field}>
              <label htmlFor="acc-number" className={styles.fieldLabel}>Numéro *</label>
              <input
                id="acc-number"
                type="text"
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="Ex. : 395"
                required
                className={styles.input}
              />
            </div>
          ) : (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Numéro</span>
              <span className={styles.readOnly}>{account!.number}</span>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="acc-name" className={styles.fieldLabel}>Libellé *</label>
            <input
              id="acc-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className={styles.input}
            />
          </div>

          {showTypeSelect ? (
            <div className={styles.field}>
              <label htmlFor="acc-type" className={styles.fieldLabel}>Type *</label>
              <select
                id="acc-type"
                value={type}
                onChange={e => setType(e.target.value as AccountType)}
                className={styles.select}
              >
                {ACCOUNT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span className={styles.deduced}>
                Solde normal déduit : {normalBalanceLabel(type)}
              </span>
            </div>
          ) : (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <span className={styles.readOnly}>{account!.type}</span>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="acc-group" className={styles.fieldLabel}>Groupe analytique</label>
            <input
              id="acc-group"
              type="text"
              list="groups-datalist"
              value={accountGroup}
              onChange={e => setAccountGroup(e.target.value)}
              placeholder="Ex. : boissons, marche, broche"
              className={styles.input}
            />
            <datalist id="groups-datalist">
              {existingGroups.map(g => <option key={g} value={g} />)}
            </datalist>
          </div>

          <div className={styles.field}>
            <label htmlFor="acc-desc" className={styles.fieldLabel}>Description</label>
            <input
              id="acc-desc"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={styles.input}
            />
          </div>

          {isEdit && (
            <div className={styles.field}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={!!isActive}
                  onChange={e => setIsActive(e.target.checked)}
                />
                Compte actif
              </label>
            </div>
          )}

          <div className={styles.actions}>
            {canEditStructure && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={deleting || submitting}
                className={styles.deleteBtn}
              >
                <Trash2 size={14} />{deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            )}
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Annuler
            </button>
            <button type="submit" disabled={!canSubmit} className={styles.submitBtn}>
              {isEdit
                ? <><Save size={14} />{submitting ? 'Enregistrement…' : 'Enregistrer'}</>
                : <><Plus size={14} />{submitting ? 'Création…' : 'Créer'}</>}
            </button>
          </div>
        </form>
      </div>
    </Modal>
    {showDeleteConfirm && (
      <ConfirmDialog
        message={`Supprimer le compte ${account!.number} — ${account!.name} ? Cette action est irréversible.`}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    )}
    </>
  );
}
