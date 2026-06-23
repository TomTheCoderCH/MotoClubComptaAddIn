import { useEffect, useState } from 'react';
import type { BackupInfo, FiscalYear } from '../types';

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
  const [dbPath,       setDbPath]       = useState<string>('');
  const [backups,      setBackups]      = useState<BackupInfo[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportPath,   setExportPath]   = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [changeStatus, setChangeStatus] = useState<ChangeStatus>('idle');
  const [fiscalYears,  setFiscalYears]  = useState<FiscalYear[]>([]);
  const [selectedFyId, setSelectedFyId] = useState<number | null>(null);
  const [excelStatus,  setExcelStatus]  = useState<'idle' | 'loading' | 'success' | 'error' | 'cancelled'>('idle');
  const [excelPath,    setExcelPath]    = useState<string | null>(null);

  useEffect(() => {
    window.api.getDbPath()
      .then(setDbPath)
      .catch((e: Error) => setError(e.message));
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
      <h1 style={s.h1}>Paramètres</h1>

      {error && <div role="alert" style={s.alertError}>Erreur : {error}</div>}

      <section style={s.section}>
        <h2 style={s.h2}>Base de données</h2>
        <input
          type="text"
          readOnly
          value={dbPath}
          aria-label="Chemin de la base de données"
          style={s.dbPathInput}
        />
        <button
          onClick={handleChangePath}
          disabled={changeStatus === 'loading'}
          style={s.btnSecondary}
        >
          {changeStatus === 'loading' ? 'Migration en cours…' : 'Changer le dossier de données…'}
        </button>
        {changeStatus === 'cancelled' && (
          <p style={s.hint} role="status">Opération annulée.</p>
        )}
        {changeStatus === 'success' && (
          <p style={s.success} role="status">Dossier de données mis à jour.</p>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.h2}>Sauvegardes</h2>

        <button
          onClick={handleExport}
          disabled={exportStatus === 'loading'}
          style={s.btn}
        >
          {exportStatus === 'loading'
            ? 'Export en cours…'
            : 'Exporter une sauvegarde maintenant'}
        </button>

        {exportStatus === 'success' && exportPath && (
          <p style={s.success} role="status">
            Sauvegarde exportée vers : {exportPath}
          </p>
        )}
        {exportStatus === 'cancelled' && (
          <p style={s.hint} role="status">Export annulé.</p>
        )}
        {exportStatus === 'error' && (
          <p style={s.errorText}>Erreur lors de l&apos;export.</p>
        )}

        <h3 style={s.h3}>
          Sauvegardes automatiques
          {backups.length > 0 && ` (${backups.length})`}
        </h3>

        {backups.length === 0 ? (
          <p style={s.empty}>Aucune sauvegarde automatique pour l&apos;instant.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.theadRow}>
                <th style={s.th}>Date</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Taille</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.filename} style={s.dataRow}>
                  <td style={s.td}>{formatDate(b.date)}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatSize(b.sizeBytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={s.section}>
        <h2 style={s.h2}>Export Excel</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label htmlFor="excel-fy-select" style={{ fontWeight: 500, fontSize: '0.875rem', color: '#475569' }}>
            Exercice
          </label>
          <select
            id="excel-fy-select"
            aria-label="Exercice"
            value={selectedFyId ?? ''}
            onChange={e => setSelectedFyId(Number(e.target.value))}
            style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.875rem' }}
          >
            {fiscalYears.map(fy => (
              <option key={fy.id} value={fy.id}>{fy.year}</option>
            ))}
          </select>
          <button
            onClick={handleExcelExport}
            disabled={excelStatus === 'loading' || selectedFyId === null}
            style={s.btn}
          >
            {excelStatus === 'loading' ? 'Export en cours…' : 'Exporter en Excel'}
          </button>
        </div>
        {excelStatus === 'success' && excelPath && (
          <p style={s.success} role="status">
            Fichier exporté : {excelPath}
          </p>
        )}
        {excelStatus === 'cancelled' && (
          <p style={s.hint} role="status">Export annulé.</p>
        )}
      </section>
    </div>
  );
}

const s = {
  h1:          { margin: '0 0 1.5rem', fontSize: '1.5rem', color: '#0f172a' },
  h2:          { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#334155' },
  h3:          { margin: '1.25rem 0 0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#475569' },
  section:     { marginBottom: '2rem', maxWidth: '640px' },
  dbPathInput: { width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', color: '#475569', background: '#f8fafc', boxSizing: 'border-box' as const },
  hint:        { margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#94a3b8' },
  btn:         { padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 },
  btnSecondary: { marginTop: '0.5rem', padding: '0.4rem 0.9rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer' },
  success:     { margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#16a34a' },
  errorText:   { margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#dc2626' },
  alertError:  { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' },
  empty:       { color: '#64748b', fontSize: '0.875rem' },
  table:       { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow:    { background: '#f1f5f9' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  dataRow:     { borderBottom: '1px solid #f1f5f9' },
  td:          { padding: '0.4rem 1rem', color: '#334155' },
} as const;
