import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  app:    { relaunch: vi.fn(), exit: vi.fn() },
}));

vi.mock('../db', () => ({
  getAllAccounts:               vi.fn(),
  getActiveAccounts:            vi.fn(),
  getAllFiscalYears:             vi.fn(),
  createFiscalYear:             vi.fn(),
  getJournalEntries:            vi.fn(),
  createJournalEntry:           vi.fn(),
  updateJournalEntry:           vi.fn(),
  deleteJournalEntry:           vi.fn(),
  getAccountBalances:           vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getDb:    vi.fn(),
  getDbDir: vi.fn(),
}));

vi.mock('../backup',   () => ({ listBackups: vi.fn(), formatBackupFilename: vi.fn() }));
vi.mock('../settings', () => ({ readSettings: vi.fn(), writeSettings: vi.fn() }));
vi.mock('../migrate',  () => ({ migrateDataDir: vi.fn() }));

import { getOpeningBalanceSuggestions, createOpeningBalanceEntry } from '../db';
import { registerIpcHandlers } from '../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.resetAllMocks();
  registerIpcHandlers();
});

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Canal non enregistré : ${channel}`);
  return fn(null, ...args);
}

describe('registration', () => {
  it('enregistre openingBalance:getSuggested et openingBalance:create', () => {
    expect(handlers.has('openingBalance:getSuggested')).toBe(true);
    expect(handlers.has('openingBalance:create')).toBe(true);
  });
});

describe('openingBalance:getSuggested', () => {
  it('délègue à getOpeningBalanceSuggestions et retourne le résultat', async () => {
    const mockSugg = [{ accountId: 1, accountNumber: '100', accountName: 'Caisse',
      type: 'ACTIF', normalBalance: 'DEBIT', suggestedAmountCents: 100000 }];
    vi.mocked(getOpeningBalanceSuggestions).mockReturnValue(mockSugg as any);
    const result = await call('openingBalance:getSuggested', 1);
    expect(getOpeningBalanceSuggestions).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockSugg);
  });

  it('propage une erreur si getOpeningBalanceSuggestions throw', async () => {
    vi.mocked(getOpeningBalanceSuggestions).mockImplementation(() => {
      throw new Error('Exercice introuvable');
    });
    await expect(call('openingBalance:getSuggested', 9999)).rejects.toThrow('Exercice introuvable');
  });
});

describe('openingBalance:create', () => {
  it('délègue à createOpeningBalanceEntry', async () => {
    vi.mocked(createOpeningBalanceEntry).mockReturnValue(undefined);
    const lines = [{ accountId: 1, amountCents: 100000 }];
    await call('openingBalance:create', 1, lines);
    expect(createOpeningBalanceEntry).toHaveBeenCalledWith(1, lines);
  });

  it('propage une erreur si createOpeningBalanceEntry throw', async () => {
    vi.mocked(createOpeningBalanceEntry).mockImplementation(() => {
      throw new Error('clôturé');
    });
    await expect(call('openingBalance:create', 1, [])).rejects.toThrow('clôturé');
  });
});
