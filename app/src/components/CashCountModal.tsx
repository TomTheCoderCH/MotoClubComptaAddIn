import { useState, useCallback, useEffect } from 'react';
import { Save, X } from 'lucide-react';
import Modal from './Modal';
import { DENOMINATIONS, PIECES, BILLETS, formatDenom, emptyLines } from '../lib/cash';
import { formatCHF } from '../lib/format';
import type { CashContext, CashCountPayload } from '../types';
import styles from './CashCountModal.module.css';

interface Props {
  fiscalYearId: number;
  editId?: number;   // si défini, pré-charge ce comptage en mode édition
  onClose: () => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CashCountModal({ fiscalYearId, editId, onClose, onSaved }: Props) {
  const [date,    setDate]    = useState(todayISO());
  const [label,   setLabel]   = useState('');
  const [context, setContext] = useState<CashContext>('LIBRE');
  const [notes,   setNotes]   = useState('');
  const [loadingEdit, setLoadingEdit] = useState(false);

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

  // Pré-chargement des données existantes en mode édition
  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    window.api.getCashCountById(editId)
      .then(count => {
        setDate(count.date);
        setLabel(count.label);
        setContext(count.context);
        setNotes(count.notes ?? '');
        if (count.lines) {
          setQtys(prev => {
            const next = { ...prev };
            for (const l of count.lines!) next[l.denomination] = l.quantity;
            return next;
          });
          setTotalDisplays(prev => {
            const next = { ...prev };
            for (const l of count.lines!) {
              next[l.denomination] = l.quantity > 0
                ? (l.quantity * l.denomination / 100).toFixed(2)
                : '';
            }
            return next;
          });
        }
      })
      .finally(() => setLoadingEdit(false));
  }, [editId]);

  const setQty = useCallback((denom: number, raw: string) => {
    const qty = Math.max(0, parseInt(raw) || 0);
    setQtys(prev => ({ ...prev, [denom]: qty }));
    setTotalDisplays(prev => ({
      ...prev,
      [denom]: qty === 0 ? '' : (qty * denom / 100).toFixed(2),
    }));
  }, []);

  // Pendant la frappe : on ne met à jour que l'affichage, pas la quantité.
  // Cela évite que taper "37" dans un champ de 5 CHF snappe à "35.00" après
  // le deuxième caractère (floor(3700/500) = 7 → snap immédiat).
  const setTotal = useCallback((denom: number, raw: string) => {
    setTotalDisplays(prev => ({ ...prev, [denom]: raw }));
  }, []);

  // À la sortie du champ : on calcule la quantité et on snappe au multiple exact.
  const commitTotal = useCallback((denom: number, raw: string) => {
    const cents = Math.round((parseFloat(raw) || 0) * 100);
    const qty   = Math.max(0, Math.floor(cents / denom));
    setQtys(prev => ({ ...prev, [denom]: qty }));
    setTotalDisplays(prev => ({
      ...prev,
      [denom]: qty > 0 ? (qty * denom / 100).toFixed(2) : '',
    }));
  }, []);

  const piecesTotal  = PIECES.reduce((s, d) => s + d * qtys[d], 0);
  const billetsTotal = BILLETS.reduce((s, d) => s + d * qtys[d], 0);
  const grandTotal   = piecesTotal + billetsTotal;
  const hasAny       = DENOMINATIONS.some(d => qtys[d] > 0);

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
      if (editId) {
        await window.api.updateCashCount(editId, payload);
      } else {
        await window.api.createCashCount(payload);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} className={styles.modal}>
      <h2 className={styles.title}>
        {editId ? 'Modifier le comptage' : 'Nouveau comptage de caisse'}
      </h2>
      {loadingEdit && <p className={styles.loadingEdit}>Chargement…</p>}

      <div className={styles.fields}>
        <div className={styles.fieldRow}>
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
        </div>
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
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
          />
        </label>
      </div>

      {/* Deux tables indépendantes côte à côte — le Tab parcourt d'abord
          toutes les pièces, puis tous les billets, dans l'ordre du DOM. */}
      <div className={styles.grid}>
        <div className={styles.gridLayout}>

          <table className={styles.denomTable}>
            <thead>
              <tr><th colSpan={3} className={styles.sectionPieces}>Pièces</th></tr>
              <tr>
                <th className={`${styles.denomLabel} ${styles.colHeader}`}>Coupure</th>
                <th className={styles.colHeader}>Qté</th>
                <th className={styles.colHeader}>Total</th>
              </tr>
            </thead>
            <tbody>
              {PIECES.map(p => {
                const pQ = qtys[p];
                return (
                  <tr key={p}>
                    <td className={styles.denomLabel}>{formatDenom(p)}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={pQ === 0 ? '' : pQ}
                        onChange={e => setQty(p, e.target.value)}
                        className={styles.numInput}
                        data-filled={pQ > 0 || undefined}
                        data-testid={`qty-${p}`}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={totalDisplays[p]}
                        onChange={e => setTotal(p, e.target.value)}
                        onBlur={e => commitTotal(p, e.target.value)}
                        className={styles.numInput}
                        data-filled={pQ > 0 || undefined}
                        data-testid={`total-${p}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <table className={styles.denomTable}>
            <thead>
              <tr><th colSpan={3} className={styles.sectionBillets}>Billets</th></tr>
              <tr>
                <th className={`${styles.denomLabel} ${styles.colHeader}`}>Coupure</th>
                <th className={styles.colHeader}>Qté</th>
                <th className={styles.colHeader}>Total</th>
              </tr>
            </thead>
            <tbody>
              {BILLETS.map(b => {
                const bQ = qtys[b];
                return (
                  <tr key={b}>
                    <td className={styles.denomLabel}>{formatDenom(b)}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={bQ === 0 ? '' : bQ}
                        onChange={e => setQty(b, e.target.value)}
                        className={styles.numInput}
                        data-filled={bQ > 0 || undefined}
                        data-testid={`qty-${b}`}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={totalDisplays[b]}
                        onChange={e => setTotal(b, e.target.value)}
                        onBlur={e => commitTotal(b, e.target.value)}
                        className={styles.numInput}
                        data-filled={bQ > 0 || undefined}
                        data-testid={`total-${b}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        </div>
      </div>

      <div className={styles.totals}>
        <div className={styles.totalPart}>
          <span className={styles.totalPartLabel}>Pièces</span>
          <span className={styles.totalPartValue}>{formatCHF(piecesTotal)}</span>
        </div>
        <span className={styles.totalOp}>+</span>
        <div className={styles.totalPart}>
          <span className={styles.totalPartLabel}>Billets</span>
          <span className={styles.totalPartValue}>{formatCHF(billetsTotal)}</span>
        </div>
        <span className={styles.totalOp}>=</span>
        <div className={styles.totalMain}>
          <span className={styles.totalMainLabel}>Total compté</span>
          <span className={styles.totalMainValue}>{formatCHF(grandTotal)} CHF</span>
        </div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" onClick={onClose} className={styles.btnSecondary}>
          <X size={16} /> Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasAny || saving || loadingEdit}
          className={styles.btnPrimary}
        >
          <Save size={16} /> {saving ? 'Enregistrement…' : (editId ? 'Modifier' : 'Enregistrer')}
        </button>
      </div>
    </Modal>
  );
}
