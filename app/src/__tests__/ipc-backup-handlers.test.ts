import { vi, describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

const { mockReload, mockGetAllWindows } = vi.hoisted(() => {
  const mockReload = vi.fn();
  const mockGetAllWindows = vi.fn(() => [{ webContents: { reload: mockReload } }]);
  return { mockReload, mockGetAllWindows };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  dialog: {
    showSaveDialog:  vi.fn(),
    showOpenDialog:  vi.fn(),
    showMessageBox:  vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
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
  getDb:          vi.fn(),
  getDbDir:       vi.fn(),
  openDatabase:   vi.fn(),
}));

vi.mock('../backup', () => ({
  listBackups:          vi.fn(),
  formatBackupFilename: vi.fn(),
  performBackup:        vi.fn().mockResolvedValue('/data/backups/mcy-compta-2025-01-01_00-00.db'),
}));

vi.mock('node:fs', () => ({
  default: { copyFileSync: vi.fn() },
  copyFileSync: vi.fn(),
}));

import { dialog } from 'electron';
import { copyFileSync } from 'node:fs';
import { getDb, getDbDir, openDatabase } from '../db';
import { listBackups, formatBackupFilename, performBackup } from '../backup';
import { registerIpcHandlers } from '../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.resetAllMocks();
  mockGetAllWindows.mockReturnValue([{ webContents: { reload: mockReload } }]);
  registerIpcHandlers();
});

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Canal non enregistré : ${channel}`);
  return fn(null, ...args);
}

describe('registration des canaux backup', () => {
  it('enregistre les 3 canaux backup', () => {
    const expected = ['backup:list', 'backup:export', 'backup:getDbPath'];
    for (const channel of expected) {
      expect(handlers.has(channel), `canal manquant : ${channel}`).toBe(true);
    }
  });
});

describe('backup:list', () => {
  it('appelle listBackups avec le bon dossier et retourne le résultat', async () => {
    vi.mocked(getDbDir).mockReturnValue('/data');
    const mockList = [{ filename: 'mcy-compta-2025-03-08_14-30.db', date: '2025-03-08T14:30:00.000Z', sizeBytes: 1000, schemaVersion: 1 }];
    vi.mocked(listBackups).mockReturnValue(mockList);
    const result = await call('backup:list');
    expect(listBackups).toHaveBeenCalledWith(path.join('/data', 'backups'));
    expect(result).toBe(mockList);
  });

  it('propage une erreur de listBackups', async () => {
    vi.mocked(getDbDir).mockReturnValue('/data');
    vi.mocked(listBackups).mockImplementation(() => { throw new Error('FS error'); });
    await expect(call('backup:list')).rejects.toThrow('FS error');
  });
});

describe('backup:export', () => {
  it('retourne null si le dialog est annulé', async () => {
    vi.mocked(formatBackupFilename).mockReturnValue('mcy-compta-2025-03-08_14-30.db');
    vi.mocked(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({ canceled: true, filePath: undefined });
    const result = await call('backup:export');
    expect(result).toBeNull();
  });

  it('appelle db.backup et retourne { path } si dialog accepté', async () => {
    const mockBackup = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDb).mockReturnValue({ backup: mockBackup } as any);
    vi.mocked(formatBackupFilename).mockReturnValue('mcy-compta-2025-03-08_14-30.db');
    vi.mocked(dialog.showSaveDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false,
      filePath: 'D:/usb/mcy-compta-2025-03-08_14-30.db',
    });
    const result = await call('backup:export') as { path: string };
    expect(mockBackup).toHaveBeenCalledWith('D:/usb/mcy-compta-2025-03-08_14-30.db');
    expect(result.path).toBe('D:/usb/mcy-compta-2025-03-08_14-30.db');
  });
});

describe('backup:getDbPath', () => {
  it('retourne le chemin complet de la DB', async () => {
    vi.mocked(getDbDir).mockReturnValue('/data');
    const result = await call('backup:getDbPath');
    expect(result).toBe(path.join('/data', 'mcy-compta.db'));
  });

  it('propage une erreur si getDbDir lance', async () => {
    vi.mocked(getDbDir).mockImplementation(() => { throw new Error('Non initialisé'); });
    await expect(call('backup:getDbPath')).rejects.toThrow('Non initialisé');
  });
});

describe('backup:restore — enregistrement', () => {
  it('enregistre le canal backup:restore', () => {
    expect(handlers.has('backup:restore')).toBe(true);
  });
});

describe('db:getSchemaVersion', () => {
  it('retourne user_version de la base courante', async () => {
    const mockPragma = vi.fn().mockReturnValue(1);
    vi.mocked(getDb).mockReturnValue({ pragma: mockPragma } as any);
    const result = await call('db:getSchemaVersion');
    expect(mockPragma).toHaveBeenCalledWith('user_version', { simple: true });
    expect(result).toBe(1);
  });
});

describe('backup:restore', () => {
  function mockDbWithClose() {
    const mockClose = vi.fn();
    vi.mocked(getDb).mockReturnValue({ close: mockClose } as any);
    return mockClose;
  }

  function setupConfirmedRestore() {
    vi.mocked(getDbDir).mockReturnValue('/data');
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false, filePaths: ['/backups/mcy.db'],
    });
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: 0,
    });
  }

  it('retourne null si le dialog de sélection est annulé', async () => {
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: true, filePaths: [],
    });
    const result = await call('backup:restore');
    expect(result).toBeNull();
  });

  it("retourne null si l'utilisateur annule la confirmation", async () => {
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false, filePaths: ['/backups/mcy.db'],
    });
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: 1,
    });
    const result = await call('backup:restore');
    expect(result).toBeNull();
  });

  it('effectue un backup de sécurité avant la restauration', async () => {
    mockDbWithClose();
    setupConfirmedRestore();
    await call('backup:restore');
    expect(performBackup).toHaveBeenCalledWith({ close: expect.any(Function) }, path.join('/data', 'backups'));
  });

  it('ferme la DB avant de copier le fichier', async () => {
    const mockClose = mockDbWithClose();
    setupConfirmedRestore();
    const callOrder: string[] = [];
    mockClose.mockImplementation(() => callOrder.push('close'));
    vi.mocked(copyFileSync).mockImplementation(() => { callOrder.push('copy'); });
    await call('backup:restore');
    expect(callOrder).toEqual(['close', 'copy']);
  });

  it('copie le fichier sélectionné sur la DB active (via dialog)', async () => {
    mockDbWithClose();
    setupConfirmedRestore();
    await call('backup:restore');
    expect(copyFileSync).toHaveBeenCalledWith(
      '/backups/mcy.db',
      path.join('/data', 'mcy-compta.db'),
    );
  });

  it('réouvre la DB et recharge la fenêtre après la restauration', async () => {
    mockDbWithClose();
    setupConfirmedRestore();
    await call('backup:restore');
    expect(openDatabase).toHaveBeenCalledWith('/data');
    expect(mockReload).toHaveBeenCalled();
  });

  it('saute le dialog si un filename est fourni et copie directement', async () => {
    mockDbWithClose();
    vi.mocked(getDbDir).mockReturnValue('/data');
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({ response: 0 });
    await call('backup:restore', 'mcy-compta-2025-01-01_00-00.db');
    expect(dialog.showOpenDialog).not.toHaveBeenCalled();
    expect(copyFileSync).toHaveBeenCalledWith(
      path.join('/data', 'backups', 'mcy-compta-2025-01-01_00-00.db'),
      path.join('/data', 'mcy-compta.db'),
    );
  });

  it('retourne null si annulation de confirmation même avec filename fourni', async () => {
    vi.mocked(getDbDir).mockReturnValue('/data');
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({ response: 1 });
    const result = await call('backup:restore', 'mcy-compta-2025-01-01_00-00.db');
    expect(result).toBeNull();
    expect(copyFileSync).not.toHaveBeenCalled();
  });
});
