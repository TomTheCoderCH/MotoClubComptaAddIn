import { useEffect, useState } from 'react';
import type { FiscalYear, AccountBalance } from '../types';
import { formatCHF as fmt } from '../lib/format';
import styles from './BilanPage.module.css';

function sign(n: number): string {
  return n >= 0 ? `+${fmt(n)}` : `−${fmt(Math.abs(n))}`;
}

type BilanData = {
  actif:    AccountBalance[];
  passif:   AccountBalance[];
  produits: AccountBalance[];
  charges:  AccountBalance[];
};

function splitBalances(balances: AccountBalance[]): BilanData {
  return {
    actif:    balances.filter(b => b.class === 1),
    passif:   balances.filter(b => b.class === 2),
    produits: balances.filter(b => b.class === 3),
    charges:  balances.filter(b => b.class === 4),
  };
}

export default function BilanPage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [balances,       setBalances]       = useState<AccountBalance[]>([]);
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
    window.api.getAccountBalances(selectedYearId)
      .then(setBalances)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  const selectedYear = years.find(y => y.id === selectedYearId);
  const { actif, passif, produits, charges } = splitBalances(balances);

  const totalActif    = actif.reduce((s, b) => s + b.solde, 0);
  const totalPassif   = passif.reduce((s, b) => s + b.solde, 0);
  const totalProduits = produits.reduce((s, b) => s + b.solde, 0);
  const totalCharges  = charges.reduce((s, b) => s + b.solde, 0);
  const netResult     = totalProduits - totalCharges;
  const totalPassifFP = totalPassif + netResult;
  const isClosed      = selectedYear?.is_closed ?? false;
  const hasData       = balances.length > 0;

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.h1}>Bilan complet</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="year-select" className={styles.label}>Exercice</label>
            <select
              id="year-select"
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

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p className={styles.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : !hasData ? (
        <p className={styles.empty}>Aucun mouvement pour cet exercice.</p>
      ) : (
        <>
          {/* ── BILAN ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Bilan</h2>
            <div className={styles.twoCol}>
              {/* Actif */}
              <div>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.theadRow}>
                      <th colSpan={2} className={styles.thSide}>ACTIF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actif.map(b => (
                      <tr key={b.number} className={styles.dataRow}>
                        <td className={styles.td}><code>{b.number}</code> {b.name}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}
                            data-negative={b.solde < 0 || undefined}>
                          {fmt(b.solde)}
                        </td>
                      </tr>
                    ))}
                    {actif.length === 0 && (
                      <tr><td colSpan={2} className={styles.tdEmpty}>—</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={styles.totalCell}>Total actif</td>
                      <td className={`${styles.totalCell} ${styles.tdRight}`}
                          data-negative={totalActif < 0 || undefined}>
                        {fmt(totalActif)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Passif & FP */}
              <div>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.theadRow}>
                      <th colSpan={2} className={styles.thSide}>PASSIF &amp; FONDS PROPRES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passif.map(b => (
                      <tr key={b.number} className={styles.dataRow}>
                        <td className={styles.td}><code>{b.number}</code> {b.name}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}
                            data-negative={b.solde < 0 || undefined}>
                          {fmt(b.solde)}
                        </td>
                      </tr>
                    ))}
                    {passif.length === 0 && (
                      <tr><td colSpan={2} className={styles.tdEmpty}>—</td></tr>
                    )}
                    {/* Ligne résultat provisoire */}
                    <tr className={styles.resultRow}>
                      <td className={styles.td}>
                        {isClosed ? 'Résultat (clôturé)' : 'Résultat provisoire *'}
                      </td>
                      <td className={`${styles.td} ${styles.tdRight}`}
                          data-negative={netResult < 0 || undefined}>
                        {fmt(netResult)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={styles.totalCell}>Total passif &amp; FP</td>
                      <td className={`${styles.totalCell} ${styles.tdRight}`}
                          data-negative={totalPassifFP < 0 || undefined}>
                        {fmt(totalPassifFP)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Ligne d'équilibre */}
            <div className={styles.balanceCheck}
                 data-ok={Math.abs(totalActif - totalPassifFP) < 2 || undefined}>
              {Math.abs(totalActif - totalPassifFP) < 2
                ? '✓ Bilan équilibré'
                : `⚠ Écart : CHF ${fmt(Math.abs(totalActif - totalPassifFP))}`}
            </div>
            {!isClosed && (
              <p className={styles.note}>* Résultat provisoire — exercice en cours, non clôturé</p>
            )}
          </section>

          {/* ── COMPTE DE RÉSULTAT ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Compte de résultat</h2>
            <div className={styles.twoCol}>
              {/* Produits */}
              <div>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.theadRow}>
                      <th colSpan={2} className={styles.thSide}>PRODUITS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produits.map(b => (
                      <tr key={b.number} className={styles.dataRow}>
                        <td className={styles.td}><code>{b.number}</code> {b.name}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}
                            data-negative={b.solde < 0 || undefined}>
                          {fmt(b.solde)}
                        </td>
                      </tr>
                    ))}
                    {produits.length === 0 && (
                      <tr><td colSpan={2} className={styles.tdEmpty}>—</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={styles.totalCell}>Total produits</td>
                      <td className={`${styles.totalCell} ${styles.tdRight}`}>
                        {fmt(totalProduits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Charges */}
              <div>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.theadRow}>
                      <th colSpan={2} className={styles.thSide}>CHARGES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {charges.map(b => (
                      <tr key={b.number} className={styles.dataRow}>
                        <td className={styles.td}><code>{b.number}</code> {b.name}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}
                            data-negative={b.solde < 0 || undefined}>
                          {fmt(b.solde)}
                        </td>
                      </tr>
                    ))}
                    {charges.length === 0 && (
                      <tr><td colSpan={2} className={styles.tdEmpty}>—</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={styles.totalCell}>Total charges</td>
                      <td className={`${styles.totalCell} ${styles.tdRight}`}>
                        {fmt(totalCharges)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Résultat net */}
            <div className={styles.netResult} data-negative={netResult < 0 || undefined}>
              <span>Résultat net</span>
              <span>{sign(netResult)} CHF — {netResult >= 0 ? 'BÉNÉFICE' : 'PERTE'}</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
