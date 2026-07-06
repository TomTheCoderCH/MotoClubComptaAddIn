// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

  it('affiche une case à cocher éditable même pour une année liée à une écriture comptable', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    expect(screen.getByText('2025')).toBeInTheDocument();
    // 2025 a journal_entry_id: 5 (voir mockMember) — la case doit être cochée et éditable,
    // pas un badge en lecture seule
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2); // 2023 (historique) + 2025 (lié à une écriture)
    // La colonne Note/Mode de 2025 affiche la date de paiement en lecture seule
    expect(screen.getByText('2025-03-01')).toBeInTheDocument();
  });

  it('cocher/décocher une année liée à une écriture appelle setHistoricalDues sans toucher au montant affiché', async () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const rows = screen.getAllByRole('row');
    const row2025 = rows.find(r => r.textContent?.includes('2025'))!;
    const checkbox2025 = within(row2025).getByRole('checkbox');
    expect(checkbox2025).toBeChecked();
    await userEvent.click(checkbox2025);
    expect(window.api.setHistoricalDues).toHaveBeenCalledWith(1, 2025, false, null);
    // Le montant affiché (CHF 30.00) provient de amount_cents du due existant, pas du formulaire —
    // il ne doit pas disparaître après le toggle (le mock ne modifie pas member.dues en place ici,
    // ce test vérifie seulement que setHistoricalDues est appelé avec les bons arguments)
  });

  it('affiche la date de paiement en lecture seule dans la colonne Note/Mode pour une écriture liée', () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const rows = screen.getAllByRole('row');
    const row2025 = rows.find(r => r.textContent?.includes('2025'))!;
    // Pas de champ texte éditable pour 2025 (contrairement à 2023)
    expect(within(row2025).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(row2025).getByText('2025-03-01')).toBeInTheDocument();
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

  describe('Ajouter une année', () => {
    it('ajoute une année valide et appelle setHistoricalDues', async () => {
      render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
      const input = screen.getByLabelText(/ajouter une année/i);
      await userEvent.type(input, '2020');
      await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
      expect(window.api.setHistoricalDues).toHaveBeenCalledWith(1, 2020, false, null);
    });

    it('refuse une année déjà présente dans le tableau', async () => {
      render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
      const input = screen.getByLabelText(/ajouter une année/i);
      await userEvent.type(input, '2023');
      await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
      expect(screen.getByText(/déjà présente/i)).toBeInTheDocument();
      expect(window.api.setHistoricalDues).not.toHaveBeenCalledWith(1, 2023, false, null);
    });

    it('refuse une année future', async () => {
      render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
      const futureYear = new Date().getFullYear() + 1;
      const input = screen.getByLabelText(/ajouter une année/i);
      await userEvent.type(input, String(futureYear));
      await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
      expect(screen.getByText(/future/i)).toBeInTheDocument();
      expect(window.api.setHistoricalDues).not.toHaveBeenCalledWith(1, futureYear, false, null);
    });

    it('refuse une année hors plage (avant 1900)', async () => {
      render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
      const input = screen.getByLabelText(/ajouter une année/i);
      await userEvent.type(input, '1899');
      await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
      expect(window.api.setHistoricalDues).not.toHaveBeenCalledWith(1, 1899, false, null);
    });
  });
});
