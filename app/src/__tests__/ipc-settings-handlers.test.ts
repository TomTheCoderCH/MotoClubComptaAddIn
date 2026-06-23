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
  app: {
    relaunch: vi.fn(),
    exit:     vi.fn(),
  },
}));

vi.mock('../db', () => ({
  getAllAccounts:      vi.fn(),
  getActiveAccounts:  vi.fn(),
  getAllFiscalYears:   vi.fn(),
  createFiscalYear:   vi.fn(),
  getJournalEntries:  vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
  getAccountBalances: vi.fn(),
  openDatabase: vi.fn(),
  getDb:    vi.fn(),
  getDbDir: vi.fn(),
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

import { dialog } from 'electron';
import { openDatabase, getDbDir } from '../db';
import { readSettings, writeSettings } from '../settings';
import { migrateDataDir } from '../migrate';
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

describe('registration des canaux settings', () => {
  it('enregistre les 3 canaux settings', () => {
    expect(handlers.has('settings:get')).toBe(true);
    expect(handlers.has('settings:choose')).toBe(true);
    expect(handlers.has('settings:changeDataDir')).toBe(true);
  });
});

describe('settings:get', () => {
  it('retourne le résultat de readSettings()', async () => {
    vi.mocked(readSettings).mockReturnValue({ dataDir: '/data/path' });
    expect(await call('settings:get')).toEqual({ dataDir: '/data/path' });
  });

  it('retourne null si readSettings() retourne null', async () => {
    vi.mocked(readSettings).mockReturnValue(null);
    expect(await call('settings:get')).toBeNull();
  });
});

describe('settings:choose', () => {
  it('retourne null si le dialog est annulé', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await call('settings:choose');
    expect(result).toBeNull();
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('écrit les settings, ouvre la DB et retourne true si le dialog est accepté', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/chosen/folder'] });
    const result = await call('settings:choose');
    expect(writeSettings).toHaveBeenCalledWith({ dataDir: '/chosen/folder' });
    expect(openDatabase).toHaveBeenCalledWith('/chosen/folder');
    expect(result).toBe(true);
  });
});

describe('settings:changeDataDir', () => {
  it('retourne null si le dialog est annulé', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await call('settings:changeDataDir');
    expect(result).toBeNull();
    expect(migrateDataDir).not.toHaveBeenCalled();
  });

  it('migre, écrit les settings, ouvre la DB et retourne true si accepté', async () => {
    vi.mocked(getDbDir).mockReturnValue('/old/folder');
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/new/folder'] });
    vi.mocked(migrateDataDir).mockResolvedValue(undefined);
    const result = await call('settings:changeDataDir');
    expect(migrateDataDir).toHaveBeenCalledWith('/old/folder', '/new/folder');
    expect(writeSettings).toHaveBeenCalledWith({ dataDir: '/new/folder' });
    expect(openDatabase).toHaveBeenCalledWith('/new/folder');
    expect(result).toBe(true);
  });

  it('propage une erreur si la migration échoue', async () => {
    vi.mocked(getDbDir).mockReturnValue('/old/folder');
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/new/folder'] });
    vi.mocked(migrateDataDir).mockRejectedValue(new Error('Disk full'));
    await expect(call('settings:changeDataDir')).rejects.toThrow('Disk full');
    expect(writeSettings).not.toHaveBeenCalled();
  });
});
