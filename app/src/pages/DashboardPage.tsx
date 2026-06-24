import { useEffect, useState } from 'react';
import type { FiscalYear, DashboardData } from '../types';
import styles from './DashboardPage.module.css';

function fmt(centimes: number): string {
  if (centimes === 0) return 'CHF 0.00';
  const sign   = centimes < 0 ? '−' : '+';
  const amount = (Math.abs(centimes) / 100).toFixed(2);
  return `${sign} CHF ${amount}`;
}

function fmtBalance(centimes: number): string {
  return `CHF ${(centimes / 100).toFixed(2)}`;
}

const CASH_ACCOUNTS = [
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
    window.api.getDashboardData(selectedYearId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  const selectedYear = years.find(y => y.id === selectedYearId);

  return (
    <div>
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
          {selectedYear?.is_closed && (
            <p className={styles.closedBadge}>Exercice clôturé</p>
          )}

          <div className={styles.cards}>
            {CASH_ACCOUNTS.map(({ number, label }) => {
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
          </div>
        </>
      )}
    </div>
  );
}
