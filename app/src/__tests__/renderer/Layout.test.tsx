// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Layout from '../../components/Layout';

describe('Layout — structure', () => {
  it('affiche la sidebar de navigation', () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div>Contenu</div>
      </Layout>
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('affiche le contenu enfant dans le main', () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div>Mon contenu test</div>
      </Layout>
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('Mon contenu test')).toBeInTheDocument();
  });

  it('transmet currentPage à la sidebar', () => {
    render(
      <Layout currentPage="journal" onNavigate={vi.fn()}>
        <div />
      </Layout>
    );
    expect(screen.getByRole('button', { name: 'Journal' }))
      .toHaveAttribute('aria-current', 'page');
  });

  it('transmet onNavigate à la sidebar', async () => {
    const onNavigate = vi.fn();
    render(
      <Layout currentPage="accounts" onNavigate={onNavigate}>
        <div />
      </Layout>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Soldes' }));
    expect(onNavigate).toHaveBeenCalledWith('balances');
  });
});

describe('Layout — aide (F1 / Escape)', () => {
  it('le drawer d\'aide est fermé par défaut', () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div />
      </Layout>
    );
    expect(screen.queryByRole('dialog', { name: 'Aide' })).not.toBeInTheDocument();
  });

  it('F1 ouvre le drawer d\'aide', async () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div />
      </Layout>
    );
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
  });

  it('Escape ferme le drawer d\'aide', async () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div />
      </Layout>
    );
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(screen.queryByRole('dialog', { name: 'Aide' })).not.toBeInTheDocument();
  });
});
