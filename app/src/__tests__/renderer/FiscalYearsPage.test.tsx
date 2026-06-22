// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear } from '../../types';
import FiscalYearsPage from '../../pages/FiscalYearsPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025,
  start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '2025-01-01T00:00:00.000Z',
  hasOpeningBalance: false,
};
const fy2024closed: FiscalYear = {
  id: 2, year: 2024,
  start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '2024-01-01T00:00:00.000Z',
  hasOpeningBalance: true,
};

function mockApi(years: FiscalYear[] = []) {
  vi.stubGlobal('api', {
    getFiscalYears:   vi.fn().mockResolvedValue(years),
    createFiscalYear: vi.fn().mockImplementation(async (year: number) => ({
      id: 99, year,
      start_date: `${year}-01-01`, end_date: `${year}-12-31`,
      is_closed: false, created_at: new Date().toISOString(),
      hasOpeningBalance: false,
    })),
    getOpeningBalanceSuggestions: vi.fn().mockResolvedValue([]),
    createOpeningBalance:         vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => mockApi());

describe('FiscalYearsPage — affichage', () => {
  it('affiche le titre Exercices', async () => {
    render(<FiscalYearsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Exercices' })).toBeInTheDocument();
  });

  it('affiche le formulaire de création', async () => {
    render(<FiscalYearsPage />);
    expect(screen.getByLabelText('Année')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Créer l'exercice/ })).toBeInTheDocument();
  });

  it('affiche l\'état vide quand aucun exercice', async () => {
    render(<FiscalYearsPage />);
    expect(await screen.findByText(/Aucun exercice créé/)).toBeInTheDocument();
  });

  it('liste les exercices existants', async () => {
    mockApi([fy2025, fy2024closed]);
    render(<FiscalYearsPage />);
    expect(await screen.findByText('2025')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
  });

  it('affiche la date de début formatée (dd.mm.yyyy)', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    expect(await screen.findByText('01.01.2025')).toBeInTheDocument();
  });

  it('affiche le badge Ouvert pour un exercice non clôturé', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    expect(await screen.findByText('Ouvert')).toBeInTheDocument();
  });

  it('affiche le badge Clôturé pour un exercice clôturé', async () => {
    mockApi([fy2024closed]);
    render(<FiscalYearsPage />);
    expect(await screen.findByText('Clôturé')).toBeInTheDocument();
  });
});

describe('FiscalYearsPage — création', () => {
  it('appelle createFiscalYear avec l\'année saisie', async () => {
    const user = userEvent.setup();
    render(<FiscalYearsPage />);

    const input = screen.getByLabelText('Année');
    await user.clear(input);
    await user.type(input, '2025');
    await user.click(screen.getByRole('button', { name: /Créer l'exercice/ }));

    expect(window.api.createFiscalYear).toHaveBeenCalledWith(2025);
  });

  it('recharge la liste après création', async () => {
    const user = userEvent.setup();
    const getFiscalYears = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([fy2025]);
    vi.stubGlobal('api', { ...window.api, getFiscalYears });

    render(<FiscalYearsPage />);
    expect(await screen.findByText(/Aucun exercice/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Créer l'exercice/ }));
    expect(await screen.findByText('2025')).toBeInTheDocument();
  });

  it('désactive le bouton si l\'année existe déjà', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    await screen.findByText('2025');

    const input = screen.getByLabelText('Année');
    await userEvent.clear(input);
    await userEvent.type(input, '2025');

    expect(screen.getByRole('button', { name: /Créer l'exercice/ })).toBeDisabled();
    expect(screen.getByText(/existe déjà/)).toBeInTheDocument();
  });

  it('affiche l\'erreur retournée par l\'API', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:   vi.fn().mockResolvedValue([]),
      createFiscalYear: vi.fn().mockRejectedValue(new Error('Année invalide')),
      getOpeningBalanceSuggestions: vi.fn().mockResolvedValue([]),
      createOpeningBalance: vi.fn().mockResolvedValue(undefined),
    });
    render(<FiscalYearsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Créer l'exercice/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Année invalide');
  });
});

describe('FiscalYearsPage — soldes à nouveau', () => {
  it('affiche la colonne "Soldes à nouveau" dans le tableau', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('columnheader', { name: 'Soldes à nouveau' })).toBeInTheDocument();
  });

  it('affiche le bouton "Saisir les soldes à nouveau" si !hasOpeningBalance', async () => {
    mockApi([fy2025]); // hasOpeningBalance: false
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('button', { name: 'Saisir les soldes à nouveau' })).toBeInTheDocument();
  });

  it('n\'affiche pas le bouton si hasOpeningBalance est vrai', async () => {
    const fy2025WithBalance: FiscalYear = { ...fy2025, hasOpeningBalance: true };
    mockApi([fy2025WithBalance]);
    render(<FiscalYearsPage />);
    await screen.findByText('2025');
    expect(screen.queryByRole('button', { name: 'Saisir les soldes à nouveau' })).not.toBeInTheDocument();
  });

  it('ouvre le modal automatiquement après création si exercice N-1 détecté', async () => {
    // fy2025 est déjà dans la liste ; on crée 2026
    const fy2026: FiscalYear = {
      id: 99, year: 2026,
      start_date: '2026-01-01', end_date: '2026-12-31',
      is_closed: false, created_at: new Date().toISOString(),
      hasOpeningBalance: false,
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn()
        .mockResolvedValueOnce([fy2025])   // chargement initial
        .mockResolvedValueOnce([fy2026, fy2025]), // après création
      createFiscalYear: vi.fn().mockResolvedValue(fy2026),
      getOpeningBalanceSuggestions: vi.fn().mockResolvedValue([]),
      createOpeningBalance: vi.fn().mockResolvedValue(undefined),
    });

    render(<FiscalYearsPage />);
    await screen.findByText('2025');

    const input = screen.getByLabelText('Année');
    await userEvent.clear(input);
    await userEvent.type(input, '2026');
    await userEvent.click(screen.getByRole('button', { name: /Créer l'exercice 2026/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('n\'ouvre pas le modal si c\'est le premier exercice (pas de N-1)', async () => {
    const fy2023: FiscalYear = {
      id: 99, year: 2023,
      start_date: '2023-01-01', end_date: '2023-12-31',
      is_closed: false, created_at: new Date().toISOString(),
      hasOpeningBalance: false,
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn()
        .mockResolvedValueOnce([])        // pas d'exercice existant
        .mockResolvedValueOnce([fy2023]),
      createFiscalYear: vi.fn().mockResolvedValue(fy2023),
      getOpeningBalanceSuggestions: vi.fn().mockResolvedValue([]),
      createOpeningBalance: vi.fn().mockResolvedValue(undefined),
    });

    render(<FiscalYearsPage />);
    await screen.findByText(/Aucun exercice/);

    const input = screen.getByLabelText('Année');
    await userEvent.clear(input);
    await userEvent.type(input, '2023');
    await userEvent.click(screen.getByRole('button', { name: /Créer l'exercice 2023/ }));

    await screen.findByText('2023');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
