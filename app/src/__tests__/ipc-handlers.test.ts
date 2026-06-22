import { vi, describe, it, expect, beforeEach } from 'vitest';

// Les mocks doivent précéder tout import qui charge electron ou ./db
const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
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
}));

import {
  getAllAccounts,
  getActiveAccounts,
  getAllFiscalYears,
  createFiscalYear,
  getJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getAccountBalances,
} from '../db';
import { registerIpcHandlers } from '../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.resetAllMocks();
  registerIpcHandlers();
});

// Helper pour invoquer un handler comme Electron le ferait.
// Async : les throws synchrones des mocks deviennent des Promise rejetées,
// ce qui permet d'utiliser .rejects.toThrow() dans tous les cas d'erreur.
async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Canal non enregistré : ${channel}`);
  return fn(null, ...args);
}

// ─── Contrat de registration ────────────────────────────────────────────────

describe('registration des canaux', () => {
  it('enregistre les 9 canaux attendus', () => {
    const expected = [
      'db:getAccounts',
      'db:getActiveAccounts',
      'db:getFiscalYears',
      'db:createFiscalYear',
      'db:getJournalEntries',
      'db:createJournalEntry',
      'db:updateJournalEntry',
      'db:deleteJournalEntry',
      'db:getAccountBalances',
    ];
    for (const channel of expected) {
      expect(handlers.has(channel), `canal manquant : ${channel}`).toBe(true);
    }
  });
});

// ─── db:getAccounts ─────────────────────────────────────────────────────────

describe('db:getAccounts', () => {
  it('délègue à getAllAccounts et retourne le résultat', async () => {
    const mockAccounts = [{ id: 1, number: '100', name: 'Caisse' }];
    vi.mocked(getAllAccounts).mockReturnValue(mockAccounts as any);
    const result = await call('db:getAccounts');
    expect(getAllAccounts).toHaveBeenCalledOnce();
    expect(result).toBe(mockAccounts);
  });

  it('propage une erreur de getAllAccounts', async () => {
    vi.mocked(getAllAccounts).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getAccounts')).rejects.toThrow('DB indisponible');
  });
});

// ─── db:getActiveAccounts ───────────────────────────────────────────────────

describe('db:getActiveAccounts', () => {
  it('délègue à getActiveAccounts et retourne le résultat', async () => {
    const mockAccounts = [{ id: 2, number: '101', name: 'Raiffeisen' }];
    vi.mocked(getActiveAccounts).mockReturnValue(mockAccounts as any);
    const result = await call('db:getActiveAccounts');
    expect(getActiveAccounts).toHaveBeenCalledOnce();
    expect(result).toBe(mockAccounts);
  });

  it('propage une erreur de getActiveAccounts', async () => {
    vi.mocked(getActiveAccounts).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getActiveAccounts')).rejects.toThrow('DB indisponible');
  });
});

// ─── db:getFiscalYears ──────────────────────────────────────────────────────

describe('db:getFiscalYears', () => {
  it('délègue à getAllFiscalYears et retourne le résultat', async () => {
    const mockYears = [{ id: 1, year: 2025 }];
    vi.mocked(getAllFiscalYears).mockReturnValue(mockYears as any);
    const result = await call('db:getFiscalYears');
    expect(getAllFiscalYears).toHaveBeenCalledOnce();
    expect(result).toBe(mockYears);
  });

  it('propage une erreur de getAllFiscalYears', async () => {
    vi.mocked(getAllFiscalYears).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getFiscalYears')).rejects.toThrow('DB indisponible');
  });
});

// ─── db:createFiscalYear ────────────────────────────────────────────────────

describe('db:createFiscalYear', () => {
  it('passe year à createFiscalYear et retourne le résultat', async () => {
    const mockYear = { id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31' };
    vi.mocked(createFiscalYear).mockReturnValue(mockYear as any);
    const result = await call('db:createFiscalYear', 2025);
    expect(createFiscalYear).toHaveBeenCalledWith(2025);
    expect(result).toBe(mockYear);
  });

  it('propage une erreur de createFiscalYear', async () => {
    vi.mocked(createFiscalYear).mockImplementation(() => { throw new Error('Exercice déjà existant'); });
    await expect(call('db:createFiscalYear', 2025)).rejects.toThrow('Exercice déjà existant');
  });
});

// ─── db:getJournalEntries ───────────────────────────────────────────────────

describe('db:getJournalEntries', () => {
  it('passe fiscalYearId à getJournalEntries et retourne le résultat', async () => {
    const mockEntries = [{ id: 1, fiscal_year_id: 42, description: 'Test' }];
    vi.mocked(getJournalEntries).mockReturnValue(mockEntries as any);
    const result = await call('db:getJournalEntries', 42);
    expect(getJournalEntries).toHaveBeenCalledWith(42);
    expect(result).toBe(mockEntries);
  });

  it('propage une erreur de getJournalEntries', async () => {
    vi.mocked(getJournalEntries).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getJournalEntries', 42)).rejects.toThrow('DB indisponible');
  });
});

// ─── db:createJournalEntry ──────────────────────────────────────────────────

describe('db:createJournalEntry', () => {
  const payload = {
    fiscal_year_id: 1,
    date: '2025-03-08',
    description: 'Cotisation',
    lines: [
      { account_id: 1, debit: 3000 },
      { account_id: 2, credit: 3000 },
    ],
  };

  it('passe le payload à createJournalEntry et retourne le résultat', async () => {
    const mockEntry = { id: 1, ...payload };
    vi.mocked(createJournalEntry).mockReturnValue(mockEntry as any);
    const result = await call('db:createJournalEntry', payload);
    expect(createJournalEntry).toHaveBeenCalledWith(payload);
    expect(result).toBe(mockEntry);
  });

  it('propage une erreur d\'écriture déséquilibrée', async () => {
    vi.mocked(createJournalEntry).mockImplementation(() => { throw new Error('Écriture déséquilibrée'); });
    await expect(call('db:createJournalEntry', payload)).rejects.toThrow('Écriture déséquilibrée');
  });
});

// ─── db:updateJournalEntry ──────────────────────────────────────────────────

describe('db:updateJournalEntry', () => {
  const payload = {
    id: 5,
    date: '2025-04-01',
    description: 'Cotisation corrigée',
    lines: [
      { account_id: 1, debit: 3000 },
      { account_id: 2, credit: 3000 },
    ],
  };

  it('passe le payload à updateJournalEntry et retourne le résultat', async () => {
    const mockUpdated = { ...payload, lines: payload.lines };
    vi.mocked(updateJournalEntry).mockReturnValue(mockUpdated as any);
    const result = await call('db:updateJournalEntry', payload);
    expect(updateJournalEntry).toHaveBeenCalledWith(payload);
    expect(result).toBe(mockUpdated);
  });

  it('propage une erreur sur exercice clôturé', async () => {
    vi.mocked(updateJournalEntry).mockImplementation(() => { throw new Error('Cet exercice est clôturé'); });
    await expect(call('db:updateJournalEntry', payload)).rejects.toThrow('clôturé');
  });
});

// ─── db:deleteJournalEntry ──────────────────────────────────────────────────

describe('db:deleteJournalEntry', () => {
  it('passe id à deleteJournalEntry et retourne undefined', async () => {
    vi.mocked(deleteJournalEntry).mockReturnValue(undefined as any);
    const result = await call('db:deleteJournalEntry', 7);
    expect(deleteJournalEntry).toHaveBeenCalledWith(7);
    expect(result).toBeUndefined();
  });

  it('propage une erreur sur écriture introuvable', async () => {
    vi.mocked(deleteJournalEntry).mockImplementation(() => { throw new Error('Écriture introuvable'); });
    await expect(call('db:deleteJournalEntry', 9999)).rejects.toThrow('introuvable');
  });
});

// ─── db:getAccountBalances ──────────────────────────────────────────────────

describe('db:getAccountBalances', () => {
  it('passe fiscalYearId à getAccountBalances et retourne le résultat', async () => {
    const mockBalances = [{ number: '100', name: 'Caisse', solde: 9000 }];
    vi.mocked(getAccountBalances).mockReturnValue(mockBalances as any);
    const result = await call('db:getAccountBalances', 1);
    expect(getAccountBalances).toHaveBeenCalledWith(1);
    expect(result).toBe(mockBalances);
  });

  it('propage une erreur de getAccountBalances', async () => {
    vi.mocked(getAccountBalances).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getAccountBalances', 1)).rejects.toThrow('DB indisponible');
  });
});
