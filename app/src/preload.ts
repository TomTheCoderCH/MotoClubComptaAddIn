import { contextBridge, ipcRenderer } from 'electron';
import type { Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance, CreateJournalEntryPayload, UpdateJournalEntryPayload, BackupInfo, OpeningBalanceSuggestion, OpeningBalanceLine } from './types';

// API exposée au renderer via window.api
contextBridge.exposeInMainWorld('api', {
  // Comptes
  getAccounts:      ()                               => ipcRenderer.invoke('db:getAccounts'),
  getActiveAccounts: ()                              => ipcRenderer.invoke('db:getActiveAccounts'),

  // Exercices
  getFiscalYears:   ()                               => ipcRenderer.invoke('db:getFiscalYears'),
  createFiscalYear: (year: number)                   => ipcRenderer.invoke('db:createFiscalYear', year),

  // Journal
  getJournalEntries: (fiscalYearId: number)          => ipcRenderer.invoke('db:getJournalEntries', fiscalYearId),
  createJournalEntry: (payload: CreateJournalEntryPayload) => ipcRenderer.invoke('db:createJournalEntry', payload),
  updateJournalEntry: (payload: UpdateJournalEntryPayload) => ipcRenderer.invoke('db:updateJournalEntry', payload),
  deleteJournalEntry: (id: number)                   => ipcRenderer.invoke('db:deleteJournalEntry', id),

  // Soldes
  getAccountBalances: (fiscalYearId: number)         => ipcRenderer.invoke('db:getAccountBalances', fiscalYearId),

  // Soldes à nouveau
  getOpeningBalanceSuggestions: (fiscalYearId: number) =>
    ipcRenderer.invoke('openingBalance:getSuggested', fiscalYearId),
  createOpeningBalance: (fiscalYearId: number, lines: import('./types').OpeningBalanceLine[]) =>
    ipcRenderer.invoke('openingBalance:create', fiscalYearId, lines),

  // Sauvegarde
  listBackups:   ()  => ipcRenderer.invoke('backup:list'),
  exportBackup:  ()  => ipcRenderer.invoke('backup:export'),
  getDbPath:     ()  => ipcRenderer.invoke('backup:getDbPath'),

  // Paramètres
  getSettings:    () => ipcRenderer.invoke('settings:get'),
  chooseDataDir:  () => ipcRenderer.invoke('settings:choose'),
  changeDataDir:  () => ipcRenderer.invoke('settings:changeDataDir'),
});

// Déclaration TypeScript pour window.api dans le renderer
export type ElectronAPI = {
  getAccounts:       () => Promise<Account[]>;
  getActiveAccounts: () => Promise<Account[]>;
  getFiscalYears:    () => Promise<FiscalYear[]>;
  createFiscalYear:  (year: number) => Promise<FiscalYear>;
  getJournalEntries: (fiscalYearId: number) => Promise<(JournalEntry & { lines: JournalEntryLine[] })[]>;
  createJournalEntry: (payload: CreateJournalEntryPayload) => Promise<JournalEntry>;
  updateJournalEntry: (payload: UpdateJournalEntryPayload) => Promise<JournalEntry & { lines: JournalEntryLine[] }>;
  deleteJournalEntry: (id: number) => Promise<void>;
  getAccountBalances: (fiscalYearId: number) => Promise<AccountBalance[]>;
  getOpeningBalanceSuggestions: (fiscalYearId: number) => Promise<OpeningBalanceSuggestion[]>;
  createOpeningBalance: (fiscalYearId: number, lines: OpeningBalanceLine[]) => Promise<void>;
  listBackups:   () => Promise<BackupInfo[]>;
  exportBackup:  () => Promise<{ path: string } | null>;
  getDbPath:     () => Promise<string>;
  getSettings:    () => Promise<{ dataDir: string } | null>;
  chooseDataDir:  () => Promise<null>;
  changeDataDir:  () => Promise<null>;
};
