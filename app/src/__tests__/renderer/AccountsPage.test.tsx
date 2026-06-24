// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from '../../types';
import AccountsPage from '../../pages/AccountsPage';

const mockAccounts: Account[] = [
  {
    id: 1, number: '100', name: 'Caisse', class: 1, type: 'ACTIF',
    normal_balance: 'DEBIT', description: null, account_group: null,
    must_be_zero_at_closing: false, is_closing_account: false,
    is_active: true, has_entries: true, created_at: '',
  },
  {
    id: 2, number: '310', name: 'Vente boissons', class: 3, type: 'PRODUIT',
    normal_balance: 'CREDIT', description: null, account_group: 'boissons',
    must_be_zero_at_closing: false, is_closing_account: false,
    is_active: true, has_entries: false, created_at: '',
  },
];

function mockApi(overrides: Partial<Window['api']> = {}) {
  vi.stubGlobal('api', {
    getAccounts:   vi.fn().mockResolvedValue(mockAccounts),
    updateAccount: vi.fn().mockResolvedValue(mockAccounts[0]),
    createAccount: vi.fn().mockResolvedValue({ ...mockAccounts[0], id: 30, number: '395' }),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

beforeEach(() => mockApi());

describe('AccountsPage — affichage', () => {
  it('affiche le titre Plan comptable', async () => {
    render(<AccountsPage />);
    expect(await screen.findByRole('heading', { name: /Plan comptable/ })).toBeInTheDocument();
  });

  it('affiche les comptes chargés', async () => {
    render(<AccountsPage />);
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Vente boissons')).toBeInTheDocument();
  });

  it('affiche le groupe analytique', async () => {
    render(<AccountsPage />);
    expect(await screen.findByText('boissons')).toBeInTheDocument();
  });

  it('affiche un bouton Modifier par compte', async () => {
    render(<AccountsPage />);
    await screen.findByText('Caisse');
    const btns = screen.getAllByRole('button', { name: /Modifier/ });
    expect(btns).toHaveLength(mockAccounts.length);
  });

  it('affiche un bouton "Nouveau compte"', async () => {
    render(<AccountsPage />);
    expect(await screen.findByRole('button', { name: /Nouveau compte/ })).toBeInTheDocument();
  });

  it('affiche le compte inactif avec opacité réduite', async () => {
    const inactiveAccounts: Account[] = [
      { ...mockAccounts[0], is_active: false },
    ];
    mockApi({ getAccounts: vi.fn().mockResolvedValue(inactiveAccounts) });
    render(<AccountsPage />);
    await screen.findByText('Caisse');
  });
});

describe('AccountsPage — édition', () => {
  it('ouvre la modale d\'édition au clic sur Modifier', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click((await screen.findAllByRole('button', { name: /Modifier/ }))[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('pré-remplit le libellé dans la modale d\'édition', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click((await screen.findAllByRole('button', { name: /Modifier/ }))[0]);
    expect(screen.getByDisplayValue('Caisse')).toBeInTheDocument();
  });

  it('appelle updateAccount à la soumission', async () => {
    const updateAccount = vi.fn().mockResolvedValue(mockAccounts[0]);
    mockApi({ updateAccount });
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click((await screen.findAllByRole('button', { name: /Modifier/ }))[0]);
    const input = screen.getByLabelText(/Libellé/);
    await user.clear(input);
    await user.type(input, 'Caisse principale');
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalled());
  });

  it('ferme la modale sur Annuler', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click((await screen.findAllByRole('button', { name: /Modifier/ }))[0]);
    await user.click(screen.getByRole('button', { name: /Annuler/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('AccountsPage — suppression et champs avancés', () => {
  it('affiche le bouton Supprimer quand has_entries = false', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    // mockAccounts[1] (Vente boissons) a has_entries = false — c'est le 2e bouton Modifier
    const btns = await screen.findAllByRole('button', { name: /Modifier/ });
    await user.click(btns[1]);
    expect(screen.getByRole('button', { name: /Supprimer/ })).toBeInTheDocument();
  });

  it('n\'affiche pas le bouton Supprimer quand has_entries = true', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    // mockAccounts[0] (Caisse) a has_entries = true — c'est le 1er bouton Modifier
    const btns = await screen.findAllByRole('button', { name: /Modifier/ });
    await user.click(btns[0]);
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
  });

  it('appelle deleteAccount après confirmation via ConfirmDialog', async () => {
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    mockApi({ deleteAccount });
    const user = userEvent.setup();
    render(<AccountsPage />);
    const btns = await screen.findAllByRole('button', { name: /Modifier/ });
    await user.click(btns[1]);
    await user.click(screen.getByRole('button', { name: /Supprimer/ }));
    // ConfirmDialog apparaît
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Confirmer/ }));
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith(mockAccounts[1].id));
  });

  it('ne supprime pas si l\'utilisateur annule dans ConfirmDialog', async () => {
    const deleteAccount = vi.fn();
    mockApi({ deleteAccount });
    const user = userEvent.setup();
    render(<AccountsPage />);
    const btns = await screen.findAllByRole('button', { name: /Modifier/ });
    await user.click(btns[1]);
    await user.click(screen.getByRole('button', { name: /Supprimer/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Annuler/ }));
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('affiche les champs numéro et type éditables quand has_entries = false', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    const btns = await screen.findAllByRole('button', { name: /Modifier/ });
    await user.click(btns[1]); // Vente boissons — has_entries = false
    // Le champ Numéro doit être présent et pré-rempli
    expect(screen.getByDisplayValue('310')).toBeInTheDocument();
    // Le sélecteur Type doit être présent
    expect(screen.getByRole('combobox', { name: /Type/ })).toBeInTheDocument();
  });

  it('n\'affiche pas de champ numéro éditable quand has_entries = true', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    const btns = await screen.findAllByRole('button', { name: /Modifier/ });
    await user.click(btns[0]); // Caisse — has_entries = true
    // Pas de champ Numéro avec valeur '100' éditable
    expect(screen.queryByDisplayValue('100')).not.toBeInTheDocument();
  });
});

describe('AccountsPage — création', () => {
  it('ouvre la modale de création au clic sur Nouveau compte', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click(await screen.findByRole('button', { name: /Nouveau compte/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Numéro/)).toBeInTheDocument();
  });

  it('appelle createAccount à la soumission', async () => {
    const createAccount = vi.fn().mockResolvedValue({ ...mockAccounts[0], id: 30 });
    mockApi({ createAccount });
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click(await screen.findByRole('button', { name: /Nouveau compte/ }));
    await user.type(screen.getByLabelText(/Numéro/), '395');
    await user.type(screen.getByLabelText(/Libellé/), 'Intérêts');
    await user.selectOptions(screen.getByLabelText(/Type/), 'PRODUIT');
    await user.click(screen.getByRole('button', { name: /Créer/ }));
    await waitFor(() => expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ number: '395', name: 'Intérêts', type: 'PRODUIT' })
    ));
  });

  it('affiche une erreur si createAccount échoue', async () => {
    mockApi({ createAccount: vi.fn().mockRejectedValue(new Error('déjà utilisé')) });
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click(await screen.findByRole('button', { name: /Nouveau compte/ }));
    await user.type(screen.getByLabelText(/Numéro/), '100');
    await user.type(screen.getByLabelText(/Libellé/), 'Doublon');
    await user.click(screen.getByRole('button', { name: /Créer/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('déjà utilisé');
  });
});
