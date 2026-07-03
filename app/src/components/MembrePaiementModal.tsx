import { useState, useMemo } from 'react';
import Modal from './Modal';
import { formatCHF, COTISATION_CENTS } from '../lib/format';
import type { FiscalYear, MemberWithDues, Account, MemberPaymentPayload } from '../types';
import styles from './MembrePaiementModal.module.css';

interface Props {
  member: MemberWithDues;
  fiscalYears: FiscalYear[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

export default function MembrePaiementModal({ member, fiscalYears, accounts, onClose, onSaved }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [paymentDate, setPaymentDate]   = useState(today);
  const [amountStr,   setAmountStr]     = useState('30.00');
  const [debitAccId,  setDebitAccId]    = useState(accounts[0]?.id ?? 0);
  const [checkedYears, setCheckedYears] = useState<Set<number>>(new Set());
  const [saving,      setSaving]        = useState(false);
  const [error,       setError]         = useState<string | null>(null);

  const amountCents = Math.round(parseFloat(amountStr || '0') * 100);
  const quota       = Math.floor(amountCents / COTISATION_CENTS);
  const surplusCents = amountCents - quota * COTISATION_CENTS;

  // Années proposées : toutes les années non encore payées — exercices connus
  // en DB, année courante et année courante + 1 (la seule "avance" autorisée).
  // L'utilisateur coche librement, jusqu'à `quota` cases simultanément.
  const paidYears = new Set(member.dues.filter(d => d.paid === 1).map(d => d.year));
  const fyYears   = fiscalYears.map(y => y.year);
  const currentYear = new Date().getFullYear();

  const candidateYears = useMemo(() => {
    const allYears = new Set<number>([...fyYears, currentYear, currentYear + 1]);
    const rank = (y: number) => (y === currentYear ? 0 : y > currentYear ? 1 : 2);
    return [...allYears]
      .filter(y => !paidYears.has(y))
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return ra === 1 ? a - b : b - a; // futures croissantes, passées décroissantes
      });
  }, [fyYears, paidYears, currentYear]);

  const toggleYear = (year: number) => {
    setCheckedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const isValid = checkedYears.size === quota && quota > 0 && debitAccId > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      const payload: MemberPaymentPayload = {
        member_id: member.id,
        payment_date: paymentDate,
        total_amount_cents: amountCents,
        debit_account_id: debitAccId,
        years: [...checkedYears].sort(),
      };
      await window.api.recordPayment(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const debitAcc = accounts.find(a => a.id === debitAccId);

  return (
    <Modal className={styles.modal} onClose={onClose}>
      <h2 className={styles.title}>Enregistrer un paiement</h2>
      <p className={styles.member}>{member.first_name} {member.last_name}</p>

      <div className={styles.form}>
        <label className={styles.label}>
          Date du paiement
          <input type="date" className={styles.input} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
        </label>

        <label className={styles.label}>
          Montant CHF
          <input
            type="number" step="0.05" min="0"
            className={styles.input}
            value={amountStr}
            onChange={e => { setAmountStr(e.target.value); setCheckedYears(new Set()); }}
          />
        </label>

        <label className={styles.label}>
          Mode de paiement
          <select
            className={styles.input}
            value={debitAccId}
            onChange={e => setDebitAccId(Number(e.target.value))}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.number} — {a.name}</option>
            ))}
          </select>
        </label>

        <div className={styles.yearsSection}>
          <div className={styles.yearsLabel}>
            Années couvertes
            <span className={styles.quota}>({checkedYears.size}/{quota} sélectionnée{quota > 1 ? 's' : ''})</span>
          </div>
          {quota === 0 ? (
            <p className={styles.hint}>Entrez un montant d&apos;au moins CHF 30.00</p>
          ) : (
            <div className={styles.yearsList}>
              {candidateYears.map(year => {
                const disabled = !checkedYears.has(year) && checkedYears.size >= quota;
                return (
                  <label key={year} className={styles.yearLabel}>
                    <input
                      type="checkbox"
                      checked={checkedYears.has(year)}
                      disabled={disabled}
                      onChange={() => toggleYear(year)}
                    />
                    {year}
                    {year > currentYear && <span className={styles.advance}> (avance)</span>}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {surplusCents > 0 && (
          <div className={styles.surplus}>
            Surplus → Dons (391) : <strong>{formatCHF(surplusCents)}</strong>
          </div>
        )}

        {isValid && (
          <div className={styles.preview}>
            <div className={styles.previewTitle}>Aperçu de l&apos;écriture</div>
            <div className={styles.previewLine}>
              <span>Débit {debitAcc?.number} {debitAcc?.name}</span>
              <span>{formatCHF(amountCents)}</span>
            </div>
            <div className={styles.previewLine}>
              <span>Crédit 300 Cotisations membres</span>
              <span>{formatCHF(quota * COTISATION_CENTS)}</span>
            </div>
            {surplusCents > 0 && (
              <div className={styles.previewLine}>
                <span>Crédit 391 Dons</span>
                <span>{formatCHF(surplusCents)}</span>
              </div>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>Annuler</button>
        <button className={styles.btnSave} onClick={handleSubmit} disabled={!isValid || saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}
