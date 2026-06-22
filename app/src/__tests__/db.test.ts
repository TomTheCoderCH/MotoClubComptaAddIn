import { vi, describe, it, expect, beforeEach } from 'vitest';

// Doit être avant tout import qui charge electron
vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/mcy-test') },
}));

import {
  openDatabase,
  getDb,
  getAllAccounts,
  getActiveAccounts,
  getAllFiscalYears,
  createFiscalYear,
  getJournalEntries,
  createJournalEntry,
  getAccountBalances,
  updateJournalEntry,
  deleteJournalEntry,
  getOpeningBalanceSuggestions,
  createOpeningBalanceEntry,
} from '../db';

// Chaque describe repart d'une base SQLite en mémoire fraîche
function freshDb() {
  openDatabase(':memory:');
}

describe('Plan comptable — seed initial', () => {
  beforeEach(freshDb);

  it('contient exactement 29 comptes', () => {
    expect(getAllAccounts()).toHaveLength(29);
  });

  it('tous les comptes sont actifs par défaut', () => {
    expect(getActiveAccounts()).toHaveLength(29);
  });

  it('le compte 100 est la Caisse (ACTIF, DEBIT)', () => {
    const caisse = getAllAccounts().find(a => a.number === '100');
    expect(caisse).toBeDefined();
    expect(caisse!.name).toBe('Caisse');
    expect(caisse!.type).toBe('ACTIF');
    expect(caisse!.normal_balance).toBe('DEBIT');
  });

  it('le compte 290 est le Capital (FONDS_PROPRES, CREDIT)', () => {
    const capital = getAllAccounts().find(a => a.number === '290');
    expect(capital).toBeDefined();
    expect(capital!.type).toBe('FONDS_PROPRES');
    expect(capital!.normal_balance).toBe('CREDIT');
  });

  it('le compte 900 est le seul compte de clôture', () => {
    const closing = getAllAccounts().filter((a: any) => a.is_closing_account);
    expect(closing).toHaveLength(1);
    expect(closing[0].number).toBe('900');
  });

  it('Twint (102) et Avances caissier (103) doivent être à zéro à la clôture', () => {
    const mustZero = getAllAccounts()
      .filter((a: any) => a.must_be_zero_at_closing)
      .map(a => a.number);
    expect(mustZero).toContain('102');
    expect(mustZero).toContain('103');
  });

  it('les 4 classes sont représentées (1, 2, 3, 4)', () => {
    const classes = [...new Set(getAllAccounts().map(a => a.class))];
    expect(classes).toContain(1);
    expect(classes).toContain(2);
    expect(classes).toContain(3);
    expect(classes).toContain(4);
  });
});

describe('Exercices fiscaux', () => {
  beforeEach(freshDb);

  it('crée un exercice 2025 avec les bonnes dates', () => {
    const fy = createFiscalYear(2025);
    expect(fy.year).toBe(2025);
    expect(fy.start_date).toBe('2025-01-01');
    expect(fy.end_date).toBe('2025-12-31');
    expect(fy.is_closed).toBeFalsy();
  });

  it('liste les exercices triés par année décroissante', () => {
    createFiscalYear(2024);
    createFiscalYear(2025);
    const years = getAllFiscalYears();
    expect(years).toHaveLength(2);
    expect(years[0].year).toBe(2025);
    expect(years[1].year).toBe(2024);
  });

  it('démarre sans exercice', () => {
    expect(getAllFiscalYears()).toHaveLength(0);
  });
});

describe('Écritures comptables', () => {
  let fiscalYearId: number;
  let caisseId: number;
  let cotisationsId: number;
  let raiffeisenId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    caisseId      = accounts.find(a => a.number === '100')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    raiffeisenId  = accounts.find(a => a.number === '101')!.id;
  });

  it('crée une écriture simple équilibrée', () => {
    const entry = createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Cotisation membre — CHF 30',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    expect(entry.description).toBe('Cotisation membre — CHF 30');
    expect(entry.fiscal_year_id).toBe(fiscalYearId);
  });

  it('l\'écriture créée apparaît dans la liste du journal', () => {
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Cotisation membre',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    const entries = getJournalEntries(fiscalYearId);
    expect(entries).toHaveLength(1);
    expect(entries[0].lines).toHaveLength(2);
  });

  it('crée une écriture à plusieurs lignes (écriture complexe)', () => {
    const assurancesId = getAllAccounts().find(a => a.number === '400')!.id;
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-01-15',
      description: 'Assurance AXA RC — paiement Raiffeisen',
      piece: 'P-2025-001',
      lines: [
        { account_id: assurancesId,  debit:  18000 },
        { account_id: raiffeisenId,  credit: 18000 },
      ],
    });
    const entries = getJournalEntries(fiscalYearId);
    expect(entries[0].piece).toBe('P-2025-001');
  });

  it('rejette une écriture déséquilibrée', () => {
    expect(() => createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Écriture déséquilibrée',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 2000 },
      ],
    })).toThrow('déséquilibrée');
  });

  it('rejette une écriture avec une seule ligne', () => {
    expect(() => createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Une seule ligne',
      lines: [{ account_id: caisseId, debit: 3000 }],
    })).toThrow('au moins 2 lignes');
  });

  it('rejette une écriture sur un exercice inexistant', () => {
    expect(() => createJournalEntry({
      fiscal_year_id: 9999,
      date: '2025-03-08',
      description: 'Test',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    })).toThrow('introuvable');
  });
});

describe('Soldes par compte', () => {
  let fiscalYearId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    const caisseId      = accounts.find(a => a.number === '100')!.id;
    const cotisationsId = accounts.find(a => a.number === '300')!.id;

    // 3 cotisations à CHF 30
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Cotisations membres — lot 1',
      lines: [
        { account_id: caisseId,      debit:  9000 },
        { account_id: cotisationsId, credit: 9000 },
      ],
    });
  });

  it('retourne le solde correct de la Caisse', () => {
    const balances = getAccountBalances(fiscalYearId);
    const caisse = balances.find(b => b.number === '100');
    expect(caisse).toBeDefined();
    expect(caisse!.solde).toBe(9000); // CHF 90.00 en centimes
  });

  it('retourne le solde correct des Cotisations', () => {
    const balances = getAccountBalances(fiscalYearId);
    const cotis = balances.find(b => b.number === '300');
    expect(cotis).toBeDefined();
    expect(cotis!.solde).toBe(9000);
  });

  it('n\'inclut pas les comptes sans mouvement', () => {
    const balances = getAccountBalances(fiscalYearId);
    const raiffeisen = balances.find(b => b.number === '101');
    expect(raiffeisen).toBeUndefined();
  });

  it('retourne le champ class pour chaque compte', () => {
    const balances = getAccountBalances(fiscalYearId);
    const caisse = balances.find(b => b.number === '100');
    expect(caisse).toBeDefined();
    expect(caisse!.class).toBe(1); // Caisse est en classe 1 (Actifs)
    const cotis = balances.find(b => b.number === '300');
    expect(cotis!.class).toBe(3); // Cotisations membres est en classe 3 (Produits)
  });
});

describe('updateJournalEntry', () => {
  let fiscalYearId: number;
  let caisseId: number;
  let cotisationsId: number;
  let entryId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    caisseId      = accounts.find(a => a.number === '100')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    const entry = createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Cotisation initiale',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    entryId = entry.id;
  });

  it('modifie le libellé, la date et la pièce', () => {
    const updated = updateJournalEntry({
      id: entryId,
      date: '2025-04-01',
      description: 'Cotisation corrigée',
      piece: 'P-001',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    expect(updated.description).toBe('Cotisation corrigée');
    expect(updated.date).toBe('2025-04-01');
    expect(updated.piece).toBe('P-001');
  });

  it('remplace les lignes avec un nombre différent de lignes', () => {
    const raiffeisenId = getAllAccounts().find(a => a.number === '101')!.id;
    const updated = updateJournalEntry({
      id: entryId,
      date: '2025-03-08',
      description: 'Écriture complexe',
      lines: [
        { account_id: caisseId,      debit:  1000 },
        { account_id: raiffeisenId,  debit:  2000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    expect(updated.lines).toHaveLength(3);
    expect(updated.lines.reduce((s, l) => s + (l.debit ?? 0), 0)).toBe(3000);
  });

  it('rejette la modification sur un exercice clôturé', () => {
    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fiscalYearId);
    expect(() => updateJournalEntry({
      id: entryId,
      date: '2025-03-08',
      description: 'Test',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    })).toThrow('clôturé');
  });

  it('rejette une écriture introuvable', () => {
    expect(() => updateJournalEntry({
      id: 9999,
      date: '2025-03-08',
      description: 'Test',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    })).toThrow('introuvable');
  });
});

describe('deleteJournalEntry', () => {
  let fiscalYearId: number;
  let caisseId: number;
  let cotisationsId: number;
  let entryId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    caisseId      = accounts.find(a => a.number === '100')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    const entry = createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Écriture à supprimer',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    entryId = entry.id;
  });

  it('supprime l\'écriture et ses lignes en cascade', () => {
    deleteJournalEntry(entryId);
    expect(getJournalEntries(fiscalYearId)).toHaveLength(0);
  });

  it('rejette la suppression sur un exercice clôturé', () => {
    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fiscalYearId);
    expect(() => deleteJournalEntry(entryId)).toThrow('clôturé');
  });

  it('rejette la suppression d\'une écriture introuvable', () => {
    expect(() => deleteJournalEntry(9999)).toThrow('introuvable');
  });
});

describe('getAllFiscalYears — hasOpeningBalance', () => {
  let fy2025Id: number;
  let caisseId: number;
  let capitalId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fy2025Id = fy.id;
    const accounts = getAllAccounts();
    caisseId  = accounts.find(a => a.number === '100')!.id;
    capitalId = accounts.find(a => a.number === '290')!.id;
  });

  it('retourne hasOpeningBalance falsy quand aucune écriture d\'ouverture', () => {
    const years = getAllFiscalYears();
    expect(years[0].hasOpeningBalance).toBeFalsy();
  });

  it('retourne hasOpeningBalance truthy après createOpeningBalanceEntry', () => {
    createOpeningBalanceEntry(fy2025Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ]);
    const years = getAllFiscalYears();
    expect(years[0].hasOpeningBalance).toBeTruthy();
  });
});

describe('getOpeningBalanceSuggestions + createOpeningBalanceEntry', () => {
  let fy2025Id: number;
  let fy2026Id: number;
  let caisseId: number;
  let raiffeisenId: number;
  let capitalId: number;
  let passifsId: number;

  beforeEach(() => {
    freshDb();
    const accounts = getAllAccounts();
    caisseId     = accounts.find(a => a.number === '100')!.id;
    raiffeisenId = accounts.find(a => a.number === '101')!.id;
    capitalId    = accounts.find(a => a.number === '290')!.id;
    passifsId    = accounts.find(a => a.number === '200')!.id;

    // Exercice 2025 avec quelques soldes
    const fy2025 = createFiscalYear(2025);
    fy2025Id = fy2025.id;
    const cotisationsId = accounts.find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy2025Id,
      date: '2025-03-08',
      description: 'Cotisations',
      lines: [
        { account_id: caisseId,      debit:  100000 },
        { account_id: cotisationsId, credit: 100000 },
      ],
    });
    fy2026Id = createFiscalYear(2026).id;
  });

  it('getSuggested retourne tous les comptes class 1 et 2 actifs', () => {
    const sugg = getOpeningBalanceSuggestions(fy2026Id);
    const numbers = sugg.map(s => s.accountNumber);
    expect(numbers).toContain('100');
    expect(numbers).toContain('101');
    expect(numbers).toContain('290');
    // Pas de classe 3 ou 4
    expect(sugg.every(s => [1, 2].includes(
      getAllAccounts().find(a => a.number === s.accountNumber)!.class
    ))).toBe(true);
  });

  it('getSuggested retourne le solde de l\'exercice précédent pour la Caisse', () => {
    const sugg = getOpeningBalanceSuggestions(fy2026Id);
    const caisse = sugg.find(s => s.accountNumber === '100');
    expect(caisse).toBeDefined();
    expect(caisse!.suggestedAmountCents).toBe(100000);
  });

  it('getSuggested retourne 0 pour les comptes sans mouvement en N-1', () => {
    const sugg = getOpeningBalanceSuggestions(fy2026Id);
    const raiffeisen = sugg.find(s => s.accountNumber === '101');
    expect(raiffeisen!.suggestedAmountCents).toBe(0);
  });

  it('getSuggested retourne 0 pour tous les comptes si premier exercice (pas de N-1)', () => {
    const fy2023Id = createFiscalYear(2023).id;
    const sugg = getOpeningBalanceSuggestions(fy2023Id);
    expect(sugg.every(s => s.suggestedAmountCents === 0)).toBe(true);
  });

  it('createOpeningBalanceEntry insère avec is_opening_balance = 1 et date YYYY-01-01', () => {
    createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ]);
    const entries = getJournalEntries(fy2026Id);
    expect(entries).toHaveLength(1);
    expect(entries[0].is_opening_balance).toBeTruthy();
    expect(entries[0].date).toBe('2026-01-01');
    expect(entries[0].description).toBe('Soldes à nouveau 2026');
    expect(entries[0].lines).toHaveLength(2);
  });

  it('createOpeningBalanceEntry rejette si déséquilibre', () => {
    expect(() => createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents:  50000 },
    ])).toThrow('déséquilibr');
  });

  it('createOpeningBalanceEntry ignore les lignes à montant nul', () => {
    createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,     amountCents: 100000 },
      { accountId: raiffeisenId, amountCents:       0 },
      { accountId: capitalId,    amountCents: 100000 },
    ]);
    const lines = getJournalEntries(fy2026Id)[0].lines;
    expect(lines).toHaveLength(2); // raiffeisen exclu
  });

  it('createOpeningBalanceEntry rejette si exercice clôturé', () => {
    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fy2026Id);
    expect(() => createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ])).toThrow('clôturé');
  });
});
