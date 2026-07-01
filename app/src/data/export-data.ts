import type Database from 'better-sqlite3';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ExportRow {
  accountNumber:       string;
  accountName:         string;
  accountType:         string;
  normalBalance:       string;
  mustBeZeroAtClosing: number;
  date:                string;
  description:         string;
  piece:               string | null;
  isClosingEntry:      number;
  debit:               number | null;  // centimes
  credit:              number | null;  // centimes
}

export interface JournalRow {
  entryId:          number;
  date:             string;
  piece:            string | null;
  description:      string;
  isOpeningBalance: number;
  isClosingEntry:   number;
  accountNumber:    string;
  accountName:      string;
  debit:            number | null;  // centimes
  credit:           number | null;  // centimes
}

export interface AccountData {
  number:              string;
  name:                string;
  type:                string;
  normalBalance:       string;
  mustBeZeroAtClosing: number;
  rows:                ExportRow[];
}

export interface EntryDetail {
  entryId:          number;
  date:             string;
  piece:            string | null;
  description:      string;
  isOpeningBalance: boolean;
  isClosingEntry:   boolean;
  lines: Array<{
    accountNumber: string;
    accountName:   string;
    debit:         number | null;
    credit:        number | null;
  }>;
}

export interface LedgerRow {
  date:             string;
  description:      string;
  piece:            string | null;
  isOpeningBalance: boolean;
  contra:           string;
  debit:            number | null;  // CHF
  credit:           number | null;  // CHF
}

export type JournalSide = {
  account:       string;  // accountName
  accountNumber: string;
  amount:        number;  // centimes
};

export interface GroupedJournalEntry {
  entryId:          number;
  date:             string;
  piece:            string | null;
  description:      string;
  isOpeningBalance: boolean;
  isClosingEntry:   boolean;
  debits:           JournalSide[];
  credits:          JournalSide[];
}

export interface ExportData {
  year:        number;
  isClosed:    boolean;
  accountMap:  Map<string, AccountData>;
  journalRows: JournalRow[];
  entries:     EntryDetail[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function centsToCHF(cents: number | null): number {
  return cents !== null ? Math.round(cents) / 100 : 0;
}

/**
 * Solde d'un compte excluant les écritures de clôture (résultat en CHF).
 * Reproduit getAccountBalancesExcludingClosing : le Capital reflète le solde
 * d'ouverture et le résultat reflète les produits/charges réels avant soldage.
 */
export function computeSolde(data: AccountData): number {
  const rows       = data.rows.filter(r => r.isClosingEntry === 0);
  const totalDebit  = rows.reduce((s, r) => s + (r.debit  ?? 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (r.credit ?? 0), 0);
  return data.normalBalance === 'DEBIT'
    ? centsToCHF(totalDebit - totalCredit)
    : centsToCHF(totalCredit - totalDebit);
}

/**
 * Groupe les lignes brutes en EntryDetail (une structure par écriture avec
 * toutes ses lignes). Utilisé pour le grand-livre et les feuilles de compte.
 */
function groupEntriesWithLines(rows: JournalRow[]): EntryDetail[] {
  const map = new Map<number, EntryDetail>();
  for (const r of rows) {
    if (!map.has(r.entryId)) {
      map.set(r.entryId, {
        entryId:          r.entryId,
        date:             r.date,
        piece:            r.piece,
        description:      r.description,
        isOpeningBalance: r.isOpeningBalance === 1,
        isClosingEntry:   r.isClosingEntry === 1,
        lines:            [],
      });
    }
    map.get(r.entryId)!.lines.push({
      accountNumber: r.accountNumber,
      accountName:   r.accountName,
      debit:         r.debit,
      credit:        r.credit,
    });
  }
  return Array.from(map.values());
}

/**
 * Groupe les lignes brutes en GroupedJournalEntry (une structure par écriture
 * avec les côtés débit et crédit séparés). Utilisé pour la feuille Journal
 * (Excel) et le journal PDF : une ligne par paire (débit | crédit | montant).
 */
export function groupJournalEntries(rows: JournalRow[]): GroupedJournalEntry[] {
  const map = new Map<number, GroupedJournalEntry>();
  for (const r of rows) {
    if (!map.has(r.entryId)) {
      map.set(r.entryId, {
        entryId:          r.entryId,
        date:             r.date,
        piece:            r.piece,
        description:      r.description,
        isOpeningBalance: r.isOpeningBalance === 1,
        isClosingEntry:   r.isClosingEntry === 1,
        debits:           [],
        credits:          [],
      });
    }
    const entry = map.get(r.entryId)!;
    if (r.debit  !== null) entry.debits.push({ account: r.accountName, accountNumber: r.accountNumber, amount: r.debit  });
    if (r.credit !== null) entry.credits.push({ account: r.accountName, accountNumber: r.accountNumber, amount: r.credit });
  }
  return Array.from(map.values());
}

/**
 * Construit les lignes du grand-livre pour un compte donné en résolvant
 * les contreparties et en gérant les décompositions multi-lignes (ex. Twint).
 */
export function buildAccountLedger(entries: EntryDetail[], accountNumber: string): LedgerRow[] {
  const result: LedgerRow[] = [];
  for (const entry of entries) {
    const ownLines = entry.lines.filter(l => l.accountNumber === accountNumber);
    if (ownLines.length === 0) continue;
    for (const ownLine of ownLines) {
      // Soldes à nouveau et écritures de clôture : 1 ligne par ligne propre,
      // pas de décomposition par contrepartie (évite le produit cartésien).
      if (entry.isOpeningBalance || entry.isClosingEntry) {
        let contra = '';
        if (entry.isClosingEntry) {
          const isDebit    = ownLine.debit !== null;
          const ownAmt     = isDebit ? ownLine.debit : ownLine.credit;
          const candidates = entry.lines.filter(l =>
            l.accountNumber !== accountNumber &&
            (isDebit ? l.credit === ownAmt : l.debit === ownAmt),
          );
          const match = candidates.find(c => c.accountNumber !== '900') ?? candidates[0];
          contra = match?.accountName ?? '';
        }
        result.push({
          date:             entry.date,
          description:      entry.description,
          piece:            entry.piece,
          isOpeningBalance: entry.isOpeningBalance,
          contra,
          debit:  ownLine.debit  !== null ? centsToCHF(ownLine.debit)  : null,
          credit: ownLine.credit !== null ? centsToCHF(ownLine.credit) : null,
        });
        continue;
      }
      const isDebit     = ownLine.debit !== null;
      const contraLines = entry.lines.filter(l =>
        l.accountNumber !== accountNumber &&
        (isDebit ? l.credit !== null : l.debit !== null),
      );
      if (contraLines.length <= 1) {
        result.push({
          date:             entry.date,
          description:      entry.description,
          piece:            entry.piece,
          isOpeningBalance: false,
          contra: contraLines.length === 1 ? contraLines[0].accountName : '',
          debit:  isDebit  ? centsToCHF(ownLine.debit!)  : null,
          credit: !isDebit ? centsToCHF(ownLine.credit!) : null,
        });
      } else {
        for (const cl of contraLines) {
          const cAmt = isDebit ? (cl.credit ?? 0) : (cl.debit ?? 0);
          result.push({
            date:             entry.date,
            description:      entry.description,
            piece:            entry.piece,
            isOpeningBalance: false,
            contra:           cl.accountName,
            debit:  isDebit  ? centsToCHF(cAmt) : null,
            credit: !isDebit ? centsToCHF(cAmt) : null,
          });
        }
      }
    }
  }
  return result;
}

// ─── Chargement des données ───────────────────────────────────────────────────

export function loadExportData(db: Database.Database, fiscalYearId: number): ExportData {
  const fy = db
    .prepare('SELECT year, is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number; is_closed: number } | undefined;
  if (!fy) throw new Error(`Exercice ${fiscalYearId} introuvable`);

  const rows = db.prepare(`
    SELECT a.number AS accountNumber, a.name AS accountName,
           a.type AS accountType, a.normal_balance AS normalBalance,
           a.must_be_zero_at_closing AS mustBeZeroAtClosing,
           e.date, e.description, e.piece, e.is_closing_entry AS isClosingEntry,
           l.debit, l.credit
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ?
    ORDER BY a.number, e.date, e.id
  `).all(fiscalYearId) as ExportRow[];

  const journalRows = db.prepare(`
    SELECT e.id AS entryId, e.date, e.piece, e.description,
           e.is_opening_balance AS isOpeningBalance,
           e.is_closing_entry AS isClosingEntry,
           a.number AS accountNumber, a.name AS accountName,
           l.debit, l.credit
    FROM journal_entries e
    JOIN journal_entry_lines l ON l.journal_entry_id = e.id
    JOIN accounts a ON a.id = l.account_id
    WHERE e.fiscal_year_id = ?
    ORDER BY e.is_opening_balance DESC, e.is_closing_entry ASC,
             e.date, e.id,
             (l.debit IS NOT NULL) DESC, l.id
  `).all(fiscalYearId) as JournalRow[];

  const accountMap = new Map<string, AccountData>();
  for (const row of rows) {
    if (!accountMap.has(row.accountNumber)) {
      accountMap.set(row.accountNumber, {
        number:              row.accountNumber,
        name:                row.accountName,
        type:                row.accountType,
        normalBalance:       row.normalBalance,
        mustBeZeroAtClosing: row.mustBeZeroAtClosing,
        rows:                [],
      });
    }
    accountMap.get(row.accountNumber)!.rows.push(row);
  }

  const entries = groupEntriesWithLines(journalRows);

  return {
    year:        fy.year,
    isClosed:    !!fy.is_closed,
    accountMap,
    journalRows,
    entries,
  };
}
