// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CashCountModal from '../../components/CashCountModal';
import type { CashCount } from '../../types';

const mockCount: CashCount = {
  id: 1, fiscal_year_id: 1, session_id: null, session_label: null,
  date: '2025-03-08', label: 'Test', context: 'LIBRE',
  notes: null, total: 3800, theoretical_balance: 3800,
  created_at: '2025-03-08T10:00:00',
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createCashCount: vi.fn().mockResolvedValue(mockCount),
  });
});

const defaultProps = { fiscalYearId: 1, onClose: vi.fn(), onSaved: vi.fn() };

describe('CashCountModal', () => {
  it('affiche les champs de saisie (date, libellé, contexte)', () => {
    render(<CashCountModal {...defaultProps} />);
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/libellé/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contexte/i)).toBeInTheDocument();
  });

  it('affiche 12 qty inputs et 12 total inputs', () => {
    render(<CashCountModal {...defaultProps} />);
    expect(screen.getAllByTestId(/^qty-/)).toHaveLength(12);
    expect(screen.getAllByTestId(/^total-/)).toHaveLength(12);
  });

  it('affiche les coupures 0.05 CHF et 200.00 CHF', () => {
    render(<CashCountModal {...defaultProps} />);
    expect(screen.getByText('0.05 CHF')).toBeInTheDocument();
    expect(screen.getByText('200.00 CHF')).toBeInTheDocument();
  });

  it('saisir une quantité met à jour le total de la ligne', async () => {
    render(<CashCountModal {...defaultProps} />);
    const qtyInput = screen.getByTestId('qty-100'); // 1.00 CHF
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, '38');
    expect((screen.getByTestId('total-100') as HTMLInputElement).value).toBe('38.00');
  });

  it('saisir un total met à jour la quantité (floor) après blur', async () => {
    render(<CashCountModal {...defaultProps} />);
    const totalInput = screen.getByTestId('total-200'); // 2.00 CHF
    await userEvent.clear(totalInput);
    await userEvent.type(totalInput, '15');
    // La quantité ne se calcule qu'à la sortie du champ (onBlur)
    await userEvent.tab();
    // floor(1500 / 200) = 7, total recalé = 14.00
    expect((screen.getByTestId('qty-200') as HTMLInputElement).value).toBe('7');
    expect((screen.getByTestId('total-200') as HTMLInputElement).value).toBe('14.00');
  });

  it('bouton Enregistrer désactivé si toutes les quantités sont 0', () => {
    render(<CashCountModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it("bouton Enregistrer actif dès qu'une quantité > 0", async () => {
    render(<CashCountModal {...defaultProps} />);
    await userEvent.clear(screen.getByTestId('qty-100'));
    await userEvent.type(screen.getByTestId('qty-100'), '5');
    expect(screen.getByRole('button', { name: /enregistrer/i })).not.toBeDisabled();
  });

  it('enregistrer appelle window.api.createCashCount avec le bon payload', async () => {
    render(<CashCountModal {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/libellé/i), 'Avant Marché');
    await userEvent.clear(screen.getByTestId('qty-100'));
    await userEvent.type(screen.getByTestId('qty-100'), '5');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => {
      expect(window.api.createCashCount).toHaveBeenCalledWith(
        expect.objectContaining({
          fiscal_year_id: 1,
          label: 'Avant Marché',
          context: 'LIBRE',
          lines: expect.arrayContaining([
            expect.objectContaining({ denomination: 100, quantity: 5 }),
          ]),
        })
      );
    });
  });

  it('appelle onSaved après un enregistrement réussi', async () => {
    const onSaved = vi.fn();
    render(<CashCountModal {...defaultProps} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/libellé/i), 'Test');
    await userEvent.clear(screen.getByTestId('qty-100'));
    await userEvent.type(screen.getByTestId('qty-100'), '1');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('bouton Annuler appelle onClose', async () => {
    const onClose = vi.fn();
    render(<CashCountModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
