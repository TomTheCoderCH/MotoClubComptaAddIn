import { useEffect, useState } from 'react';
import type { FiscalYear } from '../types';

export default function FiscalYearsPage() {
  const [years,    setYears]    = useState<FiscalYear[]>([]);
  const [newYear,  setNewYear]  = useState<number>(new Date().getFullYear());
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await window.api.getFiscalYears();
      setYears(data);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await window.api.createFiscalYear(newYear);
      setNewYear(n => n + 1);
      await load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const yearAlreadyExists = years.some(y => y.year === newYear);

  return (
    <div>
      <h1 style={s.h1}>Exercices</h1>

      {error && <div role="alert" style={s.error}>Erreur : {error}</div>}

      {/* ── Création ── */}
      <section style={s.section}>
        <h2 style={s.h2}>Créer un exercice</h2>
        <form onSubmit={handleCreate} style={s.form}>
          <label htmlFor="year-input" style={s.label}>Année</label>
          <input
            id="year-input"
            type="number"
            value={newYear}
            onChange={e => setNewYear(Number(e.target.value))}
            min={2000}
            max={2100}
            style={s.input}
          />
          {yearAlreadyExists && (
            <span style={s.warn}>L'exercice {newYear} existe déjà</span>
          )}
          <button
            type="submit"
            disabled={creating || yearAlreadyExists}
            style={{ ...s.btn, ...(creating || yearAlreadyExists ? s.btnDisabled : {}) }}
          >
            {creating ? 'Création…' : `Créer l'exercice ${newYear}`}
          </button>
        </form>
      </section>

      {/* ── Liste ── */}
      <section style={s.section}>
        <h2 style={s.h2}>Exercices enregistrés</h2>
        {years.length === 0 ? (
          <p style={s.empty}>Aucun exercice créé pour l'instant.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.theadRow}>
                <th style={s.th}>Année</th>
                <th style={s.th}>Début</th>
                <th style={s.th}>Fin</th>
                <th style={s.th}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => (
                <tr key={y.id} style={s.row}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{y.year}</td>
                  <td style={s.td}>{formatDate(y.start_date)}</td>
                  <td style={s.td}>{formatDate(y.end_date)}</td>
                  <td style={s.td}>
                    <span style={y.is_closed ? s.badgeClosed : s.badgeOpen}>
                      {y.is_closed ? 'Clôturé' : 'Ouvert'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// Evite les décalages de timezone liés à new Date('YYYY-MM-DD') interprété en UTC
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const s = {
  h1:          { margin: '0 0 1.5rem', fontSize: '1.5rem', color: '#0f172a' },
  h2:          { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#334155' },
  section:     { marginBottom: '2rem' },
  error:       { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' },
  form:        { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  label:       { fontWeight: 500, fontSize: '0.875rem', color: '#475569' },
  input:       { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', width: '90px', color: '#0f172a' },
  warn:        { fontSize: '0.8rem', color: '#d97706' },
  btn:         { padding: '0.45rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  btnDisabled: { background: '#94a3b8', cursor: 'not-allowed' },
  empty:       { color: '#64748b', fontSize: '0.875rem' },
  table:       { borderCollapse: 'collapse' as const, width: '100%', maxWidth: '600px', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow:    { background: '#f1f5f9' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  row:         { borderBottom: '1px solid #f1f5f9' },
  td:          { padding: '0.5rem 1rem', color: '#334155' },
  badgeOpen:   { display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 500 },
  badgeClosed: { display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontSize: '0.75rem', fontWeight: 500 },
} as const;
