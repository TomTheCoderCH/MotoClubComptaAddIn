import { useState } from 'react';
import type { ClosingPreview } from '../types';
import { formatCHF } from '../lib/format';
import Modal from './Modal';
import styles from './ClosingModal.module.css';

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

  const netCHF   = formatCHF(Math.abs(preview.netResultCents));
  const isProfit = preview.netResultCents >= 0;

  return (
    <Modal ariaLabelledby="closing-title" onClose={onClose} className={styles.card}>
      <div>
        <h2 id="closing-title" className={styles.title}>Clôture de l&apos;exercice {year}</h2>

        {error && <div role="alert" className={styles.alertError}>{error}</div>}

        <p className={styles.warning}>
          ⚠ Cette opération peut être annulée via &quot;Rouvrir l&apos;exercice&quot;.
        </p>

        {hasBlockers ? (
          <div className={styles.blockerBox}>
            {preview.blockers.map((b, i) => (
              <p key={i} className={styles.blockerLine}>✗ {b}</p>
            ))}
            <p className={styles.blockerHint}>La clôture ne peut pas être effectuée.</p>
          </div>
        ) : (
          <>
            {preview.accounts.length > 0 && (
              <>
                <p className={styles.sectionLabel}>Comptes soldés vers 900 — Profits et Pertes</p>
                <table className={styles.table}>
                  <tbody>
                    {preview.accounts.map(a => (
                      <tr key={a.accountId} className={styles.row}>
                        <td className={styles.tdNum}>{a.accountNumber}</td>
                        <td className={styles.tdName}>{a.accountName}</td>
                        <td className={styles.tdType}>{a.type === 'PRODUIT' ? 'Produit' : 'Charge'}</td>
                        <td className={styles.tdAmount}>{formatCHF(Math.abs(a.soldeCents))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className={styles.result}>
              Résultat net : <strong>{isProfit ? 'Bénéfice' : 'Perte'} CHF {netCHF}</strong>
              {preview.netResultCents !== 0 && ' → 900 Profits et Pertes → 290 Capital'}
            </p>
          </>
        )}

        <div className={styles.actions}>
          <button onClick={onClose} disabled={closing} className={styles.btnCancel}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={hasBlockers || closing}
            className={styles.btnConfirm}
          >
            {closing ? 'Clôture en cours…' : 'Confirmer la clôture'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
