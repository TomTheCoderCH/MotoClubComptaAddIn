import { ipcMain, dialog, app } from 'electron';
import path from 'node:path';
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
  getOpeningBalanceSuggestions,
  createOpeningBalanceEntry,
  getDb,
  getDbDir,
} from './db';
import { listBackups, formatBackupFilename } from './backup';
import type { CreateJournalEntryPayload, UpdateJournalEntryPayload, OpeningBalanceLine } from './types';
import { readSettings, writeSettings } from './settings';
import { migrateDataDir } from './migrate';

export function registerIpcHandlers(): void {
  // ─── Comptes ────────────────────────────────────────────────────────────────
  ipcMain.handle('db:getAccounts',        () => getAllAccounts());
  ipcMain.handle('db:getActiveAccounts',  () => getActiveAccounts());

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

  // ─── Paramètres ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => readSettings());

  ipcMain.handle('settings:choose', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir le dossier de données',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    writeSettings({ dataDir: result.filePaths[0] });
    app.relaunch();
    app.exit(0);
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
    app.relaunch();
    app.exit(0);
  });

  // ─── Soldes à nouveau ────────────────────────────────────────────────────────
  ipcMain.handle('openingBalance:getSuggested', (_e, fiscalYearId: number) =>
    getOpeningBalanceSuggestions(fiscalYearId));

  ipcMain.handle('openingBalance:create', (_e, fiscalYearId: number, lines: OpeningBalanceLine[]) =>
    createOpeningBalanceEntry(fiscalYearId, lines));
}
