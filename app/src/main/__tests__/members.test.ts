import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/mcy-test') },
}));

import {
  openDatabase, getDb, getAllAccounts, createFiscalYear, createJournalEntry,
  getAllMembers, createMember, updateMember, deleteMember,
  setHistoricalDues, recordPayment,
} from '../../db';
import type { MemberPayload, MemberPaymentPayload } from '../../types';

function freshDb() { openDatabase(':memory:'); }

function makeFy(): number {
  return createFiscalYear(2025).id;
}

function makeAccounts() {
  const accounts = getAllAccounts();
  return {
    a100: accounts.find(a => a.number === '100')!,
    a290: accounts.find(a => a.number === '290')!,
    a300: accounts.find(a => a.number === '300')!,
    a391: accounts.find(a => a.number === '391')!,
    a101: accounts.find(a => a.number === '101')!,
  };
}

function seedBalance(fyId: number, cents: number) {
  const { a100, a290 } = makeAccounts();
  createJournalEntry({
    fiscal_year_id: fyId, date: '2025-01-01', description: 'Solde à nouveau',
    lines: [{ account_id: a100.id, debit: cents }, { account_id: a290.id, credit: cents }],
  });
}

// ── createMember / updateMember / deleteMember ──────────────────────────────

describe('createMember', () => {
  beforeEach(freshDb);

  it('crée un membre avec les champs de base', () => {
    const m = createMember({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 });
    expect(m.id).toBeGreaterThan(0);
    expect(m.last_name).toBe('Merli');
    expect(m.first_name).toBe('Thomas');
    expect(m.is_active).toBe(1);
    expect(m.entry_date).toBeNull();
    expect(m.inactive_note).toBeNull();
  });

  it('crée un membre avec date d\'entrée et note', () => {
    const m = createMember({
      last_name: 'Dupont', first_name: 'Jean',
      entry_date: '2020-01-01', is_active: 0, inactive_note: 'Démission 2026',
    });
    expect(m.entry_date).toBe('2020-01-01');
    expect(m.is_active).toBe(0);
    expect(m.inactive_note).toBe('Démission 2026');
  });
});

describe('updateMember', () => {
  beforeEach(freshDb);

  it('met à jour le statut et la note', () => {
    const m = createMember({ last_name: 'A', first_name: 'B', is_active: 1 });
    const updated = updateMember(m.id, { last_name: 'A', first_name: 'B', is_active: 0, inactive_note: 'Parti' });
    expect(updated.is_active).toBe(0);
    expect(updated.inactive_note).toBe('Parti');
  });
});

describe('deleteMember', () => {
  beforeEach(freshDb);

  it('supprime un membre sans cotisations', () => {
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    deleteMember(m.id);
    expect(getAllMembers()).toHaveLength(0);
  });

  it('refuse de supprimer un membre avec des cotisations', () => {
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    setHistoricalDues(m.id, 2020, true, 'Raiff');
    expect(() => deleteMember(m.id)).toThrow('cotisations');
  });
});

describe('getAllMembers', () => {
  beforeEach(freshDb);

  it('retourne les membres triés par nom puis prénom', () => {
    createMember({ last_name: 'Zorro', first_name: 'A', is_active: 1 });
    createMember({ last_name: 'Achard', first_name: 'B', is_active: 1 });
    const all = getAllMembers();
    expect(all[0].last_name).toBe('Achard');
    expect(all[1].last_name).toBe('Zorro');
  });

  it('inclut les dues de chaque membre', () => {
    const m = createMember({ last_name: 'M', first_name: 'N', is_active: 1 });
    setHistoricalDues(m.id, 2023, true, 'Caisse');
    const all = getAllMembers();
    expect(all[0].dues).toHaveLength(1);
    expect(all[0].dues[0].year).toBe(2023);
    expect(all[0].dues[0].paid).toBe(1);
  });
});

// ── setHistoricalDues ────────────────────────────────────────────────────────

describe('setHistoricalDues', () => {
  beforeEach(freshDb);

  it('crée une ligne de cotisation historique', () => {
    const m = createMember({ last_name: 'A', first_name: 'B', is_active: 1 });
    const d = setHistoricalDues(m.id, 2022, true, 'Raiff');
    expect(d.paid).toBe(1);
    expect(d.payment_note).toBe('Raiff');
    expect(d.journal_entry_id).toBeNull();
  });

  it('upsert : met à jour si la ligne existe déjà', () => {
    const m = createMember({ last_name: 'A', first_name: 'B', is_active: 1 });
    setHistoricalDues(m.id, 2022, true, 'Raiff');
    const d = setHistoricalDues(m.id, 2022, false, null);
    expect(d.paid).toBe(0);
    expect(d.payment_note).toBeNull();
    const all = getAllMembers();
    expect(all[0].dues).toHaveLength(1); // toujours 1 ligne, pas 2
  });
});

// ── recordPayment ────────────────────────────────────────────────────────────

describe('recordPayment', () => {
  beforeEach(freshDb);

  it('paiement normal 30 CHF — crée écriture et dues', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    });
    expect(result.dues).toHaveLength(1);
    expect(result.dues[0].year).toBe(2025);
    expect(result.dues[0].paid).toBe(1);
    expect(result.dues[0].amount_cents).toBe(3000);
    expect(result.dues[0].journal_entry_id).toBe(result.journalEntryId);
  });

  it('paiement multi-années 60 CHF — 2 lignes dues, même journal_entry_id', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 6000, debit_account_id: a101.id, years: [2024, 2025],
    });
    expect(result.dues).toHaveLength(2);
    expect(result.dues[0].journal_entry_id).toBe(result.dues[1].journal_entry_id);
  });

  it('surplus 40 CHF — écriture avec ligne 391', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a100, a300, a391 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 4000, debit_account_id: a100.id, years: [2025],
    });
    expect(result.dues).toHaveLength(1);
    // Vérifier que l'écriture a 3 lignes (débit 100, crédit 300, crédit 391)
    const lines = getDb().prepare(
      'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?'
    ).all(result.journalEntryId) as Array<{ account_id: number; debit: number | null; credit: number | null }>;
    expect(lines).toHaveLength(3);
    const credit391 = lines.find(l => l.account_id === a391.id);
    expect(credit391?.credit).toBe(1000);
    const credit300 = lines.find(l => l.account_id === a300.id);
    expect(credit300?.credit).toBe(3000);
  });

  it('paiement en avance pour année future (2026) — pas d\'exercice requis pour l\'année couverte', () => {
    const fyId = makeFy(); // exercice 2025
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    // payment_date en 2025 mais year=2026
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-12-01',
      total_amount_cents: 6000, debit_account_id: a101.id, years: [2025, 2026],
    });
    expect(result.dues).toHaveLength(2);
    const due2026 = result.dues.find(d => d.year === 2026);
    expect(due2026?.paid).toBe(1);
  });

  it('échoue si exercice de paiement absent de la DB', () => {
    openDatabase(':memory:'); // DB vide, pas d'exercice
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    expect(() => recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    })).toThrow('exercice');
  });

  it('échoue si montant insuffisant pour les années sélectionnées', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    expect(() => recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2024, 2025],
    })).toThrow('insuffisant');
  });

  it('échoue si une année est déjà marquée payée', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'X', first_name: 'Y', is_active: 1 });
    recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    });
    expect(() => recordPayment({
      member_id: m.id, payment_date: '2025-04-01',
      total_amount_cents: 3000, debit_account_id: a101.id, years: [2025],
    })).toThrow('déjà');
  });

  it('libellé écriture = "Cotisation Prénom Nom — années"', () => {
    const fyId = makeFy();
    seedBalance(fyId, 100000);
    const { a101 } = makeAccounts();
    const m = createMember({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 });
    const result = recordPayment({
      member_id: m.id, payment_date: '2025-03-01',
      total_amount_cents: 6000, debit_account_id: a101.id, years: [2024, 2025],
    });
    const entry = getDb().prepare(
      'SELECT description FROM journal_entries WHERE id = ?'
    ).get(result.journalEntryId) as { description: string };
    expect(entry.description).toBe('Cotisation Thomas Merli — 2024+2025');
  });
});
