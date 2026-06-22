import { useState } from 'react';

export default function WelcomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleChoose() {
    setLoading(true);
    setError(null);
    try {
      await window.api.chooseDataDir();
      // Si accepté : app.relaunch() est appelé — cette Promise ne résout jamais
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.h1}>Bienvenue dans MCY Compta</h1>
        <p style={s.desc}>
          Choisissez l&apos;emplacement où sera stockée votre base de données.
        </p>
        <p style={s.hint}>
          Conseil : placez ce dossier dans OneDrive ou un dossier synchronisé
          pour une protection cloud automatique.
        </p>
        {error && <div role="alert" style={s.alert}>Erreur : {error}</div>}
        <button onClick={handleChoose} disabled={loading} style={s.btn}>
          {loading ? 'Ouverture…' : 'Choisir le dossier de données'}
        </button>
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc' },
  card:      { background: '#fff', borderRadius: '12px', padding: '2.5rem', maxWidth: '500px', width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,.1)', textAlign: 'center' as const },
  h1:        { margin: '0 0 1rem', fontSize: '1.5rem', color: '#0f172a', fontWeight: 700 },
  desc:      { margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#334155' },
  hint:      { margin: '0 0 1.5rem', fontSize: '0.825rem', color: '#64748b', fontStyle: 'italic' as const },
  alert:     { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' },
  btn:       { padding: '0.6rem 1.5rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 },
} as const;
