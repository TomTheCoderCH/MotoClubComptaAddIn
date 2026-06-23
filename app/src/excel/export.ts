import ExcelJS from 'exceljs';
import type Database from 'better-sqlite3';

interface ExportRow {
  accountNumber: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  mustBeZeroAtClosing: number;
  date: string;
  description: string;
  piece: string | null;
  debit: number | null;
  credit: number | null;
}

interface JournalRow {
  accountName: string;
  date: string;
  description: string;
  piece: string | null;
  debit: number | null;
  credit: number | null;
}

interface AccountData {
  number: string;
  name: string;
  type: string;
  normalBalance: string;
  mustBeZeroAtClosing: number;
  rows: ExportRow[];
}

export async function exportFiscalYearToExcel(
  db: Database.Database,
  fiscalYearId: number,
  outputPath: string,
): Promise<void> {
  const fy = db.prepare('SELECT year FROM fiscal_years WHERE id = ?').get(fiscalYearId) as
    | { year: number }
    | undefined;
  if (!fy) throw new Error(`Exercice ${fiscalYearId} introuvable`);

  const rows = db.prepare(`
    SELECT a.number AS accountNumber, a.name AS accountName,
           a.type AS accountType, a.normal_balance AS normalBalance,
           a.must_be_zero_at_closing AS mustBeZeroAtClosing,
           e.date, e.description, e.piece,
           l.debit, l.credit
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ?
    ORDER BY a.number, e.date, e.id
  `).all(fiscalYearId) as ExportRow[];

  const journalRows = db.prepare(`
    SELECT a.name AS accountName, e.date, e.description, e.piece, l.debit, l.credit
    FROM journal_entries e
    JOIN journal_entry_lines l ON l.journal_entry_id = e.id
    JOIN accounts a ON a.id = l.account_id
    WHERE e.fiscal_year_id = ?
    ORDER BY e.date, e.id, l.id
  `).all(fiscalYearId) as JournalRow[];

  const accountMap = new Map<string, AccountData>();
  for (const row of rows) {
    if (!accountMap.has(row.accountNumber)) {
      accountMap.set(row.accountNumber, {
        number: row.accountNumber,
        name: row.accountName,
        type: row.accountType,
        normalBalance: row.normalBalance,
        mustBeZeroAtClosing: row.mustBeZeroAtClosing,
        rows: [],
      });
    }
    accountMap.get(row.accountNumber)!.rows.push(row);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCY Compta';

  addBilanSheet(wb, accountMap, fy.year);
  addJournalSheet(wb, journalRows);
  for (const account of accountMap.values()) {
    addAccountSheet(wb, account);
  }

  await wb.xlsx.writeFile(outputPath);
}

function addBilanSheet(
  wb: ExcelJS.Workbook,
  _accountMap: Map<string, AccountData>,
  _year: number,
): void {
  // TODO in Task 3
  wb.addWorksheet('Bilan & Résultat');
}

function addJournalSheet(wb: ExcelJS.Workbook, _rows: JournalRow[]): void {
  // TODO in Task 3
  wb.addWorksheet('Journal');
}

function addAccountSheet(wb: ExcelJS.Workbook, account: AccountData): void {
  // TODO in Task 2
  wb.addWorksheet(account.name);
}
