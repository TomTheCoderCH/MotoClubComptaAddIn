import { useState, useCallback } from 'react';
import { Save, X } from 'lucide-react';
import Modal from './Modal';
import { DENOMINATIONS, PIECES, BILLETS, formatDenom, emptyLines } from '../lib/cash';
import { formatCHF } from '../lib/format';
import type { CashContext, CashCountPayload } from '../types';
import styles from './CashCountModal.module.css';

interface Props {
  fiscalYearId: number;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CashCountModal({ fiscalYearId, onClose, onSaved }: Props) {
  const [date,    setDate]    = useState(todayISO());
  const [label,   setLabel]   = useState('');
  const [context, setContext] = useState<CashContext>('LIBRE');
  const [notes,   setNotes]   = useState('');

  // Quantities keyed by denomination (centimes)
  const [qtys, setQtys] = useState<Record<number, number>>(
    () => Object.fromEntries(DENOMINATIONS.map(d => [d, 0]))
  );

  // Displayed value for each total input. Tracks intermediate raw strings (qty=0)
  // so that typing "15" character-by-character doesn't reset the field after "1".
  const [totalDisplays, setTotalDisplays] = useState<Record<number, string>>(
    () => Object.fromEntries(DENOMINATIONS.map(d => [d, '']))
  );

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const setQty = useCallback((denom: number, raw: string) => {
    const qty = Math.max(0, parseInt(raw) || 0);
    setQtys(prev => ({ ...prev, [denom]: qty }));
    // Recompute total display from the new qty
    setTotalDisplays(prev => ({
      ...prev,
      [denom]: qty === 0 ? '' : (qty * denom / 100).toFixed(2),
    }));
  }, []);

  const setTotal = useCallback((denom: number, raw: string) => {
    const cents = Math.round((parseFloat(raw) || 0) * 100);
    const qty   = Math.max(0, Math.floor(cents / denom));
    setQtys(prev => ({ ...prev, [denom]: qty }));
    // When qty > 0 snap to the exact multiple; when qty = 0 keep the raw string
    // so that intermediate characters (e.g. '1' while typing '15') don't blank the field.
    setTotalDisplays(prev => ({
      ...prev,
      [denom]: qty > 0 ? (qty * denom / 100).toFixed(2) : raw,
    }));
  }, []);

  const grandTotal = DENOMINATIONS.reduce((s, d) => s + d * qtys[d], 0);
  const hasAny     = DENOMINATIONS.some(d => qtys[d] > 0);

  const handleSave = async () => {
    if (!label.trim()) { setError('Le libellé est requis'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: CashCountPayload = {
        fiscal_year_id: fiscalYearId,
        date,
        label: label.trim(),
        context,
        notes: notes.trim() || undefined,
        lines: emptyLines().map(l => ({ ...l, quantity: qtys[l.denomination] })),
      };
      await window.api.createCashCount(payload);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  const maxRows = Math.max(PIECES.length, BILLETS.length);

  return (
    <Modal onClose={onClose} className={styles.modal}>
      <h2 className={styles.title}>Nouvel arrêté de caisse</h2>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            aria-label="Date"
          />
        </label>
        <label className={styles.field}>
          <span>Libellé</span>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="ex : Avant Marché 2026"
            aria-label="Libellé"
          />
        </label>
        <label className={styles.field}>
          <span>Contexte</span>
          <select
            value={context}
            onChange={e => setContext(e.target.value as CashContext)}
            aria-label="Contexte"
          >
            <option value="LIBRE">Libre</option>
            <option value="AVANT">Avant manifestation</option>
            <option value="FONDS">Fonds de caisse</option>
            <option value="APRES">Après manifestation</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
          />
        </label>
      </div>

      <div className={styles.grid}>
        <table className={styles.denomTable}>
          <thead>
            <tr>
              <th>Pièces</th><th>Qté</th><th>Total</th>
              <th className={styles.sep} />
              <th>Billets</th><th>Qté</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, i) => {
              const p  = PIECES[i];
              const b  = BILLETS[i];
              const pQ = p !== undefined ? qtys[p] : 0;
              const bQ = b !== undefined ? qtys[b] : 0;
              return (
                <tr key={i}>
                  {p !== undefined ? (
                    <>
                      <td className={styles.denomLabel}>{formatDenom(p)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={pQ === 0 ? '' : pQ}
                          onChange={e => setQty(p, e.target.value)}
                          className={styles.numInput}
                          data-testid={`qty-${p}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={totalDisplays[p]}
                          onChange={e => setTotal(p, e.target.value)}
                          className={styles.numInput}
                          data-testid={`total-${p}`}
                        />
                      </td>
                    </>
                  ) : <><td /><td /><td /></>}
                  <td className={styles.sep} />
                  {b !== undefined ? (
                    <>
                      <td className={styles.denomLabel}>{formatDenom(b)}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={bQ === 0 ? '' : bQ}
                          onChange={e => setQty(b, e.target.value)}
                          className={styles.numInput}
                          data-testid={`qty-${b}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={totalDisplays[b]}
                          onChange={e => setTotal(b, e.target.value)}
                          className={styles.numInput}
                          data-testid={`total-${b}`}
                        />
                      </td>
                    </>
                  ) : <><td /><td /><td /></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.totals}>
        <span className={styles.totalLabel}>Total compté</span>
        <span className={styles.totalValue}>{formatCHF(grandTotal)} CHF</span>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" onClick={onClose} className={styles.btnSecondary}>
          <X size={16} /> Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasAny || saving}
          className={styles.btnPrimary}
        >
          <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}
