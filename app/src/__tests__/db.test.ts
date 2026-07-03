import { vi, describe, it, expect, beforeEach } from 'vitest';

// Doit être avant tout import qui charge electron
vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/mcy-test') },
}));

import {
  openDatabase,
  getDb,
  hasDbChanges,
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
  getClosingPreview,
  closeFiscalYear,
  reopenFiscalYear,
  updateAccount,
  createAccount,
  deleteAccount,
  getAnalyticsData,
  getDashboardData,
  getAccountLedger,
} from '../db';

// Chaque describe repart d'une base SQLite en mémoire fraîche
function freshDb() {
  openDatabase(':memory:');
}

describe('Plan comptable — seed initial', () => {
  beforeEach(freshDb);

  it('contient exactement 30 comptes', () => {
    expect(getAllAccounts()).toHaveLength(30);
  });

  it('tous les comptes sont actifs par défaut', () => {
    expect(getActiveAccounts()).toHaveLength(30);
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
  let _passifsId: number;

  beforeEach(() => {
    freshDb();
    const accounts = getAllAccounts();
    caisseId     = accounts.find(a => a.number === '100')!.id;
    raiffeisenId = accounts.find(a => a.number === '101')!.id;
    capitalId    = accounts.find(a => a.number === '290')!.id;
    _passifsId   = accounts.find(a => a.number === '200')!.id;

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

  it('createOpeningBalanceEntry rejette si des soldes à nouveau existent déjà', () => {
    createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ]);
    expect(() => createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ])).toThrow('existent déjà');
  });
});

describe('getClosingPreview', () => {
  let fiscalYearId: number;
  let raiffeisenId: number;
  let twintId: number;
  let cotisationsId: number;
  let assurancesId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    raiffeisenId  = accounts.find(a => a.number === '101')!.id;
    twintId       = accounts.find(a => a.number === '102')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    assurancesId  = accounts.find(a => a.number === '400')!.id;
  });

  it('retourne un blocker si Twint a un solde non nul', () => {
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-01',
      description: 'Encaissement Twint',
      lines: [
        { account_id: twintId,        debit:  4500 },
        { account_id: cotisationsId,  credit: 4500 },
      ],
    });
    const preview = getClosingPreview(fiscalYearId);
    expect(preview.blockers).toHaveLength(1);
    expect(preview.blockers[0]).toMatch(/Twint/);
    expect(preview.blockers[0]).toMatch(/45\.00/);
  });

  it('retourne accounts et netResultCents corrects', () => {
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-01',
      description: 'Cotisations',
      lines: [
        { account_id: raiffeisenId,  debit:  141000 },
        { account_id: cotisationsId, credit: 141000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-04-01',
      description: 'Assurances',
      lines: [
        { account_id: assurancesId,  debit:  35000 },
        { account_id: raiffeisenId,  credit: 35000 },
      ],
    });
    const preview = getClosingPreview(fiscalYearId);
    expect(preview.blockers).toHaveLength(0);
    expect(preview.accounts).toHaveLength(2);
    expect(preview.netResultCents).toBe(106000); // 1410 - 350 = 1060 CHF
  });

  it('retourne listes vides et netResultCents = 0 sans mouvements 3xx/4xx', () => {
    const preview = getClosingPreview(fiscalYearId);
    expect(preview.blockers).toHaveLength(0);
    expect(preview.accounts).toHaveLength(0);
    expect(preview.netResultCents).toBe(0);
  });
});

describe('closeFiscalYear + reopenFiscalYear', () => {
  let fiscalYearId: number;
  let raiffeisenId: number;
  let cotisationsId: number;
  let assurancesId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    raiffeisenId  = accounts.find(a => a.number === '101')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    assurancesId  = accounts.find(a => a.number === '400')!.id;
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-01',
      description: 'Cotisations',
      lines: [
        { account_id: raiffeisenId,  debit:  141000 },
        { account_id: cotisationsId, credit: 141000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-04-01',
      description: 'Assurances',
      lines: [
        { account_id: assurancesId,  debit:  35000 },
        { account_id: raiffeisenId,  credit: 35000 },
      ],
    });
  });

  it('génère 2 écritures is_closing_entry et marque is_closed = 1', () => {
    closeFiscalYear(fiscalYearId);
    const entries = getDb()
      .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fiscalYearId) as any[];
    expect(entries).toHaveLength(2);
    const fy = getDb()
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(fiscalYearId) as { is_closed: number };
    expect(fy.is_closed).toBe(1);
  });

  it('génère 1 seule écriture si netResultCents = 0 (pas d\'écriture 2)', () => {
    const fy2 = createFiscalYear(2026);
    const fraisBancairesId = getAllAccounts().find(a => a.number === '401')!.id;
    createJournalEntry({
      fiscal_year_id: fy2.id,
      date: '2026-03-01',
      description: 'Produit égal charge',
      lines: [
        { account_id: raiffeisenId,     debit:  10000 },
        { account_id: cotisationsId,    credit: 10000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fy2.id,
      date: '2026-03-01',
      description: 'Charge égale produit',
      lines: [
        { account_id: fraisBancairesId, debit:  10000 },
        { account_id: raiffeisenId,     credit: 10000 },
      ],
    });
    closeFiscalYear(fy2.id);
    const entries = getDb()
      .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fy2.id) as any[];
    expect(entries).toHaveLength(1);
  });

  it('lève une erreur si des blockers existent (Twint non soldé)', () => {
    const twintId = getAllAccounts().find(a => a.number === '102')!.id;
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-05-01',
      description: 'Twint non soldé',
      lines: [
        { account_id: twintId,        debit:  1000 },
        { account_id: cotisationsId,  credit: 1000 },
      ],
    });
    expect(() => closeFiscalYear(fiscalYearId)).toThrow('impossible');
  });

  it('lève une erreur si déjà clôturé (idempotence)', () => {
    closeFiscalYear(fiscalYearId);
    expect(() => closeFiscalYear(fiscalYearId)).toThrow('déjà clôturé');
  });

  it('les écritures de clôture ont la date YYYY-12-31', () => {
    closeFiscalYear(fiscalYearId);
    const entries = getDb()
      .prepare('SELECT date FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fiscalYearId) as { date: string }[];
    for (const e of entries) {
      expect(e.date).toBe('2025-12-31');
    }
  });

  it('reopenFiscalYear supprime les écritures de clôture et remet is_closed = 0', () => {
    closeFiscalYear(fiscalYearId);
    reopenFiscalYear(fiscalYearId);
    const entries = getDb()
      .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fiscalYearId) as any[];
    expect(entries).toHaveLength(0);
    const fy = getDb()
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(fiscalYearId) as { is_closed: number };
    expect(fy.is_closed).toBe(0);
  });

  it('reopenFiscalYear lève une erreur si exercice non clôturé', () => {
    expect(() => reopenFiscalYear(fiscalYearId)).toThrow('n\'est pas clôturé');
  });
});

describe('hasDbChanges', () => {
  it('retourne false juste après openDatabase (seed inclus)', () => {
    openDatabase(':memory:');
    expect(hasDbChanges()).toBe(false);
  });

  it('retourne true après une écriture utilisateur', () => {
    openDatabase(':memory:');
    const fy = createFiscalYear(2025);
    const caisse      = getAllAccounts().find(a => a.number === '100')!.id;
    const cotisations = getAllAccounts().find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy.id,
      date: '2025-03-01',
      description: 'Test hasDbChanges',
      lines: [
        { account_id: caisse,       debit:  3000 },
        { account_id: cotisations,  credit: 3000 },
      ],
    });
    expect(hasDbChanges()).toBe(true);
  });
});

describe('Migration v2 — account_group', () => {
  it('la colonne account_group existe sur accounts', () => {
    openDatabase(':memory:');
    const cols = getDb()
      .prepare('PRAGMA table_info(accounts)')
      .all() as Array<{ name: string }>;
    expect(cols.some(c => c.name === 'account_group')).toBe(true);
  });

  it('account_group vaut null par défaut', () => {
    openDatabase(':memory:');
    const acc = getDb()
      .prepare("SELECT account_group FROM accounts WHERE number = '100'")
      .get() as { account_group: string | null };
    expect(acc.account_group).toBeNull();
  });
});

describe('updateAccount', () => {
  beforeEach(freshDb);

  it('renomme un compte', () => {
    const acc = getAllAccounts().find(a => a.number === '100')!;
    const updated = updateAccount({ id: acc.id, name: 'Caisse principale' });
    expect(updated.name).toBe('Caisse principale');
  });

  it('assigne un groupe analytique', () => {
    const acc = getAllAccounts().find(a => a.number === '310')!;
    const updated = updateAccount({ id: acc.id, account_group: 'boissons' });
    expect(updated.account_group).toBe('boissons');
  });

  it('efface un groupe analytique (null)', () => {
    const acc = getAllAccounts().find(a => a.number === '310')!;
    updateAccount({ id: acc.id, account_group: 'boissons' });
    const cleared = updateAccount({ id: acc.id, account_group: null });
    expect(cleared.account_group).toBeNull();
  });

  it('désactive un compte', () => {
    const acc = getAllAccounts().find(a => a.number === '490')!;
    const updated = updateAccount({ id: acc.id, is_active: false });
    expect(updated.is_active).toBeFalsy();
  });

  it('lève une erreur si aucun champ fourni', () => {
    const acc = getAllAccounts().find(a => a.number === '100')!;
    expect(() => updateAccount({ id: acc.id })).toThrow('Aucun champ');
  });
});

describe('createAccount', () => {
  beforeEach(freshDb);

  it('crée un compte PRODUIT avec solde normal CREDIT déduit', () => {
    const acc = createAccount({ number: '395', name: 'Intérêts bancaires', type: 'PRODUIT' });
    expect(acc.number).toBe('395');
    expect(acc.normal_balance).toBe('CREDIT');
    expect(acc.class).toBe(3);
  });

  it('crée un compte CHARGE avec solde normal DEBIT déduit', () => {
    const acc = createAccount({ number: '495', name: 'Frais divers', type: 'CHARGE' });
    expect(acc.normal_balance).toBe('DEBIT');
    expect(acc.class).toBe(4);
  });

  it('crée un compte avec groupe analytique', () => {
    const acc = createAccount({
      number: '312', name: 'Vente café', type: 'PRODUIT', account_group: 'boissons',
    });
    expect(acc.account_group).toBe('boissons');
  });

  it('lève une erreur si numéro déjà utilisé', () => {
    expect(() => createAccount({ number: '100', name: 'Doublon', type: 'ACTIF' }))
      .toThrow('déjà utilisé');
  });

  it('lève une erreur si numéro invalide (non numérique)', () => {
    expect(() => createAccount({ number: 'ABC', name: 'Test', type: 'PRODUIT' }))
      .toThrow('invalide');
  });
});

describe('has_entries sur Account', () => {
  beforeEach(freshDb);

  it('has_entries = false pour les comptes seed sans écriture', () => {
    const caisse = getAllAccounts().find(a => a.number === '100')!;
    expect(caisse.has_entries).toBeFalsy();
  });

  it('has_entries = true après une écriture sur ce compte', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisseId = accounts.find(a => a.number === '100')!.id;
    const cotisId  = accounts.find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-01-01', description: 'Test',
      lines: [{ account_id: caisseId, debit: 1000 }, { account_id: cotisId, credit: 1000 }],
    });
    const after = getAllAccounts().find(a => a.number === '100')!;
    expect(after.has_entries).toBeTruthy();
  });

  it('has_entries = false sur un compte nouvellement créé', () => {
    const acc = createAccount({ number: '395', name: 'Test', type: 'PRODUIT' });
    expect(acc.has_entries).toBeFalsy();
  });
});

describe('deleteAccount', () => {
  beforeEach(freshDb);

  it('supprime un compte sans écriture', () => {
    const acc = createAccount({ number: '395', name: 'Test', type: 'PRODUIT' });
    deleteAccount(acc.id);
    expect(getAllAccounts().find(a => a.number === '395')).toBeUndefined();
  });

  it('lève une erreur si des écritures existent sur ce compte', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisseId = accounts.find(a => a.number === '100')!.id;
    const cotisId  = accounts.find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-01-01', description: 'Test',
      lines: [{ account_id: caisseId, debit: 1000 }, { account_id: cotisId, credit: 1000 }],
    });
    expect(() => deleteAccount(caisseId)).toThrow('écritures');
  });

  it('lève une erreur si compte introuvable', () => {
    expect(() => deleteAccount(99999)).toThrow('introuvable');
  });
});

describe('updateAccount — numéro et type', () => {
  beforeEach(freshDb);

  it('modifie le numéro d\'un compte sans écriture', () => {
    const acc = createAccount({ number: '395', name: 'Test', type: 'PRODUIT' });
    const updated = updateAccount({ id: acc.id, number: '396' });
    expect(updated.number).toBe('396');
    expect(updated.class).toBe(3);
  });

  it('modifie le type d\'un compte sans écriture (recalcule normal_balance)', () => {
    const acc = createAccount({ number: '395', name: 'Test', type: 'PRODUIT' });
    const updated = updateAccount({ id: acc.id, type: 'CHARGE' });
    expect(updated.type).toBe('CHARGE');
    expect(updated.normal_balance).toBe('DEBIT');
  });

  it('lève une erreur si modification du numéro avec des écritures existantes', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisseId = accounts.find(a => a.number === '100')!.id;
    const cotisId  = accounts.find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-01-01', description: 'Test',
      lines: [{ account_id: caisseId, debit: 1000 }, { account_id: cotisId, credit: 1000 }],
    });
    expect(() => updateAccount({ id: caisseId, number: '199' })).toThrow('écritures');
  });

  it('lève une erreur si modification du type avec des écritures existantes', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisseId = accounts.find(a => a.number === '100')!.id;
    const cotisId  = accounts.find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-01-01', description: 'Test',
      lines: [{ account_id: caisseId, debit: 1000 }, { account_id: cotisId, credit: 1000 }],
    });
    expect(() => updateAccount({ id: caisseId, type: 'PASSIF' })).toThrow('écritures');
  });

  it('lève une erreur si le nouveau numéro est déjà utilisé', () => {
    const acc = createAccount({ number: '395', name: 'Test', type: 'PRODUIT' });
    expect(() => updateAccount({ id: acc.id, number: '100' })).toThrow('déjà utilisé');
  });

  it('lève une erreur si le nouveau numéro est invalide', () => {
    const acc = createAccount({ number: '395', name: 'Test', type: 'PRODUIT' });
    expect(() => updateAccount({ id: acc.id, number: 'XYZ' })).toThrow('invalide');
  });
});

describe('getAnalyticsData', () => {
  beforeEach(freshDb);

  it('retourne groups vide et ungrouped vide sans mouvement', () => {
    const fy = createFiscalYear(2025);
    const data = getAnalyticsData(fy.id);
    expect(data.groups).toHaveLength(0);
    expect(data.ungrouped).toHaveLength(0);
  });

  it('place les comptes sans groupe dans ungrouped', () => {
    const fy = createFiscalYear(2025);
    const caisse      = getAllAccounts().find(a => a.number === '100')!.id;
    const cotisations = getAllAccounts().find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-03-01', description: 'Test',
      lines: [
        { account_id: caisse,      debit:  3000 },
        { account_id: cotisations, credit: 3000 },
      ],
    });
    const data = getAnalyticsData(fy.id);
    expect(data.ungrouped).toHaveLength(1);
    expect(data.ungrouped[0].number).toBe('300');
    expect(data.ungrouped[0].recettes).toBe(3000);
  });

  it('regroupe les comptes par account_group', () => {
    const fy = createFiscalYear(2025);
    const comptes = getAllAccounts();
    const prod   = comptes.find(a => a.number === '310')!;
    const charge = comptes.find(a => a.number === '411')!;
    const caisse = comptes.find(a => a.number === '100')!;
    updateAccount({ id: prod.id,   account_group: 'boissons' });
    updateAccount({ id: charge.id, account_group: 'boissons' });
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-04-01', description: 'Vente boissons',
      lines: [
        { account_id: caisse.id, debit:  5000 },
        { account_id: prod.id,   credit: 5000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-04-15', description: 'Achat boissons',
      lines: [
        { account_id: charge.id, debit:  2000 },
        { account_id: caisse.id, credit: 2000 },
      ],
    });
    const data = getAnalyticsData(fy.id);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].name).toBe('boissons');
    expect(data.groups[0].totalRecettes).toBe(5000);
    expect(data.groups[0].totalCharges).toBe(2000);
    expect(data.groups[0].resultat).toBe(3000);
    expect(data.ungrouped).toHaveLength(0);
  });
});

describe('getDashboardData', () => {
  let fyId: number;
  let caisseId: number;
  let raiffeisenId: number;
  let cotisationsId: number;
  let assurancesId: number;
  let _capitalId: number;
  let avancesCaissierId: number;
  let marcheProduitId: number;
  let marcheChargeId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fyId = fy.id;
    const accounts = getAllAccounts();
    caisseId           = accounts.find(a => a.number === '100')!.id;
    raiffeisenId       = accounts.find(a => a.number === '101')!.id;
    cotisationsId      = accounts.find(a => a.number === '300')!.id;
    assurancesId       = accounts.find(a => a.number === '400')!.id;
    _capitalId         = accounts.find(a => a.number === '290')!.id;
    avancesCaissierId  = accounts.find(a => a.number === '103')!.id;
    marcheProduitId    = accounts.find(a => a.number === '330')!.id;
    marcheChargeId     = accounts.find(a => a.number === '430')!.id;
    // Assigner un groupe analytique aux comptes Marché
    updateAccount({ id: marcheProduitId, account_group: 'Marché' });
    updateAccount({ id: marcheChargeId,  account_group: 'Marché' });
  });

  it('retourne cashBalances vides et netResultCents=0 sans écriture', () => {
    const data = getDashboardData(fyId, []);
    expect(data.cashBalances).toHaveLength(0);
    expect(data.netResultCents).toBe(0);
    expect(data.customCards).toHaveLength(0);
  });

  it('retourne le solde de la Caisse', () => {
    createJournalEntry({
      fiscal_year_id: fyId, date: '2025-01-01', description: 'Cotisation',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    const data = getDashboardData(fyId, []);
    const caisse = data.cashBalances.find(b => b.number === '100');
    expect(caisse).toBeDefined();
    expect(caisse!.solde).toBe(3000);
  });

  it('calcule netResultCents correctement (produits - charges)', () => {
    createJournalEntry({
      fiscal_year_id: fyId, date: '2025-01-01', description: 'Cotisation',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fyId, date: '2025-02-01', description: 'Assurance',
      lines: [
        { account_id: assurancesId,  debit:  1000 },
        { account_id: raiffeisenId,  credit: 1000 },
      ],
    });
    const data = getDashboardData(fyId, []);
    // Produits: 3000, Charges: 1000 → résultat = 2000
    expect(data.netResultCents).toBe(2000);
  });

  it('exclut les écritures de clôture du netResultCents', () => {
    createJournalEntry({
      fiscal_year_id: fyId, date: '2025-01-01', description: 'Cotisation',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    closeFiscalYear(fyId);
    const data = getDashboardData(fyId, []);
    expect(data.netResultCents).toBe(3000);
  });

  it('n\'inclut pas le compte Raiffeisen dans cashBalances s\'il n\'a pas de mouvement', () => {
    createJournalEntry({
      fiscal_year_id: fyId, date: '2025-01-01', description: 'Cotisation',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    const data = getDashboardData(fyId, []);
    expect(data.cashBalances.find(b => b.number === '101')).toBeUndefined();
  });

  describe('cartes personnalisées — compte', () => {
    it('retourne le solde d\'un compte personnalisé (Avances caissier)', () => {
      createJournalEntry({
        fiscal_year_id: fyId, date: '2025-03-01', description: 'Avance',
        lines: [
          { account_id: avancesCaissierId, debit:  5000 },
          { account_id: caisseId,          credit: 5000 },
        ],
      });
      const data = getDashboardData(fyId, [{ type: 'account', accountId: avancesCaissierId }]);
      expect(data.customCards).toHaveLength(1);
      const card = data.customCards[0];
      expect(card.key).toBe(`account-${avancesCaissierId}`);
      expect(card.valueCents).toBe(5000);
      expect(card.isResult).toBe(false);
    });

    it('retourne valueCents=0 si le compte personnalisé n\'a pas de mouvement', () => {
      const data = getDashboardData(fyId, [{ type: 'account', accountId: avancesCaissierId }]);
      expect(data.customCards[0].valueCents).toBe(0);
    });

    it('inclut le label et subLabel du compte', () => {
      const data = getDashboardData(fyId, [{ type: 'account', accountId: caisseId }]);
      const card = data.customCards[0];
      expect(card.label).toBe('Caisse');
      expect(card.subLabel).toBe('100');
    });
  });

  describe('cartes personnalisées — groupe analytique', () => {
    it('retourne le P&L d\'un groupe analytique', () => {
      createJournalEntry({
        fiscal_year_id: fyId, date: '2025-05-01', description: 'Marché — recettes',
        lines: [
          { account_id: caisseId,       debit:  200000 },
          { account_id: marcheProduitId, credit: 200000 },
        ],
      });
      createJournalEntry({
        fiscal_year_id: fyId, date: '2025-05-02', description: 'Marché — dépenses',
        lines: [
          { account_id: marcheChargeId, debit:  50000 },
          { account_id: caisseId,       credit: 50000 },
        ],
      });
      const data = getDashboardData(fyId, [{ type: 'group', groupName: 'Marché' }]);
      expect(data.customCards).toHaveLength(1);
      const card = data.customCards[0];
      expect(card.key).toBe('group-Marché');
      expect(card.valueCents).toBe(150000); // 200000 - 50000
      expect(card.isResult).toBe(true);
    });

    it('retourne valueCents=0 si le groupe n\'a pas de mouvement', () => {
      const data = getDashboardData(fyId, [{ type: 'group', groupName: 'Marché' }]);
      expect(data.customCards[0].valueCents).toBe(0);
    });

    it('inclut label et subLabel du groupe', () => {
      const data = getDashboardData(fyId, [{ type: 'group', groupName: 'Marché' }]);
      const card = data.customCards[0];
      expect(card.label).toBe('Marché');
      expect(card.subLabel).toBe('Analytique');
    });
  });
});

describe('getAccountLedger', () => {
  beforeEach(freshDb);

  it('retourne les infos du compte et une liste vide sans écriture', () => {
    const fy = createFiscalYear(2025);
    const caisse = getAllAccounts().find(a => a.number === '100')!;
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.account.number).toBe('100');
    expect(result.account.name).toBe('Caisse');
    expect(result.lines).toHaveLength(0);
  });

  it('retourne la ligne avec contrepartie unique et flags corrects', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const cotis  = accounts.find(a => a.number === '300')!;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-03-08', description: 'Cotisations',
      lines: [
        { account_id: caisse.id, debit: 141000 },
        { account_id: cotis.id,  credit: 141000 },
      ],
    });
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].debit).toBe(141000);
    expect(result.lines[0].credit).toBeNull();
    expect(result.lines[0].description).toBe('Cotisations');
    expect(result.lines[0].isOpeningBalance).toBe(false);
    expect(result.lines[0].isClosingEntry).toBe(false);
    expect(result.lines[0].counterparts).toHaveLength(1);
    expect(result.lines[0].counterparts[0].number).toBe('300');
    expect(result.lines[0].counterparts[0].amount).toBe(141000);
  });

  it('retourne plusieurs contreparties (côté crédit) pour écriture multi-lignes', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const assur  = accounts.find(a => a.number === '400')!;
    const elect  = accounts.find(a => a.number === '410')!;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-04-01', description: 'Charges diverses',
      lines: [
        { account_id: assur.id,  debit: 30000  },
        { account_id: elect.id,  debit: 20000  },
        { account_id: caisse.id, credit: 50000 },
      ],
    });
    // Caisse est au crédit → contreparties = lignes au débit (400 + 410)
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.lines[0].counterparts).toHaveLength(2);
    const nums = result.lines[0].counterparts.map(c => c.number).sort();
    expect(nums).toEqual(['400', '410']);
    const amounts = result.lines[0].counterparts.map(c => c.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([20000, 30000]);
  });

  it('ne retourne que les contreparties du côté opposé (débit → crédit uniquement)', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const assur  = accounts.find(a => a.number === '400')!;
    const elect  = accounts.find(a => a.number === '410')!;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-04-01', description: 'Charges diverses',
      lines: [
        { account_id: assur.id,  debit: 30000  },
        { account_id: elect.id,  debit: 20000  },
        { account_id: caisse.id, credit: 50000 },
      ],
    });
    // Assurances est au débit → contrepartie = lignes au crédit uniquement (100 Caisse)
    // Le co-débit 410 Electricité ne doit PAS apparaître
    const result = getAccountLedger(fy.id, assur.id);
    expect(result.lines[0].counterparts).toHaveLength(1);
    expect(result.lines[0].counterparts[0].number).toBe('100');
    expect(result.lines[0].counterparts[0].amount).toBe(50000);
  });

  it('retourne les lignes en ordre chronologique', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const raiff  = accounts.find(a => a.number === '101')!;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-05-01', description: 'Retrait',
      lines: [{ account_id: caisse.id, debit: 10000 }, { account_id: raiff.id, credit: 10000 }],
    });
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-03-01', description: 'Dépôt',
      lines: [{ account_id: caisse.id, credit: 20000 }, { account_id: raiff.id, debit: 20000 }],
    });
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.lines[0].description).toBe('Dépôt');
    expect(result.lines[1].description).toBe('Retrait');
  });

  it('lève une erreur si le compte est introuvable', () => {
    const fy = createFiscalYear(2025);
    expect(() => getAccountLedger(fy.id, 9999)).toThrow('Compte introuvable');
  });
});
