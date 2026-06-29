import ExcelJS from 'exceljs';
import type Database from 'better-sqlite3';

const EXCEL_FORBIDDEN = /[*?:\\/[\]]/g;

function sanitizeSheetName(
  accountNumber: string,
  accountName: string,
  used: Set<string>,
): string {
  const base = `${accountNumber} ${accountName}`.replace(EXCEL_FORBIDDEN, '_').slice(0, 31);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  // De-duplicate with counter (shouldn't happen once prefixed with unique number)
  for (let i = 2; ; i++) {
    const candidate = base.slice(0, 28) + `_${i}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

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
  entryId: number;
  date: string;
  piece: string | null;
  description: string;
  isOpeningBalance: number;
  isClosingEntry: number;
  accountNumber: string;
  accountName: string;
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

  const usedSheetNames = new Set<string>();
  addBilanSheet(wb, accountMap, fy.year, usedSheetNames);
  addJournalSheet(wb, journalRows, fy.year, usedSheetNames);
  for (const account of accountMap.values()) {
    addAccountSheet(wb, account, usedSheetNames);
  }

  await wb.xlsx.writeFile(outputPath);
}

function addBilanSheet(
  wb: ExcelJS.Workbook,
  accountMap: Map<string, AccountData>,
  year: number,
  used: Set<string>,
): void {
  const bilanName = 'Bilan & Résultat';
  used.add(bilanName);
  const ws = wb.addWorksheet(bilanName);
  let row = 1;

  ws.getCell(`A${row}`).value = `Bilan & Résultat — Exercice ${year}`;
  row += 2;

  function computeSolde(data: AccountData): number {
    const totalDebit = data.rows.reduce((s, r) => s + (r.debit ?? 0), 0);
    const totalCredit = data.rows.reduce((s, r) => s + (r.credit ?? 0), 0);
    return data.normalBalance === 'DEBIT'
      ? centsToCHF(totalDebit - totalCredit)
      : centsToCHF(totalCredit - totalDebit);
  }

  const sections: Array<{
    title: string;
    types: string[];
    label: string;
  }> = [
    { title: 'Actifs', types: ['ACTIF'], label: 'Solde' },
    { title: 'Passifs & Fonds propres', types: ['PASSIF', 'FONDS_PROPRES'], label: 'Solde' },
    { title: 'Produits', types: ['PRODUIT'], label: 'Total' },
    { title: 'Charges', types: ['CHARGE'], label: 'Total' },
  ];

  let totalProduits = 0;
  let totalCharges = 0;

  for (const section of sections) {
    const accounts = [...accountMap.values()].filter(a =>
      section.types.includes(a.type),
    );
    if (accounts.length === 0) continue;

    ws.getCell(`A${row}`).value = section.title;
    row++;

    ws.getCell(`A${row}`).value = 'N°';
    ws.getCell(`B${row}`).value = 'Compte';
    ws.getCell(`C${row}`).value = section.label;
    row++;

    for (const acc of accounts) {
      const solde = computeSolde(acc);
      ws.getCell(`A${row}`).value = acc.number;
      ws.getCell(`B${row}`).value = acc.name;
      const soldeCell = ws.getCell(`C${row}`);
      soldeCell.value = solde;
      soldeCell.numFmt = '#,##0.00';
      row++;
      if (acc.type === 'PRODUIT') totalProduits += solde;
      if (acc.type === 'CHARGE') totalCharges += solde;
    }
    row++;
  }

  ws.getCell(`A${row}`).value = 'Résultat net (Produits − Charges)';
  const netCell = ws.getCell(`C${row}`);
  netCell.value = Math.round((totalProduits - totalCharges) * 100) / 100;
  netCell.numFmt = '#,##0.00';
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

type JournalSide = { account: string; amount: number };

function groupJournalEntries(rows: JournalRow[]): Array<{
  entryId: number;
  date: string;
  piece: string | null;
  description: string;
  isOpeningBalance: boolean;
  isClosingEntry: boolean;
  debits: JournalSide[];
  credits: JournalSide[];
}> {
  const map = new Map<number, ReturnType<typeof groupJournalEntries>[number]>();
  for (const r of rows) {
    if (!map.has(r.entryId)) {
      map.set(r.entryId, {
        entryId: r.entryId,
        date: r.date,
        piece: r.piece,
        description: r.description,
        isOpeningBalance: r.isOpeningBalance === 1,
        isClosingEntry: r.isClosingEntry === 1,
        debits: [],
        credits: [],
      });
    }
    const entry = map.get(r.entryId)!;
    const account = `${r.accountNumber} ${r.accountName}`;
    if (r.debit !== null)  entry.debits.push({ account, amount: r.debit });
    if (r.credit !== null) entry.credits.push({ account, amount: r.credit });
  }
  return Array.from(map.values());
}

function addJournalSheet(wb: ExcelJS.Workbook, rows: JournalRow[], year: number, used: Set<string>): void {
  const journalName = 'Journal';
  used.add(journalName);
  const ws = wb.addWorksheet(journalName);

  // Largeurs de colonnes
  ws.getColumn('A').width = 12;  // Date
  ws.getColumn('B').width = 12;  // Pièce
  ws.getColumn('C').width = 36;  // Libellé
  ws.getColumn('D').width = 28;  // Compte débit
  ws.getColumn('E').width = 28;  // Compte crédit
  ws.getColumn('F').width = 14;  // Montant

  // Titre
  const titleCell = ws.getCell('A1');
  titleCell.value = `Journal — Exercice ${year}`;
  titleCell.font = { bold: true, size: 13 };
  ws.mergeCells('A1:F1');

  // En-têtes colonnes (ligne 3)
  const HEADERS = ['Date', 'Pièce', 'Libellé', 'Débit (compte)', 'Crédit (compte)', 'Montant CHF'];
  const HDR_ROW = 3;
  HEADERS.forEach((h, i) => {
    const cell = ws.getCell(HDR_ROW, i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = { bottom: { style: 'thin' } };
    if (i === 5) cell.alignment = { horizontal: 'right' };
  });

  const entries = groupJournalEntries(rows);
  let currentRow = HDR_ROW + 1;
  let inClosingSection = false;
  let grandTotal = 0;

  for (const entry of entries) {
    // Séparateur avant les écritures de clôture
    if (entry.isClosingEntry && !inClosingSection) {
      currentRow++;
      const sectionCell = ws.getCell(currentRow, 1);
      sectionCell.value = 'Écritures de clôture';
      sectionCell.font = { bold: true, italic: true, color: { argb: 'FF64748B' } };
      ws.mergeCells(currentRow, 1, currentRow, 6);
      currentRow++;
      inClosingSection = true;
    }

    const rowCount = Math.max(entry.debits.length, entry.credits.length);

    for (let i = 0; i < rowCount; i++) {
      const debit  = entry.debits[i];
      const credit = entry.credits[i];
      const amount = debit?.amount ?? credit?.amount ?? 0;

      // Date / Pièce / Libellé : seulement sur la première ligne de l'écriture
      if (i === 0) {
        ws.getCell(currentRow, 1).value = fmtDate(entry.date);
        ws.getCell(currentRow, 2).value = entry.piece ?? '';
        ws.getCell(currentRow, 3).value = entry.description;
      }

      if (debit)  ws.getCell(currentRow, 4).value = debit.account;
      if (credit) ws.getCell(currentRow, 5).value = credit.account;

      const amountCell = ws.getCell(currentRow, 6);
      amountCell.value     = centsToCHF(amount);
      amountCell.numFmt    = '#,##0.00';
      amountCell.alignment = { horizontal: 'right' };

      if (entry.isClosingEntry) {
        for (let c = 1; c <= 6; c++) {
          ws.getCell(currentRow, c).fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' },
          };
        }
      }

      currentRow++;
    }

    grandTotal += entry.debits.reduce((s, d) => s + d.amount, 0);
    currentRow++; // ligne vide entre les écritures
  }

  // Ligne de totaux
  const totalLabelCell = ws.getCell(currentRow, 3);
  totalLabelCell.value = 'Total';
  totalLabelCell.font  = { bold: true };

  const totalCell = ws.getCell(currentRow, 6);
  totalCell.value     = centsToCHF(grandTotal);
  totalCell.numFmt    = '#,##0.00';
  totalCell.font      = { bold: true };
  totalCell.alignment = { horizontal: 'right' };
  totalCell.border    = { top: { style: 'thin' } };
}

function centsToCHF(cents: number | null): number {
  return cents !== null ? Math.round(cents) / 100 : 0;
}

function addAccountSheet(wb: ExcelJS.Workbook, account: AccountData, used: Set<string>): void {
  const sheetName = sanitizeSheetName(account.number, account.name, used);
  const ws = wb.addWorksheet(sheetName);
  const n = account.rows.length;
  const firstRow = 6;
  const lastDataRow = firstRow + n - 1;
  const totalRow = lastDataRow + 1;
  const hasCourant =
    account.type === 'ACTIF' && !account.mustBeZeroAtClosing;

  // Row 2: account name | empty | 'Total' | net formula
  ws.getCell('A2').value = account.name;
  ws.getCell('C2').value = 'Total';
  if (n > 0) {
    const netFormula =
      account.normalBalance === 'DEBIT'
        ? `SUBTOTAL(109,C${firstRow}:C${lastDataRow})-SUBTOTAL(109,D${firstRow}:D${lastDataRow})`
        : `SUBTOTAL(109,D${firstRow}:D${lastDataRow})-SUBTOTAL(109,C${firstRow}:C${lastDataRow})`;
    ws.getCell('D2').value = { formula: netFormula };
  }

  // Row 3: Doit total | Avoir total
  if (n > 0) {
    ws.getCell('C3').value = {
      formula: `SUBTOTAL(109,C${firstRow}:C${lastDataRow})`,
    };
    ws.getCell('D3').value = {
      formula: `SUBTOTAL(109,D${firstRow}:D${lastDataRow})`,
    };
  }

  // Row 5: headers
  ws.getCell('A5').value = 'Date';
  ws.getCell('B5').value = 'Libellé';
  ws.getCell('C5').value = 'Doit';
  ws.getCell('D5').value = 'Avoir';
  if (hasCourant) ws.getCell('E5').value = 'Courant';

  // Data rows
  account.rows.forEach((r, idx) => {
    const rowNum = firstRow + idx;
    ws.getCell(`A${rowNum}`).value = r.date;
    ws.getCell(`B${rowNum}`).value = r.description;
    if (r.debit !== null) {
      const cell = ws.getCell(`C${rowNum}`);
      cell.value = centsToCHF(r.debit);
      cell.numFmt = '#,##0.00';
    }
    if (r.credit !== null) {
      const cell = ws.getCell(`D${rowNum}`);
      cell.value = centsToCHF(r.credit);
      cell.numFmt = '#,##0.00';
    }
    if (hasCourant) {
      const cell = ws.getCell(`E${rowNum}`);
      cell.value = {
        formula: `SUM($C$${firstRow}:C${rowNum})-SUM($D$${firstRow}:D${rowNum})`,
      };
      cell.numFmt = '#,##0.00';
    }
  });

  // Total row
  if (n > 0) {
    ws.getCell(`A${totalRow}`).value = 'Total';
    const doitCell = ws.getCell(`C${totalRow}`);
    doitCell.value = { formula: `SUBTOTAL(109,C${firstRow}:C${lastDataRow})` };
    doitCell.numFmt = '#,##0.00';
    const avoirCell = ws.getCell(`D${totalRow}`);
    avoirCell.value = { formula: `SUBTOTAL(109,D${firstRow}:D${lastDataRow})` };
    avoirCell.numFmt = '#,##0.00';
  }
}
