import { useEffect, useState } from 'react';
import type { Account } from '../types';
import styles from './AccountsPage.module.css';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    window.api.getAccounts()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className={styles.heading}>Plan comptable</h1>

      {error && <div className={styles.error}>Erreur : {error}</div>}

      <p className={styles.subtitle}>{accounts.length} comptes</p>

      <table className={styles.table}>
        <thead>
          <tr className={styles.theadRow}>
            <th className={styles.th}>N°</th>
            <th className={styles.th}>Intitulé</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id} className={styles.row}>
              <td className={styles.td}><code>{a.number}</code></td>
              <td className={styles.td}>{a.name}</td>
              <td className={styles.td}><span className={styles.badge}>{a.type}</span></td>
              <td className={styles.td}><span className={styles.badge}>{a.normal_balance}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
