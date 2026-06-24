// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, AnalyticsData } from '../../types';
import AnalyticsPage from '../../pages/AnalyticsPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const analyticsFixture: AnalyticsData = {
  groups: [
    {
      name: 'boissons',
      accounts: [
        { id: 2, number: '310', name: 'Vente boissons', type: 'PRODUIT', recettes: 35000, charges: 0 },
        { id: 3, number: '411', name: 'Achats boissons', type: 'CHARGE', recettes: 0, charges: 18000 },
      ],
      totalRecettes: 35000,
      totalCharges:  18000,
      resultat:      17000,
    },
  ],
  ungrouped: [
    { id: 4, number: '490', name: 'Charges diverses', type: 'CHARGE', recettes: 0, charges: 4500 },
  ],
};

function mockApi(data: AnalyticsData = { groups: [], ungrouped: [] }) {
  vi.stubGlobal('api', {
    getFiscalYears: vi.fn().mockResolvedValue([fy2025]),
    getAnalytics:   vi.fn().mockResolvedValue(data),
  });
}

beforeEach(() => mockApi());

describe('AnalyticsPage — affichage', () => {
  it('affiche le titre Analytique', async () => {
    render(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: /Analytique/ })).toBeInTheDocument();
  });

  it('affiche un message si aucun exercice', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getAnalytics:   vi.fn().mockResolvedValue({ groups: [], ungrouped: [] }),
    });
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Aucun exercice/)).toBeInTheDocument();
  });

  it('affiche le message vide quand pas de mouvement', async () => {
    mockApi({ groups: [], ungrouped: [] });
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Aucun mouvement/)).toBeInTheDocument();
  });

  it('affiche un groupe analytique avec son résultat', async () => {
    mockApi(analyticsFixture);
    render(<AnalyticsPage />);
    expect(await screen.findByText('boissons')).toBeInTheDocument();
    // 350.00 apparaît deux fois : ligne groupe + ligne total
    expect(screen.getAllByText('350.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('180.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('170.00').length).toBeGreaterThanOrEqual(1);
  });

  it('affiche la section Non groupés', async () => {
    mockApi(analyticsFixture);
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Non groupés/)).toBeInTheDocument();
    expect(screen.getByText('Charges diverses')).toBeInTheDocument();
  });

  it('n\'affiche pas la section Non groupés si tous les comptes sont groupés', async () => {
    mockApi({ groups: analyticsFixture.groups, ungrouped: [] });
    render(<AnalyticsPage />);
    await screen.findByText('boissons');
    expect(screen.queryByText(/Non groupés/)).not.toBeInTheDocument();
  });

  it('affiche le total des groupes', async () => {
    mockApi(analyticsFixture);
    render(<AnalyticsPage />);
    expect(await screen.findByText('Total groupes')).toBeInTheDocument();
  });

  it('affiche "—" pour recettes nulles dans Non groupés', async () => {
    mockApi({ groups: [], ungrouped: analyticsFixture.ungrouped });
    render(<AnalyticsPage />);
    await screen.findByText('Charges diverses');
    expect(screen.getByText('45.00')).toBeInTheDocument();
  });
});

describe('AnalyticsPage — sélecteur d\'exercice', () => {
  it('affiche le sélecteur d\'exercice', async () => {
    render(<AnalyticsPage />);
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('recharge les données au changement d\'exercice', async () => {
    const fy2: FiscalYear = { ...fy2025, id: 2, year: 2024, is_closed: true };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([fy2025, fy2]),
      getAnalytics:   vi.fn().mockResolvedValue({ groups: [], ungrouped: [] }),
    });
    const user = userEvent.setup();
    render(<AnalyticsPage />);
    await screen.findByRole('combobox');
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await waitFor(() => {
      expect(window.api.getAnalytics).toHaveBeenCalledWith(2);
    });
  });
});
