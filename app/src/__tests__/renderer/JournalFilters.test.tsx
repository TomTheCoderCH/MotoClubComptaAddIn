// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { Account, JournalFilters as Filters } from '../../types';
import { DEFAULT_FILTERS } from '../../types';
import JournalFilters from '../../components/JournalFilters';

const accounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse',             class: 1, type: 'ACTIF',   normal_balance: 'DEBIT',  description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
  { id: 2, number: '300', name: 'Cotisations membres', class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
];

// Composant wrapper pour gérer l'état
function JournalFiltersWrapper() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  return <JournalFilters filters={filters} accounts={accounts} onChange={setFilters} />;
}

describe('JournalFilters', () => {
  it('affiche le champ de recherche texte', () => {
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /libellé/i })).toBeInTheDocument();
  });

  it('affiche le sélecteur de compte avec "Tous les comptes"', () => {
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /compte/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tous les comptes' })).toBeInTheDocument();
  });

  it('affiche les champs date de début et date de fin', () => {
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Date de début')).toBeInTheDocument();
    expect(screen.getByLabelText('Date de fin')).toBeInTheDocument();
  });

  it('met à jour le texte de recherche après saisie', async () => {
    render(<JournalFiltersWrapper />);
    await userEvent.type(screen.getByRole('textbox', { name: /libellé/i }), 'AXA');
    expect(screen.getByRole('textbox', { name: /libellé/i })).toHaveValue('AXA');
  });

  it('appelle onChange avec accountId mis à jour', async () => {
    const onChange = vi.fn();
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={onChange} />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /compte/i }),
      screen.getByRole('option', { name: /Caisse/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: 1 }));
  });

  it('le bouton Réinitialiser rappelle onChange avec DEFAULT_FILTERS', async () => {
    const onChange = vi.fn();
    render(<JournalFilters filters={{ ...DEFAULT_FILTERS, text: 'test' }} accounts={accounts} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Réinitialiser/i }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });
});
