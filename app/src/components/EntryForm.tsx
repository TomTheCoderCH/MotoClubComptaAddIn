import { useState, useRef, useEffect } from 'react';
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import { parseAmount, formatAmount, validateEntryBalance } from '../lib/accounting';
import { formatDate } from '../lib/format';
import Tooltip from './Tooltip';
import styles from './EntryForm.module.css';

interface Line {
  account_id: string;  // string pour le <select>, converti en number à la soumission
  debit:  string;
  credit: string;
}

interface EntryFormProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  editEntry?: JournalEntry & { lines: JournalEntryLine[] };
  hideTitle?: boolean;
  onCreated:  () => void;
  onCancel:   () => void;
  onSavedNew?: () => void;
}

function entryLinesToFormLines(lines: JournalEntryLine[]): Line[] {
  return lines.map(l => ({
    account_id: String(l.account_id),
    debit:  l.debit  != null ? formatAmount(l.debit)  : '',
    credit: l.credit != null ? formatAmount(l.credit) : '',
  }));
}

function helpForType(type: string | undefined): string {
  switch (type) {
    case 'ACTIF':         return 'Actif — Débit ↑ augmente · Crédit ↓ diminue';
    case 'PASSIF':        return 'Passif — Crédit ↑ augmente · Débit ↓ diminue';
    case 'FONDS_PROPRES': return 'Capital — Crédit ↑ augmente · Débit ↓ diminue';
    case 'PRODUIT':       return 'Produit — Crédit ↑ recette · Débit ↓ contre-passation';
    case 'CHARGE':        return 'Charge — Débit ↑ dépense · Crédit ↓ contre-passation';
    default:              return "Sélectionnez un compte pour voir l'aide";
  }
}

const emptyLine = (): Line => ({ account_id: '', debit: '', credit: '' });

export default function EntryForm({ fiscalYear, accounts, editEntry, hideTitle, onCreated, onCancel, onSavedNew }: EntryFormProps) {
  const [date,        setDate]        = useState(editEntry?.date ?? defaultDate(fiscalYear));
  const [description, setDescription] = useState(editEntry?.description ?? '');
  const [piece,       setPiece]       = useState(editEntry?.piece ?? '');
  const [lines,       setLines]       = useState<Line[]>(
    editEntry ? entryLinesToFormLines(editEntry.lines) : [emptyLine(), emptyLine()],
  );
  const [submitting,  setSubmitting]  = useState(false);
  const [apiError,    setApiError]    = useState<string | null>(null);

  const accountRefs      = useRef<(HTMLSelectElement | null)[]>([]);
  const focusLastLineRef = useRef(false);
  const dateRef          = useRef<HTMLInputElement>(null);
  const canSubmitRef     = useRef(false);
  const onSavedNewRef    = useRef<(() => void) | undefined>(undefined);
  const handleSaveRef    = useRef<(andNew: boolean) => void>(() => {});

  useEffect(() => {
    if (focusLastLineRef.current) {
      focusLastLineRef.current = false;
      accountRefs.current[lines.length - 1]?.focus();
    }
  }, [lines.length]);

  const isCreating = !editEntry;
  useEffect(() => {
    if (isCreating) dateRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === 's' && canSubmitRef.current) {
        e.preventDefault();
        handleSaveRef.current(false);
      }
      if (e.key === 'Enter' && onSavedNewRef.current && canSubmitRef.current) {
        e.preventDefault();
        handleSaveRef.current(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = lines.reduce(
    (acc, l) => ({
      debit:  acc.debit  + (parseFloat(l.debit)  || 0),
      credit: acc.credit + (parseFloat(l.credit) || 0),
    }),
    { debit: 0, credit: 0 },
  );

  const balanced       = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.001;
  const dateOutOfRange = date !== '' && (date < fiscalYear.start_date || date > fiscalYear.end_date);
  const canSubmit      = description.trim() !== '' && date !== '' && !dateOutOfRange && balanced && !submitting;

  function updateLine(i: number, field: keyof Line, value: string) {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'debit'  && value !== '') next[i].credit = '';
      if (field === 'credit' && value !== '') next[i].debit  = '';
      return next;
    });
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()]);
  }

  function handleAmountKeyDown(e: React.KeyboardEvent<HTMLInputElement>, isLastLine: boolean) {
    if (e.key === 'Enter' && isLastLine) {
      e.preventDefault();
      focusLastLineRef.current = true;
      setLines(prev => [...prev, emptyLine()]);
    }
  }

  function removeLine(i: number) {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave(andNew: boolean) {
    setApiError(null);

    const payload = lines
      .filter(l => l.account_id !== '')
      .map(l => ({
        account_id: Number(l.account_id),
        debit:  l.debit  !== '' ? parseAmount(l.debit)  : undefined,
        credit: l.credit !== '' ? parseAmount(l.credit) : undefined,
      }));

    try {
      validateEntryBalance(payload);
    } catch (e: unknown) {
      setApiError((e as Error).message);
      return;
    }

    setSubmitting(true);
    try {
      if (editEntry) {
        await window.api.updateJournalEntry({
          id:          editEntry.id,
          date,
          description: description.trim(),
          piece:       piece.trim() || undefined,
          lines:       payload,
        });
      } else {
        await window.api.createJournalEntry({
          fiscal_year_id: fiscalYear.id,
          date,
          description:    description.trim(),
          piece:          piece.trim() || undefined,
          lines:          payload,
        });
      }
      if (andNew) {
        setDate(defaultDate(fiscalYear));
        setDescription('');
        setPiece('');
        setLines([emptyLine(), emptyLine()]);
        setApiError(null);
        setTimeout(() => dateRef.current?.focus(), 0);
        onSavedNew!();
      } else {
        onCreated();
      }
    } catch (e: unknown) {
      setApiError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  handleSaveRef.current = (andNew) => void handleSave(andNew);

  canSubmitRef.current  = canSubmit;
  onSavedNewRef.current = onSavedNew;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void handleSave(false); }} aria-label="Formulaire de saisie d'écriture" noValidate className={styles.card}>
      {!hideTitle && (
        <h2 className={styles.h2}>
          {editEntry ? 'Modifier l\'écriture' : 'Nouvelle écriture'} — exercice {fiscalYear.year}
        </h2>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="entry-date" className={styles.label}>Date *</label>
          <input
            id="entry-date"
            type="date"
            ref={dateRef}
            value={date}
            onChange={e => setDate(e.target.value)}
            min={fiscalYear.start_date}
            max={fiscalYear.end_date}
            required
            className={styles.input}
          />
          {dateOutOfRange && (
            <span className={styles.fieldError}>
              Date hors de l'exercice {fiscalYear.year} ({formatDate(fiscalYear.start_date)} – {formatDate(fiscalYear.end_date)})
            </span>
          )}
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="entry-desc" className={styles.label}>Libellé *</label>
          <input
            id="entry-desc"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ex. : Cotisation membre — Dupont"
            required
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="entry-piece" className={styles.label}>Pièce</label>
          <input
            id="entry-piece"
            type="text"
            value={piece}
            onChange={e => setPiece(e.target.value)}
            placeholder="P-2025-001"
            className={styles.input}
          />
        </div>
      </div>

      <div className={styles.linesContainer}>
        <div className={styles.linesHeader}>
          <span className={styles.colAccount}>Compte</span>
          <span className={styles.colAmount}>Débit CHF</span>
          <span className={styles.colAmount}>Crédit CHF</span>
          <span className={styles.colTooltipSpacer} />
          <span className={styles.colSpacer} />
        </div>

        {lines.map((line, i) => {
          const acc = accounts.find(a => String(a.id) === line.account_id);
          const debitEffect  = acc ? (acc.normal_balance === 'DEBIT'  ? 'increase' : 'decrease') : undefined;
          const creditEffect = acc ? (acc.normal_balance === 'CREDIT' ? 'increase' : 'decrease') : undefined;
          return (
            <div key={i} className={styles.lineRow}>
              <select
                ref={el => { accountRefs.current[i] = el; }}
                value={line.account_id}
                onChange={e => updateLine(i, 'account_id', e.target.value)}
                aria-label={`Compte ligne ${i + 1}`}
                className={`${styles.input} ${styles.colAccount}`}
              >
                <option value="">— choisir un compte —</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.number} — {a.name}
                  </option>
                ))}
              </select>

              <div className={styles.amountWrapper} data-effect={debitEffect}>
                <input
                  type="number"
                  value={line.debit}
                  onChange={e => updateLine(i, 'debit', e.target.value)}
                  onKeyDown={e => handleAmountKeyDown(e, i === lines.length - 1)}
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  aria-label={`Débit ligne ${i + 1}`}
                  className={styles.input}
                />
              </div>

              <div className={styles.amountWrapper} data-effect={creditEffect}>
                <input
                  type="number"
                  value={line.credit}
                  onChange={e => updateLine(i, 'credit', e.target.value)}
                  onKeyDown={e => handleAmountKeyDown(e, i === lines.length - 1)}
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  aria-label={`Crédit ligne ${i + 1}`}
                  className={styles.input}
                />
              </div>

              <Tooltip content={helpForType(acc?.type)} />

              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 2}
                aria-label={`Supprimer ligne ${i + 1}`}
                className={styles.removeBtn}
              >
                ×
              </button>
            </div>
          );
        })}

        <button type="button" onClick={addLine} className={styles.addLineBtn}>
          + Ajouter une ligne
        </button>
      </div>

      <div className={`${styles.balance} ${balanced ? styles.balanceOk : styles.balanceKo}`}>
        <span>Total débit : <strong>{totals.debit.toFixed(2)}</strong></span>
        <span>Total crédit : <strong>{totals.credit.toFixed(2)}</strong></span>
        <span>{balanced ? 'Ecriture équilibrée' : 'Déséquilibre : ' + Math.abs(totals.debit - totals.credit).toFixed(2)}</span>
      </div>

      {apiError && <div role="alert" className={styles.error}>Erreur : {apiError}</div>}

      <div className={styles.actions}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Annuler</button>
        {!editEntry && onSavedNew && (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleSave(true)}
            className={styles.submitBtn}
          >
            {submitting ? 'Enregistrement…' : 'Enregistrer + Nouveau'}
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className={styles.submitBtn}
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer l\'écriture'}
        </button>
      </div>
    </form>
  );
}

function defaultDate(fiscalYear: FiscalYear): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');

  let candidate: string;
  if (yyyy === fiscalYear.year) {
    candidate = `${yyyy}-${mm}-${String(now.getDate()).padStart(2, '0')}`;
  } else {
    // Clamp day to last valid day of the same month in the target year
    // (handles Feb 29 on a leap year → non-leap fiscal year)
    const lastDay = new Date(fiscalYear.year, now.getMonth() + 1, 0).getDate();
    const dd = String(Math.min(now.getDate(), lastDay)).padStart(2, '0');
    candidate = `${fiscalYear.year}-${mm}-${dd}`;
  }

  if (candidate < fiscalYear.start_date) return fiscalYear.start_date;
  if (candidate > fiscalYear.end_date)   return fiscalYear.end_date;
  return candidate;
}

