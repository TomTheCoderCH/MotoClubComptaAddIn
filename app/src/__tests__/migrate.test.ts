import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { migrateDataDir } from '../migrate';

let srcDir: string;
let dstDir: string;

function createFakeDb(dir: string): void {
  const db = new Database(path.join(dir, 'mcy-compta.db'));
  db.close();
}

function createFakeBackup(dir: string, name: string): void {
  const backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.writeFileSync(path.join(backupsDir, name), 'fake-backup-content');
}

beforeEach(() => {
  srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-migrate-src-'));
  dstDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-migrate-dst-'));
});

afterEach(() => {
  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(dstDir, { recursive: true, force: true });
});

describe('migrateDataDir', () => {
  it('copie mcy-compta.db dans le nouveau dossier', async () => {
    createFakeDb(srcDir);
    await migrateDataDir(srcDir, dstDir);
    expect(fs.existsSync(path.join(dstDir, 'mcy-compta.db'))).toBe(true);
  });

  it('supprime mcy-compta.db du dossier source après copie', async () => {
    createFakeDb(srcDir);
    await migrateDataDir(srcDir, dstDir);
    expect(fs.existsSync(path.join(srcDir, 'mcy-compta.db'))).toBe(false);
  });

  it('copie les backups et supprime les originaux', async () => {
    createFakeDb(srcDir);
    createFakeBackup(srcDir, 'mcy-compta-2025-03-08_14-30.db');
    createFakeBackup(srcDir, 'mcy-compta-2025-03-07_09-15.db');
    await migrateDataDir(srcDir, dstDir);
    expect(fs.existsSync(path.join(dstDir, 'backups', 'mcy-compta-2025-03-08_14-30.db'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'backups', 'mcy-compta-2025-03-07_09-15.db'))).toBe(true);
    expect(fs.existsSync(path.join(srcDir, 'backups', 'mcy-compta-2025-03-08_14-30.db'))).toBe(false);
    expect(fs.existsSync(path.join(srcDir, 'backups', 'mcy-compta-2025-03-07_09-15.db'))).toBe(false);
  });

  it('réussit sans erreur si aucun dossier backups', async () => {
    createFakeDb(srcDir);
    await expect(migrateDataDir(srcDir, dstDir)).resolves.toBeUndefined();
  });

  it('throw immédiatement si oldDir === newDir', async () => {
    createFakeDb(srcDir);
    await expect(migrateDataDir(srcDir, srcDir)).rejects.toThrow('identique');
  });

  it("crée newDir s'il n'existe pas", async () => {
    createFakeDb(srcDir);
    const nested = path.join(dstDir, 'new', 'sub');
    await migrateDataDir(srcDir, nested);
    expect(fs.existsSync(path.join(nested, 'mcy-compta.db'))).toBe(true);
  });
});
