// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembresPage from '../../pages/MembresPage';
import type { FiscalYear, MemberWithDues } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '2025-01-01T00:00:00', hasOpeningBalance: false,
};

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: null, is_active: 1, inactive_note: null,
  created_at: '2025-01-01T00:00:00',
  dues: [{ id: 1, member_id: 1, year: 2025, paid: 1, payment_note: null,
           payment_date: '2025-03-01', amount_cents: 3000, journal_entry_id: 10, created_at: '' }],
};

const mockMemberUnpaid: MemberWithDues = {
  id: 2, last_name: 'Dupont', first_name: 'Jean',
  entry_date: '2020-01-01', is_active: 1, inactive_note: null,
  created_at: '2025-01-01T00:00:00',
  dues: [],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    getFiscalYears:         vi.fn().mockResolvedValue([mockYear]),
    getMembers:             vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
    deleteMember:           vi.fn().mockResolvedValue(undefined),
    importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 2, skipped: 0 }),
    getSettings:            vi.fn().mockResolvedValue({ dataDir: '/data' }),
    saveMembersYearRange:   vi.fn().mockResolvedValue(undefined),
    exportMembers:          vi.fn().mockResolvedValue(null),
  });
});

describe('MembresPage', () => {
  it('affiche le titre Membres', async () => {
    render(<MembresPage />);
    await screen.findByText('Membres');
  });

  it('affiche les membres dans le tableau', async () => {
    render(<MembresPage />);
    await screen.findByText('Merli');
    expect(screen.getByText('Thomas')).toBeInTheDocument();
    expect(screen.getByText('Dupont')).toBeInTheDocument();
  });

  it('affiche le badge payé pour 2025 sur Merli', async () => {
    render(<MembresPage />);
    await screen.findByText('Merli');
    // Le badge ✓ pour l'année 2025 doit apparaître
    const badges = screen.getAllByText(/✓/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('bouton Nouveau membre est présent', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /nouveau membre/i });
  });

  it('bouton Importer depuis Excel est présent', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /importer/i });
  });

  it('message si aucun exercice', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getMembers:     vi.fn().mockResolvedValue([]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data' }),
    });
    render(<MembresPage />);
    await screen.findByText(/aucun membre/i);
  });

  it('importe depuis Excel et affiche le résultat', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /importer/i });
    await userEvent.click(screen.getByRole('button', { name: /importer/i }));
    await screen.findByText(/2 membre\(s\) importé\(s\)/i);
  });
});

describe('Plage d\'années configurable', () => {
  it('affiche les champs Début/Fin avec la plage sauvegardée', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2023, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    expect(screen.getByLabelText('Début')).toHaveValue('2023');
    expect(screen.getByLabelText('Fin')).toHaveValue('2025');
    // Colonnes 2023, 2024, 2025 générées
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
  });

  it('calcule une plage par défaut si aucune plage n\'est enregistrée', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([mockYear]), // année 2025
      getMembers:     vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data' }), // pas de membersYearRange
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    // Une seule année connue (2025, via l'exercice) → start = end = 2025
    expect(screen.getByLabelText('Début')).toHaveValue('2025');
    expect(screen.getByLabelText('Fin')).toHaveValue('2025');
  });

  it('modifier le champ Fin puis sortir du champ (blur) sauvegarde la nouvelle plage et met à jour les colonnes', async () => {
    const saveMembersYearRange = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2025 } }),
      saveMembersYearRange,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const endInput = screen.getByLabelText('Fin');
    await userEvent.clear(endInput);
    await userEvent.type(endInput, '2026');
    // Pas encore sauvegardé pendant la frappe (chaque touche ne doit pas déclencher un commit)
    expect(saveMembersYearRange).not.toHaveBeenCalled();
    await userEvent.tab(); // blur → commit
    expect(saveMembersYearRange).toHaveBeenCalledTimes(1);
    expect(saveMembersYearRange).toHaveBeenCalledWith({ start: 2024, end: 2026 });
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('une saisie invalide au blur (champ vide) revient à la dernière valeur valide sans sauvegarder', async () => {
    const saveMembersYearRange = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2025 } }),
      saveMembersYearRange,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const endInput = screen.getByLabelText('Fin');
    await userEvent.clear(endInput);
    await userEvent.tab(); // blur avec champ vide
    expect(saveMembersYearRange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Fin')).toHaveValue('2025'); // revient à la valeur précédente
  });

  it('une année implausible (hors 1900-2200) au blur revient à la dernière valeur valide sans sauvegarder', async () => {
    const saveMembersYearRange = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2025 } }),
      saveMembersYearRange,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const endInput = screen.getByLabelText('Fin');
    await userEvent.clear(endInput);
    await userEvent.type(endInput, '20260');
    await userEvent.tab(); // blur avec une année implausible
    expect(saveMembersYearRange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Fin')).toHaveValue('2025'); // revient à la valeur précédente
  });

  it('une saisie avec suffixe non numérique au blur commit la valeur parsée et normalise le texte affiché', async () => {
    const saveMembersYearRange = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2025 } }),
      saveMembersYearRange,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const endInput = screen.getByLabelText('Fin');
    await userEvent.clear(endInput);
    await userEvent.type(endInput, '2026abc');
    await userEvent.tab(); // blur
    expect(saveMembersYearRange).toHaveBeenCalledWith({ start: 2024, end: 2026 });
    expect(screen.getByLabelText('Fin')).toHaveValue('2026'); // texte normalisé, pas "2026abc"
  });

  it('une plage inversée (fin < début) affiche quand même les colonnes dans l\'ordre croissant', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2023 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    const yearHeaders = headers.filter(h => /^\d{4}$/.test(h ?? ''));
    expect(yearHeaders).toEqual(['2023', '2024', '2025']);
  });
});

describe('Signalement des arriérés', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signale une année non payée si entry_date est absente (année non future)', async () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.stubGlobal('api', {
      getFiscalYears:         vi.fn().mockResolvedValue([]),
      getMembers:             vi.fn().mockResolvedValue([{
        id: 10, last_name: 'Sans', first_name: 'Entree',
        entry_date: null, is_active: 1, inactive_note: null, created_at: '',
        dues: [],
      }]),
      getSettings:            vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2024 } }),
      deleteMember:           vi.fn().mockResolvedValue(undefined),
      importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
      saveMembersYearRange:   vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    const element = await screen.findByText('Sans');
    const row = element.closest('tr')!;
    const cells = Array.from(row.querySelectorAll('td'));
    const yearCell = cells.slice(4, -1)[0]; // Skip first 4 columns and last (actions)
    expect(yearCell).toHaveAttribute('data-arrears', 'true');
  });

  it('ne signale pas une année non payée antérieure à entry_date', async () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.stubGlobal('api', {
      getFiscalYears:         vi.fn().mockResolvedValue([]),
      getMembers:             vi.fn().mockResolvedValue([{
        id: 11, last_name: 'Entree', first_name: 'Tardive',
        entry_date: '2022-06-01', is_active: 1, inactive_note: null, created_at: '',
        dues: [],
      }]),
      getSettings:            vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2020, end: 2020 } }),
      deleteMember:           vi.fn().mockResolvedValue(undefined),
      importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
      saveMembersYearRange:   vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    const element = await screen.findByText('Tardive');
    const row = element.closest('tr')!;
    const cells = Array.from(row.querySelectorAll('td'));
    const yearCell = cells.slice(4, -1)[0]; // Skip first 4 columns and last (actions)
    expect(yearCell).not.toHaveAttribute('data-arrears');
  });

  it('signale une année non payée égale ou postérieure à entry_date', async () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.stubGlobal('api', {
      getFiscalYears:         vi.fn().mockResolvedValue([]),
      getMembers:             vi.fn().mockResolvedValue([{
        id: 12, last_name: 'Entree', first_name: 'Normale',
        entry_date: '2022-06-01', is_active: 1, inactive_note: null, created_at: '',
        dues: [],
      }]),
      getSettings:            vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2022, end: 2022 } }),
      deleteMember:           vi.fn().mockResolvedValue(undefined),
      importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
      saveMembersYearRange:   vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    const element = await screen.findByText('Normale');
    const row = element.closest('tr')!;
    const cells = Array.from(row.querySelectorAll('td'));
    const yearCell = cells.slice(4, -1)[0]; // Skip first 4 columns and last (actions)
    expect(yearCell).toHaveAttribute('data-arrears', 'true');
  });

  it('ne signale jamais une année future, même si entry_date est absente', async () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.stubGlobal('api', {
      getFiscalYears:         vi.fn().mockResolvedValue([]),
      getMembers:             vi.fn().mockResolvedValue([{
        id: 13, last_name: 'Sans', first_name: 'Futur',
        entry_date: null, is_active: 1, inactive_note: null, created_at: '',
        dues: [],
      }]),
      getSettings:            vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2027, end: 2027 } }),
      deleteMember:           vi.fn().mockResolvedValue(undefined),
      importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
      saveMembersYearRange:   vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    const element = await screen.findByText('Futur');
    const row = element.closest('tr')!;
    const cells = Array.from(row.querySelectorAll('td'));
    const yearCell = cells.slice(4, -1)[0]; // Skip first 4 columns and last (actions)
    expect(yearCell).not.toHaveAttribute('data-arrears');
  });

  it('ne signale jamais une cellule payée', async () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    vi.stubGlobal('api', {
      getFiscalYears:         vi.fn().mockResolvedValue([]),
      getMembers:             vi.fn().mockResolvedValue([{
        id: 14, last_name: 'Paye', first_name: 'SansEntree',
        entry_date: null, is_active: 1, inactive_note: null, created_at: '',
        dues: [{ id: 99, member_id: 14, year: 2024, paid: 1, payment_note: null,
                 payment_date: '2024-03-01', amount_cents: 3000, journal_entry_id: 20, created_at: '' }],
      }]),
      getSettings:            vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2024 } }),
      deleteMember:           vi.fn().mockResolvedValue(undefined),
      importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 0, skipped: 0 }),
      saveMembersYearRange:   vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    const element = await screen.findByText('SansEntree');
    const row = element.closest('tr')!;
    const cells = Array.from(row.querySelectorAll('td'));
    const yearCell = cells.slice(4, -1)[0]; // Skip first 4 columns and last (actions)
    expect(yearCell).not.toHaveAttribute('data-arrears');
  });
});

describe('Export Excel', () => {
  it('affiche le bouton Exporter Excel', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /exporter excel/i });
  });

  it('appelle exportMembers avec la plage et le filtre courants, affiche un toast de succès', async () => {
    const exportMembers = vi.fn().mockResolvedValue({ path: '/tmp/mcy-membres-2025-2025.xlsx' });
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
      exportMembers,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    await userEvent.click(screen.getByRole('button', { name: /exporter excel/i }));
    expect(exportMembers).toHaveBeenCalledWith({ start: 2025, end: 2025 }, false);
    await screen.findByText(/fichier exporté/i);
  });

  it('affiche un toast d\'erreur si exportMembers retourne { error }', async () => {
    const exportMembers = vi.fn().mockResolvedValue({ error: 'Disque plein' });
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
      exportMembers,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    await userEvent.click(screen.getByRole('button', { name: /exporter excel/i }));
    await screen.findByText('Disque plein');
  });

  it('n\'affiche aucun toast si l\'export est annulé (retour null)', async () => {
    const exportMembers = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
      exportMembers,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    await userEvent.click(screen.getByRole('button', { name: /exporter excel/i }));
    await Promise.resolve(); // laisse le microtask du then() se résoudre
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
