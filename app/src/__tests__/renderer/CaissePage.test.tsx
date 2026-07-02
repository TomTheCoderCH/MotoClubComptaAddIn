// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaissePage from '../../pages/CaissePage';
import type { FiscalYear, CashCount, CashSession } from '../../types';

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
    getFiscalYears:   vi.fn().mockResolvedValue([mockYear]),
    getCashCounts:    vi.fn().mockResolvedValue([mockCount]),
    getCashSessions:  vi.fn().mockResolvedValue([]),
    deleteCashCount:  vi.fn().mockResolvedValue(undefined),
    getCashCountById: vi.fn().mockResolvedValue({ ...mockCount, lines: [] }),
    updateCashCount:  vi.fn().mockResolvedValue(mockCount),
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

  it('le bouton Modifier ouvre la modale en mode édition', async () => {
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    await userEvent.click(screen.getByRole('button', { name: /modifier/i }));
    // La modale s'ouvre et charge le comptage via getCashCountById
    await waitFor(() => expect(window.api.getCashCountById).toHaveBeenCalledWith(1));
    // Le titre de la modale indique le mode édition
    await screen.findByText(/modifier le comptage/i);
  });

  it("l'écart est marqué data-negative si non nul", async () => {
    const diverged = { ...mockCount, theoretical_balance: 138000 };
    vi.stubGlobal('api', {
      getFiscalYears:  vi.fn().mockResolvedValue([mockYear]),
      getCashCounts:   vi.fn().mockResolvedValue([diverged]),
      getCashSessions: vi.fn().mockResolvedValue([]),
      deleteCashCount: vi.fn(),
    });
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    const ecartCell = screen.getByTestId('ecart-1');
    expect(ecartCell).toHaveAttribute('data-negative');
  });
});

const mockSession: CashSession = {
  id: 10, fiscal_year_id: 1, label: 'Marché Villageois 2025',
  account_group: 'Marché', notes: null, created_at: '2025-05-01T10:00:00',
};

describe('CaissePage — onglet Manifestations', () => {
  beforeEach(() => {
    vi.stubGlobal('api', {
      getFiscalYears:    vi.fn().mockResolvedValue([mockYear]),
      getCashCounts:     vi.fn().mockResolvedValue([]),
      getCashSessions:   vi.fn().mockResolvedValue([mockSession]),
      deleteCashCount:   vi.fn().mockResolvedValue(undefined),
      deleteCashSession: vi.fn().mockResolvedValue(undefined),
      createCashSession: vi.fn().mockResolvedValue(mockSession),
    });
  });

  it("l'onglet Manifestations affiche la liste des sessions", async () => {
    render(<CaissePage />);
    await userEvent.click(await screen.findByRole('tab', { name: /manifestations/i }));
    await screen.findByText('Marché Villageois 2025');
    expect(screen.getByText('Marché')).toBeInTheDocument();
  });

  it("le bouton Nouvelle session ouvre la modale", async () => {
    render(<CaissePage />);
    await userEvent.click(await screen.findByRole('tab', { name: /manifestations/i }));
    await userEvent.click(await screen.findByRole('button', { name: /nouvelle session/i }));
    expect(screen.getByText(/nouvelle session de manifestation/i)).toBeInTheDocument();
  });

  it("supprimer une session appelle deleteCashSession après confirmation", async () => {
    render(<CaissePage />);
    await userEvent.click(await screen.findByRole('tab', { name: /manifestations/i }));
    await screen.findByText('Marché Villageois 2025');
    await userEvent.click(screen.getByRole('button', { name: /supprimer la session/i }));
    const dialog = await screen.findByRole('alertdialog');
    const confirmBtn = dialog.querySelector('button:last-child') as HTMLElement;
    if (confirmBtn) await userEvent.click(confirmBtn);
    await waitFor(() => expect(window.api.deleteCashSession).toHaveBeenCalledWith(10));
  });

  it("cliquer sur une session l'expand et montre ses comptages liés", async () => {
    const linkedCount: CashCount = {
      ...mockCount, id: 5, session_id: 10, session_label: 'Marché Villageois 2025',
      context: 'AVANT', label: 'Avant Marché',
    };
    vi.stubGlobal('api', {
      getFiscalYears:  vi.fn().mockResolvedValue([mockYear]),
      getCashCounts:   vi.fn().mockResolvedValue([linkedCount]),
      getCashSessions: vi.fn().mockResolvedValue([mockSession]),
      deleteCashCount: vi.fn(), deleteCashSession: vi.fn(),
    });
    render(<CaissePage />);
    await userEvent.click(await screen.findByRole('tab', { name: /manifestations/i }));
    await screen.findByText('Marché Villageois 2025');
    // Click the session row to expand
    await userEvent.click(screen.getByText('Marché Villageois 2025'));
    await screen.findByText('Avant Marché');
  });
});
