import { useEffect, useState } from 'react';
import type { FiscalYear, AnalyticsData, AnalyticsGroup, AnalyticsAccountRow } from '../types';
import styles from './AnalyticsPage.module.css';

function fmt(centimes: number): string {
  return (centimes / 100).toFixed(2);
}

export default function AnalyticsPage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [data,           setData]           = useState<AnalyticsData | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    window.api.getFiscalYears()
      .then(ys => {
        setYears(ys);
        const open = ys.find(y => !y.is_closed);
        if (open)           setSelectedYearId(open.id);
        else if (ys.length) setSelectedYearId(ys[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedYearId === null) return;
    setLoading(true);
    window.api.getAnalytics(selectedYearId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  const grandTotalRecettes = data?.groups.reduce((s, g) => s + g.totalRecettes, 0) ?? 0;
  const grandTotalCharges  = data?.groups.reduce((s, g) => s + g.totalCharges,  0) ?? 0;
  const grandResultat      = grandTotalRecettes - grandTotalCharges;

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.h1}>Analytique</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="analytics-year" className={styles.label}>Exercice</label>
            <select
              id="analytics-year"
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

      {error   && <div role="alert" className={styles.error}>Erreur : {error}</div>}
      {loading && <p className={styles.empty}>Chargement…</p>}

      {years.length === 0 ? (
        <p className={styles.empty}>
          Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.
        </p>
      ) : data && !loading && (
        <>
          {data.groups.length === 0 && data.ungrouped.length === 0 ? (
            <p className={styles.empty}>
              Aucun mouvement sur les comptes de résultat pour cet exercice.
            </p>
          ) : (
            <>
              {data.groups.length > 0 && (
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.theadRow}>
                      <th className={styles.th}>Groupe Analytique</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Recettes CHF</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Charges CHF</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Résultat CHF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map(g => (
                      <GroupRow key={g.name} group={g} />
                    ))}
                    <tr className={styles.totalRow}>
                      <td className={styles.totalLabel}>Total groupes</td>
                      <td className={styles.totalCell}>{fmt(grandTotalRecettes)}</td>
                      <td className={styles.totalCell}>{fmt(grandTotalCharges)}</td>
                      <td
                        className={styles.totalCell}
                        data-negative={grandResultat < 0 || undefined}
                      >
                        {fmt(grandResultat)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {data.ungrouped.length > 0 && (
                <>
                  <h2 className={styles.sectionTitle}>Non groupés</h2>
                  <table className={styles.table}>
                    <thead>
                      <tr className={styles.theadRow}>
                        <th className={styles.th}>N°</th>
                        <th className={styles.th}>Compte</th>
                        <th className={`${styles.th} ${styles.thRight}`}>Recettes CHF</th>
                        <th className={`${styles.th} ${styles.thRight}`}>Charges CHF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ungrouped.map(r => (
                        <UngroupedRow key={r.id} row={r} />
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function GroupRow({ group }: { group: AnalyticsGroup }) {
  return (
    <tr className={styles.dataRow}>
      <td className={styles.td}>{group.name}</td>
      <td className={`${styles.td} ${styles.tdRight}`}>{fmt(group.totalRecettes)}</td>
      <td className={`${styles.td} ${styles.tdRight}`}>{fmt(group.totalCharges)}</td>
      <td
        className={`${styles.td} ${styles.tdRight}`}
        data-negative={group.resultat < 0 || undefined}
      >
        {fmt(group.resultat)}
      </td>
    </tr>
  );
}

function UngroupedRow({ row }: { row: AnalyticsAccountRow }) {
  return (
    <tr className={styles.dataRow}>
      <td className={`${styles.td} ${styles.tdMono}`}>{row.number}</td>
      <td className={styles.td}>{row.name}</td>
      <td className={`${styles.td} ${styles.tdRight}`}>
        {row.recettes > 0 ? fmt(row.recettes) : '—'}
      </td>
      <td className={`${styles.td} ${styles.tdRight}`}>
        {row.charges > 0 ? fmt(row.charges) : '—'}
      </td>
    </tr>
  );
}
