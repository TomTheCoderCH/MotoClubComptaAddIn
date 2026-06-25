// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, Account } from '../../types';
import EntryForm from '../../components/EntryForm';

const fy: FiscalYear = {
  id: 1, year: 2025,
  start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '2025-01-01T00:00:00.000Z',
};

const accounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse',             class: 1, type: 'ACTIF',   normal_balance: 'DEBIT',  description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
  { id: 2, number: '300', name: 'Cotisations membres', class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
];

const defaultProps = {
  fiscalYear: fy,
  accounts,
  onCreated: vi.fn(),
  onCancel:  vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createJournalEntry: vi.fn().mockResolvedValue({ id: 1 }),
  });
  defaultProps.onCreated = vi.fn();
  defaultProps.onCancel  = vi.fn();
});

describe('EntryForm — affichage initial', () => {
  it('affiche le titre avec l\'année de l\'exercice', () => {
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByText(/Nouvelle écriture — exercice 2025/)).toBeInTheDocument();
  });

  it('affiche les champs date, libellé et pièce', () => {
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByLabelText('Date *')).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé *')).toBeInTheDocument();
    expect(screen.getByLabelText('Pièce')).toBeInTheDocument();
  });

  it('démarre avec 2 lignes comptables', () => {
    render(<EntryForm {...defaultProps} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('le bouton Enregistrer est désactivé initialement', () => {
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
  });
});

describe('EntryForm — gestion des lignes', () => {
  it('ajoute une ligne avec le bouton + Ajouter une ligne', async () => {
    render(<EntryForm {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('supprime une ligne (si plus de 2)', async () => {
    render(<EntryForm {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
    expect(screen.getAllByRole('combobox')).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer ligne 3' }));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('désactive la suppression quand il ne reste que 2 lignes', () => {
    render(<EntryForm {...defaultProps} />);
    const removeBtns = screen.getAllByRole('button', { name: /Supprimer ligne/ });
    removeBtns.forEach(btn => expect(btn).toBeDisabled());
  });
});

describe('EntryForm — validation équilibre D/C', () => {
  async function fillLine(lineNum: number, accountName: string, debit?: string, credit?: string) {
    const select = screen.getByRole('combobox', { name: `Compte ligne ${lineNum}` });
    await userEvent.selectOptions(select, within(select).getByRole('option', { name: new RegExp(accountName) }));
    if (debit)  await userEvent.type(screen.getByRole('spinbutton', { name: `Débit ligne ${lineNum}` }),  debit);
    if (credit) await userEvent.type(screen.getByRole('spinbutton', { name: `Crédit ligne ${lineNum}` }), credit);
  }

  it('affiche un déséquilibre quand débit ≠ crédit', async () => {
    render(<EntryForm {...defaultProps} />);
    await fillLine(1, 'Caisse', '30');
    expect(screen.getByText(/Déséquilibre/i)).toBeInTheDocument();
  });

  it('affiche "Ecriture équilibrée" quand débit = crédit', async () => {
    render(<EntryForm {...defaultProps} />);
    await fillLine(1, 'Caisse',             '30', undefined);
    await fillLine(2, 'Cotisations membres', undefined, '30');
    expect(screen.getByText('Ecriture équilibrée')).toBeInTheDocument();
  });

  it('active le bouton Enregistrer quand tout est valide', async () => {
    render(<EntryForm {...defaultProps} />);
    await userEvent.type(screen.getByLabelText('Libellé *'), 'Cotisation membre');
    await fillLine(1, 'Caisse',             '30', undefined);
    await fillLine(2, 'Cotisations membres', undefined, '30');
    expect(screen.getByRole('button', { name: /Enregistrer/ })).not.toBeDisabled();
  });
});

describe('EntryForm — soumission', () => {
  async function submitValidEntry() {
    const user = userEvent.setup();
    render(<EntryForm {...defaultProps} />);

    await user.type(screen.getByLabelText('Libellé *'), 'Cotisation membre');
    const sel1 = screen.getByRole('combobox', { name: 'Compte ligne 1' });
    await user.selectOptions(sel1, within(sel1).getByRole('option', { name: /Caisse/ }));
    await user.type(screen.getByRole('spinbutton', { name: 'Débit ligne 1' }), '30');
    const sel2 = screen.getByRole('combobox', { name: 'Compte ligne 2' });
    await user.selectOptions(sel2, within(sel2).getByRole('option', { name: /Cotisations membres/ }));
    await user.type(screen.getByRole('spinbutton', { name: 'Crédit ligne 2' }), '30');
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
  }

  it('appelle createJournalEntry avec les bons paramètres', async () => {
    await submitValidEntry();
    expect(window.api.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        fiscal_year_id: 1,
        description: 'Cotisation membre',
        lines: expect.arrayContaining([
          expect.objectContaining({ account_id: 1, debit: 3000 }),
          expect.objectContaining({ account_id: 2, credit: 3000 }),
        ]),
      }),
    );
  });

  it('appelle onCreated après une soumission réussie', async () => {
    await submitValidEntry();
    expect(defaultProps.onCreated).toHaveBeenCalledTimes(1);
  });

  it('appelle onCancel au clic sur Annuler', async () => {
    render(<EntryForm {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('affiche l\'erreur de l\'API en cas d\'échec', async () => {
    vi.stubGlobal('api', {
      createJournalEntry: vi.fn().mockRejectedValue(new Error('Exercice clôturé')),
    });
    render(<EntryForm {...defaultProps} />);
    await userEvent.type(screen.getByLabelText('Libellé *'), 'Test');
    const s1 = screen.getByRole('combobox', { name: 'Compte ligne 1' });
    await userEvent.selectOptions(s1, within(s1).getByRole('option', { name: /Caisse/ }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Débit ligne 1' }), '30');
    const s2 = screen.getByRole('combobox', { name: 'Compte ligne 2' });
    await userEvent.selectOptions(s2, within(s2).getByRole('option', { name: /Cotisations membres/ }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Crédit ligne 2' }), '30');
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Exercice clôturé');
  });
});

const editEntry = {
  id: 42,
  fiscal_year_id: 1,
  date: '2025-04-10',
  description: 'Cotisation à corriger',
  piece: 'P-099',
  is_opening_balance: false,
  is_closing_entry: false,
  created_at: '',
  updated_at: '',
  lines: [
    { id: 1, journal_entry_id: 42, account_id: 1, debit: 3000, credit: null, created_at: '' },
    { id: 2, journal_entry_id: 42, account_id: 2, debit: null, credit: 3000, created_at: '' },
  ],
};

describe('EntryForm — mode édition', () => {
  beforeEach(() => {
    vi.stubGlobal('api', {
      createJournalEntry: vi.fn().mockResolvedValue({ id: 1 }),
      updateJournalEntry: vi.fn().mockResolvedValue({ id: 42 }),
    });
  });

  it('pré-remplit la date depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-04-10');
  });

  it('pré-remplit le libellé depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    expect(screen.getByLabelText('Libellé *')).toHaveValue('Cotisation à corriger');
  });

  it('pré-remplit la pièce depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    expect(screen.getByLabelText('Pièce')).toHaveValue('P-099');
  });

  it('pré-remplit les lignes depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    // 2 lignes pré-remplies
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByRole('spinbutton', { name: 'Débit ligne 1' })).toHaveValue(30);
    expect(screen.getByRole('spinbutton', { name: 'Crédit ligne 2' })).toHaveValue(30);
  });

  it('appelle updateJournalEntry (et non createJournalEntry) à la soumission', async () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    expect(window.api.updateJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
    );
    expect(window.api.createJournalEntry).not.toHaveBeenCalled();
  });

  it('masque le titre quand hideTitle est true', () => {
    render(<EntryForm {...defaultProps} hideTitle />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});

describe('EntryForm — navigation clavier', () => {
  it('Enter sur Débit de la dernière ligne ajoute une ligne', async () => {
    render(<EntryForm {...defaultProps} />);
    const debit2 = screen.getByRole('spinbutton', { name: 'Débit ligne 2' });
    await userEvent.type(debit2, '{Enter}');
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('Enter sur Crédit de la dernière ligne ajoute une ligne', async () => {
    render(<EntryForm {...defaultProps} />);
    const credit2 = screen.getByRole('spinbutton', { name: 'Crédit ligne 2' });
    await userEvent.type(credit2, '{Enter}');
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('Enter sur une ligne non-dernière n\'ajoute pas de ligne', async () => {
    render(<EntryForm {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Ajouter une ligne/ }));
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    const debit1 = screen.getByRole('spinbutton', { name: 'Débit ligne 1' });
    await userEvent.type(debit1, '{Enter}');
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('Enter sur la dernière ligne place le focus sur le compte de la nouvelle ligne', async () => {
    render(<EntryForm {...defaultProps} />);
    const debit2 = screen.getByRole('spinbutton', { name: 'Débit ligne 2' });
    await userEvent.type(debit2, '{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Compte ligne 3' }));
  });
});

describe('EntryForm — tooltips d\'aide par ligne', () => {
  it('chaque ligne initiale a un tooltip', () => {
    render(<EntryForm {...defaultProps} />);
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips).toHaveLength(2);
  });

  it('sans compte sélectionné : invite à choisir un compte', () => {
    render(<EntryForm {...defaultProps} />);
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips[0]).toHaveTextContent("Sélectionnez un compte pour voir l'aide");
  });

  it('avec compte ACTIF sélectionné : affiche la règle débit/crédit', async () => {
    render(<EntryForm {...defaultProps} />);
    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], '1');
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips[0]).toHaveTextContent('Actif — Débit ↑ augmente · Crédit ↓ diminue');
  });
});
