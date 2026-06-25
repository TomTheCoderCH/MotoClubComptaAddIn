import { describe, it, expect } from 'vitest';
import { DEFAULT_FILTERS, applyFilters } from '../lib/journalFilters';
import type { EntryWithLines } from '../lib/journalFilters';

function makeEntry(
  id: number,
  date: string,
  description: string,
  piece: string | null,
  lines: Array<{ account_id: number; debit: number | null; credit: number | null }>,
): EntryWithLines {
  return {
    id, fiscal_year_id: 1, date, description, piece,
    is_opening_balance: false, is_closing_entry: false,
    created_at: '', updated_at: '',
    lines: lines.map((l, i) => ({
      id: i + 1, journal_entry_id: id,
      account_id: l.account_id, debit: l.debit, credit: l.credit,
      created_at: '',
    })),
  };
}

const e1 = makeEntry(1, '2025-03-01', 'Cotisation membre', 'P-001', [
  { account_id: 1, debit: 3000,  credit: null },
  { account_id: 2, debit: null,  credit: 3000 },
]);
const e2 = makeEntry(2, '2025-05-15', 'Assurance AXA', null, [
  { account_id: 3, debit: 18000, credit: null },
  { account_id: 1, debit: null,  credit: 18000 },
]);
const e3 = makeEntry(3, '2025-07-20', 'Vente boissons local', 'P-003', [
  { account_id: 1, debit: 5000,  credit: null },
  { account_id: 4, debit: null,  credit: 5000 },
]);

const all = [e1, e2, e3];

describe('applyFilters — filtre texte', () => {
  it('retourne tout sans filtre', () => {
    expect(applyFilters(all, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it('filtre par libellé (insensible à la casse)', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, text: 'cotisation' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('filtre par numéro de pièce', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, text: 'P-003' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('retourne vide si aucune correspondance', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, text: 'zzz' })).toHaveLength(0);
  });
});

describe('applyFilters — filtre dates', () => {
  it('filtre par dateFrom', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateFrom: '2025-05-01' });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toEqual([2, 3]);
  });

  it('filtre par dateTo', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateTo: '2025-05-15' });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toEqual([1, 2]);
  });

  it('filtre par plage de dates', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateFrom: '2025-05-01', dateTo: '2025-06-30' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

describe('applyFilters — filtre compte (vue grand-livre)', () => {
  it('ne garde que les lignes du compte filtré', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, accountId: 1 });
    expect(result).toHaveLength(3);
    result.forEach(e => {
      expect(e.lines).toHaveLength(1);
      expect(e.lines[0].account_id).toBe(1);
    });
  });

  it('exclut les écritures sans ligne pour le compte', () => {
    // Compte 4 n'apparaît que dans e3
    const result = applyFilters(all, { ...DEFAULT_FILTERS, accountId: 4 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});

describe('applyFilters — filtres combinés', () => {
  it('texte + compte', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, text: 'cotisation', accountId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].lines).toHaveLength(1);
    expect(result[0].lines[0].account_id).toBe(1);
  });

  it('dateFrom + compte', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateFrom: '2025-05-01', accountId: 1 });
    expect(result).toHaveLength(2); // e2 et e3 ont account_id=1
    result.forEach(e => {
      expect(e.lines.every(l => l.account_id === 1)).toBe(true);
    });
  });
});
