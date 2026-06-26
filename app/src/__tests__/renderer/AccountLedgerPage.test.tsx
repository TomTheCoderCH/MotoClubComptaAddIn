// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountLedgerData } from '../../types';
import AccountLedgerPage from '../../pages/AccountLedgerPage';

const bilanData: AccountLedgerData = {
  account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
  lines: [
    {
      entryId: 1, date: '2025-03-08', piece: null,
      description: 'Cotisations membres',
      isOpeningBalance: false, isClosingEntry: false,
      debit: null, credit: 141000,
      counterparts: [{ number: '300', name: 'Cotisations membres', amount: 141000 }],
    },
    {
      entryId: 2, date: '2025-04-01', piece: 'F-12',
      description: 'Assurance AXA',
      isOpeningBalance: false, isClosingEntry: false,
      debit: 45000, credit: null,
      counterparts: [
        { number: '101', name: 'Raiffeisen', amount: 20000 },
        { number: '400', name: 'Assurances', amount: 25000 },
      ],
    },
  ],
};

const resultData: AccountLedgerData = {
  account: { id: 5, number: '300', name: 'Cotisations membres', type: 'PRODUIT', normal_balance: 'CREDIT', class: 3 },
  lines: [
    {
      entryId: 1, date: '2025-03-08', piece: null,
      description: 'Cotisations membres',
      isOpeningBalance: false, isClosingEntry: false,
      debit: null, credit: 141000,
      counterparts: [{ number: '100', name: 'Caisse', amount: 141000 }],
    },
  ],
};

function mockApi(data: AccountLedgerData) {
  vi.stubGlobal('api', {
    getAccountLedger: vi.fn().mockResolvedValue(data),
  });
}

beforeEach(() => mockApi(bilanData));

describe('AccountLedgerPage — affichage', () => {
  it('affiche le titre avec numéro et nom du compte', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('100 Caisse');
  });

  it('affiche la colonne Solde CHF pour un compte de bilan (classe 1)', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Solde CHF')).toBeInTheDocument();
  });

  it("n'affiche pas Solde CHF pour un compte de résultat (classe 3)", async () => {
    mockApi(resultData);
    render(<AccountLedgerPage accountId={5} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Solde CHF')).not.toBeInTheDocument();
  });

  it('affiche la contrepartie unique directement', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText('300 Cotisations membres')).toBeInTheDocument();
  });

  it('affiche les contreparties multiples empilées avec montants sans "Divers"', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('101 Raiffeisen')).toBeInTheDocument();
    expect(screen.getByText('400 Assurances')).toBeInTheDocument();
    expect(screen.getByText('200.00')).toBeInTheDocument();
    expect(screen.getByText('250.00')).toBeInTheDocument();
    expect(screen.queryByText('Divers')).not.toBeInTheDocument();
  });

  it('affiche les montants débit et crédit', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText("1'410.00")).toHaveLength(2);
    expect(screen.getAllByText('450.00')).toHaveLength(2);
  });

  it('affiche la ligne Total en pied de tableau', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText('Total')).toBeInTheDocument();
  });

  it('affiche un message vide si aucun mouvement', async () => {
    mockApi({
      account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
      lines: [],
    });
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText(/Aucun mouvement/)).toBeInTheDocument();
  });

  it('le bouton Retour appelle onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={onBack} />);
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: /Retour/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('la ligne d\'ouverture a la classe CSS rowOpening', async () => {
    mockApi({
      account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
      lines: [{
        entryId: 1, date: '2025-01-01', piece: null, description: 'Solde à nouveau',
        isOpeningBalance: true, isClosingEntry: false,
        debit: 500000, credit: null,
        counterparts: [{ number: '290', name: 'Capital', amount: 337000 }],
      }],
    });
    const { container } = render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByText('Solde à nouveau');
    const row = container.querySelector('tbody tr');
    expect(row?.className).toContain('rowOpening');
  });

  it('la ligne de clôture a la classe CSS rowClosing', async () => {
    mockApi({
      account: { id: 4, number: '290', name: 'Capital', type: 'FONDS_PROPRES', normal_balance: 'CREDIT', class: 2 },
      lines: [{
        entryId: 99, date: '2025-12-31', piece: null, description: 'Clôture vers Capital',
        isOpeningBalance: false, isClosingEntry: true,
        debit: null, credit: 337000,
        counterparts: [{ number: '900', name: 'Profits et Pertes', amount: 337000 }],
      }],
    });
    const { container } = render(<AccountLedgerPage accountId={4} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByText('Clôture vers Capital');
    const row = container.querySelector('tbody tr');
    expect(row?.className).toContain('rowClosing');
  });
});
