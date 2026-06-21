// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../../components/ConfirmDialog';

const defaultProps = {
  message: 'Supprimer cette écriture ?',
  onConfirm: vi.fn(),
  onCancel:  vi.fn(),
};

describe('ConfirmDialog', () => {
  it('affiche le message', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Supprimer cette écriture ?')).toBeInTheDocument();
  });

  it('affiche les boutons Confirmer et Annuler', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
  });

  it('clic Confirmer appelle onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clic Annuler appelle onCancel', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clic sur le fond extérieur ne ferme pas la boîte', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-overlay'));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
