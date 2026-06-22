import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { initSchema } from './schema';
import { seedAccountsIfEmpty } from './seed';
import { validateEntryBalance } from '../lib/accounting';
import type { Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance, CreateJournalEntryPayload, UpdateJournalEntryPayload } from '../types';

let db: Database.Database;
let dbDir: string;

export function getDb(): Database.Database {
  if (!db) throw new Error('Base de données non initialisée');
  return db;
}

export function getDbDir(): string {
  if (!dbDir) throw new Error('Base de données non initialisée');
  return dbDir;
}

export function isDbOpen(): boolean {
  return !!db;
}

export function openDatabase(dataPath?: string): Database.Database {
  // Mode test : base SQLite en mémoire (isolation totale, pas de fichier résiduel)
  if (dataPath === ':memory:') {
    db = new Database(':memory:');
    initSchema(db);
    seedAccountsIfEmpty(db);
    return db;
  }

  const dir = dataPath ?? path.join(app.getPath('userData'), 'data');
  dbDir = dir;
  const dbPath = path.join(dir, 'mcy-compta.db');

  // Créer le dossier si nécessaire
  const fs = require('node:fs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  initSchema(db);
  seedAccountsIfEmpty(db);
  return db;
}

// ─── Comptes ─────────────────────────────────────────────────────────────────

export function getAllAccounts(): Account[] {
  return getDb().prepare('SELECT * FROM accounts ORDER BY number').all() as Account[];
}

export function getActiveAccounts(): Account[] {
  return getDb().prepare('SELECT * FROM accounts WHERE is_active = 1 ORDER BY number').all() as Account[];
}

// ─── Exercices ────────────────────────────────────────────────────────────────

export function getAllFiscalYears(): FiscalYear[] {
  return getDb().prepare('SELECT * FROM fiscal_years ORDER BY year DESC').all() as FiscalYear[];
}

export function createFiscalYear(year: number): FiscalYear {
  const stmt = getDb().prepare(`
    INSERT INTO fiscal_years (year, start_date, end_date)
    VALUES (@year, @start_date, @end_date)
  `);
  const info = stmt.run({
    year,
    start_date: `${year}-01-01`,
    end_date:   `${year}-12-31`,
  });
  return getDb().prepare('SELECT * FROM fiscal_years WHERE id = ?').get(info.lastInsertRowid) as FiscalYear;
}

// ─── Écritures ────────────────────────────────────────────────────────────────

export function getJournalEntries(fiscalYearId: number): (JournalEntry & { lines: JournalEntryLine[] })[] {
  const entries = getDb()
    .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ? ORDER BY date, id')
    .all(fiscalYearId) as JournalEntry[];

  const getLines = getDb().prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?');
  return entries.map(e => ({ ...e, lines: getLines.all(e.id) as JournalEntryLine[] }));
}

export function createJournalEntry(payload: CreateJournalEntryPayload): JournalEntry {
  const { fiscal_year_id, date, description, piece, lines } = payload;

  // Vérification exercice ouvert
  const fy = getDb().prepare('SELECT is_closed FROM fiscal_years WHERE id = ?').get(fiscal_year_id) as { is_closed: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');
  if (fy.is_closed) throw new Error('Cet exercice est clôturé — aucune modification possible');

  // Vérification équilibre débit/crédit
  validateEntryBalance(lines);

  return getDb().transaction(() => {
    const entryInfo = getDb().prepare(`
      INSERT INTO journal_entries (fiscal_year_id, date, description, piece)
      VALUES (@fiscal_year_id, @date, @description, @piece)
    `).run({ fiscal_year_id, date, description, piece: piece ?? null });

    const lineStmt = getDb().prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (@journal_entry_id, @account_id, @debit, @credit)
    `);
    for (const l of lines) {
      lineStmt.run({
        journal_entry_id: entryInfo.lastInsertRowid,
        account_id: l.account_id,
        debit:  l.debit  ?? null,
        credit: l.credit ?? null,
      });
    }

    return getDb().prepare('SELECT * FROM journal_entries WHERE id = ?').get(entryInfo.lastInsertRowid) as JournalEntry;
  })();
}

// ─── Soldes ───────────────────────────────────────────────────────────────────

export function getAccountBalances(fiscalYearId: number): AccountBalance[] {
  return getDb().prepare(`
    SELECT
      a.number,
      a.name,
      a.class,
      SUM(COALESCE(l.debit, 0))  AS total_debit,
      SUM(COALESCE(l.credit, 0)) AS total_credit,
      CASE a.normal_balance
        WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0)) - SUM(COALESCE(l.credit,0))
        WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
      END AS solde
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ?
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as AccountBalance[];
}

// ─── Modification / suppression d'écritures ──────────────────────────────────

export function updateJournalEntry(
  payload: UpdateJournalEntryPayload,
): JournalEntry & { lines: JournalEntryLine[] } {
  const { id, date, description, piece, lines } = payload;

  const existing = getDb()
    .prepare('SELECT fiscal_year_id FROM journal_entries WHERE id = ?')
    .get(id) as { fiscal_year_id: number } | undefined;
  if (!existing) throw new Error('Écriture introuvable');

  const fy = getDb()
    .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
    .get(existing.fiscal_year_id) as { is_closed: number };
  if (fy.is_closed) throw new Error('Cet exercice est clôturé — aucune modification possible');

  validateEntryBalance(lines);

  return getDb().transaction(() => {
    getDb()
      .prepare('DELETE FROM journal_entry_lines WHERE journal_entry_id = ?')
      .run(id);

    getDb().prepare(`
      UPDATE journal_entries
      SET date = @date, description = @description, piece = @piece, updated_at = datetime('now')
      WHERE id = @id
    `).run({ id, date, description, piece: piece ?? null });

    const lineStmt = getDb().prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (@journal_entry_id, @account_id, @debit, @credit)
    `);
    for (const l of lines) {
      lineStmt.run({
        journal_entry_id: id,
        account_id: l.account_id,
        debit:  l.debit  ?? null,
        credit: l.credit ?? null,
      });
    }

    const updated = getDb()
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(id) as JournalEntry;
    const updatedLines = getDb()
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(id) as JournalEntryLine[];
    return { ...updated, lines: updatedLines };
  })();
}

export function deleteJournalEntry(id: number): void {
  const existing = getDb()
    .prepare('SELECT fiscal_year_id FROM journal_entries WHERE id = ?')
    .get(id) as { fiscal_year_id: number } | undefined;
  if (!existing) throw new Error('Écriture introuvable');

  const fy = getDb()
    .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
    .get(existing.fiscal_year_id) as { is_closed: number };
  if (fy.is_closed) throw new Error('Cet exercice est clôturé — aucune modification possible');

  getDb().prepare('DELETE FROM journal_entries WHERE id = ?').run(id);
}
