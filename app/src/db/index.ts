import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { initSchema } from './schema';
import { runSchemaMigrations } from './schema-migrations';
import { seedAccountsIfEmpty } from './seed';
import { validateEntryBalance } from '../lib/accounting';
import { COTISATION_CENTS } from '../lib/format';
import type {
  Account, AccountType, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance,
  CreateJournalEntryPayload, UpdateJournalEntryPayload,
  OpeningBalanceSuggestion, OpeningBalanceLine,
  ClosingAccountLine, ClosingPreview,
  UpdateAccountPayload, CreateAccountPayload,
  AnalyticsAccountRow, AnalyticsGroup, AnalyticsData,
  DashboardCashBalance, DashboardData, DashboardCardConfig, DashboardCustomCard,
  LedgerLine, AccountLedgerData,
  TwintSummary,
  CashCount, CashCountLine, CashSession, CashCountPayload, CashSessionPayload,
  Member, MemberDues, MemberWithDues, MemberPayload, MemberPaymentPayload,
} from '../types';

let db: Database.Database;
let dbDir: string;
let changesAtOpen = 0;

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

export function hasDbChanges(): boolean {
  if (!db) return false;
  const current = db.prepare('SELECT total_changes()').pluck().get() as number;
  return current > changesAtOpen;
}

export function openDatabase(dataPath?: string): Database.Database {
  // Mode test : base SQLite en mémoire (isolation totale, pas de fichier résiduel)
  if (dataPath === ':memory:') {
    db = new Database(':memory:');
    initSchema(db);
    runSchemaMigrations(db);
    seedAccountsIfEmpty(db);
    changesAtOpen = db.prepare('SELECT total_changes()').pluck().get() as number;
    return db;
  }

  const dir = dataPath ?? path.join(app.getPath('userData'), 'data');
  dbDir = dir;
  const dbPath = path.join(dir, 'mcy-compta.db');

  // Créer le dossier si nécessaire
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  initSchema(db);
  runSchemaMigrations(db);
  seedAccountsIfEmpty(db);
  changesAtOpen = db.prepare('SELECT total_changes()').pluck().get() as number;
  return db;
}

// ─── Comptes ─────────────────────────────────────────────────────────────────

function normalBalanceForType(type: AccountType): 'DEBIT' | 'CREDIT' {
  return (type === 'ACTIF' || type === 'CHARGE') ? 'DEBIT' : 'CREDIT';
}

const ACCOUNT_WITH_ENTRIES_SQL = `
  SELECT a.*,
    EXISTS(SELECT 1 FROM journal_entry_lines jel WHERE jel.account_id = a.id) AS has_entries
  FROM accounts a
`;

export function getAllAccounts(): Account[] {
  return getDb().prepare(`${ACCOUNT_WITH_ENTRIES_SQL} ORDER BY a.number`).all() as Account[];
}

export function getActiveAccounts(): Account[] {
  return getDb().prepare(`${ACCOUNT_WITH_ENTRIES_SQL} WHERE a.is_active = 1 ORDER BY a.number`).all() as Account[];
}

export function updateAccount(payload: UpdateAccountPayload): Account {
  const { id, name, description, account_group, is_active, number, type } = payload;
  const fields: string[]  = [];
  const values: unknown[] = [];

  if (number !== undefined || type !== undefined) {
    const hasEntries = (getDb()
      .prepare('SELECT EXISTS(SELECT 1 FROM journal_entry_lines WHERE account_id = ?)')
      .pluck().get(id) as number) === 1;
    if (hasEntries) throw new Error('Impossible de modifier le numéro ou le type : des écritures existent pour ce compte');
  }

  if (number !== undefined) {
    if (!/^\d/.test(number)) throw new Error(`Numéro de compte invalide : "${number}"`);
    const conflict = getDb().prepare('SELECT id FROM accounts WHERE number = ? AND id != ?').get(number, id);
    if (conflict) throw new Error(`Numéro de compte ${number} déjà utilisé`);
    fields.push('number = ?'); values.push(number);
    fields.push('class = ?');  values.push(parseInt(number[0], 10));
  }

  if (type !== undefined) {
    fields.push('type = ?');           values.push(type);
    fields.push('normal_balance = ?'); values.push(normalBalanceForType(type));
  }

  if (name          !== undefined) { fields.push('name = ?');          values.push(name); }
  if (description   !== undefined) { fields.push('description = ?');   values.push(description); }
  if (account_group !== undefined) { fields.push('account_group = ?'); values.push(account_group); }
  if (is_active     !== undefined) { fields.push('is_active = ?');     values.push(is_active ? 1 : 0); }

  if (fields.length === 0) throw new Error('Aucun champ à mettre à jour');

  getDb()
    .prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values, id);

  return getDb().prepare(`${ACCOUNT_WITH_ENTRIES_SQL} WHERE a.id = ?`).get(id) as Account;
}

export function createAccount(payload: CreateAccountPayload): Account {
  const { number, name, type, description, account_group } = payload;

  if (!/^\d/.test(number)) throw new Error(`Numéro de compte invalide : "${number}"`);

  const existing = getDb().prepare('SELECT id FROM accounts WHERE number = ?').get(number);
  if (existing) throw new Error(`Numéro de compte ${number} déjà utilisé`);

  const cls            = parseInt(number[0], 10);
  const normal_balance = normalBalanceForType(type);

  const result = getDb()
    .prepare(`
      INSERT INTO accounts (number, name, class, type, normal_balance, description, account_group)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(number, name, cls, type, normal_balance, description ?? null, account_group ?? null);

  return getDb()
    .prepare(`${ACCOUNT_WITH_ENTRIES_SQL} WHERE a.id = ?`)
    .get(result.lastInsertRowid) as Account;
}

export function deleteAccount(id: number): void {
  const account = getDb().prepare('SELECT id FROM accounts WHERE id = ?').get(id);
  if (!account) throw new Error('Compte introuvable');

  const hasEntries = (getDb()
    .prepare('SELECT EXISTS(SELECT 1 FROM journal_entry_lines WHERE account_id = ?)')
    .pluck().get(id) as number) === 1;
  if (hasEntries) throw new Error('Impossible de supprimer ce compte : des écritures existent pour ce compte');

  getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

export function getAnalyticsData(fiscalYearId: number): AnalyticsData {
  type RawRow = {
    id: number; number: string; name: string;
    type: string; account_group: string | null;
    total_debit: number; total_credit: number;
  };

  const rows = getDb().prepare(`
    SELECT
      a.id, a.number, a.name, a.type, a.account_group,
      SUM(COALESCE(l.debit,  0)) AS total_debit,
      SUM(COALESCE(l.credit, 0)) AS total_credit
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ? AND a.class IN (3, 4) AND e.is_closing_entry = 0
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as RawRow[];

  const toRow = (r: RawRow): AnalyticsAccountRow => ({
    id:       r.id,
    number:   r.number,
    name:     r.name,
    type:     r.type as 'PRODUIT' | 'CHARGE',
    recettes: r.type === 'PRODUIT' ? r.total_credit - r.total_debit : 0,
    charges:  r.type === 'CHARGE'  ? r.total_debit - r.total_credit : 0,
  });

  const grouped   = rows.filter(r => r.account_group);
  const ungrouped = rows.filter(r => !r.account_group);

  const groupMap = new Map<string, RawRow[]>();
  for (const r of grouped) {
    const key  = r.account_group!;
    const list = groupMap.get(key) ?? [];
    list.push(r);
    groupMap.set(key, list);
  }

  const groups: AnalyticsGroup[] = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([name, accs]) => {
      const accounts      = accs.map(toRow);
      const totalRecettes = accounts.reduce((s, r) => s + r.recettes, 0);
      const totalCharges  = accounts.reduce((s, r) => s + r.charges,  0);
      return { name, accounts, totalRecettes, totalCharges, resultat: totalRecettes - totalCharges };
    });

  return { groups, ungrouped: ungrouped.map(toRow) };
}

export function getDashboardData(
  fiscalYearId: number,
  cards: DashboardCardConfig[] = [],
): DashboardData {
  const cashBalances = getDb().prepare(`
    SELECT a.number, a.name,
      CASE a.normal_balance
        WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0)) - SUM(COALESCE(l.credit,0))
        WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
      END AS solde
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ? AND a.number IN ('100','101','102')
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as DashboardCashBalance[];

  const resultRows = getDb().prepare(`
    SELECT a.class,
      CASE a.normal_balance
        WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0)) - SUM(COALESCE(l.credit,0))
        WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
      END AS solde
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ? AND a.class IN (3, 4) AND e.is_closing_entry = 0
    GROUP BY a.id
  `).all(fiscalYearId) as Array<{ class: number; solde: number }>;

  const netResultCents = resultRows.reduce((sum, r) => (
    r.class === 3 ? sum + r.solde : sum - r.solde
  ), 0);

  const accountStmt = getDb().prepare(`
    SELECT a.number, a.name, a.normal_balance,
      COALESCE((
        SELECT CASE a.normal_balance
          WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0))  - SUM(COALESCE(l.credit,0))
          WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
        END
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id
        WHERE l.account_id = a.id AND e.fiscal_year_id = ?
      ), 0) AS solde
    FROM accounts a WHERE a.id = ?
  `);

  const groupStmt = getDb().prepare(`
    SELECT a.class,
      CASE a.normal_balance
        WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0))  - SUM(COALESCE(l.credit,0))
        WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
      END AS solde
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ? AND a.account_group = ? AND a.class IN (3, 4)
      AND e.is_closing_entry = 0
    GROUP BY a.id
  `);

  const customCards: DashboardCustomCard[] = cards.map(card => {
    if (card.type === 'account') {
      const row = accountStmt.get(fiscalYearId, card.accountId) as
        { number: string; name: string; solde: number } | undefined;
      return {
        key:        `account-${card.accountId}`,
        label:      row?.name    ?? '',
        subLabel:   row?.number  ?? '',
        valueCents: row?.solde   ?? 0,
        isResult:   false,
      };
    } else {
      const rows = groupStmt.all(fiscalYearId, card.groupName) as
        Array<{ class: number; solde: number }>;
      const pl = rows.reduce((s, r) => (r.class === 3 ? s + r.solde : s - r.solde), 0);
      return {
        key:        `group-${card.groupName}`,
        label:      card.groupName,
        subLabel:   'Analytique',
        valueCents: pl,
        isResult:   true,
      };
    }
  });

  return { cashBalances, netResultCents, customCards };
}

// ─── Récapitulatif Twint ─────────────────────────────────────────────────────

export function getTwintSummary(fiscalYearId: number): TwintSummary {
  const row = getDb().prepare(`
    SELECT
      COALESCE((
        SELECT SUM(l.debit)
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id
        JOIN accounts a ON a.id = l.account_id
        WHERE e.fiscal_year_id = ? AND a.number = '102' AND l.debit IS NOT NULL
          AND e.is_closing_entry = 0
      ), 0) AS gross,
      COALESCE((
        SELECT SUM(COALESCE(l.debit,0)) - SUM(COALESCE(l.credit,0))
        FROM journal_entry_lines l
        JOIN journal_entries e ON e.id = l.journal_entry_id
        JOIN accounts a ON a.id = l.account_id
        WHERE e.fiscal_year_id = ? AND a.number = '402'
          AND e.is_closing_entry = 0
      ), 0) AS fees
  `).get(fiscalYearId, fiscalYearId) as { gross: number; fees: number };

  const gross = row.gross;
  const fees  = row.fees;
  return {
    grossCents:  gross,
    feesCents:   fees,
    netCents:    gross - fees,
    ratePercent: gross > 0 ? (fees / gross) * 100 : 0,
  };
}

// ─── Exercices ────────────────────────────────────────────────────────────────

export function getAllFiscalYears(): FiscalYear[] {
  return getDb().prepare(`
    SELECT
      fy.*,
      CASE WHEN COUNT(je.id) > 0 THEN 1 ELSE 0 END AS hasOpeningBalance
    FROM fiscal_years fy
    LEFT JOIN journal_entries je
      ON je.fiscal_year_id = fy.id
      AND je.is_opening_balance = 1
    GROUP BY fy.id
    ORDER BY fy.year DESC
  `).all() as FiscalYear[];
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
  return getDb().prepare(`
    SELECT fy.*, 0 AS hasOpeningBalance
    FROM fiscal_years fy
    WHERE fy.id = ?
  `).get(info.lastInsertRowid) as FiscalYear;
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
      a.id,
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

// Même requête que getAccountBalances mais sans les écritures de clôture
// (is_closing_entry = 1). Utilisée par le Bilan complet pour afficher les états
// financiers en présentation comptable standard : Capital = solde d'ouverture,
// Résultat de l'exercice = produits − charges réels avant soldage.
export function getAccountBalancesExcludingClosing(fiscalYearId: number): AccountBalance[] {
  return getDb().prepare(`
    SELECT
      a.id,
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
    WHERE e.fiscal_year_id = ? AND e.is_closing_entry = 0
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as AccountBalance[];
}

export function getAccountLedger(fiscalYearId: number, accountId: number): AccountLedgerData {
  const account = getDb().prepare(`
    SELECT id, number, name, type, normal_balance, class
    FROM accounts WHERE id = ?
  `).get(accountId) as AccountLedgerData['account'] | undefined;

  if (!account) throw new Error('Compte introuvable');

  const rows = getDb().prepare(`
    SELECT
      e.id   AS entry_id,
      e.date,
      e.piece,
      e.description,
      e.is_opening_balance,
      e.is_closing_entry,
      l.debit,
      l.credit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.journal_entry_id
    WHERE l.account_id = ? AND e.fiscal_year_id = ?
    ORDER BY e.date, e.id
  `).all(accountId, fiscalYearId) as Array<{
    entry_id: number;
    date: string;
    piece: string | null;
    description: string;
    is_opening_balance: number;
    is_closing_entry: number;
    debit: number | null;
    credit: number | null;
  }>;

  // Filtre par côté opposé : ligne au débit → contreparties au crédit, et vice versa.
  // Évite d'afficher des co-débits ou co-crédits comme contreparties (écritures composées).
  const cpStmt = getDb().prepare(`
    SELECT a.number, a.name, COALESCE(l2.debit, l2.credit) AS amount
    FROM journal_entry_lines l2
    JOIN accounts a ON a.id = l2.account_id
    WHERE l2.journal_entry_id = ?
      AND l2.account_id != ?
      AND CASE WHEN ? = 1 THEN l2.credit IS NOT NULL
               ELSE l2.debit IS NOT NULL
          END
    ORDER BY a.number
  `);

  // Pour les écritures de clôture, chaque ligne est appairée exactement avec
  // la contrepartie de même montant (structure : chaque compte 3xx/4xx ↔ 900,
  // même montant, côté opposé). On filtre aussi par montant pour isoler la
  // contrepartie directe et éviter de lister tous les comptes de l'écriture.
  const cpClosingStmt = getDb().prepare(`
    SELECT a.number, a.name, COALESCE(l2.debit, l2.credit) AS amount
    FROM journal_entry_lines l2
    JOIN accounts a ON a.id = l2.account_id
    WHERE l2.journal_entry_id = ?
      AND l2.account_id != ?
      AND CASE WHEN ? = 1 THEN l2.credit IS NOT NULL
               ELSE l2.debit IS NOT NULL
          END
      AND COALESCE(l2.debit, l2.credit) = ?
    ORDER BY a.number
    LIMIT 1
  `);

  const lines: LedgerLine[] = rows.map(r => {
    const isDebit = r.debit != null;
    const amount  = r.debit ?? r.credit ?? 0;
    const counterparts = r.is_closing_entry === 1
      ? cpClosingStmt.all(r.entry_id, accountId, isDebit ? 1 : 0, amount) as Array<{ number: string; name: string; amount: number }>
      : cpStmt.all(r.entry_id, accountId, isDebit ? 1 : 0) as Array<{ number: string; name: string; amount: number }>;
    return {
      entryId:          r.entry_id,
      date:             r.date,
      piece:            r.piece,
      description:      r.description,
      isOpeningBalance: r.is_opening_balance === 1,
      isClosingEntry:   r.is_closing_entry   === 1,
      debit:            r.debit,
      credit:           r.credit,
      counterparts,
    };
  });

  return { account, lines };
}

export function getOpeningBalanceSuggestions(fiscalYearId: number): OpeningBalanceSuggestion[] {
  const currentFy = getDb()
    .prepare('SELECT year FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number } | undefined;
  if (!currentFy) throw new Error('Exercice introuvable');

  const prevFy = getDb()
    .prepare('SELECT id FROM fiscal_years WHERE year = ?')
    .get(currentFy.year - 1) as { id: number } | undefined;
  const prevFyId = prevFy?.id ?? null;

  const rows = getDb().prepare(`
    SELECT
      a.id            AS accountId,
      a.number        AS accountNumber,
      a.name          AS accountName,
      a.type,
      a.normal_balance AS normalBalance,
      COALESCE(
        CASE a.normal_balance
          WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit, 0))  - SUM(COALESCE(l.credit, 0))
          WHEN 'CREDIT' THEN SUM(COALESCE(l.credit, 0)) - SUM(COALESCE(l.debit, 0))
        END,
        0
      ) AS suggestedAmountCents
    FROM accounts a
    LEFT JOIN journal_entry_lines l
      ON l.account_id = a.id
      AND @prevFyId IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM journal_entries e
        WHERE e.id = l.journal_entry_id AND e.fiscal_year_id = @prevFyId
      )
    WHERE a.class IN (1, 2) AND a.is_active = 1
    GROUP BY a.id
    ORDER BY a.number
  `).all({ prevFyId }) as OpeningBalanceSuggestion[];

  return rows.map(r => ({
    ...r,
    suggestedAmountCents: Math.max(0, r.suggestedAmountCents),
  }));
}

export function createOpeningBalanceEntry(
  fiscalYearId: number,
  lines: OpeningBalanceLine[],
): void {
  const fy = getDb()
    .prepare('SELECT year, is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number; is_closed: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');
  if (fy.is_closed) throw new Error('Cet exercice est clôturé — aucune modification possible');

  const existing = getDb()
    .prepare('SELECT id FROM journal_entries WHERE fiscal_year_id = ? AND is_opening_balance = 1')
    .get(fiscalYearId);
  if (existing) throw new Error('Des soldes à nouveau existent déjà pour cet exercice');

  const nonZero = lines.filter(l => l.amountCents > 0);

  const entryLines = nonZero.map(l => {
    const account = getDb()
      .prepare('SELECT normal_balance FROM accounts WHERE id = ?')
      .get(l.accountId) as { normal_balance: string } | undefined;
    if (!account) throw new Error(`Compte introuvable : ${l.accountId}`);
    return account.normal_balance === 'DEBIT'
      ? { account_id: l.accountId, debit: l.amountCents, credit: null }
      : { account_id: l.accountId, debit: null, credit: l.amountCents };
  });

  validateEntryBalance(entryLines);

  getDb().transaction(() => {
    const info = getDb().prepare(`
      INSERT INTO journal_entries (fiscal_year_id, date, description, is_opening_balance)
      VALUES (@fiscal_year_id, @date, @description, 1)
    `).run({
      fiscal_year_id: fiscalYearId,
      date: `${fy.year}-01-01`,
      description: `Soldes à nouveau ${fy.year}`,
    });

    const stmt = getDb().prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (@journal_entry_id, @account_id, @debit, @credit)
    `);
    for (const l of entryLines) {
      stmt.run({
        journal_entry_id: info.lastInsertRowid,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
      });
    }
  })();
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

// ─── Clôture ──────────────────────────────────────────────────────────────────

export function getClosingPreview(fiscalYearId: number): ClosingPreview {
  const fy = getDb()
    .prepare('SELECT year FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');

  const zeroRows = getDb().prepare(`
    SELECT
      a.number, a.name,
      COALESCE(
        CASE a.normal_balance
          WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit, 0))  - SUM(COALESCE(l.credit, 0))
          WHEN 'CREDIT' THEN SUM(COALESCE(l.credit, 0)) - SUM(COALESCE(l.debit, 0))
        END,
        0
      ) AS solde
    FROM accounts a
    LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      AND EXISTS (
        SELECT 1 FROM journal_entries e
        WHERE e.id = l.journal_entry_id AND e.fiscal_year_id = @fiscalYearId
      )
    WHERE a.must_be_zero_at_closing = 1 AND a.is_active = 1
    GROUP BY a.id
  `).all({ fiscalYearId }) as { number: string; name: string; solde: number }[];

  const blockers: string[] = [];
  for (const row of zeroRows) {
    if (row.solde !== 0) {
      const chf = (Math.abs(row.solde) / 100).toFixed(2);
      blockers.push(`${row.name} (${row.number}) : solde CHF ${chf} doit être à 0`);
    }
  }

  const rows = getDb().prepare(`
    SELECT
      a.id       AS accountId,
      a.number   AS accountNumber,
      a.name     AS accountName,
      a.type,
      COALESCE(
        CASE a.normal_balance
          WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit, 0))  - SUM(COALESCE(l.credit, 0))
          WHEN 'CREDIT' THEN SUM(COALESCE(l.credit, 0)) - SUM(COALESCE(l.debit, 0))
        END,
        0
      ) AS soldeCents
    FROM accounts a
    LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      AND EXISTS (
        SELECT 1 FROM journal_entries e
        WHERE e.id = l.journal_entry_id AND e.fiscal_year_id = @fiscalYearId
      )
    WHERE a.class IN (3, 4) AND a.is_active = 1
    GROUP BY a.id
    ORDER BY a.number
  `).all({ fiscalYearId }) as ClosingAccountLine[];

  const accounts = rows.filter(r => r.soldeCents !== 0);

  const netResultCents = accounts.reduce((sum, a) => {
    if (a.type === 'PRODUIT') return sum + a.soldeCents;
    return sum - a.soldeCents;
  }, 0);

  return { blockers, accounts, netResultCents };
}

export function closeFiscalYear(fiscalYearId: number): void {
  const fy = getDb()
    .prepare('SELECT year, is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number; is_closed: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');
  if (fy.is_closed) throw new Error('Cet exercice est déjà clôturé');

  const existing = getDb()
    .prepare('SELECT id FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
    .get(fiscalYearId);
  if (existing) throw new Error('Des écritures de clôture existent déjà pour cet exercice');

  const preview = getClosingPreview(fiscalYearId);
  if (preview.blockers.length > 0) {
    throw new Error(`Clôture impossible : ${preview.blockers.join('; ')}`);
  }

  const account900 = getDb()
    .prepare('SELECT id FROM accounts WHERE is_closing_account = 1')
    .get() as { id: number } | undefined;
  if (!account900) throw new Error('Compte Profits et Pertes (900) introuvable');

  const account290 = getDb()
    .prepare("SELECT id FROM accounts WHERE type = 'FONDS_PROPRES' AND is_active = 1")
    .get() as { id: number } | undefined;
  if (!account290) throw new Error('Compte Capital (290) introuvable');

  getDb().transaction(() => {
    const year = fy.year;
    const lineStmt = getDb().prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (@entry_id, @account_id, @debit, @credit)
    `);

    if (preview.accounts.length > 0) {
      const entry1 = getDb().prepare(`
        INSERT INTO journal_entries (fiscal_year_id, date, description, is_closing_entry)
        VALUES (@fiscal_year_id, @date, @description, 1)
      `).run({
        fiscal_year_id: fiscalYearId,
        date: `${year}-12-31`,
        description: `Clôture — Soldage résultat ${year}`,
      });

      const lines: Array<{ account_id: number; debit: number | null; credit: number | null }> = [];
      for (const a of preview.accounts) {
        const amt = Math.abs(a.soldeCents);
        if (a.type === 'PRODUIT') {
          if (a.soldeCents > 0) {
            lines.push({ account_id: a.accountId,    debit: amt,  credit: null });
            lines.push({ account_id: account900!.id, debit: null, credit: amt  });
          } else {
            lines.push({ account_id: a.accountId,    debit: null, credit: amt  });
            lines.push({ account_id: account900!.id, debit: amt,  credit: null });
          }
        } else {
          if (a.soldeCents > 0) {
            lines.push({ account_id: a.accountId,    debit: null, credit: amt  });
            lines.push({ account_id: account900!.id, debit: amt,  credit: null });
          } else {
            lines.push({ account_id: a.accountId,    debit: amt,  credit: null });
            lines.push({ account_id: account900!.id, debit: null, credit: amt  });
          }
        }
      }
      validateEntryBalance(lines);
      for (const l of lines) {
        lineStmt.run({ entry_id: entry1.lastInsertRowid, account_id: l.account_id, debit: l.debit, credit: l.credit });
      }
    }

    if (preview.netResultCents !== 0) {
      const entry2 = getDb().prepare(`
        INSERT INTO journal_entries (fiscal_year_id, date, description, is_closing_entry)
        VALUES (@fiscal_year_id, @date, @description, 1)
      `).run({
        fiscal_year_id: fiscalYearId,
        date: `${year}-12-31`,
        description: `Clôture — Transfert du ${preview.netResultCents > 0 ? 'bénéfice' : 'déficit'} vers Capital ${year}`,
      });

      const amt = Math.abs(preview.netResultCents);
      if (preview.netResultCents > 0) {
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account900!.id, debit: amt,  credit: null });
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account290!.id, debit: null, credit: amt  });
      } else {
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account900!.id, debit: null, credit: amt  });
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account290!.id, debit: amt,  credit: null });
      }
    }

    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fiscalYearId);
  })();
}

export function reopenFiscalYear(fiscalYearId: number): void {
  const fy = getDb()
    .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { is_closed: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');
  if (!fy.is_closed) throw new Error('Cet exercice n\'est pas clôturé');

  getDb().transaction(() => {
    getDb()
      .prepare('DELETE FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .run(fiscalYearId);
    getDb()
      .prepare('UPDATE fiscal_years SET is_closed = 0 WHERE id = ?')
      .run(fiscalYearId);
  })();
}

// ─── Caisse ────────────────────────────────────────────────────────────────

const CASH_COUNT_SELECT = `
  SELECT
    cc.id,
    cc.fiscal_year_id,
    cc.session_id,
    cs.label      AS session_label,
    cc.date,
    cc.label,
    cc.context,
    cc.notes,
    cc.created_at,
    COALESCE((SELECT SUM(denomination * quantity)
              FROM cash_count_lines WHERE cash_count_id = cc.id), 0) AS total,
    COALESCE((
      SELECT SUM(COALESCE(jel.debit,0)) - SUM(COALESCE(jel.credit,0))
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounts a         ON a.id  = jel.account_id
      WHERE a.number = '100'
        AND je.fiscal_year_id = cc.fiscal_year_id
        AND je.date <= cc.date
    ), 0) AS theoretical_balance
  FROM cash_counts cc
  LEFT JOIN cash_sessions cs ON cs.id = cc.session_id
`;

export function getCashCounts(fiscalYearId: number): CashCount[] {
  return getDb().prepare(`
    ${CASH_COUNT_SELECT}
    WHERE cc.fiscal_year_id = ?
    ORDER BY cc.date DESC, cc.created_at DESC
  `).all(fiscalYearId) as CashCount[];
}

export function getCashCountById(id: number): CashCount {
  const row = getDb().prepare(`
    ${CASH_COUNT_SELECT} WHERE cc.id = ?
  `).get(id) as CashCount | undefined;
  if (!row) throw new Error(`Comptage de caisse ${id} introuvable`);
  const lines = getDb().prepare(
    'SELECT denomination, quantity FROM cash_count_lines WHERE cash_count_id = ? ORDER BY denomination'
  ).all(id) as CashCountLine[];
  return { ...row, lines };
}

export function createCashCount(payload: CashCountPayload): CashCount {
  const { fiscal_year_id, session_id, date, label, context, notes, lines } = payload;
  return getDb().transaction((): CashCount => {
    const r = getDb().prepare(`
      INSERT INTO cash_counts (fiscal_year_id, session_id, date, label, context, notes)
      VALUES (@fiscal_year_id, @session_id, @date, @label, @context, @notes)
    `).run({
      fiscal_year_id, session_id: session_id ?? null,
      date, label, context, notes: notes ?? null,
    });
    const stmt = getDb().prepare(`
      INSERT INTO cash_count_lines (cash_count_id, denomination, quantity)
      VALUES (@cash_count_id, @denomination, @quantity)
    `);
    for (const l of lines) {
      stmt.run({ cash_count_id: r.lastInsertRowid, denomination: l.denomination, quantity: l.quantity });
    }
    return getCashCountById(Number(r.lastInsertRowid));
  })();
}

export function updateCashCount(id: number, payload: CashCountPayload): CashCount {
  const { date, label, context, session_id, notes, lines } = payload;
  return getDb().transaction((): CashCount => {
    getDb().prepare(`
      UPDATE cash_counts SET date = @date, label = @label, context = @context,
        session_id = @session_id, notes = @notes
      WHERE id = @id
    `).run({ date, label, context, session_id: session_id ?? null, notes: notes ?? null, id });
    getDb().prepare('DELETE FROM cash_count_lines WHERE cash_count_id = ?').run(id);
    const stmt = getDb().prepare(`
      INSERT INTO cash_count_lines (cash_count_id, denomination, quantity)
      VALUES (@cash_count_id, @denomination, @quantity)
    `);
    for (const l of lines) {
      stmt.run({ cash_count_id: id, denomination: l.denomination, quantity: l.quantity });
    }
    return getCashCountById(id);
  })();
}

export function deleteCashCount(id: number): void {
  getDb().prepare('DELETE FROM cash_counts WHERE id = ?').run(id);
}

export function getCashSessions(fiscalYearId: number): CashSession[] {
  return getDb().prepare(`
    SELECT id, fiscal_year_id, label, account_group, notes, created_at
    FROM cash_sessions WHERE fiscal_year_id = ? ORDER BY created_at DESC
  `).all(fiscalYearId) as CashSession[];
}

export function createCashSession(payload: CashSessionPayload): CashSession {
  const { fiscal_year_id, label, account_group, notes } = payload;
  const r = getDb().prepare(`
    INSERT INTO cash_sessions (fiscal_year_id, label, account_group, notes)
    VALUES (@fiscal_year_id, @label, @account_group, @notes)
  `).run({ fiscal_year_id, label, account_group: account_group ?? null, notes: notes ?? null });
  return getDb().prepare(
    'SELECT id, fiscal_year_id, label, account_group, notes, created_at FROM cash_sessions WHERE id = ?'
  ).get(r.lastInsertRowid) as CashSession;
}

export function deleteCashSession(id: number): void {
  getDb().prepare('DELETE FROM cash_sessions WHERE id = ?').run(id);
}

// ─── Membres ─────────────────────────────────────────────────────────────────

export function getAllMembers(): MemberWithDues[] {
  const members = getDb()
    .prepare('SELECT * FROM members ORDER BY last_name, first_name')
    .all() as Member[];
  const getDues = getDb().prepare(
    'SELECT * FROM member_dues WHERE member_id = ? ORDER BY year DESC'
  );
  return members.map(m => ({ ...m, dues: getDues.all(m.id) as MemberDues[] }));
}

export function createMember(payload: MemberPayload): Member {
  const { last_name, first_name, entry_date, is_active, inactive_note } = payload;
  const r = getDb().prepare(`
    INSERT INTO members (last_name, first_name, entry_date, is_active, inactive_note)
    VALUES (@last_name, @first_name, @entry_date, @is_active, @inactive_note)
  `).run({
    last_name, first_name,
    entry_date: entry_date ?? null,
    is_active,
    inactive_note: inactive_note ?? null,
  });
  return getDb().prepare('SELECT * FROM members WHERE id = ?').get(r.lastInsertRowid) as Member;
}

export function updateMember(id: number, payload: MemberPayload): Member {
  const { last_name, first_name, entry_date, is_active, inactive_note } = payload;
  getDb().prepare(`
    UPDATE members
    SET last_name = @last_name, first_name = @first_name, entry_date = @entry_date,
        is_active = @is_active, inactive_note = @inactive_note
    WHERE id = @id
  `).run({ last_name, first_name, entry_date: entry_date ?? null, is_active, inactive_note: inactive_note ?? null, id });
  return getDb().prepare('SELECT * FROM members WHERE id = ?').get(id) as Member;
}

export function deleteMember(id: number): void {
  const hasDues = (getDb()
    .prepare('SELECT EXISTS(SELECT 1 FROM member_dues WHERE member_id = ?)')
    .pluck().get(id) as number) === 1;
  if (hasDues) throw new Error('Impossible de supprimer ce membre : des cotisations existent');
  getDb().prepare('DELETE FROM members WHERE id = ?').run(id);
}

export function setHistoricalDues(
  memberId: number, year: number, paid: boolean, note: string | null,
): MemberDues {
  getDb().prepare(`
    INSERT INTO member_dues (member_id, year, paid, payment_note)
    VALUES (@member_id, @year, @paid, @payment_note)
    ON CONFLICT(member_id, year) DO UPDATE SET
      paid = excluded.paid,
      payment_note = excluded.payment_note
  `).run({ member_id: memberId, year, paid: paid ? 1 : 0, payment_note: note ?? null });
  return getDb().prepare(
    'SELECT * FROM member_dues WHERE member_id = ? AND year = ?'
  ).get(memberId, year) as MemberDues;
}

export function recordPayment(
  payload: MemberPaymentPayload,
): { dues: MemberDues[]; journalEntryId: number } {
  const { member_id, payment_date, total_amount_cents, debit_account_id, years } = payload;

  return getDb().transaction(() => {
    const paymentYear = parseInt(payment_date.slice(0, 4), 10);
    const fy = getDb()
      .prepare('SELECT id FROM fiscal_years WHERE year = ?')
      .get(paymentYear) as { id: number } | undefined;
    if (!fy) throw new Error(`Aucun exercice trouvé pour l'année ${paymentYear}`);

    const cotisationsCents = years.length * COTISATION_CENTS;
    const surplusCents = total_amount_cents - cotisationsCents;
    if (surplusCents < 0) throw new Error('Montant insuffisant pour couvrir les années sélectionnées');

    for (const year of years) {
      const existing = getDb()
        .prepare('SELECT paid FROM member_dues WHERE member_id = ? AND year = ?')
        .get(member_id, year) as { paid: number } | undefined;
      if (existing?.paid === 1) throw new Error(`L'année ${year} est déjà marquée comme payée`);
    }

    const member = getDb()
      .prepare('SELECT first_name, last_name FROM members WHERE id = ?')
      .get(member_id) as { first_name: string; last_name: string } | undefined;
    if (!member) throw new Error('Membre introuvable');

    const acc300 = getDb()
      .prepare("SELECT id FROM accounts WHERE number = '300'")
      .get() as { id: number } | undefined;
    if (!acc300) throw new Error('Compte 300 introuvable');

    const acc391 = getDb()
      .prepare("SELECT id FROM accounts WHERE number = '391'")
      .get() as { id: number } | undefined;

    const description = `Cotisation ${member.first_name} ${member.last_name} — ${years.join('+')}`;
    const lines: Array<{ account_id: number; debit?: number; credit?: number }> = [
      { account_id: debit_account_id, debit: total_amount_cents },
      { account_id: acc300.id, credit: cotisationsCents },
    ];
    if (surplusCents > 0) {
      if (!acc391) throw new Error('Compte 391 introuvable');
      lines.push({ account_id: acc391.id, credit: surplusCents });
    }

    const entry = createJournalEntry({
      fiscal_year_id: fy.id, date: payment_date, description, lines,
    });

    const upsert = getDb().prepare(`
      INSERT INTO member_dues (member_id, year, paid, payment_date, amount_cents, journal_entry_id)
      VALUES (@member_id, @year, 1, @payment_date, @amount_cents, @journal_entry_id)
      ON CONFLICT(member_id, year) DO UPDATE SET
        paid = 1, payment_date = excluded.payment_date,
        amount_cents = excluded.amount_cents,
        journal_entry_id = excluded.journal_entry_id
    `);
    for (const year of years) {
      upsert.run({ member_id, year, payment_date, amount_cents: COTISATION_CENTS, journal_entry_id: entry.id });
    }

    const dues = years.map(year =>
      getDb()
        .prepare('SELECT * FROM member_dues WHERE member_id = ? AND year = ?')
        .get(member_id, year) as MemberDues
    );

    return { dues, journalEntryId: entry.id };
  })();
}
