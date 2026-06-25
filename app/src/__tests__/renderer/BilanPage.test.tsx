// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, AccountBalance } from '../../types';
import BilanPage from '../../pages/BilanPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: true,
};
const fy2024: FiscalYear = {
  id: 2, year: 2024, start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '', hasOpeningBalance: true,
};

const balancesFixture: AccountBalance[] = [
  // Actif
  { id: 1, number: '100', name: 'Caisse',              class: 1, total_debit: 150000, total_credit: 110000, solde: 40000 },
  { id: 2, number: '101', name: 'Raiffeisen',          class: 1, total_debit: 500000, total_credit: 300000, solde: 200000 },
  // Passif
  { id: 3, number: '200', name: 'Passifs transitoires', class: 2, total_debit: 0,      total_credit: 10000,  solde: 10000 },
  { id: 4, number: '290', name: 'Capital',              class: 2, total_debit: 0,      total_credit: 200000, solde: 200000 },
  // Produits
  { id: 5, number: '300', name: 'Cotisations membres',  class: 3, total_debit: 0,      total_credit: 141000, solde: 141000 },
  { id: 6, number: '310', name: 'Vente boissons',       class: 3, total_debit: 0,      total_credit: 20000,  solde: 20000 },
  // Charges
  { id: 7, number: '400', name: 'Assurances',           class: 4, total_debit: 50000,  total_credit: 0,      solde: 50000 },
  { id: 8, number: '401', name: 'Frais bancaires',      class: 4, total_debit: 10000,  total_credit: 0,      solde: 10000 },
];
// Actif: 40000 + 200000 = 240000
// Passif: 10000 + 200000 = 210000
// Produits: 141000 + 20000 = 161000
// Charges: 50000 + 10000 = 60000
// Net result: 161000 - 60000 = 101000
// Total P+FP: 210000 + 101000 = 311000  (intentionally not balanced — not goal of this test)

function mockApi(
  years: FiscalYear[] = [fy2025],
  balances: AccountBalance[] = balancesFixture,
) {
  vi.stubGlobal('api', {
    getFiscalYears:     vi.fn().mockResolvedValue(years),
    getAccountBalances: vi.fn().mockResolvedValue(balances),
  });
}

beforeEach(() => mockApi());

describe('BilanPage — affichage', () => {
  it('affiche le titre Bilan complet', async () => {
    render(<BilanPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Bilan complet' })).toBeInTheDocument();
  });

  it('affiche le message si aucun exercice', async () => {
    mockApi([], []);
    render(<BilanPage />);
    expect(await screen.findByText(/Aucun exercice disponible/)).toBeInTheDocument();
  });

  it('affiche le message si aucun mouvement', async () => {
    mockApi([fy2025], []);
    render(<BilanPage />);
    expect(await screen.findByText(/Aucun mouvement pour cet exercice/)).toBeInTheDocument();
  });

  it('affiche les sections Bilan et Compte de résultat', async () => {
    render(<BilanPage />);
    expect(await screen.findByText('Bilan')).toBeInTheDocument();
    expect(screen.getByText('Compte de résultat')).toBeInTheDocument();
  });

  it('affiche les en-têtes ACTIF et PASSIF & FONDS PROPRES', async () => {
    render(<BilanPage />);
    expect(await screen.findByText('ACTIF')).toBeInTheDocument();
    expect(screen.getByText('PASSIF & FONDS PROPRES')).toBeInTheDocument();
  });

  it('affiche les en-têtes PRODUITS et CHARGES', async () => {
    render(<BilanPage />);
    expect(await screen.findByText('PRODUITS')).toBeInTheDocument();
    expect(screen.getByText('CHARGES')).toBeInTheDocument();
  });

  it('affiche les comptes actifs avec leur solde', async () => {
    render(<BilanPage />);
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Raiffeisen')).toBeInTheDocument();
    // solde Caisse = 40000 centimes = 400.00 CHF
    expect(screen.getByText('400.00')).toBeInTheDocument();
  });

  it('affiche le résultat net correctement', async () => {
    render(<BilanPage />);
    // net result = 161000 - 60000 = 101000 centimes = 1'010.00 CHF
    expect(await screen.findByText(/BÉNÉFICE/)).toBeInTheDocument();
    expect(screen.getByText(/\+1'010\.00 CHF/)).toBeInTheDocument();
  });

  it('affiche "Résultat provisoire" pour un exercice ouvert', async () => {
    render(<BilanPage />);
    // La mention "Résultat provisoire" apparaît dans la cellule ET dans la note
    const matches = await screen.findAllByText(/Résultat provisoire/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('affiche "Résultat (clôturé)" pour un exercice clôturé', async () => {
    mockApi([fy2024], balancesFixture);
    render(<BilanPage />);
    expect(await screen.findByText('Résultat (clôturé)')).toBeInTheDocument();
    expect(screen.queryByText(/Résultat provisoire/)).toBeNull();
  });
});

describe('BilanPage — sélecteur exercice', () => {
  it('affiche le sélecteur d\'exercice', async () => {
    render(<BilanPage />);
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('recharge les données au changement d\'exercice', async () => {
    const getBalances = vi.fn().mockResolvedValue(balancesFixture);
    vi.stubGlobal('api', {
      getFiscalYears:     vi.fn().mockResolvedValue([fy2025, fy2024]),
      getAccountBalances: getBalances,
    });
    render(<BilanPage />);
    const select = await screen.findByRole('combobox');
    await userEvent.selectOptions(select, String(fy2024.id));
    expect(getBalances).toHaveBeenCalledWith(fy2024.id);
  });
});
