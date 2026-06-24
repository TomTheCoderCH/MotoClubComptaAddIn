import type Database from 'better-sqlite3';

interface Migration {
  version:     number;
  description: string;
  sql:         string;
}

// Version 1 = schéma initial (fiscal_years, accounts, journal_entries, journal_entry_lines).
// initSchema() l'a déjà créé via CREATE TABLE IF NOT EXISTS.
// Cette entrée sert uniquement à poser le marqueur user_version = 1 sur les bases existantes.
//
// Pour ajouter une migration future :
//   { version: 2, description: '...', sql: 'ALTER TABLE ...' },
const MIGRATIONS: Migration[] = [
  {
    version:     1,
    description: 'Schéma initial (fiscal_years, accounts, journal_entries, journal_entry_lines)',
    sql:         '',
  },
  {
    version:     2,
    description: 'Ajout account_group sur accounts (groupes analytiques)',
    sql:         'ALTER TABLE accounts ADD COLUMN account_group TEXT',
  },
];

export function runSchemaMigrations(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending  = MIGRATIONS.filter(m => m.version > current);

  for (const m of pending) {
    db.transaction(() => {
      if (m.sql.trim()) db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}

export function getSchemaVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}
