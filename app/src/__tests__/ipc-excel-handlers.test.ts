import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  },
}));

vi.mock('../db', () => ({
  getAllAccounts:       vi.fn(),
  getActiveAccounts:   vi.fn(),
  getAllFiscalYears:    vi.fn(),
  createFiscalYear:    vi.fn(),
  getJournalEntries:   vi.fn(),
  createJournalEntry:  vi.fn(),
  updateJournalEntry:  vi.fn(),
  deleteJournalEntry:  vi.fn(),
  getAccountBalances:  vi.fn(),
  getDb:               vi.fn(),
  getDbDir:            vi.fn(),
  openDatabase:        vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getClosingPreview:   vi.fn(),
  closeFiscalYear:     vi.fn(),
  reopenFiscalYear:    vi.fn(),
}));

vi.mock('../backup', () => ({
  listBackups:          vi.fn(),
  formatBackupFilename: vi.fn(),
}));

vi.mock('../settings', () => ({
  readSettings:  vi.fn(),
  writeSettings: vi.fn(),
}));

vi.mock('../migrate', () => ({
  migrateDataDir: vi.fn(),
}));

vi.mock('../excel/export', () => ({
  exportFiscalYearToExcel: vi.fn(),
}));

import { dialog } from 'electron';
import { getDb } from '../db';
import { exportFiscalYearToExcel } from '../excel/export';
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

describe('excel:export', () => {
  it('enregistre le canal excel:export', () => {
    expect(handlers.has('excel:export')).toBe(true);
  });

  it('retourne null si l\'utilisateur annule le dialog', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: true,
      filePath: undefined,
    } as Electron.SaveDialogReturnValue);
    const fakeDb = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ year: 2025 }) }),
    };
    vi.mocked(getDb).mockReturnValue(fakeDb as any);
    const result = await call('excel:export', 1);
    expect(result).toBeNull();
    expect(exportFiscalYearToExcel).not.toHaveBeenCalled();
  });

  it('retourne { path } si l\'export réussit', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: 'C:/tmp/mcy-compta-2025.xlsx',
    } as Electron.SaveDialogReturnValue);
    const fakeDb = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ year: 2025 }) }),
    };
    vi.mocked(getDb).mockReturnValue(fakeDb as any);
    vi.mocked(exportFiscalYearToExcel).mockResolvedValue(undefined);

    const result = await call('excel:export', 1);
    expect(result).toEqual({ path: 'C:/tmp/mcy-compta-2025.xlsx' });
    expect(exportFiscalYearToExcel).toHaveBeenCalledWith(
      fakeDb,
      1,
      'C:/tmp/mcy-compta-2025.xlsx',
    );
  });

  it('retourne { error } si exportFiscalYearToExcel lève une exception', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: 'C:/tmp/mcy-compta-2025.xlsx',
    } as Electron.SaveDialogReturnValue);
    const fakeDb = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ year: 2025 }) }),
    };
    vi.mocked(getDb).mockReturnValue(fakeDb as any);
    vi.mocked(exportFiscalYearToExcel).mockRejectedValue(new Error('Disk full'));

    const result = await call('excel:export', 1);
    expect(result).toEqual({ error: 'Disk full' });
  });
});
