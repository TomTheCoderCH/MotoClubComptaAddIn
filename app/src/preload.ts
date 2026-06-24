import { contextBridge, ipcRenderer } from 'electron';
import type { Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance, CreateJournalEntryPayload, UpdateJournalEntryPayload, BackupInfo, OpeningBalanceSuggestion, OpeningBalanceLine, ClosingPreview, UpdateAccountPayload, CreateAccountPayload, AnalyticsData } from './types';

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
  createOpeningBalance: (fiscalYearId: number, lines: OpeningBalanceLine[]) =>
    ipcRenderer.invoke('openingBalance:create', fiscalYearId, lines),

  // Clôture
  getClosingPreview: (fiscalYearId: number) =>
    ipcRenderer.invoke('closing:getPreview', fiscalYearId),
  closeFiscalYear:   (fiscalYearId: number) =>
    ipcRenderer.invoke('closing:close', fiscalYearId),
  reopenFiscalYear:  (fiscalYearId: number) =>
    ipcRenderer.invoke('closing:reopen', fiscalYearId),

  // Sauvegarde
  listBackups:   ()  => ipcRenderer.invoke('backup:list'),
  exportBackup:  ()  => ipcRenderer.invoke('backup:export'),
  getDbPath:     ()  => ipcRenderer.invoke('backup:getDbPath'),

  // Paramètres
  getSettings:    () => ipcRenderer.invoke('settings:get'),
  chooseDataDir:  (): Promise<boolean | null> => ipcRenderer.invoke('settings:choose'),
  changeDataDir:  (): Promise<boolean | null> => ipcRenderer.invoke('settings:changeDataDir'),

  // Export Excel
  exportExcel: (fiscalYearId: number) => ipcRenderer.invoke('excel:export', fiscalYearId),

  // Restauration
  restoreBackup: (filename?: string): Promise<null> => ipcRenderer.invoke('backup:restore', filename),

  // Version du schéma
  getSchemaVersion: (): Promise<number> => ipcRenderer.invoke('db:getSchemaVersion'),

  // Gestion du plan comptable
  updateAccount: (payload: UpdateAccountPayload): Promise<Account> =>
    ipcRenderer.invoke('accounts:update', payload),
  createAccount: (payload: CreateAccountPayload): Promise<Account> =>
    ipcRenderer.invoke('accounts:create', payload),
  deleteAccount: (id: number): Promise<void> =>
    ipcRenderer.invoke('accounts:delete', id),

  // Analytique
  getAnalytics: (fiscalYearId: number): Promise<AnalyticsData> =>
    ipcRenderer.invoke('analytics:get', fiscalYearId),
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
  getClosingPreview: (fiscalYearId: number) => Promise<ClosingPreview>;
  closeFiscalYear:   (fiscalYearId: number) => Promise<void>;
  reopenFiscalYear:  (fiscalYearId: number) => Promise<void>;
  listBackups:   () => Promise<BackupInfo[]>;
  exportBackup:  () => Promise<{ path: string } | null>;
  getDbPath:     () => Promise<string>;
  getSettings:    () => Promise<{ dataDir: string } | null>;
  chooseDataDir:  () => Promise<boolean | null>;
  changeDataDir:  () => Promise<boolean | null>;
  exportExcel: (fiscalYearId: number) => Promise<{ path: string } | { error: string } | null>;
  restoreBackup:    (filename?: string) => Promise<null>;
  getSchemaVersion: () => Promise<number>;
  updateAccount:    (payload: UpdateAccountPayload) => Promise<Account>;
  createAccount:    (payload: CreateAccountPayload) => Promise<Account>;
  deleteAccount:    (id: number) => Promise<void>;
  getAnalytics:     (fiscalYearId: number) => Promise<AnalyticsData>;
};
