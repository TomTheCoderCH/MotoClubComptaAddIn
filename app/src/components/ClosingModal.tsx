import { useState } from 'react';
import type { ClosingPreview } from '../types';

interface ClosingModalProps {
  fiscalYearId: number;
  year: number;
  preview: ClosingPreview;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ClosingModal({ fiscalYearId, year, preview, onClose, onSuccess }: ClosingModalProps) {
  const [closing, setClosing] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const hasBlockers = preview.blockers.length > 0;

  async function handleConfirm() {
    setClosing(true);
    setError(null);
    try {
      await window.api.closeFiscalYear(fiscalYearId);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClosing(false);
    }
  }

  const netCHF   = (Math.abs(preview.netResultCents) / 100).toFixed(2);
  const isProfit = preview.netResultCents >= 0;

  return (
    <div style={s.overlay}>
      <div style={s.card} role="dialog" aria-modal="true" aria-labelledby="closing-title">
        <h2 id="closing-title" style={s.title}>Clôture de l&apos;exercice {year}</h2>

        {error && <div role="alert" style={s.alertError}>{error}</div>}

        <p style={s.warning}>
          ⚠ Cette opération peut être annulée via &quot;Rouvrir l&apos;exercice&quot;.
        </p>

        {hasBlockers ? (
          <div style={s.blockerBox}>
            {preview.blockers.map((b, i) => (
              <p key={i} style={s.blockerLine}>✗ {b}</p>
            ))}
            <p style={s.blockerHint}>La clôture ne peut pas être effectuée.</p>
          </div>
        ) : (
          <>
            {preview.accounts.length > 0 && (
              <>
                <p style={s.sectionLabel}>Comptes soldés vers 900 — Profits et Pertes</p>
                <table style={s.table}>
                  <tbody>
                    {preview.accounts.map(a => (
                      <tr key={a.accountId} style={s.row}>
                        <td style={s.tdNum}>{a.accountNumber}</td>
                        <td style={s.tdName}>{a.accountName}</td>
                        <td style={s.tdType}>{a.type === 'PRODUIT' ? 'Produit' : 'Charge'}</td>
                        <td style={s.tdAmount}>{(Math.abs(a.soldeCents) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p style={s.result}>
              Résultat net : <strong>{isProfit ? 'Bénéfice' : 'Perte'} CHF {netCHF}</strong>
              {preview.netResultCents !== 0 && ' → 900 Profits et Pertes → 290 Capital'}
            </p>
          </>
        )}

        <div style={s.actions}>
          <button onClick={onClose} disabled={closing} style={s.btnCancel}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={hasBlockers || closing}
            style={{ ...s.btnConfirm, ...(hasBlockers || closing ? s.btnDisabled : {}) }}
          >
            {closing ? 'Clôture en cours…' : 'Confirmer la clôture'}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay:      { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  card:         { background: '#fff', borderRadius: '10px', padding: '1.75rem', width: '560px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' as const, boxShadow: '0 8px 32px rgba(0,0,0,.18)' },
  title:        { margin: '0 0 1rem', fontSize: '1.1rem', color: '#0f172a' },
  alertError:   { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.6rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem', color: '#dc2626', fontSize: '0.875rem' },
  warning:      { margin: '0 0 1rem', fontSize: '0.85rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.5rem 0.75rem', borderRadius: '6px' },
  blockerBox:   { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem' },
  blockerLine:  { margin: '0 0 0.25rem', color: '#dc2626', fontSize: '0.875rem' },
  blockerHint:  { margin: '0.5rem 0 0', color: '#7f1d1d', fontSize: '0.8rem', fontStyle: 'italic' as const },
  sectionLabel: { margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#334155' },
  table:        { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', marginBottom: '1rem', background: '#f8fafc', borderRadius: '6px', overflow: 'hidden' },
  row:          { borderBottom: '1px solid #e2e8f0' },
  tdNum:        { padding: '0.35rem 0.75rem', color: '#64748b', fontFamily: 'monospace' },
  tdName:       { padding: '0.35rem 0.5rem', color: '#334155', width: '100%' },
  tdType:       { padding: '0.35rem 0.5rem', color: '#64748b', whiteSpace: 'nowrap' as const },
  tdAmount:     { padding: '0.35rem 0.75rem', textAlign: 'right' as const, fontFamily: 'monospace', color: '#334155' },
  result:       { margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#334155' },
  actions:      { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' },
  btnCancel:    { padding: '0.45rem 1rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' },
  btnConfirm:   { padding: '0.45rem 1.1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 as const },
  btnDisabled:  { background: '#94a3b8', cursor: 'not-allowed' },
} as const;
