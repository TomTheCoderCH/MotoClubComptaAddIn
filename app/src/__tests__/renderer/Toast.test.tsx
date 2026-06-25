// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Toast from '../../components/Toast';

describe('Toast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('affiche le message', () => {
    render(<Toast message="Écriture enregistrée" onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Écriture enregistrée');
  });

  it('appelle onDismiss après la durée par défaut (2500 ms)', () => {
    const onDismiss = vi.fn();
    render(<Toast message="ok" onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('appelle onDismiss après une durée personnalisée', () => {
    const onDismiss = vi.fn();
    render(<Toast message="ok" onDismiss={onDismiss} duration={1000} />);
    act(() => { vi.advanceTimersByTime(999); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
