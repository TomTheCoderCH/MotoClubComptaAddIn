import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: null, ...a: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  app:    { getPath: vi.fn(), isPackaged: false, getAppPath: vi.fn().mockReturnValue('/app') },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../../db', () => ({
  getAllMembers:      vi.fn(),
  createMember:      vi.fn(),
  updateMember:      vi.fn(),
  deleteMember:      vi.fn(),
  setHistoricalDues: vi.fn(),
  recordPayment:     vi.fn(),
  // fonctions existantes requises par registerIpcHandlers
  getAllAccounts:     vi.fn(),
  getActiveAccounts: vi.fn(),
  getAllFiscalYears:  vi.fn(),
  createFiscalYear:  vi.fn(),
  getJournalEntries: vi.fn(),
  createJournalEntry:vi.fn(),
  updateJournalEntry:vi.fn(),
  deleteJournalEntry:vi.fn(),
  getAccountBalances:vi.fn(),
  getAccountBalancesExcludingClosing: vi.fn(),
  updateAccount:     vi.fn(),
  createAccount:     vi.fn(),
  deleteAccount:     vi.fn(),
  getDashboardData:  vi.fn(),
  getTwintSummary:   vi.fn(),
  getAnalyticsData:  vi.fn(),
  getAccountLedger:  vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getClosingPreview: vi.fn(),
  closeFiscalYear:   vi.fn(),
  reopenFiscalYear:  vi.fn(),
  getCashCounts:     vi.fn(),
  getCashCountById:  vi.fn(),
  createCashCount:   vi.fn(),
  updateCashCount:   vi.fn(),
  deleteCashCount:   vi.fn(),
  getCashSessions:   vi.fn(),
  createCashSession: vi.fn(),
  deleteCashSession: vi.fn(),
  getDb: vi.fn(() => ({
    pragma: vi.fn(),
    prepare: vi.fn(() => ({
      pluck: vi.fn(() => ({ get: vi.fn(() => 0) })),
      get: vi.fn(),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
  })),
  getDbDir:     vi.fn(),
  openDatabase: vi.fn(),
  hasDbChanges: vi.fn(),
}));

vi.mock('../../settings', () => ({
  readSettings:  vi.fn(() => ({ dataDir: '/tmp', dashboardCards: [] })),
  writeSettings: vi.fn(),
}));

import {
  getAllMembers, createMember, updateMember, deleteMember,
  setHistoricalDues, recordPayment,
} from '../../db';
import { registerIpcHandlers } from '../../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  registerIpcHandlers();
});

function call(channel: string, ...args: unknown[]) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Handler non enregistré : ${channel}`);
  return fn(null, ...args);
}

describe('members:getAll', () => {
  it('délègue à getAllMembers()', () => {
    (getAllMembers as ReturnType<typeof vi.fn>).mockReturnValue([]);
    call('members:getAll');
    expect(getAllMembers).toHaveBeenCalledOnce();
  });
});

describe('members:create', () => {
  it('délègue à createMember avec le payload', () => {
    const payload = { last_name: 'Merli', first_name: 'Thomas', is_active: 1 };
    call('members:create', payload);
    expect(createMember).toHaveBeenCalledWith(payload);
  });
});

describe('members:update', () => {
  it('délègue à updateMember avec id et payload', () => {
    const payload = { last_name: 'X', first_name: 'Y', is_active: 1 };
    call('members:update', 5, payload);
    expect(updateMember).toHaveBeenCalledWith(5, payload);
  });
});

describe('members:delete', () => {
  it('délègue à deleteMember avec id', () => {
    call('members:delete', 3);
    expect(deleteMember).toHaveBeenCalledWith(3);
  });
});

describe('members:setHistoricalDues', () => {
  it('délègue à setHistoricalDues avec les bons args', () => {
    call('members:setHistoricalDues', 1, 2022, true, 'Raiff');
    expect(setHistoricalDues).toHaveBeenCalledWith(1, 2022, true, 'Raiff');
  });
});

describe('members:recordPayment', () => {
  it('délègue à recordPayment avec le payload', () => {
    const payload = {
      member_id: 1, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: 2, years: [2025],
    };
    call('members:recordPayment', payload);
    expect(recordPayment).toHaveBeenCalledWith(payload);
  });
});
