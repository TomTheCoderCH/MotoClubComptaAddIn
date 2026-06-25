// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
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
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2025-06-15' } });
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

    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2025-06-15' } });
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
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2025-06-15' } });
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

describe('EntryForm — validation de date', () => {
  it('pas d\'avertissement pour une date dans l\'exercice', () => {
    render(<EntryForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2025-06-15' } });
    expect(screen.queryByText(/hors de l'exercice/)).not.toBeInTheDocument();
  });

  it('affiche un avertissement pour une date avant le début de l\'exercice', () => {
    render(<EntryForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2024-12-31' } });
    expect(screen.getByText(/hors de l'exercice 2025/)).toBeInTheDocument();
  });

  it('affiche un avertissement pour une date après la fin de l\'exercice', () => {
    render(<EntryForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2026-01-01' } });
    expect(screen.getByText(/hors de l'exercice 2025/)).toBeInTheDocument();
  });

  it('désactive le bouton Enregistrer quand la date est hors exercice', async () => {
    render(<EntryForm {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2025-06-15' } });
    await userEvent.type(screen.getByLabelText('Libellé *'), 'Test');
    const s1 = screen.getByRole('combobox', { name: 'Compte ligne 1' });
    await userEvent.selectOptions(s1, within(s1).getByRole('option', { name: /Caisse/ }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Débit ligne 1' }), '30');
    const s2 = screen.getByRole('combobox', { name: 'Compte ligne 2' });
    await userEvent.selectOptions(s2, within(s2).getByRole('option', { name: /Cotisations/ }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Crédit ligne 2' }), '30');
    expect(screen.getByRole('button', { name: /Enregistrer/ })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2026-01-01' } });
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled();
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

describe('EntryForm — date par défaut (defaultDate)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("utilise la date du jour si l'exercice est l'année courante", () => {
    vi.setSystemTime(new Date(2025, 5, 25, 12, 0, 0)); // 25 juin 2025 local
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-25');
  });

  it("utilise le même jour/mois dans l'année de l'exercice si différent", () => {
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0)); // 25 juin 2026 — fy.year = 2025
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-25');
  });

  it('clamp à start_date si le candidat est antérieur au début de l\'exercice', () => {
    vi.setSystemTime(new Date(2025, 4, 10, 12, 0, 0)); // 10 mai 2025
    const fyLate: FiscalYear = { ...fy, start_date: '2025-06-01', end_date: '2025-12-31' };
    render(<EntryForm {...defaultProps} fiscalYear={fyLate} />);
    // candidat 2025-05-10 < 2025-06-01 → clamped
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-01');
  });

  it('clamp à end_date si le candidat est postérieur à la fin de l\'exercice', () => {
    vi.setSystemTime(new Date(2025, 7, 15, 12, 0, 0)); // 15 août 2025
    const fyEarly: FiscalYear = { ...fy, start_date: '2025-01-01', end_date: '2025-06-30' };
    render(<EntryForm {...defaultProps} fiscalYear={fyEarly} />);
    // candidat 2025-08-15 > 2025-06-30 → clamped
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-30');
  });

  it('clamp le jour si le jour est invalide dans l\'exercice (ex: 29 fév → 28 fév)', () => {
    vi.setSystemTime(new Date(2028, 1, 29, 12, 0, 0)); // 29 fév 2028 (bissextile)
    // fy.year = 2025 (non-bissextile) → 2025-02-29 invalide → 2025-02-28
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-02-28');
  });
});

describe('EntryForm — autofocus champ Date', () => {
  it('le champ Date reçoit le focus au montage en mode création', async () => {
    render(<EntryForm {...defaultProps} />);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Date *'));
    });
  });

  it("le champ Date ne reçoit pas le focus au montage en mode édition", async () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    // Laisser passer un tick pour que l'effect ait pu s'exécuter
    await waitFor(() => {
      expect(document.activeElement).not.toBe(screen.getByLabelText('Date *'));
    });
  });
});

/** Remplit le formulaire avec une écriture 30 CHF Caisse/Cotisations équilibrée. */
async function fillValidForm() {
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2025-06-15' } });
  await user.type(screen.getByLabelText('Libellé *'), 'Test');
  const s1 = screen.getByRole('combobox', { name: 'Compte ligne 1' });
  await user.selectOptions(s1, within(s1).getByRole('option', { name: /Caisse/ }));
  await user.type(screen.getByRole('spinbutton', { name: 'Débit ligne 1' }), '30');
  const s2 = screen.getByRole('combobox', { name: 'Compte ligne 2' });
  await user.selectOptions(s2, within(s2).getByRole('option', { name: /Cotisations/ }));
  await user.type(screen.getByRole('spinbutton', { name: 'Crédit ligne 2' }), '30');
}

describe('EntryForm — bouton Enregistrer + Nouveau', () => {
  it('est visible en mode création quand onSavedNew est défini', () => {
    render(<EntryForm {...defaultProps} onSavedNew={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Enregistrer \+ Nouveau/ })).toBeInTheDocument();
  });

  it('est absent en mode édition même si onSavedNew est défini', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} onSavedNew={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Enregistrer \+ Nouveau/ })).not.toBeInTheDocument();
  });

  it("est absent en mode création si onSavedNew n'est pas fourni", () => {
    render(<EntryForm {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /Enregistrer \+ Nouveau/ })).not.toBeInTheDocument();
  });

  it('appelle onSavedNew (pas onCreated) et réinitialise le formulaire', async () => {
    const onSavedNew = vi.fn();
    render(<EntryForm {...defaultProps} onSavedNew={onSavedNew} />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer \+ Nouveau/ }));
    await waitFor(() => expect(onSavedNew).toHaveBeenCalledOnce());
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
    // formulaire réinitialisé
    expect(screen.getByLabelText('Libellé *')).toHaveValue('');
    expect(screen.getByLabelText('Pièce')).toHaveValue('');
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });
});

describe('EntryForm — raccourcis Ctrl+S et Ctrl+Entrée', () => {
  it('Ctrl+S soumet le formulaire si canSubmit est vrai', async () => {
    render(<EntryForm {...defaultProps} />);
    await fillValidForm();
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => {
      expect(window.api.createJournalEntry).toHaveBeenCalledOnce();
    });
  });

  it('Ctrl+S ne soumet pas si le formulaire est incomplet', () => {
    render(<EntryForm {...defaultProps} />);
    // libellé vide, montants vides → canSubmit = false
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    expect(window.api.createJournalEntry).not.toHaveBeenCalled();
  });

  it('Ctrl+Entrée appelle onSavedNew et réinitialise si onSavedNew est défini', async () => {
    const onSavedNew = vi.fn();
    render(<EntryForm {...defaultProps} onSavedNew={onSavedNew} />);
    await fillValidForm();
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onSavedNew).toHaveBeenCalledOnce());
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Libellé *')).toHaveValue('');
  });

  it('Ctrl+Entrée ne soumet pas si onSavedNew est absent', async () => {
    render(<EntryForm {...defaultProps} />);
    await fillValidForm();
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    // la garde onSavedNewRef.current est undefined → pas d'appel
    expect(window.api.createJournalEntry).not.toHaveBeenCalled();
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
  });
});
