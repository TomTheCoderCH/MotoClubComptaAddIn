import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// vi.mock is hoisted; factory runs lazily when 'electron' is first imported.
// mockAppDataDir is set in beforeEach before any test calls getSettingsPath().
let mockAppDataDir: string;

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockImplementation(() => mockAppDataDir) },
}));

import { readSettings, writeSettings, getSettingsPath } from '../settings';

beforeEach(() => {
  mockAppDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-settings-test-'));
});

afterEach(() => {
  fs.rmSync(mockAppDataDir, { recursive: true, force: true });
});

describe('getSettingsPath', () => {
  it('retourne appData/MCYCompta/settings.json', () => {
    expect(getSettingsPath()).toBe(
      path.join(mockAppDataDir, 'MCYCompta', 'settings.json'),
    );
  });
});

describe('readSettings', () => {
  it("retourne null si le fichier n'existe pas", () => {
    expect(readSettings()).toBeNull();
  });

  it('retourne l\'objet si le fichier est valide', () => {
    writeSettings({ dataDir: '/some/path' });
    expect(readSettings()).toEqual({ dataDir: '/some/path' });
  });

  it('throw si le JSON est invalide', () => {
    const settingsPath = getSettingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, 'not valid json', 'utf-8');
    expect(() => readSettings()).toThrow();
  });
});

describe('writeSettings', () => {
  it('crée le dossier parent si nécessaire', () => {
    const settingsPath = getSettingsPath();
    expect(fs.existsSync(path.dirname(settingsPath))).toBe(false);
    writeSettings({ dataDir: '/test/path' });
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it('roundtrip: readSettings retourne ce que writeSettings a écrit', () => {
    writeSettings({ dataDir: '/roundtrip/path' });
    expect(readSettings()).toEqual({ dataDir: '/roundtrip/path' });
  });
});
