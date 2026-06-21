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
  must_be_zero_at_closing: boolean;
  is_closing_account: boolean;
  is_active: boolean;
  created_at: string;
}

export interface FiscalYear {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_at: string;
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
  number: string;
  name: string;
  class: number;
  total_debit: number;
  total_credit: number;
  solde: number;
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
