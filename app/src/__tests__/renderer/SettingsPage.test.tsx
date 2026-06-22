// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BackupInfo } from '../../types';
import SettingsPage from '../../pages/SettingsPage';

const mockBackups: BackupInfo[] = [
  {
    filename: 'mcy-compta-2025-03-08_14-30.db',
    date: new Date(2025, 2, 8, 14, 30).toISOString(),
    sizeBytes: 1234567,
  },
  {
    filename: 'mcy-compta-2025-03-07_09-15.db',
    date: new Date(2025, 2, 7, 9, 15).toISOString(),
    sizeBytes: 1100000,
  },
];

function mockApi(overrides: Partial<Window['api']> = {}) {
  vi.stubGlobal('api', {
    getDbPath:    vi.fn().mockResolvedValue('C:/Users/tm/AppData/data/mcy-compta.db'),
    listBackups:  vi.fn().mockResolvedValue(mockBackups),
    exportBackup: vi.fn().mockResolvedValue(null),
    ...overrides,
  });
}

beforeEach(() => mockApi());

describe('SettingsPage — affichage', () => {
  it('affiche le titre Paramètres', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeInTheDocument();
  });

  it('affiche le chemin de la DB dans un champ lecture seule', async () => {
    render(<SettingsPage />);
    const input = await screen.findByLabelText('Chemin de la base de données');
    expect(input).toHaveValue('C:/Users/tm/AppData/data/mcy-compta.db');
    expect(input).toHaveAttribute('readOnly');
  });

  it('affiche le nombre de sauvegardes dans le titre de section', async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/Sauvegardes automatiques \(2\)/)).toBeInTheDocument();
  });

  it('affiche les dates des sauvegardes', async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/08\.03\.2025/)).toBeInTheDocument();
    expect(screen.getByText(/07\.03\.2025/)).toBeInTheDocument();
  });

  it('affiche les tailles en Mo', async () => {
    render(<SettingsPage />);
    expect(await screen.findByText('1.2 Mo')).toBeInTheDocument();
  });

  it('affiche le message vide si aucune sauvegarde', async () => {
    mockApi({ listBackups: vi.fn().mockResolvedValue([]) });
    render(<SettingsPage />);
    expect(await screen.findByText(/Aucune sauvegarde automatique/)).toBeInTheDocument();
  });
});

describe('SettingsPage — export', () => {
  it('le bouton export appelle window.api.exportBackup', async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    expect(window.api.exportBackup).toHaveBeenCalledOnce();
  });

  it('affiche un message de succès après export réussi', async () => {
    mockApi({
      exportBackup: vi.fn().mockResolvedValue({ path: 'D:/backup/mcy.db' }),
    });
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    expect(await screen.findByText(/Sauvegarde exportée vers/)).toBeInTheDocument();
  });

  it('affiche un message si l\'export est annulé (retour null)', async () => {
    mockApi({ exportBackup: vi.fn().mockResolvedValue(null) });
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    expect(await screen.findByText('Export annulé.')).toBeInTheDocument();
  });

  it('affiche un message d\'erreur si l\'export échoue', async () => {
    mockApi({ exportBackup: vi.fn().mockRejectedValue(new Error('Disk full')) });
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Exporter/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
