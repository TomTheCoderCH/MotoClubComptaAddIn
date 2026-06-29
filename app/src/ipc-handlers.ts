import { ipcMain, dialog, BrowserWindow } from 'electron';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { exportFiscalYearToExcel } from './excel/export';
import {
  getAllAccounts,
  getActiveAccounts,
  getAllFiscalYears,
  createFiscalYear,
  getJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getAccountBalances,
  getAccountBalancesExcludingClosing,
  getOpeningBalanceSuggestions,
  createOpeningBalanceEntry,
  getClosingPreview,
  closeFiscalYear,
  reopenFiscalYear,
  openDatabase,
  getDb,
  getDbDir,
  updateAccount,
  createAccount,
  deleteAccount,
  getAnalyticsData,
  getDashboardData,
  getTwintSummary,
  getAccountLedger,
} from './db';
import { listBackups, formatBackupFilename, performBackup } from './backup';
import type { CreateJournalEntryPayload, UpdateJournalEntryPayload, OpeningBalanceLine, UpdateAccountPayload, CreateAccountPayload, DashboardCardConfig } from './types';
import { readSettings, writeSettings } from './settings';
import { migrateDataDir } from './migrate';

export function registerIpcHandlers(): void {
  // ─── Schéma ──────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getSchemaVersion', () =>
    getDb().pragma('user_version', { simple: true }) as number
  );

  // ─── Comptes ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getAccounts',        () => getAllAccounts());
  ipcMain.handle('db:getActiveAccounts',  () => getActiveAccounts());
  ipcMain.handle('accounts:update', (_e, payload: UpdateAccountPayload) => updateAccount(payload));
  ipcMain.handle('accounts:create', (_e, payload: CreateAccountPayload) => createAccount(payload));
  ipcMain.handle('accounts:delete', (_e, id: number) => deleteAccount(id));
  ipcMain.handle('account:getLedger', (_e, fiscalYearId: number, accountId: number) =>
    getAccountLedger(fiscalYearId, accountId)
  );

  // ─── Tableau de bord ─────────────────────────────────────────────────────────
  ipcMain.handle('dashboard:get', (_e, fiscalYearId: number, cards: DashboardCardConfig[] = []) =>
    getDashboardData(fiscalYearId, cards));

  ipcMain.handle('dashboard:getTwintSummary', (_e, fiscalYearId: number) =>
    getTwintSummary(fiscalYearId));

  ipcMain.handle('settings:saveDashboardCards', (_e, cards: DashboardCardConfig[]) => {
    const current = readSettings();
    if (!current) return;
    writeSettings({ ...current, dashboardCards: cards });
  });

  // ─── Analytique ──────────────────────────────────────────────────────────────
  ipcMain.handle('analytics:get', (_e, fiscalYearId: number) => getAnalyticsData(fiscalYearId));

  // ─── Exercices ───────────────────────────────────────────────────────────────
  ipcMain.handle('db:getFiscalYears',    () => getAllFiscalYears());
  ipcMain.handle('db:createFiscalYear',  (_e, year: number) => createFiscalYear(year));

  // ─── Journal ─────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getJournalEntries',  (_e, fiscalYearId: number) => getJournalEntries(fiscalYearId));
  ipcMain.handle('db:createJournalEntry', (_e, payload: CreateJournalEntryPayload) => createJournalEntry(payload));
  ipcMain.handle('db:updateJournalEntry', (_e, payload: UpdateJournalEntryPayload) => updateJournalEntry(payload));
  ipcMain.handle('db:deleteJournalEntry', (_e, id: number) => deleteJournalEntry(id));

  // ─── Soldes ──────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getAccountBalances', (_e, fiscalYearId: number) => getAccountBalances(fiscalYearId));
  ipcMain.handle('db:getAccountBalancesExcludingClosing', (_e, fiscalYearId: number) => getAccountBalancesExcludingClosing(fiscalYearId));

  // ─── Sauvegarde ──────────────────────────────────────────────────────────────
  ipcMain.handle('backup:list', () => {
    const backupDir = path.join(getDbDir(), 'backups');
    return listBackups(backupDir);
  });

  ipcMain.handle('backup:export', async () => {
    const defaultName = formatBackupFilename();
    const result = await dialog.showSaveDialog({
      title: 'Exporter une sauvegarde',
      defaultPath: defaultName,
      filters: [{ name: 'Base de données SQLite', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await getDb().backup(result.filePath);
    return { path: result.filePath };
  });

  ipcMain.handle('backup:getDbPath', () => {
    return path.join(getDbDir(), 'mcy-compta.db');
  });

  ipcMain.handle('backup:restore', async (_e, filename?: string) => {
    let srcPath: string;

    if (filename) {
      srcPath = path.join(getDbDir(), 'backups', filename);
    } else {
      const picked = await dialog.showOpenDialog({
        title: 'Restaurer une sauvegarde',
        filters: [{ name: 'Base de données SQLite', extensions: ['db'] }],
        properties: ['openFile'],
      });
      if (picked.canceled || !picked.filePaths[0]) return null;
      srcPath = picked.filePaths[0];
    }

    const confirmed = await dialog.showMessageBox({
      type: 'warning',
      title: 'Restaurer une sauvegarde',
      message: 'Remplacer la base de données actuelle et redémarrer ?',
      detail:
        `Fichier sélectionné : ${srcPath}\n\n` +
        "Une sauvegarde de sécurité sera créée avant la restauration.",
      buttons: ['Restaurer et redémarrer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
    });
    if (confirmed.response !== 0) return null;

    const backupDir = path.join(getDbDir(), 'backups');
    await performBackup(getDb(), backupDir);

    const destPath = path.join(getDbDir(), 'mcy-compta.db');

    // Fermer la connexion avant d'écraser le fichier (sinon EPERM sur Windows)
    getDb().close();

    copyFileSync(srcPath, destPath);

    // Réouvrir la DB depuis le fichier restauré, puis recharger le renderer —
    // pas de redémarrage du process, fonctionne en dev et en production.
    openDatabase(getDbDir());
    BrowserWindow.getAllWindows()[0]?.webContents.reload();
  });

  // ─── Paramètres ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => readSettings());

  ipcMain.handle('settings:choose', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir le dossier de données',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const dataDir = result.filePaths[0];
    writeSettings({ dataDir });
    openDatabase(dataDir);
    return true;
  });

  ipcMain.handle('settings:changeDataDir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir le nouveau dossier de données',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const newDir = result.filePaths[0];
    await migrateDataDir(getDbDir(), newDir);
    writeSettings({ dataDir: newDir });
    openDatabase(newDir);
    return true;
  });

  // ─── Soldes à nouveau ────────────────────────────────────────────────────────
  ipcMain.handle('openingBalance:getSuggested', (_e, fiscalYearId: number) =>
    getOpeningBalanceSuggestions(fiscalYearId));

  ipcMain.handle('openingBalance:create', (_e, fiscalYearId: number, lines: OpeningBalanceLine[]) =>
    createOpeningBalanceEntry(fiscalYearId, lines));

  // ─── Clôture ─────────────────────────────────────────────────────────────────
  ipcMain.handle('closing:getPreview', (_e, fiscalYearId: number) =>
    getClosingPreview(fiscalYearId));

  ipcMain.handle('closing:close', (_e, fiscalYearId: number) =>
    closeFiscalYear(fiscalYearId));

  ipcMain.handle('closing:reopen', (_e, fiscalYearId: number) =>
    reopenFiscalYear(fiscalYearId));

  // ─── Export Excel ────────────────────────────────────────────────────────────
  ipcMain.handle('excel:export', async (_e, fiscalYearId: number) => {
    const fy = getDb()
      .prepare('SELECT year FROM fiscal_years WHERE id = ?')
      .get(fiscalYearId) as { year: number } | undefined;
    if (!fy) throw new Error(`Exercice ${fiscalYearId} introuvable`);

    const result = await dialog.showSaveDialog({
      title: 'Exporter les comptes en Excel',
      defaultPath: `mcy-compta-${fy.year}.xlsx`,
      filters: [{ name: 'Classeur Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return null;

    try {
      await exportFiscalYearToExcel(getDb(), fiscalYearId, result.filePath);
      return { path: result.filePath };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
}
