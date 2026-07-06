import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPaid, isArrears } from '../lib/members';
import type { MemberWithDues } from '../types';

function makeMember(overrides: Partial<MemberWithDues> = {}): MemberWithDues {
  return {
    id: 1, last_name: 'Test', first_name: 'Membre',
    entry_date: null, is_active: 1, inactive_note: null, created_at: '',
    dues: [],
    ...overrides,
  };
}

describe('isPaid', () => {
  it('retourne true si une cotisation payée existe pour cette année', () => {
    const m = makeMember({
      dues: [{ id: 1, member_id: 1, year: 2024, paid: 1, payment_note: null,
               payment_date: '2024-03-01', amount_cents: 3000, journal_entry_id: 1, created_at: '' }],
    });
    expect(isPaid(m, 2024)).toBe(true);
  });

  it('retourne false si aucune cotisation payée pour cette année', () => {
    const m = makeMember({ dues: [] });
    expect(isPaid(m, 2024)).toBe(false);
  });

  it('retourne false si la cotisation existe mais paid=0', () => {
    const m = makeMember({
      dues: [{ id: 1, member_id: 1, year: 2024, paid: 0, payment_note: null,
               payment_date: null, amount_cents: null, journal_entry_id: null, created_at: '' }],
    });
    expect(isPaid(m, 2024)).toBe(false);
  });
});

describe('isArrears', () => {
  afterEach(() => vi.restoreAllMocks());

  it('signale une année non future si entry_date est absente', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: null });
    expect(isArrears(m, 2024)).toBe(true);
  });

  it('ne signale jamais une année future, même sans entry_date', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: null });
    expect(isArrears(m, 2027)).toBe(false);
  });

  it('ne signale pas une année antérieure à entry_date', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: '2022-06-01' });
    expect(isArrears(m, 2020)).toBe(false);
  });

  it('signale une année égale ou postérieure à entry_date', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: '2022-06-01' });
    expect(isArrears(m, 2022)).toBe(true);
    expect(isArrears(m, 2024)).toBe(true);
  });
});
