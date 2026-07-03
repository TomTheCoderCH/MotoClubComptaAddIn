import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/mcy-test') },
}));

import {
  openDatabase,
  getDb,
  getAllAccounts,
  createFiscalYear,
  createJournalEntry,
  getAllFiscalYears,
} from '../../db';
import type { CashCountPayload, CashSessionPayload } from '../../types';

function freshDb() { openDatabase(':memory:'); }

// ── Migration ────────────────────────────────────────────────────────────────

describe('Migration — schéma courant (v4)', () => {
  beforeEach(freshDb);

  it('crée les tables cash_sessions, cash_counts, cash_count_lines', () => {
    const db = openDatabase(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cash_%'"
    ).all() as { name: string }[];
    expect(tables.map(t => t.name).sort()).toEqual([
      'cash_count_lines', 'cash_counts', 'cash_sessions',
    ]);
  });

  it('schema version est 4', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(4);
  });
});

import {
  createCashCount, getCashCounts, getCashCountById, updateCashCount, deleteCashCount,
  createCashSession, getCashSessions, deleteCashSession,
} from '../../db';
import { emptyLines } from '../../lib/cash';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFiscalYear(): number {
  return createFiscalYear(2025).id;
}

function makeEntry100(fyId: number, amountCents: number, date: string) {
  const accounts = getAllAccounts();
  const c100 = accounts.find(a => a.number === '100')!;
  const c290 = accounts.find(a => a.number === '290')!;
  createJournalEntry({
    fiscal_year_id: fyId, date, description: 'Seed',
    lines: [
      { account_id: c100.id, debit: amountCents },
      { account_id: c290.id, credit: amountCents },
    ],
  });
}

// ── createCashCount ───────────────────────────────────────────────────────────

describe('createCashCount', () => {
  beforeEach(freshDb);

  it('persiste 12 lignes et calcule le total', () => {
    const fyId = makeFiscalYear();
    const lines = emptyLines();
    lines[4].quantity = 38; // 100 centimes × 38 = 3 800 centimes
    const count = createCashCount({
      fiscal_year_id: fyId, date: '2025-03-08',
      label: 'Test comptage', context: 'LIBRE', lines,
    });
    expect(count.label).toBe('Test comptage');
    expect(count.context).toBe('LIBRE');
    expect(count.total).toBe(3800);
    expect(count.lines).toHaveLength(12);
    expect(count.lines!.find(l => l.denomination === 100)!.quantity).toBe(38);
  });

  it('theoretical_balance reflète les écritures du compte 100', () => {
    const fyId = makeFiscalYear();
    makeEntry100(fyId, 500000, '2025-01-01');
    const count = createCashCount({
      fiscal_year_id: fyId, date: '2025-01-01',
      label: 'Début', context: 'LIBRE', lines: emptyLines(),
    });
    expect(count.theoretical_balance).toBe(500000);
  });

  it('theoretical_balance exclut les écritures postérieures à la date', () => {
    const fyId = makeFiscalYear();
    makeEntry100(fyId, 500000, '2025-01-01');
    makeEntry100(fyId, 200000, '2025-03-15');
    const count = createCashCount({
      fiscal_year_id: fyId, date: '2025-01-31',
      label: 'Janvier', context: 'LIBRE', lines: emptyLines(),
    });
    expect(count.theoretical_balance).toBe(500000);
  });
});

describe('getCashCounts', () => {
  beforeEach(freshDb);

  it('retourne les comptages triés par date décroissante', () => {
    const fyId = makeFiscalYear();
    createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'A', context: 'LIBRE', lines: emptyLines() });
    createCashCount({ fiscal_year_id: fyId, date: '2025-03-08', label: 'B', context: 'AVANT', lines: emptyLines() });
    const counts = getCashCounts(fyId);
    expect(counts).toHaveLength(2);
    expect(counts[0].label).toBe('B');
    expect(counts[1].label).toBe('A');
  });

  it('ne retourne pas les comptages des autres exercices', () => {
    const fy1 = makeFiscalYear();
    createFiscalYear(2026);
    const fy2 = getAllFiscalYears().find(f => f.year === 2026)!.id;
    createCashCount({ fiscal_year_id: fy1, date: '2025-01-01', label: 'FY1', context: 'LIBRE', lines: emptyLines() });
    createCashCount({ fiscal_year_id: fy2, date: '2026-01-01', label: 'FY2', context: 'LIBRE', lines: emptyLines() });
    expect(getCashCounts(fy1)).toHaveLength(1);
    expect(getCashCounts(fy2)).toHaveLength(1);
  });
});

describe('getCashCountById', () => {
  beforeEach(freshDb);

  it('retourne le count avec ses lignes', () => {
    const fyId = makeFiscalYear();
    const c = createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'X', context: 'LIBRE', lines: emptyLines() });
    const byId = getCashCountById(c.id);
    expect(byId.id).toBe(c.id);
    expect(byId.lines).toHaveLength(12);
  });

  it("lève une erreur si l'id est introuvable", () => {
    openDatabase(':memory:');
    expect(() => getCashCountById(999)).toThrow('introuvable');
  });
});

describe('updateCashCount', () => {
  beforeEach(freshDb);

  it('met à jour le libellé et la date', () => {
    const fyId = makeFiscalYear();
    const c = createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'Avant', context: 'LIBRE', lines: emptyLines() });
    updateCashCount(c.id, { fiscal_year_id: fyId, date: '2025-02-01', label: 'Modifié', context: 'AVANT', lines: emptyLines() });
    const updated = getCashCountById(c.id);
    expect(updated.label).toBe('Modifié');
    expect(updated.date).toBe('2025-02-01');
    expect(updated.context).toBe('AVANT');
  });

  it('persiste le session_id lors de la mise à jour', () => {
    const fyId = makeFiscalYear();
    const s = createCashSession({ fiscal_year_id: fyId, label: 'Marché' });
    const c = createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'Avant', context: 'AVANT', lines: emptyLines() });
    expect(getCashCountById(c.id).session_id).toBeNull();
    updateCashCount(c.id, { fiscal_year_id: fyId, date: '2025-01-01', label: 'Avant', context: 'AVANT', session_id: s.id, lines: emptyLines() });
    expect(getCashCountById(c.id).session_id).toBe(s.id);
    expect(getCashCountById(c.id).session_label).toBe('Marché');
  });

  it('peut retirer le session_id (session_id = null)', () => {
    const fyId = makeFiscalYear();
    const s = createCashSession({ fiscal_year_id: fyId, label: 'Marché' });
    const c = createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'Avant', context: 'AVANT', session_id: s.id, lines: emptyLines() });
    expect(getCashCountById(c.id).session_id).toBe(s.id);
    updateCashCount(c.id, { fiscal_year_id: fyId, date: '2025-01-01', label: 'Avant', context: 'AVANT', lines: emptyLines() });
    expect(getCashCountById(c.id).session_id).toBeNull();
  });
});

describe('deleteCashCount', () => {
  beforeEach(freshDb);

  it('supprime le count et ses lignes (CASCADE)', () => {
    const fyId = makeFiscalYear();
    const c = createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'X', context: 'LIBRE', lines: emptyLines() });
    deleteCashCount(c.id);
    expect(getCashCounts(fyId)).toHaveLength(0);
    const db = getDb();
    const lines = db.prepare('SELECT * FROM cash_count_lines WHERE cash_count_id = ?').all(c.id);
    expect(lines).toHaveLength(0);
  });
});

describe('CashSession CRUD', () => {
  beforeEach(freshDb);

  it('crée et liste une session', () => {
    const fyId = makeFiscalYear();
    const s = createCashSession({ fiscal_year_id: fyId, label: 'Marché 2025' });
    expect(s.label).toBe('Marché 2025');
    expect(getCashSessions(fyId)).toHaveLength(1);
  });

  it('supprime une session — les counts gardent session_id NULL', () => {
    const fyId = makeFiscalYear();
    const s = createCashSession({ fiscal_year_id: fyId, label: 'Marché' });
    const c = createCashCount({
      fiscal_year_id: fyId, date: '2025-01-01', label: 'Avant',
      context: 'AVANT', session_id: s.id, lines: emptyLines(),
    });
    deleteCashSession(s.id);
    expect(getCashCountById(c.id).session_id).toBeNull();
    expect(getCashCountById(c.id).session_label).toBeNull();
  });
});
