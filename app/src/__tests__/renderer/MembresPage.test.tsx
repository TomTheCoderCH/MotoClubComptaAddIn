// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    });
    render(<MembresPage />);
    await screen.findByText(/aucun membre/i);
  });

  it('confirme avant import et affiche le résultat', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /importer/i });
    await userEvent.click(screen.getByRole('button', { name: /importer/i }));
    await screen.findByText(/2 membre\(s\) importé\(s\)/i);
  });
});
