import { useEffect, useState } from 'react';
import type { BackupInfo, FiscalYear } from '../types';
import styles from './SettingsPage.module.css';

type ExportStatus = 'idle' | 'loading' | 'success' | 'error' | 'cancelled';
type ChangeStatus = 'idle' | 'loading' | 'success' | 'cancelled';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SettingsPage() {
  const [dbPath,        setDbPath]        = useState<string>('');
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null);
  const [backups,      setBackups]      = useState<BackupInfo[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportPath,   setExportPath]   = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [changeStatus, setChangeStatus] = useState<ChangeStatus>('idle');
  const [restoring,    setRestoring]    = useState(false);
  const [fiscalYears,  setFiscalYears]  = useState<FiscalYear[]>([]);
  const [selectedFyId, setSelectedFyId] = useState<number | null>(null);
  const [excelStatus,  setExcelStatus]  = useState<'idle' | 'loading' | 'success' | 'error' | 'cancelled'>('idle');
  const [excelPath,    setExcelPath]    = useState<string | null>(null);

  useEffect(() => {
    window.api.getDbPath()
      .then(setDbPath)
      .catch((e: Error) => setError(e.message));
    window.api.getSchemaVersion()
      .then(setSchemaVersion)
      .catch(() => { /* non critique */ });
    window.api.listBackups()
      .then(setBackups)
      .catch((e: Error) => setError(e.message));
    window.api.getFiscalYears()
      .then(years => {
        setFiscalYears(years);
        if (years.length > 0) setSelectedFyId(years[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function handleExport() {
    setExportStatus('loading');
    setExportPath(null);
    try {
      const result = await window.api.exportBackup();
      if (result === null) {
        setExportStatus('cancelled');
      } else {
        setExportStatus('success');
        setExportPath(result.path);
      }
    } catch (e) {
      setExportStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleChangePath() {
    setChangeStatus('loading');
    try {
      const result = await window.api.changeDataDir();
      if (result === null) {
        setChangeStatus('cancelled');
      } else {
        setChangeStatus('success');
        const newPath = await window.api.getDbPath();
        setDbPath(newPath);
      }
    } catch (e) {
      setChangeStatus('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRestore(filename?: string) {
    setRestoring(true);
    setError(null);
    try {
      await window.api.restoreBackup(filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  }

  function handleRestoreFrom(filename: string) {
    return handleRestore(filename);
  }

  async function handleExcelExport() {
    if (selectedFyId === null) return;
    setExcelStatus('loading');
    setExcelPath(null);
    try {
      const result = await window.api.exportExcel(selectedFyId);
      if (result === null) {
        setExcelStatus('cancelled');
      } else if ('error' in result) {
        setExcelStatus('error');
        setError(result.error);
      } else {
        setExcelStatus('success');
        setExcelPath(result.path);
      }
    } catch (e) {
      setExcelStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1 className={styles.h1}>Paramètres</h1>

      {error && <div role="alert" className={styles.alertError}>Erreur : {error}</div>}

      <section className={styles.section}>
        <h2 className={styles.h2}>Base de données</h2>
        <input
          type="text"
          readOnly
          value={dbPath}
          aria-label="Chemin de la base de données"
          className={styles.dbPathInput}
        />
        {schemaVersion !== null && (
          <p className={styles.hint}>Version du schéma : v{schemaVersion}</p>
        )}
        <button
          onClick={handleChangePath}
          disabled={changeStatus === 'loading'}
          className={styles.btnSecondary}
        >
          {changeStatus === 'loading' ? 'Migration en cours…' : 'Changer le dossier de données…'}
        </button>
        {changeStatus === 'cancelled' && (
          <p className={styles.hint} role="status">Opération annulée.</p>
        )}
        {changeStatus === 'success' && (
          <p className={styles.success} role="status">Dossier de données mis à jour.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Sauvegardes</h2>

        <button
          onClick={handleExport}
          disabled={exportStatus === 'loading'}
          className={styles.btn}
        >
          {exportStatus === 'loading'
            ? 'Export en cours…'
            : 'Exporter une sauvegarde maintenant'}
        </button>

        {exportStatus === 'success' && exportPath && (
          <p className={styles.success} role="status">
            Sauvegarde exportée vers : {exportPath}
          </p>
        )}
        {exportStatus === 'cancelled' && (
          <p className={styles.hint} role="status">Export annulé.</p>
        )}
        {exportStatus === 'error' && (
          <p className={styles.errorText}>Erreur lors de l&apos;export.</p>
        )}

        <button
          onClick={handleRestore}
          disabled={restoring}
          className={styles.btnSecondary}
        >
          {restoring ? 'Restauration en cours…' : 'Restaurer depuis une sauvegarde…'}
        </button>

        <h3 className={styles.h3}>
          Sauvegardes automatiques
          {backups.length > 0 && ` (${backups.length})`}
        </h3>

        {backups.length === 0 ? (
          <p className={styles.empty}>Aucune sauvegarde automatique pour l&apos;instant.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={styles.th}>Date</th>
                <th className={`${styles.th} ${styles.thRight}`}>Taille</th>
                <th className={`${styles.th} ${styles.thRight}`}>Ver.</th>
                <th className={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.filename} className={styles.dataRow}>
                  <td className={styles.td}>{formatDate(b.date)}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    {formatSize(b.sizeBytes)}
                  </td>
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    {b.schemaVersion >= 0 ? `v${b.schemaVersion}` : '?'}
                  </td>
                  <td className={styles.td}>
                    <button
                      className={styles.btnRestore}
                      disabled={restoring}
                      onClick={() => handleRestoreFrom(b.filename)}
                    >
                      Restaurer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Export Excel</h2>
        <div className={styles.excelBar}>
          <label htmlFor="excel-fy-select" className={styles.excelLabel}>
            Exercice
          </label>
          <select
            id="excel-fy-select"
            aria-label="Exercice"
            value={selectedFyId ?? ''}
            onChange={e => setSelectedFyId(Number(e.target.value))}
            className={styles.excelSelect}
          >
            {fiscalYears.map(fy => (
              <option key={fy.id} value={fy.id}>{fy.year}</option>
            ))}
          </select>
          <button
            onClick={handleExcelExport}
            disabled={excelStatus === 'loading' || selectedFyId === null}
            className={styles.btn}
          >
            {excelStatus === 'loading' ? 'Export en cours…' : 'Exporter en Excel'}
          </button>
        </div>
        {excelStatus === 'success' && excelPath && (
          <p className={styles.success} role="status">
            Fichier exporté : {excelPath}
          </p>
        )}
        {excelStatus === 'cancelled' && (
          <p className={styles.hint} role="status">Export annulé.</p>
        )}
      </section>
    </div>
  );
}
