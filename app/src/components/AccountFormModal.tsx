import { useState } from 'react';
import type { Account, AccountType, UpdateAccountPayload, CreateAccountPayload } from '../types';
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
}

export default function AccountFormModal({ account, existingGroups, onClose, onSaved }: Props) {
  const isEdit = account !== undefined;

  const [name,         setName]         = useState(account?.name ?? '');
  const [number,       setNumber]       = useState('');
  const [type,         setType]         = useState<AccountType>(account?.type ?? 'PRODUIT');
  const [description,  setDescription]  = useState(account?.description ?? '');
  const [accountGroup, setAccountGroup] = useState(account?.account_group ?? '');
  const [isActive,     setIsActive]     = useState(account?.is_active !== false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const canSubmit = name.trim() !== '' && (isEdit || number.trim() !== '') && !submitting;

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

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.h2}>
          {isEdit
            ? `Modifier — ${account!.number} ${account!.name}`
            : 'Nouveau compte'}
        </h2>

        {error && <div className={styles.errorBox} role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {!isEdit && (
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

          {!isEdit ? (
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
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Annuler
            </button>
            <button type="submit" disabled={!canSubmit} className={styles.submitBtn}>
              {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
