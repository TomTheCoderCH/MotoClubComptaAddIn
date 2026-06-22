import { useState } from 'react';
import type { OpeningBalanceSuggestion, OpeningBalanceLine } from '../types';

export interface OpeningBalanceModalProps {
  fiscalYearId: number;
  year: number;
  suggestions: OpeningBalanceSuggestion[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function OpeningBalanceModal({
  fiscalYearId, year, suggestions, onClose, onSuccess,
}: OpeningBalanceModalProps) {
  const editable = suggestions.filter(s => s.type !== 'FONDS_PROPRES');
  const capital  = suggestions.filter(s => s.type === 'FONDS_PROPRES');

  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(editable.map(s => [s.accountId, formatCHF(s.suggestedAmountCents)]))
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const actifCents = suggestions
    .filter(s => s.type === 'ACTIF')
    .reduce((sum, s) => sum + parseCHF(amounts[s.accountId] ?? '0'), 0);

  const passifCents = suggestions
    .filter(s => s.type === 'PASSIF')
    .reduce((sum, s) => sum + parseCHF(amounts[s.accountId] ?? '0'), 0);

  const capitalCents = actifCents - passifCents;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const lines: OpeningBalanceLine[] = [
        ...editable.map(s => ({
          accountId: s.accountId,
          amountCents: parseCHF(amounts[s.accountId] ?? '0'),
        })),
        ...capital.map(s => ({ accountId: s.accountId, amountCents: capitalCents })),
      ];
      await window.api.createOpeningBalance(fiscalYearId, lines);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const actifAccounts  = suggestions.filter(s => s.type === 'ACTIF');
  const passifAccounts = suggestions.filter(s => s.type === 'PASSIF');

  return (
    <div style={s.overlay} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div style={s.modal}>
        <h2 id="ob-title" style={s.h2}>Soldes à nouveau — Exercice {year}</h2>

        {error && <div role="alert" style={s.alert}>{error}</div>}

        <table style={s.table}>
          <tbody>
            <tr><td colSpan={2} style={s.sectionHeader}>Classe 1 — Actifs</td></tr>
            {actifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td style={s.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td style={s.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    style={s.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            <tr><td colSpan={2} style={s.sectionHeader}>Classe 2 — Passifs et fonds propres</td></tr>
            {passifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td style={s.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td style={s.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    style={s.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            {capital.map(sg => (
              <tr key={sg.accountId}>
                <td style={s.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td style={s.amountCell}>
                  <input
                    type="text"
                    readOnly
                    value={formatCHF(capitalCents)}
                    style={{ ...s.input, ...s.inputReadOnly }}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={s.actions}>
          <button onClick={onClose} disabled={saving} style={s.btnSecondary}>
            Passer cette étape
          </button>
          <button onClick={handleSave} disabled={saving} style={s.btn}>
            {saving ? 'Enregistrement…' : 'Enregistrer les soldes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseCHF(str: string): number {
  const n = parseFloat(str.replace(',', '.'));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

function formatCHF(cents: number): string {
  return (cents / 100).toFixed(2);
}

const s = {
  overlay:       { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:         { background: '#fff', borderRadius: '10px', padding: '2rem', minWidth: '480px', maxWidth: '640px', boxShadow: '0 8px 32px rgba(0,0,0,.18)' },
  h2:            { margin: '0 0 1.25rem', fontSize: '1.1rem', color: '#0f172a' },
  alert:         { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.6rem 0.75rem', borderRadius: '6px', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' },
  table:         { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '1.5rem', fontSize: '0.875rem' },
  sectionHeader: { padding: '0.5rem 0 0.25rem', fontWeight: 600, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  accountCell:   { padding: '0.3rem 0', color: '#334155', width: '60%' },
  amountCell:    { padding: '0.3rem 0', textAlign: 'right' as const },
  input:         { width: '120px', padding: '0.3rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '0.875rem', textAlign: 'right' as const, fontFamily: 'monospace' },
  inputReadOnly: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' },
  actions:       { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  btn:           { padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 },
  btnSecondary:  { padding: '0.5rem 1rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer' },
} as const;
