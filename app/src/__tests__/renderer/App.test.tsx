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
    description: null, account_group: null, must_be_zero_at_closing: false,
    is_closing_account: false, is_active: true, has_entries: false,
    created_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2, number: '300', name: 'Cotisations membres', class: 3,
    type: 'PRODUIT', normal_balance: 'CREDIT',
    description: null, account_group: null, must_be_zero_at_closing: false,
    is_closing_account: false, is_active: true, has_entries: false,
    created_at: '2025-01-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.stubGlobal('api', {
    getSettings:        vi.fn().mockResolvedValue({ dataDir: '/data' }),
    getAccounts:        vi.fn().mockResolvedValue(mockAccounts),
    getActiveAccounts:  vi.fn().mockResolvedValue(mockAccounts),
    getFiscalYears:     vi.fn().mockResolvedValue([]),
    getDashboardData:   vi.fn().mockResolvedValue({ cashBalances: [], netResultCents: 0 }),
    createFiscalYear:   vi.fn(),
    getJournalEntries:  vi.fn().mockResolvedValue([]),
    createJournalEntry: vi.fn(),
    getAccountBalances: vi.fn().mockResolvedValue([]),
    listBackups:        vi.fn().mockResolvedValue([]),
    exportBackup:       vi.fn().mockResolvedValue(null),
    getDbPath:          vi.fn().mockResolvedValue(''),
    chooseDataDir:      vi.fn().mockResolvedValue(null),
    changeDataDir:      vi.fn().mockResolvedValue(null),
  });
});

describe('App — layout', () => {
  it('affiche la sidebar avec le nom de l\'application', async () => {
    render(<App />);
    expect(await screen.findByText('MCY Compta')).toBeInTheDocument();
  });

  it('affiche les 7 items de navigation', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Accueil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plan comptable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Journal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exercices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Soldes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analytique' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toBeInTheDocument();
  });

  it('démarre sur la page Accueil (tableau de bord)', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Accueil' }))
      .toHaveAttribute('aria-current', 'page');
  });
});

describe('App — navigation', () => {
  it('affiche le tableau de bord par défaut', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
  });

  it('navigue vers Plan comptable au clic', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: 'Plan comptable' });
    await userEvent.click(btn);
    expect(screen.getByRole('heading', { name: 'Plan comptable' })).toBeInTheDocument();
  });

  it('navigue vers Journal au clic', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: 'Journal' });
    await userEvent.click(btn);
    expect(screen.getByRole('heading', { name: 'Journal' })).toBeInTheDocument();
  });

  it('navigue vers Exercices au clic', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: 'Exercices' });
    await userEvent.click(btn);
    expect(screen.getByRole('heading', { name: 'Exercices' })).toBeInTheDocument();
  });

  it('navigue vers Soldes au clic', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: 'Soldes' });
    await userEvent.click(btn);
    expect(screen.getByRole('heading', { name: 'Soldes' })).toBeInTheDocument();
  });
});

describe('App — AccountsPage', () => {
  it('affiche les comptes après navigation vers Plan comptable', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Plan comptable' }));
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
  });

  it('affiche le nombre de comptes après navigation', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Plan comptable' }));
    expect(await screen.findByText('2 comptes')).toBeInTheDocument();
  });

  it('affiche un message d\'erreur si l\'API échoue', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      getAccounts: vi.fn().mockRejectedValue(new Error('DB non disponible')),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Plan comptable' }));
    expect(await screen.findByText(/DB non disponible/)).toBeInTheDocument();
  });
});

describe('App — premier lancement', () => {
  it('affiche WelcomePage si getSettings() retourne null', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      getSettings: vi.fn().mockResolvedValue(null),
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Bienvenue dans MCY Compta' })).toBeInTheDocument();
  });

  it("n'affiche pas la sidebar sur WelcomePage", async () => {
    vi.stubGlobal('api', {
      ...window.api,
      getSettings: vi.fn().mockResolvedValue(null),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Bienvenue dans MCY Compta' });
    expect(screen.queryByRole('button', { name: 'Plan comptable' })).not.toBeInTheDocument();
  });
});
