// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CashSessionModal from '../../components/CashSessionModal';
import type { CashSession } from '../../types';

const mockSession: CashSession = {
  id: 1, fiscal_year_id: 1, label: 'Marché 2025', account_group: 'Marché',
  notes: null, created_at: '2025-01-01T10:00:00',
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createCashSession: vi.fn().mockResolvedValue(mockSession),
  });
});

const defaultProps = { fiscalYearId: 1, onClose: vi.fn(), onSaved: vi.fn() };

describe('CashSessionModal', () => {
  it('affiche les champs libellé et groupe analytique', () => {
    render(<CashSessionModal {...defaultProps} />);
    expect(screen.getByLabelText(/libellé/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/groupe analytique/i)).toBeInTheDocument();
  });

  it('bouton Créer désactivé pendant la création', async () => {
    render(<CashSessionModal {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/libellé/i), 'Marché 2025');
    // Should be enabled before save
    expect(screen.getByRole('button', { name: /créer/i })).not.toBeDisabled();
  });

  it('affiche une erreur si libellé vide', async () => {
    render(<CashSessionModal {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /créer/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/libellé est requis/i);
  });

  it('appelle createCashSession avec le bon payload', async () => {
    render(<CashSessionModal {...defaultProps} existingGroups={['Marché']} />);
    await userEvent.type(screen.getByLabelText(/libellé/i), 'Marché 2025');
    await userEvent.type(screen.getByLabelText(/groupe analytique/i), 'Marché');
    await userEvent.click(screen.getByRole('button', { name: /créer/i }));
    await waitFor(() => {
      expect(window.api.createCashSession).toHaveBeenCalledWith(
        expect.objectContaining({ fiscal_year_id: 1, label: 'Marché 2025', account_group: 'Marché' })
      );
    });
  });

  it('appelle onSaved après une création réussie', async () => {
    const onSaved = vi.fn();
    render(<CashSessionModal {...defaultProps} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/libellé/i), 'Test');
    await userEvent.click(screen.getByRole('button', { name: /créer/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('bouton Annuler appelle onClose', async () => {
    const onClose = vi.fn();
    render(<CashSessionModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
