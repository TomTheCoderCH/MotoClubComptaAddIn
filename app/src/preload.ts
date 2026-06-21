import { contextBridge, ipcRenderer } from 'electron';
import type { Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance, CreateJournalEntryPayload } from './types';

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

  // Soldes
  getAccountBalances: (fiscalYearId: number)         => ipcRenderer.invoke('db:getAccountBalances', fiscalYearId),
});

// Déclaration TypeScript pour window.api dans le renderer
export type ElectronAPI = {
  getAccounts:       () => Promise<Account[]>;
  getActiveAccounts: () => Promise<Account[]>;
  getFiscalYears:    () => Promise<FiscalYear[]>;
  createFiscalYear:  (year: number) => Promise<FiscalYear>;
  getJournalEntries: (fiscalYearId: number) => Promise<(JournalEntry & { lines: JournalEntryLine[] })[]>;
  createJournalEntry: (payload: CreateJournalEntryPayload) => Promise<JournalEntry>;
  getAccountBalances: (fiscalYearId: number) => Promise<AccountBalance[]>;
};
