import { useEffect, useState } from 'react';
import type { Account } from './types';

declare global {
  interface Window {
    api: {
      getAccounts: () => Promise<Account[]>;
    };
  }
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.getAccounts()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ borderBottom: '2px solid #333', paddingBottom: '0.5rem' }}>MCY Compta</h1>

      {error && (
        <div style={{ background: '#fee', border: '1px solid #c00', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem' }}>
          Erreur : {error}
        </div>
      )}

      <h2>Plan comptable ({accounts.length} comptes)</h2>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            <th style={th}>N°</th>
            <th style={th}>Intitulé</th>
            <th style={th}>Type</th>
            <th style={th}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={td}><code>{a.number}</code></td>
              <td style={td}>{a.name}</td>
              <td style={td}><span style={{ fontSize: '0.8em', color: '#666' }}>{a.type}</span></td>
              <td style={td}><span style={{ fontSize: '0.8em', color: '#666' }}>{a.normal_balance}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  fontWeight: 600,
  borderBottom: '2px solid #ccc',
};

const td: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
};
