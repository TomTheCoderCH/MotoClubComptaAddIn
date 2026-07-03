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
  {
    version: 3,
    description: 'Tables gestion de la caisse (cash_sessions, cash_counts, cash_count_lines)',
    sql: `
CREATE TABLE cash_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  label          TEXT    NOT NULL,
  account_group  TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE cash_counts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  session_id     INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
  date           TEXT    NOT NULL,
  label          TEXT    NOT NULL,
  context        TEXT    NOT NULL DEFAULT 'LIBRE',
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (context IN ('AVANT','FONDS','APRES','LIBRE'))
);
CREATE TABLE cash_count_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_count_id INTEGER NOT NULL REFERENCES cash_counts(id) ON DELETE CASCADE,
  denomination  INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 0,
  CHECK (denomination > 0),
  CHECK (quantity >= 0)
);
CREATE INDEX idx_cash_counts_fiscal_year ON cash_counts(fiscal_year_id);
CREATE INDEX idx_cash_counts_session     ON cash_counts(session_id);
CREATE INDEX idx_cash_count_lines_count  ON cash_count_lines(cash_count_id);
    `.trim(),
  },
  {
    version: 4,
    description: 'Tables membres et cotisations + compte 391',
    sql: `
CREATE TABLE members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name     TEXT    NOT NULL,
  first_name    TEXT    NOT NULL,
  entry_date    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  inactive_note TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE member_dues (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id        INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,
  paid             INTEGER NOT NULL DEFAULT 0,
  payment_note     TEXT,
  payment_date     TEXT,
  amount_cents     INTEGER,
  journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, year)
);
CREATE INDEX idx_member_dues_member ON member_dues(member_id);
CREATE INDEX idx_member_dues_year   ON member_dues(year);
INSERT OR IGNORE INTO accounts (number, name, class, type, normal_balance, description, account_group, must_be_zero_at_closing, is_closing_account)
VALUES ('391', 'Dons', 3, 'PRODUIT', 'CREDIT', 'Dons divers', NULL, 0, 0);
    `.trim(),
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
