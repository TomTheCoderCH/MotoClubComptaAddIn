import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: null, ...a: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  app:    { getPath: vi.fn(), isPackaged: false },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../../db', () => ({
  // Cash functions
  getCashCounts:     vi.fn(),
  getCashCountById:  vi.fn(),
  createCashCount:   vi.fn(),
  deleteCashCount:   vi.fn(),
  getCashSessions:   vi.fn(),
  createCashSession: vi.fn(),
  deleteCashSession: vi.fn(),
  // Non-cash (required by registerIpcHandlers — mock all to avoid errors)
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
  getDb:             vi.fn(() => ({
    pragma: vi.fn(),
    prepare: vi.fn(() => ({ pluck: vi.fn(() => ({ get: vi.fn(() => 0) })) })),
  })),
  getDbDir:          vi.fn(),
  openDatabase:      vi.fn(),
  hasDbChanges:      vi.fn(),
  getSchemaVersion:  vi.fn(),
}));

vi.mock('../../settings', () => ({
  readSettings:  vi.fn(() => ({ dataDir: '/tmp', dashboardCards: [] })),
  writeSettings: vi.fn(),
}));

import {
  getCashCounts, getCashCountById, createCashCount, deleteCashCount,
  getCashSessions, createCashSession, deleteCashSession,
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

describe('cash:getAll', () => {
  it('délègue à getCashCounts avec fiscalYearId', () => {
    (getCashCounts as ReturnType<typeof vi.fn>).mockReturnValue([]);
    call('cash:getAll', 1);
    expect(getCashCounts).toHaveBeenCalledWith(1);
  });
});

describe('cash:getById', () => {
  it('délègue à getCashCountById avec id', () => {
    (getCashCountById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1 });
    call('cash:getById', 42);
    expect(getCashCountById).toHaveBeenCalledWith(42);
  });
});

describe('cash:create', () => {
  it('délègue à createCashCount avec le payload', () => {
    const payload = { fiscal_year_id: 1, date: '2025-01-01', label: 'Test', context: 'LIBRE', lines: [] };
    (createCashCount as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1, ...payload });
    call('cash:create', payload);
    expect(createCashCount).toHaveBeenCalledWith(payload);
  });
});

describe('cash:delete', () => {
  it('délègue à deleteCashCount avec id', () => {
    call('cash:delete', 7);
    expect(deleteCashCount).toHaveBeenCalledWith(7);
  });
});

describe('cash:getSessions', () => {
  it('délègue à getCashSessions', () => {
    (getCashSessions as ReturnType<typeof vi.fn>).mockReturnValue([]);
    call('cash:getSessions', 2);
    expect(getCashSessions).toHaveBeenCalledWith(2);
  });
});

describe('cash:createSession', () => {
  it('délègue à createCashSession', () => {
    const payload = { fiscal_year_id: 1, label: 'Marché' };
    (createCashSession as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1, ...payload });
    call('cash:createSession', payload);
    expect(createCashSession).toHaveBeenCalledWith(payload);
  });
});

describe('cash:deleteSession', () => {
  it('délègue à deleteCashSession', () => {
    call('cash:deleteSession', 3);
    expect(deleteCashSession).toHaveBeenCalledWith(3);
  });
});
