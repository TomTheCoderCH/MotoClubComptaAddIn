// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpContext } from '../../components/HelpContext';
import HelpDrawer from '../../components/HelpDrawer';

function renderDrawer(isOpen: boolean, close = vi.fn(), toggle = vi.fn()) {
  return render(
    <HelpContext.Provider value={{ isOpen, close, toggle }}>
      <HelpDrawer />
    </HelpContext.Provider>
  );
}

beforeEach(() => {
  vi.stubGlobal('api', {
    getVersion: vi.fn().mockResolvedValue('1.2.0'),
  });
});

describe('HelpDrawer', () => {
  it('ne rend rien quand isOpen=false', () => {
    renderDrawer(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('affiche le drawer quand isOpen=true', () => {
    renderDrawer(true);
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
  });

  it('appelle close() au clic sur le bouton Fermer', async () => {
    const close = vi.fn();
    renderDrawer(true, close);
    await userEvent.click(screen.getByRole('button', { name: "Fermer l'aide" }));
    expect(close).toHaveBeenCalled();
  });

  it('affiche l\'onglet Démarrage rapide par défaut', () => {
    renderDrawer(true);
    expect(screen.getByRole('tab', { name: 'Démarrage rapide' }))
      .toHaveAttribute('aria-selected', 'true');
  });

  it('change d\'onglet au clic sur Comptabilité', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Comptabilité' }));
    expect(screen.getByRole('tab', { name: 'Comptabilité' }))
      .toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Démarrage rapide' }))
      .toHaveAttribute('aria-selected', 'false');
  });

  it('affiche le handle de redimensionnement', () => {
    const { container } = renderDrawer(true);
    expect(container.querySelector('[class*="resizeHandle"]')).toBeInTheDocument();
  });

  it('affiche un quatrième onglet "À propos"', () => {
    renderDrawer(true);
    expect(screen.getByRole('tab', { name: 'À propos' })).toBeInTheDocument();
  });

  it('affiche la version dans l\'onglet À propos', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'À propos' }));
    expect(await screen.findByText('Version 1.2.0')).toBeInTheDocument();
  });

  it('affiche les notes de version dans l\'onglet À propos', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'À propos' }));
    expect(await screen.findByText(/v1\.0\.0/)).toBeInTheDocument();
  });

  it('affiche l\'entrée Membres dans l\'onglet Application', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Application' }));
    expect(screen.getByText('Membres')).toBeInTheDocument();
  });

  it('affiche l\'entrée Bilan complet dans l\'onglet Application', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Application' }));
    expect(screen.getByText('Bilan complet')).toBeInTheDocument();
  });

  it('mentionne le suivi des cotisations dans le Démarrage rapide', () => {
    renderDrawer(true);
    expect(screen.getByText(/Suivre les cotisations/)).toBeInTheDocument();
  });
});
