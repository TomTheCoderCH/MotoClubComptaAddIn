// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from '../../types';
import App from '../../App';

const mockAccounts: Account[] = [
  {
    id: 1, number: '100', name: 'Caisse', class: 1,
    type: 'ACTIF', normal_balance: 'DEBIT',
    description: null, must_be_zero_at_closing: false,
    is_closing_account: false, is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2, number: '300', name: 'Cotisations membres', class: 3,
    type: 'PRODUIT', normal_balance: 'CREDIT',
    description: null, must_be_zero_at_closing: false,
    is_closing_account: false, is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.stubGlobal('api', {
    getAccounts:        vi.fn().mockResolvedValue(mockAccounts),
    getActiveAccounts:  vi.fn().mockResolvedValue(mockAccounts),
    getFiscalYears:     vi.fn().mockResolvedValue([]),
    createFiscalYear:   vi.fn(),
    getJournalEntries:  vi.fn().mockResolvedValue([]),
    createJournalEntry: vi.fn(),
    getAccountBalances: vi.fn().mockResolvedValue([]),
    listBackups:        vi.fn().mockResolvedValue([]),
    exportBackup:       vi.fn().mockResolvedValue(null),
    getDbPath:          vi.fn().mockResolvedValue(''),
  });
});

describe('App — layout', () => {
  it('affiche la sidebar avec le nom de l\'application', () => {
    render(<App />);
    expect(screen.getByText('MCY Compta')).toBeInTheDocument();
  });

  it('affiche les 5 items de navigation', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Plan comptable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Journal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exercices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Soldes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toBeInTheDocument();
  });

  it('démarre sur la page Plan comptable', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Plan comptable' }))
      .toHaveAttribute('aria-current', 'page');
  });
});

describe('App — navigation', () => {
  it('affiche le plan comptable par défaut', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Plan comptable' })).toBeInTheDocument();
  });

  it('navigue vers Journal au clic', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
    expect(screen.getByRole('heading', { name: 'Journal' })).toBeInTheDocument();
  });

  it('navigue vers Exercices au clic', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Exercices' }));
    expect(screen.getByRole('heading', { name: 'Exercices' })).toBeInTheDocument();
  });

  it('navigue vers Soldes au clic', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Soldes' }));
    expect(screen.getByRole('heading', { name: 'Soldes' })).toBeInTheDocument();
  });
});

describe('App — AccountsPage', () => {
  it('affiche les comptes après chargement', async () => {
    render(<App />);
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
  });

  it('affiche le nombre de comptes', async () => {
    render(<App />);
    expect(await screen.findByText('2 comptes')).toBeInTheDocument();
  });

  it('affiche un message d\'erreur si l\'API échoue', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      getAccounts: vi.fn().mockRejectedValue(new Error('DB non disponible')),
    });
    render(<App />);
    expect(await screen.findByText(/DB non disponible/)).toBeInTheDocument();
  });
});
