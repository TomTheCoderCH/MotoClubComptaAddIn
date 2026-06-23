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
  getClosingPreview:            vi.fn(),
  closeFiscalYear:              vi.fn(),
  reopenFiscalYear:             vi.fn(),
  getDb:    vi.fn(),
  getDbDir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('../backup',   () => ({ listBackups: vi.fn(), formatBackupFilename: vi.fn() }));
vi.mock('../settings', () => ({ readSettings: vi.fn(), writeSettings: vi.fn() }));
vi.mock('../migrate',  () => ({ migrateDataDir: vi.fn() }));

import { getClosingPreview, closeFiscalYear, reopenFiscalYear } from '../db';
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
  it('enregistre closing:getPreview, closing:close, closing:reopen', () => {
    expect(handlers.has('closing:getPreview')).toBe(true);
    expect(handlers.has('closing:close')).toBe(true);
    expect(handlers.has('closing:reopen')).toBe(true);
  });
});

describe('closing:getPreview', () => {
  it('délègue à getClosingPreview et retourne le résultat', async () => {
    const preview = { blockers: [], accounts: [], netResultCents: 0 };
    vi.mocked(getClosingPreview).mockReturnValue(preview);
    const result = await call('closing:getPreview', 1);
    expect(getClosingPreview).toHaveBeenCalledWith(1);
    expect(result).toBe(preview);
  });

  it('propage les erreurs de getClosingPreview', async () => {
    vi.mocked(getClosingPreview).mockImplementation(() => { throw new Error('Exercice introuvable'); });
    await expect(call('closing:getPreview', 999)).rejects.toThrow('Exercice introuvable');
  });
});

describe('closing:close', () => {
  it('délègue à closeFiscalYear', async () => {
    vi.mocked(closeFiscalYear).mockReturnValue(undefined);
    await call('closing:close', 1);
    expect(closeFiscalYear).toHaveBeenCalledWith(1);
  });

  it('propage les erreurs de closeFiscalYear', async () => {
    vi.mocked(closeFiscalYear).mockImplementation(() => { throw new Error('déjà clôturé'); });
    await expect(call('closing:close', 1)).rejects.toThrow('déjà clôturé');
  });
});

describe('closing:reopen', () => {
  it('délègue à reopenFiscalYear', async () => {
    vi.mocked(reopenFiscalYear).mockReturnValue(undefined);
    await call('closing:reopen', 1);
    expect(reopenFiscalYear).toHaveBeenCalledWith(1);
  });

  it('propage les erreurs de reopenFiscalYear', async () => {
    vi.mocked(reopenFiscalYear).mockImplementation(() => { throw new Error('n\'est pas clôturé'); });
    await expect(call('closing:reopen', 1)).rejects.toThrow('n\'est pas clôturé');
  });
});
