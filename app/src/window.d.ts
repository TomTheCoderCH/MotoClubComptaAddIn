import type {
  Account,
  FiscalYear,
  JournalEntry,
  JournalEntryLine,
  AccountBalance,
  CreateJournalEntryPayload,
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
      getAccountBalances: (fiscalYearId: number) => Promise<AccountBalance[]>;
    };
  }
}
