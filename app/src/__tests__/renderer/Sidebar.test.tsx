// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../../components/Sidebar';

describe('Sidebar — affichage', () => {
  it('affiche les 4 items de navigation', () => {
    render(<Sidebar currentPage="accounts" onNavigate={vi.fn()} />);
    expect(screen.getByText('Plan comptable')).toBeInTheDocument();
    expect(screen.getByText('Journal')).toBeInTheDocument();
    expect(screen.getByText('Exercices')).toBeInTheDocument();
    expect(screen.getByText('Soldes')).toBeInTheDocument();
  });

  it('affiche le nom de l\'application', () => {
    render(<Sidebar currentPage="accounts" onNavigate={vi.fn()} />);
    expect(screen.getByText('MCY Compta')).toBeInTheDocument();
  });

  it('marque la page active avec aria-current="page"', () => {
    render(<Sidebar currentPage="journal" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Journal' }))
      .toHaveAttribute('aria-current', 'page');
  });

  it('les autres items n\'ont pas aria-current', () => {
    render(<Sidebar currentPage="journal" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Plan comptable' }))
      .not.toHaveAttribute('aria-current');
  });
});

describe('Sidebar — navigation', () => {
  it('appelle onNavigate("journal") au clic sur Journal', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar currentPage="accounts" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
    expect(onNavigate).toHaveBeenCalledWith('journal');
  });

  it('appelle onNavigate("fiscal-years") au clic sur Exercices', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar currentPage="accounts" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Exercices' }));
    expect(onNavigate).toHaveBeenCalledWith('fiscal-years');
  });

  it('appelle onNavigate("balances") au clic sur Soldes', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar currentPage="accounts" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Soldes' }));
    expect(onNavigate).toHaveBeenCalledWith('balances');
  });

  it('n\'appelle onNavigate qu\'une fois par clic', async () => {
    const onNavigate = vi.fn();
    render(<Sidebar currentPage="accounts" onNavigate={onNavigate} />);
    await userEvent.click(screen.getByRole('button', { name: 'Journal' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
