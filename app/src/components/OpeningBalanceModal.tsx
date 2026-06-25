import { useState } from 'react';
import type { OpeningBalanceSuggestion, OpeningBalanceLine } from '../types';
import { formatCHF } from '../lib/format';
import Modal from './Modal';
import styles from './OpeningBalanceModal.module.css';

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
    <Modal ariaLabelledby="ob-title" onClose={onClose} className={styles.modal}>
      <div>
        <h2 id="ob-title" className={styles.h2}>Soldes à nouveau — Exercice {year}</h2>

        {error && <div role="alert" className={styles.alert}>{error}</div>}

        <table className={styles.table}>
          <tbody>
            <tr><td colSpan={2} className={styles.sectionHeader}>Classe 1 — Actifs</td></tr>
            {actifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td className={styles.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td className={styles.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    className={styles.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            <tr><td colSpan={2} className={styles.sectionHeader}>Classe 2 — Passifs et fonds propres</td></tr>
            {passifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td className={styles.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td className={styles.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    className={styles.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            {capital.map(sg => (
              <tr key={sg.accountId}>
                <td className={styles.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td className={styles.amountCell}>
                  <input
                    type="text"
                    readOnly
                    value={formatCHF(capitalCents)}
                    className={`${styles.input} ${styles.inputReadOnly}`}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.actions}>
          <button onClick={onClose} disabled={saving} className={styles.btnSecondary}>
            Passer cette étape
          </button>
          <button onClick={handleSave} disabled={saving} className={styles.btn}>
            {saving ? 'Enregistrement…' : 'Enregistrer les soldes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function parseCHF(str: string): number {
  const n = parseFloat(str.replace(',', '.'));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

