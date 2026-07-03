// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MembreFormModal from '../../components/MembreFormModal';
import type { MemberWithDues } from '../../types';

const mockMember: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: '2020-01-01', is_active: 1, inactive_note: null,
  created_at: '', dues: [],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createMember: vi.fn().mockResolvedValue({ id: 2, ...mockMember }),
    updateMember: vi.fn().mockResolvedValue(mockMember),
  });
});

describe('MembreFormModal — création', () => {
  it('affiche les champs Nom, Prénom, Date d\'entrée, Statut', () => {
    render(<MembreFormModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/^nom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/prénom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date d.entrée/i)).toBeInTheDocument();
  });

  it('bouton Créer désactivé si Nom vide', async () => {
    render(<MembreFormModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole('button', { name: /créer/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/prénom/i), 'Thomas');
    expect(screen.getByRole('button', { name: /créer/i })).toBeDisabled();
  });

  it('appelle createMember et onSaved après soumission', async () => {
    const onSaved = vi.fn();
    render(<MembreFormModal onClose={vi.fn()} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/^nom/i), 'Merli');
    await userEvent.type(screen.getByLabelText(/prénom/i), 'Thomas');
    await userEvent.click(screen.getByRole('button', { name: /créer/i }));
    expect(window.api.createMember).toHaveBeenCalledWith(
      expect.objectContaining({ last_name: 'Merli', first_name: 'Thomas', is_active: 1 })
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('note visible uniquement si statut inactif', async () => {
    render(<MembreFormModal onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/inactif/i));
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument();
  });
});

describe('MembreFormModal — modification', () => {
  it('prérempli avec les données du membre', () => {
    render(<MembreFormModal member={mockMember} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByDisplayValue('Merli')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Thomas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument();
  });

  it('appelle updateMember avec l\'id correct', async () => {
    render(<MembreFormModal member={mockMember} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText(/^nom/i));
    await userEvent.type(screen.getByLabelText(/^nom/i), 'Merli2');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(window.api.updateMember).toHaveBeenCalledWith(1, expect.objectContaining({ last_name: 'Merli2' }));
  });
});
