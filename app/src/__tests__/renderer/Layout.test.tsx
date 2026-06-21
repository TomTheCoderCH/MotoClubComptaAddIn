// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
