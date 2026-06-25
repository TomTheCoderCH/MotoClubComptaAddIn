// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../../types';
import JournalPage from '../../pages/JournalPage';

const fy: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '',
};
const fyClosed: FiscalYear = {
  id: 2, year: 2024, start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '',
};

const accounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse',             class: 1, type: 'ACTIF',   normal_balance: 'DEBIT',  description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
  { id: 2, number: '300', name: 'Cotisations membres', class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
];

type Entry = JournalEntry & { lines: JournalEntryLine[] };

const entry1: Entry = {
  id: 1, fiscal_year_id: 1, date: '2025-03-01', description: 'Cotisation membre', piece: 'P-001',
  is_opening_balance: false, is_closing_entry: false, created_at: '', updated_at: '',
  lines: [
    { id: 1, journal_entry_id: 1, account_id: 1, debit: 3000,  credit: null, created_at: '' },
    { id: 2, journal_entry_id: 1, account_id: 2, debit: null,  credit: 3000, created_at: '' },
  ],
};
const entry2: Entry = {
  id: 2, fiscal_year_id: 1, date: '2025-05-15', description: 'Assurance AXA', piece: null,
  is_opening_balance: false, is_closing_entry: false, created_at: '', updated_at: '',
  lines: [
    { id: 3, journal_entry_id: 2, account_id: 2, debit: 18000, credit: null, created_at: '' },
    { id: 4, journal_entry_id: 2, account_id: 1, debit: null,  credit: 18000, created_at: '' },
  ],
};

function mockApi(entries: Entry[] = [entry1, entry2]) {
  vi.stubGlobal('api', {
    getFiscalYears:      vi.fn().mockResolvedValue([fy]),
    getActiveAccounts:   vi.fn().mockResolvedValue(accounts),
    getJournalEntries:   vi.fn().mockResolvedValue(entries),
    updateJournalEntry:  vi.fn().mockResolvedValue({ id: 1 }),
    deleteJournalEntry:  vi.fn().mockResolvedValue(undefined),
    createJournalEntry:  vi.fn().mockResolvedValue({ id: 99 }),
  });
}

beforeEach(() => mockApi());

describe('JournalPage — filtres', () => {
  it('affiche les filtres quand des écritures existent', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    expect(screen.getByRole('textbox', { name: /libellé/i })).toBeInTheDocument();
  });

  it('filtre par texte (libellé)', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.type(screen.getByRole('textbox', { name: /libellé/i }), 'Assurance');
    expect(screen.queryByText('Cotisation membre')).not.toBeInTheDocument();
    expect(screen.getByText('Assurance AXA')).toBeInTheDocument();
  });

  it('filtre par compte (vue grand-livre)', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /compte/i }),
      screen.getByRole('option', { name: /Caisse/ }),
    );
    // entry1 : seule la ligne débit (compte 1) reste
    // entry2 : seule la ligne crédit (compte 1) reste
    // Les deux écritures restent visibles
    expect(screen.getByText('Cotisation membre')).toBeInTheDocument();
    expect(screen.getByText('Assurance AXA')).toBeInTheDocument();
    // La ligne "Cotisations membres" (compte 2) ne doit plus apparaître
    expect(screen.queryByText('300')).not.toBeInTheDocument();
  });
});

describe('JournalPage — boutons Modifier et Supprimer', () => {
  it('affiche les boutons Modifier et Supprimer sur un exercice ouvert', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Supprimer' })).toHaveLength(2);
  });

  it('n\'affiche pas les boutons Modifier/Supprimer sur un exercice clôturé', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:    vi.fn().mockResolvedValue([fyClosed]),
      getActiveAccounts: vi.fn().mockResolvedValue(accounts),
      getJournalEntries: vi.fn().mockResolvedValue([entry1]),
      deleteJournalEntry: vi.fn(),
      updateJournalEntry: vi.fn(),
    });
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('clic Modifier ouvre la modale avec l\'écriture pré-remplie', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé *')).toHaveValue('Cotisation membre');
  });

  it('clic Supprimer ouvre la boîte de confirmation', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('confirmer la suppression appelle deleteJournalEntry', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => {
      expect(window.api.deleteJournalEntry).toHaveBeenCalledWith(1);
    });
  });
});

describe('JournalPage — bouton + Nouvelle écriture', () => {
  it('ouvre la modale vide au clic sur + Nouvelle écriture', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getByRole('button', { name: /Nouvelle écriture/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Nouvelle écriture/);
  });
});

describe('JournalPage — toast de confirmation', () => {
  it('affiche "Écriture modifiée" après enregistrement en mode édition', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await screen.findByRole('status');
    expect(screen.getByRole('status')).toHaveTextContent('Écriture modifiée');
  });

  it('affiche "Écriture enregistrée" après création', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getByRole('button', { name: /Nouvelle écriture/ }));
    const dateInput = screen.getByLabelText('Date *');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2025-06-15');
    await userEvent.type(screen.getByLabelText('Libellé *'), 'Test écriture');
    await userEvent.type(screen.getByLabelText('Débit ligne 1'), '30.00');
    await userEvent.type(screen.getByLabelText('Crédit ligne 2'), '30.00');
    await userEvent.selectOptions(screen.getByLabelText('Compte ligne 1'), '1');
    await userEvent.selectOptions(screen.getByLabelText('Compte ligne 2'), '2');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await screen.findByRole('status');
    expect(screen.getByRole('status')).toHaveTextContent('Écriture enregistrée');
  });
});
