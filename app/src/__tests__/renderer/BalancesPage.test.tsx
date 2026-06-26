// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, AccountBalance } from '../../types';
import BalancesPage from '../../pages/BalancesPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025,
  start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '',
};
const fy2024: FiscalYear = {
  id: 2, year: 2024,
  start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '',
};

const balancesFixture: AccountBalance[] = [
  { id: 1, number: '100', name: 'Caisse',              class: 1, total_debit: 120000, total_credit: 80000, solde: 40000 },
  { id: 5, number: '300', name: 'Cotisations membres', class: 3, total_debit: 0,      total_credit: 141000, solde: 141000 },
];

function mockApi(years: FiscalYear[] = [], balances: AccountBalance[] = []) {
  vi.stubGlobal('api', {
    getFiscalYears:     vi.fn().mockResolvedValue(years),
    getAccountBalances: vi.fn().mockResolvedValue(balances),
  });
}

beforeEach(() => mockApi());

describe('BalancesPage — affichage', () => {
  it('affiche le titre Soldes', async () => {
    render(<BalancesPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Soldes' })).toBeInTheDocument();
  });

  it('affiche le message vide sans exercice', async () => {
    render(<BalancesPage />);
    expect(await screen.findByText(/Aucun exercice disponible/)).toBeInTheDocument();
  });

  it('affiche le message vide sans mouvement', async () => {
    mockApi([fy2025], []);
    render(<BalancesPage />);
    expect(await screen.findByText(/Aucun mouvement pour cet exercice/)).toBeInTheDocument();
  });

  it('affiche le sélecteur d\'exercice quand des exercices existent', async () => {
    mockApi([fy2025], []);
    render(<BalancesPage />);
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('affiche les comptes groupés par classe', async () => {
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    // Le label de classe apparaît en <td> dans le tableau ET en <option> dans le filtre
    expect(await screen.findAllByText('Classe 1 — Actifs')).not.toHaveLength(0);
    expect(screen.getAllByText('Classe 3 — Produits')).not.toHaveLength(0);
    expect(screen.getByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
  });

  it('affiche les sous-totaux par classe', async () => {
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    await screen.findAllByText('Classe 1 — Actifs');
    // Sous-total classe 1 : débit 1'200.00, solde 400.00
    // Ces valeurs apparaissent aussi sur la ligne Caisse → getAllByText
    expect(screen.getAllByText("1'200.00")).toHaveLength(2); // ligne + sous-total
    expect(screen.getAllByText('400.00')).toHaveLength(2);
  });

  it('sélectionne automatiquement le premier exercice ouvert', async () => {
    mockApi([fy2024, fy2025], balancesFixture);
    render(<BalancesPage />);
    await waitFor(() => {
      // fy2025 (id=1) est ouvert → doit être sélectionné en priorité
      expect(window.api.getAccountBalances).toHaveBeenCalledWith(1);
    });
  });

  it('recharge les soldes au changement d\'exercice', async () => {
    const user = userEvent.setup();
    mockApi([fy2025, fy2024], balancesFixture);
    render(<BalancesPage />);
    await screen.findByText('Caisse');

    // Deux combobox présents (exercice + filtre classe) : on cible par label
    await user.selectOptions(screen.getByLabelText('Exercice'), '2');
    await waitFor(() => {
      expect(window.api.getAccountBalances).toHaveBeenCalledWith(2);
    });
  });

  it('filtre les comptes par texte (numéro)', async () => {
    const user = userEvent.setup();
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    await screen.findByText('Caisse');
    await user.type(screen.getByLabelText('Rechercher un compte'), '300');
    expect(screen.queryByText('Caisse')).not.toBeInTheDocument();
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
  });

  it('filtre les comptes par texte (nom)', async () => {
    const user = userEvent.setup();
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    await screen.findByText('Caisse');
    await user.type(screen.getByLabelText('Rechercher un compte'), 'caisse');
    expect(screen.getByText('Caisse')).toBeInTheDocument();
    expect(screen.queryByText('Cotisations membres')).not.toBeInTheDocument();
  });

  it('filtre par classe', async () => {
    const user = userEvent.setup();
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    await screen.findByText('Caisse');
    await user.selectOptions(screen.getByLabelText('Filtrer par classe'), '3');
    expect(screen.queryByText('Caisse')).not.toBeInTheDocument();
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
  });

  it('affiche un message si aucun compte ne correspond', async () => {
    const user = userEvent.setup();
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    await screen.findByText('Caisse');
    await user.type(screen.getByLabelText('Rechercher un compte'), 'xxxxxx');
    expect(screen.getByText(/Aucun compte ne correspond/)).toBeInTheDocument();
  });

  it('appelle onOpenLedger avec accountId et fiscalYearId au clic sur une ligne', async () => {
    const user = userEvent.setup();
    const onOpenLedger = vi.fn();
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage onOpenLedger={onOpenLedger} />);
    await screen.findByText('Caisse');
    await user.click(screen.getByText('Caisse'));
    // balancesFixture[0] : id=1, fy2025.id=1
    expect(onOpenLedger).toHaveBeenCalledWith(1, 1);
  });
});
