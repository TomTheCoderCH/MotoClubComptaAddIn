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
  ClosingPreview,
  UpdateAccountPayload,
  CreateAccountPayload,
  AnalyticsData,
  DashboardData,
  DashboardCardConfig,
  AccountLedgerData,
  TwintSummary,
  CashCount,
  CashSession,
  CashCountPayload,
  CashSessionPayload,
  Member,
  MemberDues,
  MemberWithDues,
  MemberPayload,
  MemberPaymentPayload,
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
      getAccountBalancesExcludingClosing: (fiscalYearId: number) => Promise<AccountBalance[]>;
      getOpeningBalanceSuggestions: (fiscalYearId: number) => Promise<OpeningBalanceSuggestion[]>;
      createOpeningBalance: (fiscalYearId: number, lines: OpeningBalanceLine[]) => Promise<void>;
      getClosingPreview: (fiscalYearId: number) => Promise<ClosingPreview>;
      closeFiscalYear:   (fiscalYearId: number) => Promise<void>;
      reopenFiscalYear:  (fiscalYearId: number) => Promise<void>;
      listBackups:        () => Promise<BackupInfo[]>;
      exportBackup:       () => Promise<{ path: string } | null>;
      getDbPath:          () => Promise<string>;
      getSettings:        () => Promise<{ dataDir: string; dashboardCards?: DashboardCardConfig[]; membersYearRange?: { start: number; end: number } } | null>;
      chooseDataDir:      () => Promise<boolean | null>;
      changeDataDir:      () => Promise<boolean | null>;
      exportExcel:        (fiscalYearId: number) => Promise<{ path: string } | { error: string } | null>;
      restoreBackup:      (filename?: string) => Promise<null>;
      getSchemaVersion:   () => Promise<number>;
      updateAccount:      (payload: UpdateAccountPayload) => Promise<Account>;
      createAccount:      (payload: CreateAccountPayload) => Promise<Account>;
      deleteAccount:      (id: number) => Promise<void>;
      getDashboardData:    (fiscalYearId: number, cards: DashboardCardConfig[]) => Promise<DashboardData>;
      saveDashboardCards:  (cards: DashboardCardConfig[]) => Promise<void>;
      saveMembersYearRange: (range: { start: number; end: number }) => Promise<void>;
      getAnalytics:        (fiscalYearId: number) => Promise<AnalyticsData>;
      getAccountLedger:    (fiscalYearId: number, accountId: number) => Promise<AccountLedgerData>;
      getTwintSummary:     (fiscalYearId: number) => Promise<TwintSummary>;
      exportPdf:           (fiscalYearId: number) => Promise<{ path: string } | { error: string } | null>;
      // Caisse
      getCashCounts:     (fiscalYearId: number) => Promise<CashCount[]>;
      getCashCountById:  (id: number) => Promise<CashCount>;
      createCashCount:   (payload: CashCountPayload) => Promise<CashCount>;
      updateCashCount:   (id: number, payload: CashCountPayload) => Promise<CashCount>;
      deleteCashCount:   (id: number) => Promise<void>;
      getCashSessions:   (fiscalYearId: number) => Promise<CashSession[]>;
      createCashSession: (payload: CashSessionPayload) => Promise<CashSession>;
      deleteCashSession: (id: number) => Promise<void>;
      // Membres
      getMembers:             () => Promise<MemberWithDues[]>;
      createMember:           (payload: MemberPayload) => Promise<Member>;
      updateMember:           (id: number, payload: MemberPayload) => Promise<Member>;
      deleteMember:           (id: number) => Promise<void>;
      setHistoricalDues:      (memberId: number, year: number, paid: boolean, note: string | null) => Promise<MemberDues>;
      recordPayment:          (payload: MemberPaymentPayload) => Promise<{ dues: MemberDues[]; journalEntryId: number }>;
      importMembersFromExcel: () => Promise<{ imported: number; skipped: number }>;
    };
  }
}
