import { ipcMain } from 'electron';
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
} from './db';
import type { CreateJournalEntryPayload, UpdateJournalEntryPayload } from './types';

export function registerIpcHandlers(): void {
  ipcMain.handle('db:getAccounts',        () => getAllAccounts());
  ipcMain.handle('db:getActiveAccounts',  () => getActiveAccounts());

  ipcMain.handle('db:getFiscalYears',    () => getAllFiscalYears());
  ipcMain.handle('db:createFiscalYear',  (_e, year: number) => createFiscalYear(year));

  ipcMain.handle('db:getJournalEntries',  (_e, fiscalYearId: number) => getJournalEntries(fiscalYearId));
  ipcMain.handle('db:createJournalEntry', (_e, payload: CreateJournalEntryPayload) => createJournalEntry(payload));
  ipcMain.handle('db:updateJournalEntry', (_e, payload: UpdateJournalEntryPayload) => updateJournalEntry(payload));
  ipcMain.handle('db:deleteJournalEntry', (_e, id: number) => deleteJournalEntry(id));

  ipcMain.handle('db:getAccountBalances', (_e, fiscalYearId: number) => getAccountBalances(fiscalYearId));
}
