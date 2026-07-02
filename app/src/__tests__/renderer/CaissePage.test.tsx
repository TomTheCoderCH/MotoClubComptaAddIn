// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaissePage from '../../pages/CaissePage';
import type { FiscalYear, CashCount } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '2025-01-01', hasOpeningBalance: false,
};

const mockCount: CashCount = {
  id: 1, fiscal_year_id: 1, session_id: null, session_label: null,
  date: '2025-03-08', label: 'Avant Marché', context: 'AVANT',
  notes: null, total: 137830, theoretical_balance: 137830,
  created_at: '2025-03-08T10:00:00',
};

beforeEach(() => {
  vi.stubGlobal('api', {
    getFiscalYears:  vi.fn().mockResolvedValue([mockYear]),
    getCashCounts:   vi.fn().mockResolvedValue([mockCount]),
    deleteCashCount: vi.fn().mockResolvedValue(undefined),
  });
});

describe('CaissePage', () => {
  it('affiche un message si aucun exercice', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getCashCounts:  vi.fn().mockResolvedValue([]),
    });
    render(<CaissePage />);
    await screen.findByText(/aucun exercice/i);
  });

  it('affiche les onglets Comptages et Manifestations', async () => {
    render(<CaissePage />);
    await screen.findByRole('tab', { name: /comptages/i });
    expect(screen.getByRole('tab', { name: /manifestations/i })).toBeInTheDocument();
  });

  it('affiche un comptage dans la liste avec libellé et montants', async () => {
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    // total 137830 centimes = 1378.30 → formatCHF returns "1'378.30"
    // Both total and theoretical_balance show "1'378.30", use getAllByText
    const cells = screen.getAllByText("1'378.30");
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it('le bouton Nouveau comptage ouvre la modale', async () => {
    render(<CaissePage />);
    await screen.findByRole('button', { name: /nouveau comptage/i });
    await userEvent.click(screen.getByRole('button', { name: /nouveau comptage/i }));
    expect(screen.getByText(/nouveau comptage de caisse/i)).toBeInTheDocument();
  });

  it('supprimer un comptage appelle deleteCashCount après confirmation', async () => {
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    await userEvent.click(screen.getByRole('button', { name: /supprimer/i }));
    const dialog = await screen.findByRole('alertdialog');
    // ConfirmDialog renders a "Confirmer" button — click it within the dialog
    const confirmBtn = dialog.querySelector('button:last-child') as HTMLElement;
    if (confirmBtn) await userEvent.click(confirmBtn);
    await waitFor(() => expect(window.api.deleteCashCount).toHaveBeenCalledWith(1));
  });

  it("l'écart est marqué data-negative si non nul", async () => {
    const diverged = { ...mockCount, theoretical_balance: 138000 };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([mockYear]),
      getCashCounts:  vi.fn().mockResolvedValue([diverged]),
      deleteCashCount: vi.fn(),
    });
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    const ecartCell = screen.getByTestId('ecart-1');
    expect(ecartCell).toHaveAttribute('data-negative');
  });
});
