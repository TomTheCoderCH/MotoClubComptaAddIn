// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembreDetailModal from '../../components/MembreDetailModal';
import type { FiscalYear, MemberWithDues } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: null, is_active: 1, inactive_note: null,
  created_at: '',
  dues: [
    { id: 1, member_id: 1, year: 2023, paid: 1, payment_note: 'Raiff',
      payment_date: null, amount_cents: null, journal_entry_id: null, created_at: '' },
    { id: 2, member_id: 1, year: 2025, paid: 1, payment_note: null,
      payment_date: '2025-03-01', amount_cents: 3000, journal_entry_id: 5, created_at: '' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    setHistoricalDues: vi.fn().mockResolvedValue({ id: 3, member_id: 1, year: 2022, paid: 1, payment_note: 'Caisse', payment_date: null, amount_cents: null, journal_entry_id: null, created_at: '' }),
    getMembers:        vi.fn().mockResolvedValue([mockMember]),
    getFiscalYears:    vi.fn().mockResolvedValue([mockYear]),
    getActiveAccounts: vi.fn().mockResolvedValue([]),
  });
});

describe('MembreDetailModal', () => {
  it('affiche le nom complet du membre', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByText(/Thomas Merli/i)).toBeInTheDocument();
  });

  it('affiche les années historiques avec checkbox', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    // 2023 est hors exercices DB — doit apparaître comme historique avec note "Raiff"
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Raiff')).toBeInTheDocument();
  });

  it('affiche les années en DB avec badge statut', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByText('2025')).toBeInTheDocument();
    // 2025 est en DB et payé
    expect(screen.getByText(/payé/i)).toBeInTheDocument();
  });

  it('bouton Enregistrer un paiement est présent', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByRole('button', { name: /enregistrer un paiement/i })).toBeInTheDocument();
  });

  it('cocher une case historique appelle setHistoricalDues sans fermer la modale', async () => {
    const onUpdated = vi.fn();
    const onClose = vi.fn();
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={onClose} onUpdated={onUpdated} />);
    const checkbox = screen.getAllByRole('checkbox')[0];
    await userEvent.click(checkbox);
    expect(window.api.setHistoricalDues).toHaveBeenCalled();
    // La modale ne doit pas se fermer ni notifier le parent au simple cochage
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('le bouton Fermer notifie le parent puis ferme la modale', async () => {
    const onUpdated = vi.fn();
    const onClose = vi.fn();
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={onClose} onUpdated={onUpdated} />);
    await userEvent.click(screen.getByRole('button', { name: /fermer/i }));
    expect(onUpdated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
