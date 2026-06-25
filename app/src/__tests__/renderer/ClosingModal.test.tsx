// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClosingPreview } from '../../types';
import ClosingModal from '../../components/ClosingModal';

const mockPreview: ClosingPreview = {
  blockers: [],
  accounts: [
    { accountId: 10, accountNumber: '300', accountName: 'Cotisations membres', type: 'PRODUIT', soldeCents: 141000 },
    { accountId: 11, accountNumber: '400', accountName: 'Assurances',           type: 'CHARGE', soldeCents:  35000 },
  ],
  netResultCents: 106000,
};

beforeEach(() => {
  vi.stubGlobal('api', {
    closeFiscalYear:  vi.fn().mockResolvedValue(undefined),
    reopenFiscalYear: vi.fn().mockResolvedValue(undefined),
  });
});

describe('ClosingModal', () => {
  it('affiche le titre avec l\'année', () => {
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Clôture de l'exercice 2025/ })).toBeInTheDocument();
  });

  it('affiche la table des comptes à solder', () => {
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
    expect(screen.getByText('Assurances')).toBeInTheDocument();
  });

  it('affiche le résultat net (bénéfice)', () => {
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Bénéfice CHF 1'060\.00/)).toBeInTheDocument();
  });

  it('affiche les blockers et désactive le bouton Confirmer', () => {
    const previewBlocked: ClosingPreview = {
      ...mockPreview,
      blockers: ['Twint (102) : solde CHF 45.00 doit être à 0'],
    };
    render(<ClosingModal fiscalYearId={1} year={2025} preview={previewBlocked} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Twint/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer la clôture' })).toBeDisabled();
  });

  it('"Annuler" appelle onClose sans appel API', async () => {
    const onClose = vi.fn();
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={onClose} onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(window.api.closeFiscalYear).not.toHaveBeenCalled();
  });

  it('"Confirmer la clôture" appelle closeFiscalYear puis onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
    expect(window.api.closeFiscalYear).toHaveBeenCalledWith(1);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('affiche un bandeau erreur si closeFiscalYear rejette', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      closeFiscalYear: vi.fn().mockRejectedValue(new Error('Clôture impossible')),
    });
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clôture impossible');
  });

  it('affiche le résultat net perte si netResultCents < 0', () => {
    const lossPreview: ClosingPreview = { ...mockPreview, netResultCents: -5000 };
    render(<ClosingModal fiscalYearId={1} year={2025} preview={lossPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Perte CHF 50\.00/)).toBeInTheDocument();
  });
});
