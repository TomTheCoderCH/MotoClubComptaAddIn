// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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
});
