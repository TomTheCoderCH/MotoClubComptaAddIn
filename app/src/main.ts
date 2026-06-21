import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import {
  openDatabase,
  getAllAccounts,
  getActiveAccounts,
  getAllFiscalYears,
  createFiscalYear,
  getJournalEntries,
  createJournalEntry,
  getAccountBalances,
  updateJournalEntry,
  deleteJournalEntry,
} from './db';
import type { CreateJournalEntryPayload, UpdateJournalEntryPayload } from './types';

if (started) app.quit();

function registerIpcHandlers(): void {
  ipcMain.handle('db:getAccounts',      () => getAllAccounts());
  ipcMain.handle('db:getActiveAccounts', () => getActiveAccounts());

  ipcMain.handle('db:getFiscalYears',   () => getAllFiscalYears());
  ipcMain.handle('db:createFiscalYear', (_e, year: number) => createFiscalYear(year));

  ipcMain.handle('db:getJournalEntries',  (_e, fiscalYearId: number) => getJournalEntries(fiscalYearId));
  ipcMain.handle('db:createJournalEntry', (_e, payload: CreateJournalEntryPayload) => createJournalEntry(payload));
  ipcMain.handle('db:updateJournalEntry', (_e, payload: UpdateJournalEntryPayload) => updateJournalEntry(payload));
  ipcMain.handle('db:deleteJournalEntry', (_e, id: number) => deleteJournalEntry(id));

  ipcMain.handle('db:getAccountBalances', (_e, fiscalYearId: number) => getAccountBalances(fiscalYearId));
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MCY Compta',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on('ready', () => {
  openDatabase();
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
