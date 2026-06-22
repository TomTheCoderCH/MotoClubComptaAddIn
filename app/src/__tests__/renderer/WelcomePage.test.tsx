// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomePage from '../../pages/WelcomePage';

beforeEach(() => {
  vi.stubGlobal('api', {
    chooseDataDir: vi.fn().mockResolvedValue(null),
  });
});

describe('WelcomePage', () => {
  it('affiche le titre "Bienvenue dans MCY Compta"', () => {
    render(<WelcomePage />);
    expect(screen.getByRole('heading', { name: 'Bienvenue dans MCY Compta' })).toBeInTheDocument();
  });

  it('affiche le bouton "Choisir le dossier de données"', () => {
    render(<WelcomePage />);
    expect(screen.getByRole('button', { name: 'Choisir le dossier de données' })).toBeInTheDocument();
  });

  it('appelle window.api.chooseDataDir() au clic', async () => {
    render(<WelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(window.api.chooseDataDir).toHaveBeenCalledOnce();
  });

  it('affiche un message d\'erreur si chooseDataDir() rejette', async () => {
    vi.stubGlobal('api', {
      chooseDataDir: vi.fn().mockRejectedValue(new Error('Permission denied')),
    });
    render(<WelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
