import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { FiscalYear, DashboardData, DashboardCardConfig, TwintSummary } from '../types';
import { formatCHF } from '../lib/format';
import AddCardModal from '../components/AddCardModal';
import styles from './DashboardPage.module.css';

function fmtBalance(centimes: number): string {
  return `CHF ${formatCHF(centimes)}`;
}

function fmt(centimes: number): string {
  if (centimes === 0) return `CHF ${formatCHF(0)}`;
  const sign   = centimes < 0 ? '−' : '+';
  return `${sign} CHF ${formatCHF(Math.abs(centimes))}`;
}

const FIXED_ACCOUNTS = [
  { number: '100', label: 'Caisse' },
  { number: '101', label: 'Raiffeisen' },
  { number: '102', label: 'Twint' },
];

export default function DashboardPage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [data,           setData]           = useState<DashboardData | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [customCards,    setCustomCards]    = useState<DashboardCardConfig[]>([]);
  const [showAddModal,   setShowAddModal]   = useState(false);
  const [twint,          setTwint]          = useState<TwintSummary | null>(null);

  // Charger les settings au montage pour récupérer les cartes sauvegardées
  useEffect(() => {
    window.api.getSettings()
      .then(s => setCustomCards(s?.dashboardCards ?? []))
      .catch(() => {/* settings optionnels */});
  }, []);

  useEffect(() => {
    window.api.getFiscalYears()
      .then(ys => {
        setYears(ys);
        const open = ys.find(y => !y.is_closed);
        setSelectedYearId(open?.id ?? ys[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedYearId === null) return;
    setLoading(true);
    Promise.all([
      window.api.getDashboardData(selectedYearId, customCards),
      window.api.getTwintSummary(selectedYearId),
    ])
      .then(([dashData, twintData]) => {
        setData(dashData);
        setTwint(twintData);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYearId, customCards]);

  async function addCard(card: DashboardCardConfig) {
    const updated = [...customCards, card];
    setCustomCards(updated);
    setShowAddModal(false);
    await window.api.saveDashboardCards(updated);
  }

  async function removeCard(key: string) {
    const updated = customCards.filter(c => {
      const k = c.type === 'account' ? `account-${c.accountId}` : `group-${c.groupName}`;
      return k !== key;
    });
    setCustomCards(updated);
    await window.api.saveDashboardCards(updated);
  }

  const selectedYear = years.find(y => y.id === selectedYearId);

  return (
    <div>
      {showAddModal && (
        <AddCardModal
          existingCards={customCards}
          onAdd={addCard}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      <div className={styles.header}>
        <h1 className={styles.h1}>Tableau de bord</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="dash-year" className={styles.label}>Exercice</label>
            <select
              id="dash-year"
              value={selectedYearId ?? ''}
              onChange={e => setSelectedYearId(Number(e.target.value))}
              className={styles.select}
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>
                  {y.year}{y.is_closed ? ' (clôturé)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div role="alert" className={styles.error}>{error}</div>}

      {years.length === 0 ? (
        <p className={styles.empty}>
          Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.
        </p>
      ) : loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : data && (
        <>
          {!!selectedYear?.is_closed && (
            <p className={styles.closedBadge}>Exercice clôturé</p>
          )}

          {twint && twint.grossCents > 0 && (
            <div className={styles.twintPanel}>
              <div className={styles.twintTitle}>Twint — Récapitulatif</div>
              <div className={styles.twintRow}>
                <span>Encaissements bruts</span>
                <span className={styles.twintAmount}>CHF {formatCHF(twint.grossCents)}</span>
              </div>
              <div className={styles.twintRow}>
                <span>
                  Frais Twint
                  <span className={styles.twintRate}>({twint.ratePercent.toFixed(2)} %)</span>
                </span>
                <span className={styles.twintAmountFees}>− CHF {formatCHF(twint.feesCents)}</span>
              </div>
              <div className={styles.twintRowNet}>
                <span>Net versé sur Raiffeisen</span>
                <span className={styles.twintAmount}>CHF {formatCHF(twint.netCents)}</span>
              </div>
            </div>
          )}

          <div className={styles.cards}>
            {/* Cartes fixes */}
            {FIXED_ACCOUNTS.map(({ number, label }) => {
              const balance = data.cashBalances.find(b => b.number === number);
              const solde   = balance?.solde ?? 0;
              return (
                <div key={number} className={styles.card}>
                  <div className={styles.cardLabel}>{label}</div>
                  <div className={styles.cardNumber}>{number}</div>
                  <div className={styles.cardAmount}>{fmtBalance(solde)}</div>
                </div>
              );
            })}

            <div
              className={styles.card}
              data-result={data.netResultCents >= 0 ? 'positive' : 'negative'}
            >
              <div className={styles.cardLabel}>Résultat</div>
              <div className={styles.cardNumber}>3xx − 4xx</div>
              <div className={styles.cardAmount}>{fmt(data.netResultCents)}</div>
            </div>

            {/* Cartes personnalisées */}
            {data.customCards.map(card => (
              <div
                key={card.key}
                className={styles.card}
                data-result={card.isResult ? (card.valueCents >= 0 ? 'positive' : 'negative') : undefined}
              >
                <button
                  className={styles.removeBtn}
                  onClick={() => removeCard(card.key)}
                  aria-label={`Supprimer ${card.label}`}
                >×</button>
                <div className={styles.cardLabel}>{card.label}</div>
                <div className={styles.cardNumber}>{card.subLabel}</div>
                <div className={styles.cardAmount}>
                  {card.isResult ? fmt(card.valueCents) : fmtBalance(card.valueCents)}
                </div>
              </div>
            ))}

            {/* Bouton ajouter */}
            <button
              className={styles.addCard}
              onClick={() => setShowAddModal(true)}
              aria-label="Ajouter une carte"
            >
              <Plus size={16} />Ajouter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
