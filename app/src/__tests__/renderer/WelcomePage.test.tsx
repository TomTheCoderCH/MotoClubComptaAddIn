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
    render(<WelcomePage onReady={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bienvenue dans MCY Compta' })).toBeInTheDocument();
  });

  it('affiche le bouton "Choisir le dossier de données"', () => {
    render(<WelcomePage onReady={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Choisir le dossier de données' })).toBeInTheDocument();
  });

  it('appelle window.api.chooseDataDir() au clic', async () => {
    render(<WelcomePage onReady={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(window.api.chooseDataDir).toHaveBeenCalledOnce();
  });

  it('appelle onReady si chooseDataDir() retourne true', async () => {
    const onReady = vi.fn();
    vi.stubGlobal('api', {
      chooseDataDir: vi.fn().mockResolvedValue(true),
    });
    render(<WelcomePage onReady={onReady} />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('n\'appelle pas onReady si chooseDataDir() retourne null (annulé)', async () => {
    const onReady = vi.fn();
    render(<WelcomePage onReady={onReady} />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(onReady).not.toHaveBeenCalled();
  });

  it('affiche un message d\'erreur si chooseDataDir() rejette', async () => {
    vi.stubGlobal('api', {
      chooseDataDir: vi.fn().mockRejectedValue(new Error('Permission denied')),
    });
    render(<WelcomePage onReady={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
