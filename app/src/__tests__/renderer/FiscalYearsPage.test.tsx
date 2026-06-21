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
};
const fy2024closed: FiscalYear = {
  id: 2, year: 2024,
  start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '2024-01-01T00:00:00.000Z',
};

function mockApi(years: FiscalYear[] = []) {
  vi.stubGlobal('api', {
    getFiscalYears:   vi.fn().mockResolvedValue(years),
    createFiscalYear: vi.fn().mockImplementation(async (year: number) => ({
      id: 99, year,
      start_date: `${year}-01-01`, end_date: `${year}-12-31`,
      is_closed: false, created_at: new Date().toISOString(),
    })),
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
    });
    render(<FiscalYearsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Créer l'exercice/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Année invalide');
  });
});
