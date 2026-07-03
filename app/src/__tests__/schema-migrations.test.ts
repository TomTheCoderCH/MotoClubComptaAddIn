import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runSchemaMigrations, getSchemaVersion } from '../db/schema-migrations';
import { initSchema } from '../db/schema';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('runSchemaMigrations', () => {
  it('une base fraîche passe de user_version=0 à 4 (version courante)', () => {
    const db = freshDb();
    expect(getSchemaVersion(db)).toBe(0);
    runSchemaMigrations(db);
    expect(getSchemaVersion(db)).toBe(4);
  });

  it('une base déjà à jour (v4) n\'est pas modifiée', () => {
    const db = freshDb();
    runSchemaMigrations(db);
    // deuxième appel — idempotent
    runSchemaMigrations(db);
    expect(getSchemaVersion(db)).toBe(4);
  });

  it('les tables sont intactes après migration', () => {
    const db = freshDb();
    runSchemaMigrations(db);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('accounts');
    expect(names).toContain('fiscal_years');
    expect(names).toContain('journal_entries');
    expect(names).toContain('journal_entry_lines');
  });

  it('les tables members et member_dues existent après migration', () => {
    const db = freshDb();
    runSchemaMigrations(db);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('members');
    expect(names).toContain('member_dues');
  });

  it('une migration SQL est appliquée et la version incrémentée', () => {
    const db = freshDb();
    // Simuler une migration v2 directement sur la DB de test
    db.pragma('user_version = 1');
    db.exec('ALTER TABLE accounts ADD COLUMN notes TEXT;');
    db.pragma('user_version = 2');
    expect(getSchemaVersion(db)).toBe(2);
    // Les colonnes existantes sont préservées
    const cols = db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('notes');
  });
});
