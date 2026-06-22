// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpeningBalanceSuggestion } from '../../types';
import OpeningBalanceModal from '../../components/OpeningBalanceModal';

const suggestions: OpeningBalanceSuggestion[] = [
  { accountId: 1, accountNumber: '100', accountName: 'Caisse',
    type: 'ACTIF', normalBalance: 'DEBIT', suggestedAmountCents: 100000 },
  { accountId: 2, accountNumber: '101', accountName: 'Raiffeisen',
    type: 'ACTIF', normalBalance: 'DEBIT', suggestedAmountCents: 50000 },
  { accountId: 3, accountNumber: '200', accountName: 'Passifs transitoires',
    type: 'PASSIF', normalBalance: 'CREDIT', suggestedAmountCents: 0 },
  { accountId: 4, accountNumber: '290', accountName: 'Capital',
    type: 'FONDS_PROPRES', normalBalance: 'CREDIT', suggestedAmountCents: 150000 },
];

const defaultProps = {
  fiscalYearId: 1,
  year: 2025,
  suggestions,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createOpeningBalance: vi.fn().mockResolvedValue(undefined),
  });
});

describe('OpeningBalanceModal — affichage', () => {
  it('affiche le titre avec l\'année', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    expect(screen.getByRole('heading', { name: /Soldes à nouveau.*2025/ })).toBeInTheDocument();
  });

  it('affiche les comptes ACTIF et PASSIF comme champs éditables', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    expect(screen.getByRole('textbox', { name: /Solde Caisse/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Solde Raiffeisen/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Solde Passifs transitoires/ })).toBeInTheDocument();
  });

  it('affiche Capital (FONDS_PROPRES) en lecture seule', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    const capitalInput = screen.getByRole('textbox', { name: /Solde Capital/ });
    expect(capitalInput).toHaveAttribute('readonly');
  });

  it('pré-remplit les montants suggérés en CHF', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    expect(screen.getByRole('textbox', { name: /Solde Caisse/ })).toHaveValue('1000.00');
    expect(screen.getByRole('textbox', { name: /Solde Raiffeisen/ })).toHaveValue('500.00');
  });
});

describe('OpeningBalanceModal — calcul Capital', () => {
  it('Capital affiche la différence Actifs − Passifs initiale', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    // Actifs = 1000 + 500 = 1500, Passifs = 0 → Capital = 1500
    expect(screen.getByRole('textbox', { name: /Solde Capital/ })).toHaveValue('1500.00');
  });

  it('Capital se recalcule quand un actif change', async () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    const caisseInput = screen.getByRole('textbox', { name: /Solde Caisse/ });
    await userEvent.clear(caisseInput);
    await userEvent.type(caisseInput, '200.00');
    // Actifs = 200 + 500 = 700, Passifs = 0 → Capital = 700
    expect(screen.getByRole('textbox', { name: /Solde Capital/ })).toHaveValue('700.00');
  });
});

describe('OpeningBalanceModal — actions', () => {
  it('"Passer cette étape" appelle onClose sans appel API', async () => {
    const onClose = vi.fn();
    render(<OpeningBalanceModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Passer cette étape' }));
    expect(onClose).toHaveBeenCalled();
    expect(window.api.createOpeningBalance).not.toHaveBeenCalled();
  });

  it('"Enregistrer les soldes" appelle createOpeningBalance avec les bons montants (centimes)', async () => {
    const onSuccess = vi.fn();
    render(<OpeningBalanceModal {...defaultProps} onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les soldes' }));
    expect(window.api.createOpeningBalance).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([
        { accountId: 1, amountCents: 100000 }, // Caisse
        { accountId: 2, amountCents:  50000 }, // Raiffeisen
        { accountId: 4, amountCents: 150000 }, // Capital calculé
      ]),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it('affiche un bandeau d\'erreur si createOpeningBalance rejette', async () => {
    vi.stubGlobal('api', {
      createOpeningBalance: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    render(<OpeningBalanceModal {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les soldes' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
