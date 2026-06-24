import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/mcy-test') },
}));

import {
  formatBackupFilename,
  performBackup,
  pruneBackups,
  listBackups,
} from '../backup';

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-backup-test-'));
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('formatBackupFilename', () => {
  it('génère le nom attendu pour une date donnée', () => {
    const d = new Date(2025, 2, 8, 14, 30); // 8 mars 2025 14:30 (local)
    expect(formatBackupFilename(d)).toBe('mcy-compta-2025-03-08_14-30.db');
  });
});

describe('performBackup', () => {
  it('crée un fichier .db dans backupDir', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(backupDir);
    await performBackup(db, backupDir);
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
    expect(files).toHaveLength(1);
  });

  it("crée backupDir s'il n'existe pas", async () => {
    const backupDir = path.join(tmpDir, 'deep', 'nested', 'backups');
    expect(fs.existsSync(backupDir)).toBe(false);
    await performBackup(db, backupDir);
    expect(fs.existsSync(backupDir)).toBe(true);
  });

  it('retourne le chemin complet du fichier créé', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    const result = await performBackup(db, backupDir);
    expect(result).toMatch(/mcy-compta-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db$/);
    expect(fs.existsSync(result)).toBe(true);
  });
});

describe('pruneBackups', () => {
  function createFakeBackup(name: string) {
    fs.writeFileSync(path.join(tmpDir, name), 'fake');
  }

  it('ne fait rien si count ≤ maxCount', () => {
    createFakeBackup('mcy-compta-2025-01-01_10-00.db');
    createFakeBackup('mcy-compta-2025-01-02_10-00.db');
    pruneBackups(tmpDir, 3);
    expect(fs.readdirSync(tmpDir)).toHaveLength(2);
  });

  it('supprime les plus anciens au-delà de maxCount', () => {
    createFakeBackup('mcy-compta-2025-01-01_10-00.db');
    createFakeBackup('mcy-compta-2025-01-02_10-00.db');
    createFakeBackup('mcy-compta-2025-01-03_10-00.db');
    pruneBackups(tmpDir, 2);
    const remaining = fs.readdirSync(tmpDir).sort();
    expect(remaining).toHaveLength(2);
    expect(remaining).toContain('mcy-compta-2025-01-02_10-00.db');
    expect(remaining).toContain('mcy-compta-2025-01-03_10-00.db');
  });

  it("ne fait rien si backupDir n'existe pas", () => {
    expect(() => pruneBackups(path.join(tmpDir, 'nonexistent'), 30)).not.toThrow();
  });
});

describe('listBackups', () => {
  function createFakeBackup(name: string) {
    fs.writeFileSync(path.join(tmpDir, name), 'fake-content');
  }

  it("retourne [] si backupDir n'existe pas", () => {
    expect(listBackups(path.join(tmpDir, 'nonexistent'))).toEqual([]);
  });

  it('retourne les backups triés du plus récent au plus ancien', () => {
    createFakeBackup('mcy-compta-2025-01-01_10-00.db');
    createFakeBackup('mcy-compta-2025-01-03_10-00.db');
    createFakeBackup('mcy-compta-2025-01-02_10-00.db');
    const list = listBackups(tmpDir);
    expect(list[0].filename).toBe('mcy-compta-2025-01-03_10-00.db');
    expect(list[2].filename).toBe('mcy-compta-2025-01-01_10-00.db');
  });

  it('retourne filename, date ISO et sizeBytes', () => {
    createFakeBackup('mcy-compta-2025-03-08_14-30.db');
    const [item] = listBackups(tmpDir);
    expect(item.filename).toBe('mcy-compta-2025-03-08_14-30.db');
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(item.sizeBytes).toBeGreaterThan(0);
  });

  it('retourne schemaVersion=-1 pour un fichier non-SQLite', () => {
    createFakeBackup('mcy-compta-2025-03-08_14-30.db');
    const [item] = listBackups(tmpDir);
    expect(item.schemaVersion).toBe(-1);
  });

  it('retourne schemaVersion>=0 pour un fichier SQLite valide', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    await performBackup(db, backupDir);
    const [item] = listBackups(backupDir);
    expect(item.schemaVersion).toBeGreaterThanOrEqual(0);
  });

  it('ignore les fichiers qui ne correspondent pas au pattern', () => {
    createFakeBackup('random-file.db');
    createFakeBackup('mcy-compta-2025-03-08_14-30.db');
    expect(listBackups(tmpDir)).toHaveLength(1);
  });
});
