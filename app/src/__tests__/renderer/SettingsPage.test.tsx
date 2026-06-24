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
    getDbPath:      vi.fn().mockResolvedValue('C:/Users/tm/AppData/data/mcy-compta.db'),
    listBackups:    vi.fn().mockResolvedValue(mockBackups),
    exportBackup:   vi.fn().mockResolvedValue(null),
    changeDataDir:  vi.fn().mockResolvedValue(null),
    getFiscalYears: vi.fn().mockResolvedValue([
      { id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31', is_closed: false, created_at: '', hasOpeningBalance: false },
    ]),
    exportExcel:    vi.fn().mockResolvedValue(null),
    restoreBackup:  vi.fn().mockResolvedValue(null),
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
    await userEvent.click(screen.getByRole('button', { name: /Exporter une sauvegarde/ }));
    expect(window.api.exportBackup).toHaveBeenCalledOnce();
  });

  it('affiche un message de succès après export réussi', async () => {
    mockApi({
      exportBackup: vi.fn().mockResolvedValue({ path: 'D:/backup/mcy.db' }),
    });
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Exporter une sauvegarde/ }));
    expect(await screen.findByText(/Sauvegarde exportée vers/)).toBeInTheDocument();
  });

  it('affiche un message si l\'export est annulé (retour null)', async () => {
    mockApi({ exportBackup: vi.fn().mockResolvedValue(null) });
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Exporter une sauvegarde/ }));
    expect(await screen.findByText('Export annulé.')).toBeInTheDocument();
  });

  it('affiche un message d\'erreur si l\'export échoue', async () => {
    mockApi({ exportBackup: vi.fn().mockRejectedValue(new Error('Disk full')) });
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Exporter une sauvegarde/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('SettingsPage — changer le dossier', () => {
  it('affiche le bouton "Changer le dossier de données…"', async () => {
    render(<SettingsPage />);
    expect(await screen.findByRole('button', { name: /Changer le dossier de données/ })).toBeInTheDocument();
  });

  it('appelle window.api.changeDataDir() au clic', async () => {
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Changer le dossier de données/ }));
    expect(window.api.changeDataDir).toHaveBeenCalledOnce();
  });

  it('affiche le bandeau d\'erreur si changeDataDir() rejette', async () => {
    mockApi({ changeDataDir: vi.fn().mockRejectedValue(new Error('Migration failed')) });
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Changer le dossier de données/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('affiche un message de succès et met à jour le chemin si changeDataDir() retourne true', async () => {
    mockApi({
      changeDataDir: vi.fn().mockResolvedValue(true),
      getDbPath: vi.fn().mockResolvedValue('D:/NewFolder/mcy-compta.db'),
    });
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Changer le dossier de données/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Dossier de données mis à jour');
    const input = await screen.findByLabelText('Chemin de la base de données');
    expect(input).toHaveValue('D:/NewFolder/mcy-compta.db');
  });
});

describe('SettingsPage — restauration', () => {
  it('affiche le bouton "Restaurer depuis une sauvegarde…"', async () => {
    render(<SettingsPage />);
    expect(
      await screen.findByRole('button', { name: /Restaurer depuis une sauvegarde/ })
    ).toBeInTheDocument();
  });

  it('appelle window.api.restoreBackup() au clic', async () => {
    mockApi({ restoreBackup: vi.fn().mockResolvedValue(null) });
    render(<SettingsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Restaurer depuis une sauvegarde/ })
    );
    expect(window.api.restoreBackup).toHaveBeenCalledOnce();
  });

  it("affiche un message d'erreur si restoreBackup() rejette", async () => {
    mockApi({ restoreBackup: vi.fn().mockRejectedValue(new Error('Copie impossible')) });
    render(<SettingsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Restaurer depuis une sauvegarde/ })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Copie impossible');
  });
});

describe('SettingsPage — export Excel', () => {
  it('affiche la section "Export Excel"', async () => {
    render(<SettingsPage />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Export Excel' })).toBeInTheDocument();
  });

  it('affiche un sélecteur d\'exercice avec l\'exercice 2025', async () => {
    render(<SettingsPage />);
    expect(await screen.findByLabelText('Exercice')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: '2025' })).toBeInTheDocument();
  });

  it('appelle exportExcel avec l\'id sélectionné au clic', async () => {
    render(<SettingsPage />);
    await screen.findByLabelText('Exercice');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter en Excel' }));
    expect(window.api.exportExcel).toHaveBeenCalledWith(1);
  });

  it('affiche un message de succès après export', async () => {
    mockApi({
      exportExcel: vi.fn().mockResolvedValue({ path: 'C:/tmp/mcy-compta-2025.xlsx' }),
    });
    render(<SettingsPage />);
    await screen.findByLabelText('Exercice');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter en Excel' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/exporté/i);
  });
});
