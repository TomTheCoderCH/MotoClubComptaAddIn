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
    relaunch:   vi.fn(),
    exit:       vi.fn(),
    getVersion: vi.fn().mockReturnValue('1.1.2'),
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
  updateAccount:      vi.fn(),
  createAccount:      vi.fn(),
  deleteAccount:      vi.fn(),
  getDashboardData:   vi.fn(),
  getAnalyticsData:   vi.fn(),
  openDatabase: vi.fn(),
  getDb:    vi.fn(),
  getDbDir: vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getClosingPreview:  vi.fn(),
  closeFiscalYear:    vi.fn(),
  reopenFiscalYear:   vi.fn(),
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

import { app, dialog } from 'electron';
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
  it('enregistre les 4 canaux settings', () => {
    expect(handlers.has('settings:get')).toBe(true);
    expect(handlers.has('settings:choose')).toBe(true);
    expect(handlers.has('settings:changeDataDir')).toBe(true);
    expect(handlers.has('settings:saveDashboardCards')).toBe(true);
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

describe('settings:saveDashboardCards', () => {
  it('enregistre le canal settings:saveDashboardCards', () => {
    expect(handlers.has('settings:saveDashboardCards')).toBe(true);
  });

  it('appelle writeSettings avec les cards fusionnées aux settings existants', async () => {
    vi.mocked(readSettings).mockReturnValue({ dataDir: '/data' });
    const cards = [{ type: 'group' as const, groupName: 'Marché' }];
    await call('settings:saveDashboardCards', cards);
    expect(writeSettings).toHaveBeenCalledWith({ dataDir: '/data', dashboardCards: cards });
  });

  it('ne fait rien si readSettings() retourne null', async () => {
    vi.mocked(readSettings).mockReturnValue(null);
    await call('settings:saveDashboardCards', []);
    expect(writeSettings).not.toHaveBeenCalled();
  });
});

describe('settings:saveMembersYearRange', () => {
  it('enregistre le canal settings:saveMembersYearRange', () => {
    expect(handlers.has('settings:saveMembersYearRange')).toBe(true);
  });

  it('appelle writeSettings avec la plage fusionnée aux settings existants', async () => {
    vi.mocked(readSettings).mockReturnValue({ dataDir: '/data' });
    const range = { start: 2023, end: 2025 };
    await call('settings:saveMembersYearRange', range);
    expect(writeSettings).toHaveBeenCalledWith({ dataDir: '/data', membersYearRange: range });
  });

  it('ne fait rien si readSettings() retourne null', async () => {
    vi.mocked(readSettings).mockReturnValue(null);
    await call('settings:saveMembersYearRange', { start: 2023, end: 2025 });
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('préserve les autres champs existants (dashboardCards) lors de la fusion', async () => {
    vi.mocked(readSettings).mockReturnValue({ dataDir: '/data', dashboardCards: [{ type: 'group', groupName: 'Marché' }] });
    const range = { start: 2020, end: 2022 };
    await call('settings:saveMembersYearRange', range);
    expect(writeSettings).toHaveBeenCalledWith({
      dataDir: '/data',
      dashboardCards: [{ type: 'group', groupName: 'Marché' }],
      membersYearRange: range,
    });
  });
});

describe('app:getVersion', () => {
  it('enregistre le canal app:getVersion', () => {
    expect(handlers.has('app:getVersion')).toBe(true);
  });

  it('retourne app.getVersion()', async () => {
    vi.mocked(app.getVersion).mockReturnValue('1.2.0');
    const result = await call('app:getVersion');
    expect(result).toBe('1.2.0');
  });
});
