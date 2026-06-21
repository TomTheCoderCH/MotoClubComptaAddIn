import type Database from 'better-sqlite3';

export function initSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS fiscal_years (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      year        INTEGER NOT NULL UNIQUE,
      start_date  TEXT    NOT NULL,
      end_date    TEXT    NOT NULL,
      is_closed   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      number                  TEXT    NOT NULL UNIQUE,
      name                    TEXT    NOT NULL,
      class                   INTEGER NOT NULL,
      type                    TEXT    NOT NULL,
      normal_balance          TEXT    NOT NULL,
      description             TEXT,
      must_be_zero_at_closing INTEGER NOT NULL DEFAULT 0,
      is_closing_account      INTEGER NOT NULL DEFAULT 0,
      is_active               INTEGER NOT NULL DEFAULT 1,
      created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
      CHECK (type IN ('ACTIF','PASSIF','FONDS_PROPRES','PRODUIT','CHARGE','RESULTAT')),
      CHECK (normal_balance IN ('DEBIT','CREDIT'))
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fiscal_year_id      INTEGER NOT NULL REFERENCES fiscal_years(id),
      date                TEXT    NOT NULL,
      description         TEXT    NOT NULL,
      piece               TEXT,
      is_opening_balance  INTEGER NOT NULL DEFAULT 0,
      is_closing_entry    INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id       INTEGER NOT NULL REFERENCES accounts(id),
      debit            INTEGER,
      credit           INTEGER,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      CHECK ((debit IS NOT NULL AND credit IS NULL) OR (debit IS NULL AND credit IS NOT NULL)),
      CHECK (COALESCE(debit, credit) > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_journal_entries_fiscal_year ON journal_entries(fiscal_year_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_date        ON journal_entries(date);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry   ON journal_entry_lines(journal_entry_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id);
  `);
}
