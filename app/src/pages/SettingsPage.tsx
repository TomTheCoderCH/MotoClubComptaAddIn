import { useEffect, useState } from 'react';
import { FolderOpen, Download, RotateCcw, FileSpreadsheet } from 'lucide-react';
import type { BackupInfo, FiscalYear } from '../types';
import { formatSize, formatDateTime as formatDate } from '../lib/format';
import Toast from '../components/Toast';
import styles from './SettingsPage.module.css';

type ChangeStatus = 'idle' | 'loading' | 'success' | 'cancelled';

export default function SettingsPage() {
  const [dbPath,          setDbPath]          = useState<string>('');
  const [schemaVersion,   setSchemaVersion]   = useState<number | null>(null);
  const [backups,         setBackups]         = useState<BackupInfo[]>([]);
  const [error,           setError]           = useState<string | null>(null);
  const [changeStatus,    setChangeStatus]    = useState<ChangeStatus>('idle');
  const [restoring,       setRestoring]       = useState(false);
  const [fiscalYears,     setFiscalYears]     = useState<FiscalYear[]>([]);
  const [selectedFyId,    setSelectedFyId]    = useState<number | null>(null);
  const [backupExporting, setBackupExporting] = useState(false);
  const [excelExporting,  setExcelExporting]  = useState(false);
  const [toast,           setToast]           = useState<{ msg: string; variant: 'success' | 'error' } | null>(null);

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
    setBackupExporting(true);
    try {
      const result = await window.api.exportBackup();
      if (result !== null) {
        setToast({ msg: `Sauvegarde exportée vers : ${result.path}`, variant: 'success' });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), variant: 'error' });
    } finally {
      setBackupExporting(false);
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
    setExcelExporting(true);
    try {
      const result = await window.api.exportExcel(selectedFyId);
      if (result === null) {
        // annulé par l'utilisateur — pas de feedback
      } else if ('error' in result) {
        setToast({ msg: result.error, variant: 'error' });
      } else {
        setToast({ msg: `Fichier exporté : ${result.path}`, variant: 'success' });
      }
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), variant: 'error' });
    } finally {
      setExcelExporting(false);
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
          <FolderOpen size={14} />{changeStatus === 'loading' ? 'Migration en cours…' : 'Changer le dossier de données…'}
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
          disabled={backupExporting}
          className={styles.btn}
        >
          <Download size={14} />{backupExporting ? 'Export en cours…' : 'Exporter une sauvegarde'}
        </button>

        <button
          onClick={() => handleRestore()}
          disabled={restoring}
          className={styles.btnSecondary}
        >
          <RotateCcw size={14} />{restoring ? 'Restauration en cours…' : 'Restaurer depuis une sauvegarde…'}
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
                      <RotateCcw size={12} />Restaurer
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
            disabled={excelExporting || selectedFyId === null}
            className={styles.btn}
          >
            <FileSpreadsheet size={14} />{excelExporting ? 'Export en cours…' : 'Exporter en Excel'}
          </button>
        </div>
      </section>

      {toast && (
        <Toast
          message={toast.msg}
          variant={toast.variant}
          duration={toast.variant === 'error' ? 6000 : 2500}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
