import { useEffect, useState } from 'react';
import type { Account } from '../types';

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
      <h1 style={styles.heading}>Plan comptable</h1>

      {error && <div style={styles.error}>Erreur : {error}</div>}

      <p style={styles.subtitle}>{accounts.length} comptes</p>

      <table style={styles.table}>
        <thead>
          <tr style={styles.theadRow}>
            <th style={styles.th}>N°</th>
            <th style={styles.th}>Intitulé</th>
            <th style={styles.th}>Type</th>
            <th style={styles.th}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id} style={styles.row}>
              <td style={styles.td}><code>{a.number}</code></td>
              <td style={styles.td}>{a.name}</td>
              <td style={styles.td}><span style={styles.badge}>{a.type}</span></td>
              <td style={styles.td}><span style={styles.badge}>{a.normal_balance}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  heading:  { margin: '0 0 0.25rem', fontSize: '1.5rem', color: '#0f172a' },
  subtitle: { margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.875rem' },
  error:    { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', color: '#dc2626' },
  table:    { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow: { background: '#f1f5f9' },
  th:       { textAlign: 'left' as const, padding: '0.65rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  row:      { borderBottom: '1px solid #f1f5f9' },
  td:       { padding: '0.5rem 1rem', color: '#334155' },
  badge:    { fontSize: '0.75rem', color: '#64748b' },
} as const;
