// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembrePaiementModal from '../../components/MembrePaiementModal';
import type { FiscalYear, MemberWithDues, Account } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: null, is_active: 1, inactive_note: null, created_at: '', dues: [],
};

const mockAccounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse',      class: 1, type: 'ACTIF', normal_balance: 'DEBIT', description: null, account_group: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, has_entries: false, created_at: '' },
  { id: 2, number: '101', name: 'Raiffeisen',  class: 1, type: 'ACTIF', normal_balance: 'DEBIT', description: null, account_group: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, has_entries: false, created_at: '' },
];

beforeEach(() => {
  vi.stubGlobal('api', {
    recordPayment: vi.fn().mockResolvedValue({ dues: [], journalEntryId: 99 }),
  });
});

describe('MembrePaiementModal', () => {
  it('affiche le nom du membre', () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/Thomas Merli/)).toBeInTheDocument();
  });

  it('montant par défaut = 30.00', () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByDisplayValue('30.00')).toBeInTheDocument();
  });

  it('propose toutes les années impayées, pas seulement le quota, mais limite les cases cochables au quota', async () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    // 30 CHF → quota=1, mais toutes les années impayées (année exercice, courante, avance) apparaissent
    const initialCheckboxes = screen.getAllByRole('checkbox');
    expect(initialCheckboxes.length).toBeGreaterThan(1);

    // Cocher une première case : les autres doivent se désactiver (quota atteint)
    await userEvent.click(initialCheckboxes[0]);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const checked = boxes.filter(b => b.checked);
    const uncheckedRest = boxes.filter(b => !b.checked);
    expect(checked).toHaveLength(1);
    uncheckedRest.forEach(b => expect(b).toBeDisabled());

    // Passer à 60 CHF (quota=2) réactive une seconde case cochable
    const input = screen.getByDisplayValue('30.00');
    await userEvent.clear(input);
    await userEvent.type(input, '60.00');
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2));
  });

  it('affiche le surplus si montant % 30 > 0', async () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    const input = screen.getByDisplayValue('30.00');
    await userEvent.clear(input);
    await userEvent.type(input, '40.00');
    await waitFor(() => expect(screen.getByText(/dons/i)).toBeInTheDocument());
    expect(screen.getByText(/10\.00/)).toBeInTheDocument();
  });

  it('bouton désactivé si pas assez de cases cochées', async () => {
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.clear(screen.getByDisplayValue('30.00'));
    await userEvent.type(screen.getByDisplayValue(''), '60.00');
    // Au moins 2 cases possibles (quota=2) mais aucune cochée → désactivé
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it('appelle recordPayment avec le bon payload', async () => {
    const onSaved = vi.fn();
    render(<MembrePaiementModal member={mockMember} fiscalYears={[mockYear]} accounts={mockAccounts} onClose={vi.fn()} onSaved={onSaved} />);
    // Cocher explicitement la case 2025 (année de l'exercice), parmi les candidates proposées
    await userEvent.click(screen.getByRole('checkbox', { name: /2025/ }));
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(window.api.recordPayment).toHaveBeenCalled());
    const call = (window.api.recordPayment as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.member_id).toBe(1);
    expect(call.total_amount_cents).toBe(3000);
    expect(call.years).toContain(2025);
  });

  it('permet de choisir librement une année future (avance) même si une année passée reste impayée', async () => {
    const fiscalYear2024: FiscalYear = {
      id: 2, year: 2024, start_date: '2024-01-01', end_date: '2024-12-31',
      is_closed: true, created_at: '', hasOpeningBalance: false,
    };
    const onSaved = vi.fn();
    render(
      <MembrePaiementModal
        member={mockMember}
        fiscalYears={[fiscalYear2024, mockYear]}
        accounts={mockAccounts}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    // L'année passée impayée (2024) ET une année future/avance doivent toutes deux être proposées
    const futureYear = new Date().getFullYear() + 1;
    expect(screen.getByRole('checkbox', { name: /2024/ })).toBeInTheDocument();
    const futureCheckbox = screen.getByRole('checkbox', { name: new RegExp(String(futureYear)) });
    expect(futureCheckbox).toBeInTheDocument();

    // L'utilisateur coche librement l'année future plutôt que l'année passée la plus ancienne
    await userEvent.click(futureCheckbox);
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(window.api.recordPayment).toHaveBeenCalled());
    const call = (window.api.recordPayment as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.years).toContain(futureYear);
    expect(call.years).not.toContain(2024);
  });
});
