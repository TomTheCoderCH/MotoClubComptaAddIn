// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, DashboardData } from '../../types';
import DashboardPage from '../../pages/DashboardPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const dashData: DashboardData = {
  cashBalances: [
    { number: '100', name: 'Caisse',      solde: 123456 },
    { number: '101', name: 'Raiffeisen',  solde: 567890 },
  ],
  netResultCents: 33704,
};

function mockApi(data: DashboardData = { cashBalances: [], netResultCents: 0 }) {
  vi.stubGlobal('api', {
    getFiscalYears:    vi.fn().mockResolvedValue([fy2025]),
    getDashboardData:  vi.fn().mockResolvedValue(data),
  });
}

beforeEach(() => mockApi());

describe('DashboardPage — affichage', () => {
  it('affiche le titre Tableau de bord', async () => {
    render(<DashboardPage />);
    expect(await screen.findByRole('heading', { name: /Tableau de bord/ })).toBeInTheDocument();
  });

  it('affiche le message si aucun exercice', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:   vi.fn().mockResolvedValue([]),
      getDashboardData: vi.fn(),
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/Aucun exercice/)).toBeInTheDocument();
  });

  it('affiche les 4 cartes (Caisse, Raiffeisen, Twint, Résultat)', async () => {
    mockApi(dashData);
    render(<DashboardPage />);
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Raiffeisen')).toBeInTheDocument();
    expect(screen.getByText('Twint')).toBeInTheDocument();
    expect(screen.getByText('Résultat')).toBeInTheDocument();
  });

  it('affiche CHF 0.00 pour Twint si aucun mouvement', async () => {
    mockApi(dashData);
    render(<DashboardPage />);
    await screen.findByText('Twint');
    // Twint n'est pas dans cashBalances → doit afficher 0.00
    const twintCard = screen.getByText('Twint').closest('div')!.parentElement!;
    expect(twintCard).toHaveTextContent('CHF 0.00');
  });

  it('affiche le solde Caisse correctement formaté', async () => {
    mockApi(dashData);
    render(<DashboardPage />);
    expect(await screen.findByText('CHF 1234.56')).toBeInTheDocument();
  });

  it('affiche le résultat avec signe + si positif', async () => {
    mockApi(dashData);
    render(<DashboardPage />);
    expect(await screen.findByText(/\+ CHF 337\.04/)).toBeInTheDocument();
  });

  it('affiche le résultat avec signe − si négatif', async () => {
    mockApi({ cashBalances: [], netResultCents: -15000 });
    render(<DashboardPage />);
    expect(await screen.findByText(/− CHF 150\.00/)).toBeInTheDocument();
  });

  it('affiche CHF 0.00 sans signe si résultat nul', async () => {
    mockApi({ cashBalances: [], netResultCents: 0 });
    render(<DashboardPage />);
    await screen.findByText('Résultat');
    const résultatCard = screen.getByText('Résultat').closest('div')!.parentElement!;
    expect(résultatCard).toHaveTextContent('CHF 0.00');
    expect(résultatCard).not.toHaveTextContent('+ CHF');
    expect(résultatCard).not.toHaveTextContent('− CHF');
  });

  it('affiche le badge "Exercice clôturé" pour un exercice fermé', async () => {
    const closedFy: FiscalYear = { ...fy2025, is_closed: true };
    vi.stubGlobal('api', {
      getFiscalYears:   vi.fn().mockResolvedValue([closedFy]),
      getDashboardData: vi.fn().mockResolvedValue(dashData),
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/Exercice clôturé/)).toBeInTheDocument();
  });
});

describe('DashboardPage — sélecteur exercice', () => {
  it('affiche le sélecteur d\'exercice', async () => {
    render(<DashboardPage />);
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('recharge les données au changement d\'exercice', async () => {
    const fy2: FiscalYear = { ...fy2025, id: 2, year: 2024, is_closed: true };
    vi.stubGlobal('api', {
      getFiscalYears:   vi.fn().mockResolvedValue([fy2025, fy2]),
      getDashboardData: vi.fn().mockResolvedValue({ cashBalances: [], netResultCents: 0 }),
    });
    const user = userEvent.setup();
    render(<DashboardPage />);
    await screen.findByRole('combobox');
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await waitFor(() => {
      expect(window.api.getDashboardData).toHaveBeenCalledWith(2);
    });
  });
});
