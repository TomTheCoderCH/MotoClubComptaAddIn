// Types partagés entre main process et renderer (via IPC)

export type AccountType =
  | 'ACTIF'
  | 'PASSIF'
  | 'FONDS_PROPRES'
  | 'PRODUIT'
  | 'CHARGE'
  | 'RESULTAT';

export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface Account {
  id: number;
  number: string;
  name: string;
  class: number;
  type: AccountType;
  normal_balance: NormalBalance;
  description: string | null;
  account_group: string | null;
  must_be_zero_at_closing: boolean;
  is_closing_account: boolean;
  is_active: boolean;
  has_entries: boolean;
  created_at: string;
}

export interface FiscalYear {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_at: string;
  hasOpeningBalance: boolean;
}

export interface JournalEntry {
  id: number;
  fiscal_year_id: number;
  date: string;
  description: string;
  piece: string | null;
  is_opening_balance: boolean;
  is_closing_entry: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalEntryLine {
  id: number;
  journal_entry_id: number;
  account_id: number;
  debit: number | null;   // centimes CHF
  credit: number | null;  // centimes CHF
  created_at: string;
}

export interface AccountBalance {
  id: number;
  number: string;
  name: string;
  class: number;
  total_debit: number;
  total_credit: number;
  solde: number;
}

export interface LedgerLine {
  entryId: number;
  date: string;
  piece: string | null;
  description: string;
  isOpeningBalance: boolean;
  isClosingEntry: boolean;
  debit: number | null;   // centimes CHF, null si ligne au crédit
  credit: number | null;  // centimes CHF, null si ligne au débit
  counterparts: Array<{ number: string; name: string; amount: number }>;
}

export interface AccountLedgerData {
  account: {
    id: number;
    number: string;
    name: string;
    type: AccountType;
    normal_balance: NormalBalance;
    class: number;
  };
  lines: LedgerLine[];
}

// Payloads IPC
export interface CreateJournalEntryPayload {
  fiscal_year_id: number;
  date: string;
  description: string;
  piece?: string;
  lines: Array<{
    account_id: number;
    debit?: number;
    credit?: number;
  }>;
}

export interface JournalFilters {
  text: string;
  accountId: number | null;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_FILTERS: JournalFilters = {
  text: '',
  accountId: null,
  dateFrom: '',
  dateTo: '',
};

export interface UpdateJournalEntryPayload {
  id: number;
  date: string;
  description: string;
  piece?: string;
  lines: Array<{ account_id: number; debit?: number; credit?: number }>;
}

export interface BackupInfo {
  filename: string;
  date: string;        // ISO 8601 extrait du nom de fichier
  sizeBytes: number;
  schemaVersion: number;  // PRAGMA user_version (-1 si fichier illisible)
}

export interface OpeningBalanceSuggestion {
  accountId: number;
  accountNumber: string;
  accountName: string;
  type: AccountType;
  normalBalance: NormalBalance;
  suggestedAmountCents: number;
}

export interface OpeningBalanceLine {
  accountId: number;
  amountCents: number;
}

export interface ClosingAccountLine {
  accountId: number;
  accountNumber: string;
  accountName: string;
  type: 'PRODUIT' | 'CHARGE';
  soldeCents: number;
}

export interface ClosingPreview {
  blockers: string[];
  accounts: ClosingAccountLine[];
  netResultCents: number;
}

export interface UpdateAccountPayload {
  id: number;
  name?: string;
  description?: string;
  account_group?: string | null;
  is_active?: boolean;
  number?: string;      // modifiable uniquement si has_entries = false
  type?: AccountType;   // modifiable uniquement si has_entries = false
}

export interface CreateAccountPayload {
  number: string;
  name: string;
  type: AccountType;
  description?: string;
  account_group?: string | null;
}

export interface DashboardCashBalance {
  number: string;
  name: string;
  solde: number;
}

export type DashboardCardConfig =
  | { type: 'account'; accountId: number }
  | { type: 'group'; groupName: string };

export interface DashboardCustomCard {
  key: string;       // "account-5" | "group-Marché Villageois"
  label: string;
  subLabel: string;
  valueCents: number;
  isResult: boolean; // true → affichage +/− comme le Résultat
}

export interface DashboardData {
  cashBalances: DashboardCashBalance[];
  netResultCents: number;
  customCards: DashboardCustomCard[];
}

export interface TwintSummary {
  grossCents:  number;  // SUM(debit) sur compte 102 = total encaissé via Twint
  feesCents:   number;  // solde compte 402 = commissions versées à Twint
  netCents:    number;  // gross - fees = montant réellement viré sur Raiffeisen
  ratePercent: number;  // fees / gross * 100 (0 si pas de mouvement)
}

export interface AnalyticsAccountRow {
  id: number;
  number: string;
  name: string;
  type: 'PRODUIT' | 'CHARGE';
  recettes: number;
  charges:  number;
}

export interface AnalyticsGroup {
  name:           string;
  accounts:       AnalyticsAccountRow[];
  totalRecettes:  number;
  totalCharges:   number;
  resultat:       number;
}

export interface AnalyticsData {
  groups:    AnalyticsGroup[];
  ungrouped: AnalyticsAccountRow[];
}

// ─── Caisse ────────────────────────────────────────────────────────────────

export type CashContext = 'AVANT' | 'FONDS' | 'APRES' | 'LIBRE';

export interface CashCountLine {
  denomination: number;
  quantity: number;
}

export interface CashCount {
  id: number;
  fiscal_year_id: number;
  session_id: number | null;
  session_label: string | null;
  date: string;
  label: string;
  context: CashContext;
  notes: string | null;
  total: number;
  theoretical_balance: number;
  created_at: string;
  lines?: CashCountLine[];
}

export interface CashSession {
  id: number;
  fiscal_year_id: number;
  label: string;
  account_group: string | null;
  notes: string | null;
  created_at: string;
}

export interface CashCountPayload {
  fiscal_year_id: number;
  session_id?: number;
  date: string;
  label: string;
  context: CashContext;
  notes?: string;
  lines: CashCountLine[];
}

export interface CashSessionPayload {
  fiscal_year_id: number;
  label: string;
  account_group?: string;
  notes?: string;
}
