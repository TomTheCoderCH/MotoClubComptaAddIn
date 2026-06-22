import type {
  Account,
  FiscalYear,
  JournalEntry,
  JournalEntryLine,
  AccountBalance,
  CreateJournalEntryPayload,
  UpdateJournalEntryPayload,
  BackupInfo,
  OpeningBalanceSuggestion,
  OpeningBalanceLine,
} from './types';

declare global {
  interface Window {
    api: {
      getAccounts:        () => Promise<Account[]>;
      getActiveAccounts:  () => Promise<Account[]>;
      getFiscalYears:     () => Promise<FiscalYear[]>;
      createFiscalYear:   (year: number) => Promise<FiscalYear>;
      getJournalEntries:  (fiscalYearId: number) => Promise<(JournalEntry & { lines: JournalEntryLine[] })[]>;
      createJournalEntry: (payload: CreateJournalEntryPayload) => Promise<JournalEntry>;
      updateJournalEntry: (payload: UpdateJournalEntryPayload) => Promise<JournalEntry & { lines: JournalEntryLine[] }>;
      deleteJournalEntry: (id: number) => Promise<void>;
      getAccountBalances: (fiscalYearId: number) => Promise<AccountBalance[]>;
      getOpeningBalanceSuggestions: (fiscalYearId: number) => Promise<OpeningBalanceSuggestion[]>;
      createOpeningBalance: (fiscalYearId: number, lines: OpeningBalanceLine[]) => Promise<void>;
      listBackups:        () => Promise<BackupInfo[]>;
      exportBackup:       () => Promise<{ path: string } | null>;
      getDbPath:          () => Promise<string>;
      getSettings:        () => Promise<{ dataDir: string } | null>;
      chooseDataDir:      () => Promise<null>;
      changeDataDir:      () => Promise<null>;
    };
  }
}
