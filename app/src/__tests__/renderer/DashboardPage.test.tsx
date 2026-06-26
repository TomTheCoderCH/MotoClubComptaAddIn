// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, DashboardData, Account, TwintSummary } from '../../types';
import DashboardPage from '../../pages/DashboardPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const dashData: DashboardData = {
  cashBalances: [
    { number: '100', name: 'Caisse',     solde: 123456 },
    { number: '101', name: 'Raiffeisen', solde: 567890 },
  ],
  netResultCents: 33704,
  customCards: [],
};

const mockAccountAvances: Account = {
  id: 5, number: '103', name: 'Avances caissier', class: 1,
  type: 'ACTIF', normal_balance: 'DEBIT',
  description: null, account_group: null,
  must_be_zero_at_closing: true, is_closing_account: false,
  is_active: true, has_entries: false, created_at: '',
};

const mockAccountMarche: Account = {
  id: 10, number: '330', name: 'Marché Villageois', class: 3,
  type: 'PRODUIT', normal_balance: 'CREDIT',
  description: null, account_group: 'Marché Villageois',
  must_be_zero_at_closing: false, is_closing_account: false,
  is_active: true, has_entries: false, created_at: '',
};

const noTwint: TwintSummary = { grossCents: 0, feesCents: 0, netCents: 0, ratePercent: 0 };

function mockApi(
  data: DashboardData = { cashBalances: [], netResultCents: 0, customCards: [] },
  cards = [],
  twint: TwintSummary = noTwint,
) {
  vi.stubGlobal('api', {
    getSettings:        vi.fn().mockResolvedValue({ dataDir: '/data', dashboardCards: cards }),
    getFiscalYears:     vi.fn().mockResolvedValue([fy2025]),
    getDashboardData:   vi.fn().mockResolvedValue(data),
    getTwintSummary:    vi.fn().mockResolvedValue(twint),
    getActiveAccounts:  vi.fn().mockResolvedValue([mockAccountAvances, mockAccountMarche]),
    saveDashboardCards: vi.fn().mockResolvedValue(undefined),
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
      getSettings:        vi.fn().mockResolvedValue({ dataDir: '/data' }),
      getFiscalYears:     vi.fn().mockResolvedValue([]),
      getDashboardData:   vi.fn(),
      getTwintSummary:    vi.fn().mockResolvedValue(noTwint),
      getActiveAccounts:  vi.fn().mockResolvedValue([]),
      saveDashboardCards: vi.fn(),
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/Aucun exercice/)).toBeInTheDocument();
  });

  it('affiche les 4 cartes fixes (Caisse, Raiffeisen, Twint, Résultat)', async () => {
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
    const twintCard = screen.getByText('Twint').closest('div')!.parentElement!;
    expect(twintCard).toHaveTextContent('CHF 0.00');
  });

  it('affiche le solde Caisse correctement formaté', async () => {
    mockApi(dashData);
    render(<DashboardPage />);
    expect(await screen.findByText("CHF 1'234.56")).toBeInTheDocument();
  });

  it('affiche le résultat avec signe + si positif', async () => {
    mockApi(dashData);
    render(<DashboardPage />);
    expect(await screen.findByText(/\+ CHF 337\.04/)).toBeInTheDocument();
  });

  it('affiche le résultat avec signe − si négatif', async () => {
    mockApi({ cashBalances: [], netResultCents: -15000, customCards: [] });
    render(<DashboardPage />);
    expect(await screen.findByText(/− CHF 150\.00/)).toBeInTheDocument();
  });

  it('affiche CHF 0.00 sans signe si résultat nul', async () => {
    mockApi({ cashBalances: [], netResultCents: 0, customCards: [] });
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
      getSettings:        vi.fn().mockResolvedValue({ dataDir: '/data' }),
      getFiscalYears:     vi.fn().mockResolvedValue([closedFy]),
      getDashboardData:   vi.fn().mockResolvedValue(dashData),
      getTwintSummary:    vi.fn().mockResolvedValue(noTwint),
      getActiveAccounts:  vi.fn().mockResolvedValue([]),
      saveDashboardCards: vi.fn(),
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
      getSettings:        vi.fn().mockResolvedValue({ dataDir: '/data' }),
      getFiscalYears:     vi.fn().mockResolvedValue([fy2025, fy2]),
      getDashboardData:   vi.fn().mockResolvedValue({ cashBalances: [], netResultCents: 0, customCards: [] }),
      getTwintSummary:    vi.fn().mockResolvedValue(noTwint),
      getActiveAccounts:  vi.fn().mockResolvedValue([]),
      saveDashboardCards: vi.fn(),
    });
    const user = userEvent.setup();
    render(<DashboardPage />);
    await screen.findByRole('combobox');
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await waitFor(() => {
      expect(window.api.getDashboardData).toHaveBeenCalledWith(2, expect.any(Array));
    });
  });
});

describe('DashboardPage — cartes personnalisées', () => {
  it('affiche une carte compte personnalisée', async () => {
    const data: DashboardData = {
      ...dashData,
      customCards: [{
        key: 'account-5', label: 'Avances caissier', subLabel: '103',
        valueCents: 5000, isResult: false,
      }],
    };
    mockApi(data, [{ type: 'account', accountId: 5 }]);
    render(<DashboardPage />);
    expect(await screen.findByText('Avances caissier')).toBeInTheDocument();
    expect(await screen.findByText('CHF 50.00')).toBeInTheDocument();
  });

  it('affiche une carte groupe avec signe P&L', async () => {
    const data: DashboardData = {
      ...dashData,
      customCards: [{
        key: 'group-Marché', label: 'Marché', subLabel: 'Analytique',
        valueCents: 161800, isResult: true,
      }],
    };
    mockApi(data, [{ type: 'group', groupName: 'Marché' }]);
    render(<DashboardPage />);
    expect(await screen.findByText('Marché')).toBeInTheDocument();
    expect(await screen.findByText(/\+ CHF 1'618\.00/)).toBeInTheDocument();
  });

  it('affiche le bouton "+" pour ajouter une carte', async () => {
    render(<DashboardPage />);
    expect(await screen.findByRole('button', { name: /Ajouter/ })).toBeInTheDocument();
  });

  it('ouvre le modal d\'ajout au clic sur "+"', async () => {
    render(<DashboardPage />);
    const btn = await screen.findByRole('button', { name: /Ajouter/ });
    await userEvent.click(btn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('le bouton × supprime la carte et appelle saveDashboardCards', async () => {
    const card = { type: 'account' as const, accountId: 5 };
    const data: DashboardData = {
      ...dashData,
      customCards: [{
        key: 'account-5', label: 'Avances caissier', subLabel: '103',
        valueCents: 0, isResult: false,
      }],
    };
    mockApi(data, [card]);
    render(<DashboardPage />);
    await screen.findByText('Avances caissier');
    const removeBtn = screen.getByRole('button', { name: /Supprimer Avances caissier/ });
    await userEvent.click(removeBtn);
    await waitFor(() => {
      expect(window.api.saveDashboardCards).toHaveBeenCalledWith([]);
    });
  });
});

describe('DashboardPage — panel Twint', () => {
  it('masque le panel si aucun mouvement Twint (gross = 0)', async () => {
    mockApi(dashData, [], noTwint);
    render(<DashboardPage />);
    await screen.findByText('Tableau de bord');
    expect(screen.queryByText('Twint — Récapitulatif')).not.toBeInTheDocument();
  });

  it('affiche le panel avec les 3 lignes si gross > 0', async () => {
    const twint: TwintSummary = { grossCents: 123456, feesCents: 1605, netCents: 121851, ratePercent: 1.30 };
    mockApi(dashData, [], twint);
    render(<DashboardPage />);
    expect(await screen.findByText('Twint — Récapitulatif')).toBeInTheDocument();
    expect(screen.getByText('Encaissements bruts')).toBeInTheDocument();
    expect(screen.getByText(/1\.30 %/)).toBeInTheDocument();
    expect(screen.getByText('Net versé sur Raiffeisen')).toBeInTheDocument();
  });

  it('affiche les montants CHF corrects', async () => {
    const twint: TwintSummary = { grossCents: 234500, feesCents: 3050, netCents: 231450, ratePercent: 1.30 };
    mockApi(dashData, [], twint);
    render(<DashboardPage />);
    await screen.findByText('Twint — Récapitulatif');
    expect(screen.getByText("CHF 2'345.00")).toBeInTheDocument();
    expect(screen.getByText('− CHF 30.50')).toBeInTheDocument();
    expect(screen.getByText("CHF 2'314.50")).toBeInTheDocument();
  });
});

describe('DashboardPage — modal ajout carte', () => {
  async function openModal() {
    render(<DashboardPage />);
    const btn = await screen.findByRole('button', { name: /Ajouter/ });
    await userEvent.click(btn);
  }

  it('affiche les deux options Compte et Groupe analytique', async () => {
    await openModal();
    expect(screen.getByRole('radio', { name: /Compte/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Groupe analytique/ })).toBeInTheDocument();
  });

  it('annuler ferme le modal', async () => {
    await openModal();
    await userEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sélection Compte montre la liste des comptes', async () => {
    await openModal();
    await userEvent.click(screen.getByRole('radio', { name: /Compte/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('combobox')).toBeInTheDocument();
    expect(within(dialog).getByText(/Avances caissier/)).toBeInTheDocument();
  });

  it('sélection Groupe montre la liste des groupes', async () => {
    await openModal();
    await userEvent.click(screen.getByRole('radio', { name: /Groupe analytique/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('combobox')).toBeInTheDocument();
    expect(within(dialog).getByText('Marché Villageois')).toBeInTheDocument();
  });
});
