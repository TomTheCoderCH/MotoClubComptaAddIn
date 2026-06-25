import { useEffect, useState } from 'react';
import type { Account, DashboardCardConfig } from '../types';
import Modal from './Modal';
import styles from './AddCardModal.module.css';

const FIXED_NUMBERS = new Set(['100', '101', '102']);

interface Props {
  existingCards: DashboardCardConfig[];
  onAdd:    (card: DashboardCardConfig) => void;
  onCancel: () => void;
}

export default function AddCardModal({ existingCards, onAdd, onCancel }: Props) {
  const [cardType,       setCardType]       = useState<'account' | 'group'>('account');
  const [accounts,       setAccounts]       = useState<Account[]>([]);
  const [selectedAccId,  setSelectedAccId]  = useState('');
  const [selectedGroup,  setSelectedGroup]  = useState('');

  useEffect(() => {
    window.api.getActiveAccounts().then(setAccounts);
  }, []);

  const existingAccountIds = new Set(
    existingCards.filter(c => c.type === 'account').map(c => c.accountId)
  );
  const existingGroupNames = new Set(
    existingCards.filter(c => c.type === 'group').map(c => c.groupName)
  );

  const availableAccounts = accounts.filter(
    a => !FIXED_NUMBERS.has(a.number) && !existingAccountIds.has(a.id)
  );

  const availableGroups = [...new Set(
    accounts
      .map(a => a.account_group)
      .filter((g): g is string => !!g && !existingGroupNames.has(g))
  )].sort();

  const canSubmit = cardType === 'account'
    ? selectedAccId !== ''
    : selectedGroup !== '';

  function handleSubmit() {
    if (!canSubmit) return;
    if (cardType === 'account') {
      onAdd({ type: 'account', accountId: Number(selectedAccId) });
    } else {
      onAdd({ type: 'group', groupName: selectedGroup });
    }
  }

  return (
    <Modal ariaLabel="Ajouter une carte" onClose={onCancel} className={styles.modal}>
      <div>
        <h2 className={styles.title}>Ajouter une carte</h2>

        <div className={styles.radios}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="cardType"
              value="account"
              checked={cardType === 'account'}
              onChange={() => { setCardType('account'); setSelectedAccId(''); }}
            />
            Compte
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="cardType"
              value="group"
              checked={cardType === 'group'}
              onChange={() => { setCardType('group'); setSelectedGroup(''); }}
            />
            Groupe analytique
          </label>
        </div>

        {cardType === 'account' ? (
          <select
            className={styles.select}
            value={selectedAccId}
            onChange={e => setSelectedAccId(e.target.value)}
          >
            <option value="">— Choisir un compte —</option>
            {availableAccounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.number} — {a.name}
              </option>
            ))}
          </select>
        ) : (
          <select
            className={styles.select}
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value)}
          >
            <option value="">— Choisir un groupe —</option>
            {availableGroups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        )}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Annuler</button>
          <button className={styles.addBtn} disabled={!canSubmit} onClick={handleSubmit}>
            Ajouter
          </button>
        </div>
      </div>
    </Modal>
  );
}
