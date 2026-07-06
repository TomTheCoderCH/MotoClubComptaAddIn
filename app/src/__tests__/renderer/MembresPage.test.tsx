// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
