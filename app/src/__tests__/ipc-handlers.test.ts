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
  updateAccount:       vi.fn(),
  createAccount:       vi.fn(),
  deleteAccount:       vi.fn(),
  getDashboardData:    vi.fn(),
  getTwintSummary:     vi.fn(),
  getAnalyticsData:    vi.fn(),
  getAccountLedger:    vi.fn(),
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
  updateAccount,
  createAccount,
  deleteAccount,
  getDashboardData,
  getTwintSummary,
  getAnalyticsData,
  getAccountLedger,
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

// ─── accounts:update ────────────────────────────────────────────────────────

describe('accounts:update', () => {
  it('enregistre le canal accounts:update', () => {
    expect(handlers.has('accounts:update')).toBe(true);
  });

  it('délègue à updateAccount et retourne le résultat', async () => {
    const payload = { id: 1, name: 'Caisse principale' };
    const updated = { id: 1, name: 'Caisse principale', number: '100' };
    vi.mocked(updateAccount).mockReturnValue(updated as any);
    const result = await call('accounts:update', payload);
    expect(updateAccount).toHaveBeenCalledWith(payload);
    expect(result).toBe(updated);
  });

  it('propage une erreur de updateAccount', async () => {
    vi.mocked(updateAccount).mockImplementation(() => { throw new Error('Aucun champ'); });
    await expect(call('accounts:update', { id: 1 })).rejects.toThrow('Aucun champ');
  });
});

// ─── accounts:create ────────────────────────────────────────────────────────

describe('accounts:create', () => {
  it('enregistre le canal accounts:create', () => {
    expect(handlers.has('accounts:create')).toBe(true);
  });

  it('délègue à createAccount et retourne le résultat', async () => {
    const payload = { number: '395', name: 'Intérêts', type: 'PRODUIT' };
    const created = { id: 30, number: '395', name: 'Intérêts' };
    vi.mocked(createAccount).mockReturnValue(created as any);
    const result = await call('accounts:create', payload);
    expect(createAccount).toHaveBeenCalledWith(payload);
    expect(result).toBe(created);
  });

  it('propage une erreur de createAccount', async () => {
    vi.mocked(createAccount).mockImplementation(() => { throw new Error('déjà utilisé'); });
    await expect(call('accounts:create', { number: '100', name: 'X', type: 'ACTIF' }))
      .rejects.toThrow('déjà utilisé');
  });
});

// ─── analytics:get ──────────────────────────────────────────────────────────

describe('analytics:get', () => {
  it('enregistre le canal analytics:get', () => {
    expect(handlers.has('analytics:get')).toBe(true);
  });

  it('délègue à getAnalyticsData et retourne le résultat', async () => {
    const data = { groups: [], ungrouped: [] };
    vi.mocked(getAnalyticsData).mockReturnValue(data as any);
    const result = await call('analytics:get', 1);
    expect(getAnalyticsData).toHaveBeenCalledWith(1);
    expect(result).toBe(data);
  });

  it('propage une erreur de getAnalyticsData', async () => {
    vi.mocked(getAnalyticsData).mockImplementation(() => { throw new Error('Exercice introuvable'); });
    await expect(call('analytics:get', 9999)).rejects.toThrow('Exercice introuvable');
  });
});

// ─── dashboard:get ──────────────────────────────────────────────────────────

describe('dashboard:get', () => {
  it('enregistre le canal dashboard:get', () => {
    expect(handlers.has('dashboard:get')).toBe(true);
  });

  it('délègue à getDashboardData avec les cards et retourne le résultat', async () => {
    const cards = [{ type: 'account' as const, accountId: 5 }];
    const data = { cashBalances: [], netResultCents: 0, customCards: [] };
    vi.mocked(getDashboardData).mockReturnValue(data as any);
    const result = await call('dashboard:get', 1, cards);
    expect(getDashboardData).toHaveBeenCalledWith(1, cards);
    expect(result).toBe(data);
  });

  it('passe un tableau vide si aucune card fournie', async () => {
    const data = { cashBalances: [], netResultCents: 0, customCards: [] };
    vi.mocked(getDashboardData).mockReturnValue(data as any);
    await call('dashboard:get', 1);
    expect(getDashboardData).toHaveBeenCalledWith(1, []);
  });

  it('propage une erreur de getDashboardData', async () => {
    vi.mocked(getDashboardData).mockImplementation(() => { throw new Error('Exercice introuvable'); });
    await expect(call('dashboard:get', 9999)).rejects.toThrow('Exercice introuvable');
  });
});


// ─── accounts:delete ────────────────────────────────────────────────────────

describe('accounts:delete', () => {
  it('enregistre le canal accounts:delete', () => {
    expect(handlers.has('accounts:delete')).toBe(true);
  });

  it('délègue à deleteAccount', async () => {
    vi.mocked(deleteAccount).mockReturnValue(undefined);
    await call('accounts:delete', 5);
    expect(deleteAccount).toHaveBeenCalledWith(5);
  });

  it('propage une erreur de deleteAccount', async () => {
    vi.mocked(deleteAccount).mockImplementation(() => { throw new Error('des écritures existent'); });
    await expect(call('accounts:delete', 1)).rejects.toThrow('des écritures existent');
  });
});

// ─── dashboard:getTwintSummary ───────────────────────────────────────────────

describe('dashboard:getTwintSummary', () => {
  it('enregistre le canal dashboard:getTwintSummary', () => {
    expect(handlers.has('dashboard:getTwintSummary')).toBe(true);
  });

  it('délègue à getTwintSummary et retourne le résultat', async () => {
    const summary = { grossCents: 123456, feesCents: 1605, netCents: 121851, ratePercent: 1.30 };
    vi.mocked(getTwintSummary).mockReturnValue(summary);
    const result = await call('dashboard:getTwintSummary', 1);
    expect(getTwintSummary).toHaveBeenCalledWith(1);
    expect(result).toBe(summary);
  });

  it('retourne zéros si aucun mouvement Twint', async () => {
    const summary = { grossCents: 0, feesCents: 0, netCents: 0, ratePercent: 0 };
    vi.mocked(getTwintSummary).mockReturnValue(summary);
    const result = await call('dashboard:getTwintSummary', 1);
    expect(result.grossCents).toBe(0);
    expect(result.ratePercent).toBe(0);
  });
});

// ─── account:getLedger ──────────────────────────────────────────────────────

describe('account:getLedger', () => {
  it('délègue à getAccountLedger avec fiscalYearId et accountId', async () => {
    const mockData = {
      account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
      lines: [],
    };
    vi.mocked(getAccountLedger).mockReturnValue(mockData as any);
    const result = await call('account:getLedger', 1, 42);
    expect(getAccountLedger).toHaveBeenCalledWith(1, 42);
    expect(result).toBe(mockData);
  });

  it('propage une erreur de getAccountLedger', async () => {
    vi.mocked(getAccountLedger).mockImplementation(() => {
      throw new Error('Compte introuvable');
    });
    await expect(call('account:getLedger', 1, 9999)).rejects.toThrow('Compte introuvable');
  });

  it('passe les flags isOpeningBalance et isClosingEntry', async () => {
    const mockData = {
      account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
      lines: [
        {
          entryId: 1, date: '2025-01-01', piece: null, description: 'Solde à nouveau',
          isOpeningBalance: true, isClosingEntry: false,
          debit: 500000, credit: null,
          counterparts: [{ number: '290', name: 'Capital' }],
        },
        {
          entryId: 99, date: '2025-12-31', piece: null, description: 'Clôture',
          isOpeningBalance: false, isClosingEntry: true,
          debit: null, credit: 33700,
          counterparts: [{ number: '900', name: 'Profits et Pertes' }],
        },
      ],
    };
    vi.mocked(getAccountLedger).mockReturnValue(mockData as any);
    const result = await call('account:getLedger', 1, 1);
    expect(result.lines[0].isOpeningBalance).toBe(true);
    expect(result.lines[0].isClosingEntry).toBe(false);
    expect(result.lines[1].isOpeningBalance).toBe(false);
    expect(result.lines[1].isClosingEntry).toBe(true);
  });
});
