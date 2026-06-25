import React, { useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import type { Account } from '../types';
import AccountFormModal from '../components/AccountFormModal';
import styles from './AccountsPage.module.css';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const [modal,    setModal]    = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);

  function load() {
    window.api.getAccounts()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  function openEdit(acc: Account) {
    setSelected(acc);
    setModal('edit');
  }

  function openCreate() {
    setSelected(null);
    setModal('create');
  }

  function handleSaved() {
    setModal(null);
    load();
  }

  const existingGroups = [...new Set(
    accounts.map(a => a.account_group).filter((g): g is string => g !== null)
  )].sort();

  const CLASS_LABELS: Record<number, string> = {
    1: 'Classe 1 — Actifs',
    2: 'Classe 2 — Passifs & fonds propres',
    3: 'Classe 3 — Produits',
    4: 'Classe 4 — Charges',
    9: 'Classe 9 — Clôture',
  };

  const byClass = accounts.reduce<Record<number, Account[]>>((acc, a) => {
    (acc[a.class] ??= []).push(a);
    return acc;
  }, {});
  const classes = Object.keys(byClass).map(Number).sort((a, b) => a - b);

  return (
    <div>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Plan comptable</h1>
        <button onClick={openCreate} className={styles.newBtn}><Plus size={15} />Nouveau compte</button>
      </div>

      {error && <div className={styles.error}>Erreur : {error}</div>}

      <p className={styles.subtitle}>{accounts.length} comptes</p>

      <table className={styles.table}>
        <thead>
          <tr className={styles.theadRow}>
            <th className={styles.th}>N°</th>
            <th className={styles.th}>Intitulé</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Balance</th>
            <th className={styles.th}>Groupe analytique</th>
            <th className={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {classes.map(cls => (
            <React.Fragment key={cls}>
              <tr className={styles.groupHeader}>
                <td colSpan={6}>{CLASS_LABELS[cls] ?? `Classe ${cls}`}</td>
              </tr>
              {byClass[cls].map(a => (
                <tr key={a.id} className={`${styles.row} ${!a.is_active ? styles.inactive : ''}`}>
                  <td className={styles.td}><code>{a.number}</code></td>
                  <td className={styles.td}>{a.name}</td>
                  <td className={styles.td}><span className={styles.badge}>{a.type}</span></td>
                  <td className={styles.td}><span className={styles.badge}>{a.normal_balance}</span></td>
                  <td className={styles.td}>
                    {a.account_group && (
                      <span className={styles.groupTag}>{a.account_group}</span>
                    )}
                  </td>
                  <td className={styles.td}>
                    <button
                      onClick={() => openEdit(a)}
                      className={styles.editBtn}
                      aria-label={`Modifier ${a.name}`}
                    >
                      <Pencil size={13} />Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {modal !== null && (
        <AccountFormModal
          account={modal === 'edit' ? selected ?? undefined : undefined}
          existingGroups={existingGroups}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleSaved}
        />
      )}
    </div>
  );
}
