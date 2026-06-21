// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Account } from '../../types';
import App from '../../App';

const mockAccounts: Account[] = [
  {
    id: 1,
    number: '100',
    name: 'Caisse',
    class: 1,
    type: 'ACTIF',
    normal_balance: 'DEBIT',
    description: null,
    must_be_zero_at_closing: false,
    is_closing_account: false,
    is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    number: '300',
    name: 'Cotisations membres',
    class: 3,
    type: 'PRODUIT',
    normal_balance: 'CREDIT',
    description: null,
    must_be_zero_at_closing: false,
    is_closing_account: false,
    is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.stubGlobal('api', {
    getAccounts: vi.fn().mockResolvedValue(mockAccounts),
  });
});

describe('App — rendu de base', () => {
  it('affiche le titre MCY Compta', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('MCY Compta');
  });

  it('affiche l\'en-tête du plan comptable', async () => {
    render(<App />);
    expect(await screen.findByText(/Plan comptable/)).toBeInTheDocument();
  });
});

describe('App — chargement du plan comptable', () => {
  it('affiche le compte Caisse après chargement', async () => {
    render(<App />);
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
  });

  it('affiche le numéro de compte', async () => {
    render(<App />);
    expect(await screen.findByText('100')).toBeInTheDocument();
  });

  it('affiche tous les comptes mockés (2)', async () => {
    render(<App />);
    expect(await screen.findByText('Cotisations membres')).toBeInTheDocument();
    expect(screen.getByText(/2 comptes/)).toBeInTheDocument();
  });

  it('affiche le type du compte', async () => {
    render(<App />);
    expect(await screen.findByText('ACTIF')).toBeInTheDocument();
  });
});

describe('App — gestion des erreurs', () => {
  it('affiche un message d\'erreur si l\'API échoue', async () => {
    vi.stubGlobal('api', {
      getAccounts: vi.fn().mockRejectedValue(new Error('DB non disponible')),
    });
    render(<App />);
    expect(await screen.findByText(/DB non disponible/)).toBeInTheDocument();
  });
});
