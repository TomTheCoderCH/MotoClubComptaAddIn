import { useState } from 'react';
import type { FiscalYear, Account } from '../types';
import { parseAmount, formatAmount, validateEntryBalance } from '../lib/accounting';

interface Line {
  account_id: string;  // string pour le <select>, converti en number à la soumission
  debit:  string;
  credit: string;
}

interface EntryFormProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  onCreated:  () => void;
  onCancel:   () => void;
}

const emptyLine = (): Line => ({ account_id: '', debit: '', credit: '' });

export default function EntryForm({ fiscalYear, accounts, onCreated, onCancel }: EntryFormProps) {
  const [date,        setDate]        = useState(today());
  const [description, setDescription] = useState('');
  const [piece,       setPiece]       = useState('');
  const [lines,       setLines]       = useState<Line[]>([emptyLine(), emptyLine()]);
  const [submitting,  setSubmitting]  = useState(false);
  const [apiError,    setApiError]    = useState<string | null>(null);

  // ── Calcul de l'équilibre en temps réel ──────────────────────────────────

  const totals = lines.reduce(
    (acc, l) => ({
      debit:  acc.debit  + (parseFloat(l.debit)  || 0),
      credit: acc.credit + (parseFloat(l.credit) || 0),
    }),
    { debit: 0, credit: 0 },
  );

  const balanced   = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.001;
  const canSubmit  = description.trim() !== '' && date !== '' && balanced && !submitting;

  // ── Modification d'une ligne ──────────────────────────────────────────────

  function updateLine(i: number, field: keyof Line, value: string) {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };

      // Quand on saisit un débit, efface le crédit de la même ligne (et inversement)
      if (field === 'debit'  && value !== '') next[i].credit = '';
      if (field === 'credit' && value !== '') next[i].debit  = '';

      return next;
    });
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()]);
  }

  function removeLine(i: number) {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Soumission ────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    // Construire les lignes en centimes
    const payload = lines
      .filter(l => l.account_id !== '')
      .map(l => ({
        account_id: Number(l.account_id),
        debit:  l.debit  !== '' ? parseAmount(l.debit)  : undefined,
        credit: l.credit !== '' ? parseAmount(l.credit) : undefined,
      }));

    // Validation côté client (même règles que le serveur)
    try {
      validateEntryBalance(payload);
    } catch (e: unknown) {
      setApiError((e as Error).message);
      return;
    }

    setSubmitting(true);
    try {
      await window.api.createJournalEntry({
        fiscal_year_id: fiscalYear.id,
        date,
        description:    description.trim(),
        piece:          piece.trim() || undefined,
        lines:          payload,
      });
      onCreated();
    } catch (e: unknown) {
      setApiError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Formulaire de saisie d'écriture" noValidate style={s.card}>
      <h2 style={s.h2}>Nouvelle écriture — exercice {fiscalYear.year}</h2>

      {/* ── En-tête de l'écriture ── */}
      <div style={s.row}>
        <div style={s.field}>
          <label htmlFor="entry-date" style={s.label}>Date *</label>
          <input
            id="entry-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            min={fiscalYear.start_date}
            max={fiscalYear.end_date}
            required
            style={s.input}
          />
        </div>
        <div style={{ ...s.field, flex: 2 }}>
          <label htmlFor="entry-desc" style={s.label}>Libellé *</label>
          <input
            id="entry-desc"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ex. : Cotisation membre — Dupont"
            required
            style={s.input}
          />
        </div>
        <div style={s.field}>
          <label htmlFor="entry-piece" style={s.label}>Pièce</label>
          <input
            id="entry-piece"
            type="text"
            value={piece}
            onChange={e => setPiece(e.target.value)}
            placeholder="P-2025-001"
            style={s.input}
          />
        </div>
      </div>

      {/* ── Lignes comptables ── */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={s.linesHeader}>
          <span style={s.colAccount}>Compte</span>
          <span style={s.colAmount}>Débit CHF</span>
          <span style={s.colAmount}>Crédit CHF</span>
          <span style={{ width: '32px' }} />
        </div>

        {lines.map((line, i) => (
          <div key={i} style={s.lineRow}>
            <select
              value={line.account_id}
              onChange={e => updateLine(i, 'account_id', e.target.value)}
              aria-label={`Compte ligne ${i + 1}`}
              style={{ ...s.input, ...s.colAccount }}
            >
              <option value="">— choisir un compte —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.number} — {a.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={line.debit}
              onChange={e => updateLine(i, 'debit', e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              aria-label={`Débit ligne ${i + 1}`}
              style={{ ...s.input, ...s.colAmount, textAlign: 'right' }}
            />

            <input
              type="number"
              value={line.credit}
              onChange={e => updateLine(i, 'credit', e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              aria-label={`Crédit ligne ${i + 1}`}
              style={{ ...s.input, ...s.colAmount, textAlign: 'right' }}
            />

            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lines.length <= 2}
              aria-label={`Supprimer ligne ${i + 1}`}
              style={s.removeBtn}
            >
              ×
            </button>
          </div>
        ))}

        <button type="button" onClick={addLine} style={s.addLineBtn}>
          + Ajouter une ligne
        </button>
      </div>

      {/* ── Résumé débit / crédit ── */}
      <div style={{ ...s.balance, ...(balanced ? s.balanceOk : s.balanceKo) }}>
        <span>Total débit : <strong>{totals.debit.toFixed(2)}</strong></span>
        <span>Total crédit : <strong>{totals.credit.toFixed(2)}</strong></span>
        <span>{balanced ? 'Ecriture équilibrée' : 'Déséquilibre : ' + Math.abs(totals.debit - totals.credit).toFixed(2)}</span>
      </div>

      {apiError && <div role="alert" style={s.error}>Erreur : {apiError}</div>}

      {/* ── Actions ── */}
      <div style={s.actions}>
        <button type="button" onClick={onCancel} style={s.cancelBtn}>Annuler</button>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{ ...s.submitBtn, ...(!canSubmit ? s.btnDisabled : {}) }}
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer l\'écriture'}
        </button>
      </div>
    </form>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const s = {
  card:        { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,.07)' },
  h2:          { margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600, color: '#334155' },
  row:         { display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' as const },
  field:       { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem', flex: 1, minWidth: '140px' },
  label:       { fontSize: '0.8rem', fontWeight: 500, color: '#475569' },
  input:       { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff' },
  linesHeader: { display: 'flex', gap: '0.5rem', padding: '0 0 0.25rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748b' },
  lineRow:     { display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' },
  colAccount:  { flex: 2, minWidth: '200px' },
  colAmount:   { width: '110px' },
  removeBtn:   { width: '32px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: 0 },
  addLineBtn:  { marginTop: '0.25rem', background: 'none', border: '1px dashed #94a3b8', borderRadius: '6px', padding: '0.35rem 0.75rem', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' },
  balance:     { display: 'flex', gap: '1.5rem', padding: '0.6rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '0.75rem' },
  balanceOk:   { background: '#dcfce7', color: '#15803d' },
  balanceKo:   { background: '#fef9c3', color: '#92400e' },
  error:       { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.65rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem', color: '#dc2626', fontSize: '0.875rem' },
  actions:     { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn:   { padding: '0.45rem 1rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' },
  submitBtn:   { padding: '0.45rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  btnDisabled: { background: '#94a3b8', cursor: 'not-allowed' },
} as const;
