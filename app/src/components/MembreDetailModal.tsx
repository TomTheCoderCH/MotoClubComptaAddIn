import { useState } from 'react';
import Modal from './Modal';
import MembrePaiementModal from './MembrePaiementModal';
import type { FiscalYear, MemberWithDues, MemberDues, Account } from '../types';
import styles from './MembreDetailModal.module.css';

interface Props {
  member: MemberWithDues;
  fiscalYears: FiscalYear[];
  onClose: () => void;
  onUpdated: () => void;
}

export default function MembreDetailModal({ member, fiscalYears, onClose, onUpdated }: Props) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Calcul des années à afficher : union dues + fiscalYears, triées décroissant
  const fyYears = new Set(fiscalYears.map(y => y.year));
  const dueYears = new Set(member.dues.map(d => d.year));
  const allYears = [...new Set([...fyYears, ...dueYears])].sort((a, b) => b - a);

  const getDues = (year: number): MemberDues | undefined =>
    member.dues.find(d => d.year === year);

  const isHistorical = (year: number) => !fyYears.has(year);

  const handleCheckbox = async (year: number, checked: boolean) => {
    const existing = getDues(year);
    const note = existing?.payment_note ?? null;
    await window.api.setHistoricalDues(member.id, year, checked, note);
    onUpdated();
  };

  const handleNoteBlur = async (year: number, note: string) => {
    const existing = getDues(year);
    const paid = existing?.paid === 1;
    await window.api.setHistoricalDues(member.id, year, paid, note || null);
  };

  const openPayment = async () => {
    const accs = await window.api.getActiveAccounts();
    setAccounts(accs);
    setShowPaymentModal(true);
  };

  const hasOpenFy = fiscalYears.some(y => !y.is_closed);

  return (
    <Modal className={styles.modal} onClose={onClose}>
      <div className={styles.header}>
        <h2 className={styles.title}>{member.first_name} {member.last_name}</h2>
        <div className={styles.meta}>
          {member.entry_date && <span>Entré le {member.entry_date}</span>}
          <span className={member.is_active === 1 ? styles.actif : styles.inactif}>
            {member.is_active === 1 ? 'Actif' : 'Inactif'}
          </span>
          {member.inactive_note && <span className={styles.note}>{member.inactive_note}</span>}
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Année</th>
            <th>Statut</th>
            <th>Note / Mode</th>
            <th>Montant</th>
          </tr>
        </thead>
        <tbody>
          {allYears.map(year => {
            const dues = getDues(year);
            const historical = isHistorical(year);
            return (
              <tr key={year} className={styles.row}>
                <td className={styles.yearCell}>{year}</td>
                {historical ? (
                  <>
                    <td>
                      <input
                        type="checkbox"
                        checked={dues?.paid === 1}
                        onChange={e => handleCheckbox(year, e.target.checked)}
                      />
                    </td>
                    <td>
                      <input
                        className={styles.noteInput}
                        defaultValue={dues?.payment_note ?? ''}
                        onBlur={e => handleNoteBlur(year, e.target.value)}
                        placeholder="Mode paiement…"
                      />
                    </td>
                    <td className={styles.num}>—</td>
                  </>
                ) : (
                  <>
                    <td>
                      {dues?.paid === 1
                        ? <span className={styles.paid}>✓ Payé</span>
                        : <span className={styles.unpaid}>✗ Non payé</span>
                      }
                    </td>
                    <td className={styles.muted}>
                      {dues?.payment_date ?? '—'}
                    </td>
                    <td className={styles.num}>
                      {dues?.amount_cents != null
                        ? `CHF ${(dues.amount_cents / 100).toFixed(2)}`
                        : '—'
                      }
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={onClose}>Fermer</button>
        <button
          className={styles.btnPrimary}
          onClick={openPayment}
          disabled={!hasOpenFy}
        >
          Enregistrer un paiement
        </button>
      </div>

      {showPaymentModal && (
        <MembrePaiementModal
          member={member}
          fiscalYears={fiscalYears}
          accounts={accounts.filter(a => ['100', '101', '102', '103'].includes(a.number))}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); onUpdated(); }}
        />
      )}
    </Modal>
  );
}
