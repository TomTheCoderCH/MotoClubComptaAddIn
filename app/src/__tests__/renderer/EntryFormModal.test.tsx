// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../../types';
import EntryFormModal from '../../components/EntryFormModal';

const fy: FiscalYear = {
  id: 1, year: 2025,
  start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '',
};

const accounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse', class: 1, type: 'ACTIF', normal_balance: 'DEBIT', description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
];

const editEntry: JournalEntry & { lines: JournalEntryLine[] } = {
  id: 42, fiscal_year_id: 1, date: '2025-04-10', description: 'Test', piece: null,
  is_opening_balance: false, is_closing_entry: false, created_at: '', updated_at: '',
  lines: [
    { id: 1, journal_entry_id: 42, account_id: 1, debit: 3000, credit: null, created_at: '' },
    { id: 2, journal_entry_id: 42, account_id: 1, debit: null, credit: 3000, created_at: '' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createJournalEntry: vi.fn().mockResolvedValue({ id: 1 }),
    updateJournalEntry: vi.fn().mockResolvedValue({ id: 42 }),
  });
});

describe('EntryFormModal', () => {
  it('affiche le titre "Nouvelle écriture" en mode création', () => {
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Nouvelle écriture/);
  });

  it('affiche le titre "Modifier l\'écriture" en mode édition', () => {
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} editEntry={editEntry} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Modifier l'écriture/);
  });

  it('le bouton ✕ appelle onClose', async () => {
    const onClose = vi.fn();
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clic sur le fond extérieur ne ferme pas la modale', () => {
    const onClose = vi.fn();
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a role="dialog" et aria-modal="true"', () => {
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
