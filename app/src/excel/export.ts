import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import fs from 'node:fs';
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
    addAccountSheet(wb, account, fy.year, usedSheetNames);
  }

  const raw = await wb.xlsx.writeBuffer() as Buffer;
  fs.writeFileSync(outputPath, await fixNamedRangesOrder(raw));
}

// Deux bugs ExcelJS dans les definedNames corrigés par post-processing :
//
// Fix 1 — Apostrophe dans les noms de feuille :
//   ExcelJS génère &apos;Souper fin d&apos;an&apos;! (apostrophe interne non doublée).
//   Excel exige &apos;Souper fin d&apos;&apos;an&apos;! (doublée dans un nom quoté).
//   Sans ce fix, Excel supprime les Print_Area et Print_Titles de ces feuilles.
//
// Fix 2 — Ordre des definedNames :
//   ExcelJS interleave _xlnm.Print_Titles entre des entrées _xlnm.Print_Area.
//   Excel rejette cet ordre. On déplace toutes les Print_Titles en fin de <definedNames>.
async function fixNamedRangesOrder(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const wbFile = zip.file('xl/workbook.xml');
  if (!wbFile) return buffer;
  let xml = await wbFile.async('string');

  // Fix 1 : doubler les apostrophes internes dans les noms de feuille quotés
  xml = xml.replace(/<definedName([^>]*)>(&apos;[^<]*)<\/definedName>/g, (_, attrs, content) => {
    const bangPos = content.indexOf('!');
    if (bangPos === -1) return `<definedName${attrs}>${content}</definedName>`;
    const beforeBang = content.substring(0, bangPos);
    if (!beforeBang.endsWith('&apos;')) return `<definedName${attrs}>${content}</definedName>`;
    const sheetName = beforeBang.slice(6, -6); // retire &apos; ouvrant et &apos; fermant
    const rangeRef  = content.substring(bangPos);
    const fixed     = sheetName.replace(/&apos;/g, '&apos;&apos;');
    return `<definedName${attrs}>&apos;${fixed}&apos;${rangeRef}</definedName>`;
  });

  // Fix 2 : déplacer toutes les Print_Titles après tous les Print_Area
  const titles: string[] = [];
  xml = xml.replace(/<definedName name="_xlnm\.Print_Titles"[^>]*>[^<]*<\/definedName>/g, m => {
    titles.push(m);
    return '';
  });
  if (titles.length > 0 && xml.includes('</definedNames>')) {
    // Supprimer les guillemets inutiles autour des noms simples (&apos;Journal&apos; → Journal)
    // Le > ancre le match au début du contenu de la balise pour éviter de matcher
    // à l'intérieur d'un nom comme '...d&apos;&apos;an&apos;!' → 'an!' (bug)
    const normalized = titles.map(t => t.replace(/>&apos;([A-Za-z]\w*)&apos;!/g, '>$1!'));
    xml = xml.replace('</definedNames>', normalized.join('') + '</definedNames>');
  }

  zip.file('xl/workbook.xml', xml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
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

// Midi UTC pour éviter le décalage de fuseau horaire lors de la sérialisation ExcelJS
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
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
    const account = r.accountName;
    if (r.debit !== null)  entry.debits.push({ account, amount: r.debit });
    if (r.credit !== null) entry.credits.push({ account, amount: r.credit });
  }
  return Array.from(map.values());
}

function addJournalSheet(wb: ExcelJS.Workbook, rows: JournalRow[], year: number, used: Set<string>): void {
  const journalName = 'Journal';
  used.add(journalName);
  const ws = wb.addWorksheet(journalName);

  ws.getColumn('A').width = 12;
  ws.getColumn('B').width = 12;
  ws.getColumn('C').width = 36;
  ws.getColumn('D').width = 28;
  ws.getColumn('E').width = 28;
  ws.getColumn('F').width = 14;

  const titleCell = ws.getCell('A1');
  titleCell.value = `Journal — Exercice ${year}`;
  titleCell.font = { bold: true, size: 13 };
  ws.mergeCells('A1:F1');

  // Collecte des lignes du tableau
  type TableRow = [Date, string, string, string, string, number];
  const tableRows: TableRow[] = [];

  for (const entry of groupJournalEntries(rows)) {
    // Soldes à nouveau : une ligne par compte, colonne contrepartie vide
    if (entry.isOpeningBalance) {
      for (const d of entry.debits) {
        tableRows.push([isoToDate(entry.date), entry.piece ?? '', entry.description, d.account, '', centsToCHF(d.amount)]);
      }
      for (const cr of entry.credits) {
        tableRows.push([isoToDate(entry.date), entry.piece ?? '', entry.description, '', cr.account, centsToCHF(cr.amount)]);
      }
      continue;
    }

    // Écritures ordinaires et de clôture :
    // max(N débits, M crédits) lignes — le côté le plus court est répété.
    const rowCount = Math.max(entry.debits.length, entry.credits.length);
    for (let i = 0; i < rowCount; i++) {
      const debitAccount  = (i < entry.debits.length  ? entry.debits[i]  : entry.debits[entry.debits.length   - 1])?.account ?? '';
      const creditAccount = (i < entry.credits.length ? entry.credits[i] : entry.credits[entry.credits.length - 1])?.account ?? '';
      const amount = (i < entry.debits.length ? entry.debits[i] : entry.credits[i])?.amount ?? 0;
      tableRows.push([isoToDate(entry.date), entry.piece ?? '', entry.description, debitAccount, creditAccount, centsToCHF(amount)]);
    }
  }

  // Tableau structuré Excel (ligne 3 = en-têtes, données dès la ligne 4)
  ws.addTable({
    name:      `Journal${year}`,
    ref:       'A3',
    headerRow: true,
    style: {
      theme:          'TableStyleMedium2',
      showRowStripes: true,
    },
    columns: [
      { name: 'Date',            filterButton: true },
      { name: 'Pièce',          filterButton: true },
      { name: 'Libellé',        filterButton: true },
      { name: 'Débit compte',   filterButton: true },
      { name: 'Crédit compte',  filterButton: true },
      { name: 'Montant CHF',    filterButton: true },
    ],
    rows: tableRows,
  });

  // Formats sur les colonnes Date (A) et Montant CHF (F), dès la ligne 4
  const DATA_START = 4;
  tableRows.forEach((_, i) => {
    const dateCell = ws.getCell(DATA_START + i, 1);
    dateCell.numFmt    = 'DD.MM';
    dateCell.alignment = { horizontal: 'left' };
    const amtCell = ws.getCell(DATA_START + i, 6);
    amtCell.numFmt    = '#,##0.00';
    amtCell.alignment = { horizontal: 'right' };
  });

  // Zone d'impression et mise en page
  // Workaround ExcelJS : passer "$" avant le numéro de ligne pour obtenir $A$1:$F$N
  // (ExcelJS ajoute "$" devant la colonne, mais pas devant la ligne → format mixte rejeté par Excel)
  const lastRow = DATA_START - 1 + tableRows.length;
  ws.pageSetup.printArea      = `A$1:F$${lastRow}`;
  ws.pageSetup.printTitlesRow = '1:3';
  ws.pageSetup.orientation    = 'portrait';
  ws.pageSetup.paperSize      = 9;           // A4
  ws.pageSetup.fitToPage      = true;
  ws.pageSetup.fitToWidth     = 1;           // 1 page de large
  ws.pageSetup.fitToHeight    = 0;           // autant de pages en hauteur que nécessaire
}

function centsToCHF(cents: number | null): number {
  return cents !== null ? Math.round(cents) / 100 : 0;
}

function addAccountSheet(wb: ExcelJS.Workbook, account: AccountData, year: number, used: Set<string>): void {
  const sheetName = sanitizeSheetName(account.number, account.name, used);
  const ws = wb.addWorksheet(sheetName);
  const n = account.rows.length;

  const hasSolde = account.type === 'ACTIF' && !account.mustBeZeroAtClosing;
  const colCount = hasSolde ? 5 : 4;
  const lastColLetter = ['', 'A', 'B', 'C', 'D', 'E'][colCount];

  // Largeurs colonnes
  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;
  if (hasSolde) ws.getColumn(5).width = 14;

  // Ligne 1 : titre fusionné
  const titleCell = ws.getCell('A1');
  titleCell.value = `${account.number} ${account.name} — Exercice ${year}`;
  titleCell.font  = { bold: true, size: 13 };
  ws.mergeCells(`A1:${lastColLetter}1`);

  // Lignes du tableau (ligne 3 = en-têtes, données dès la ligne 4)
  type TRow = (Date | string | number | null)[];
  const tableRows: TRow[] = account.rows.map(r => {
    const row: TRow = [
      isoToDate(r.date),
      r.description,
      r.debit  !== null ? centsToCHF(r.debit)  : null,
      r.credit !== null ? centsToCHF(r.credit) : null,
    ];
    if (hasSolde) row.push(null); // placeholder — formule posée ensuite
    return row;
  });

  type ColDef = {
    name: string; filterButton?: boolean;
    totalsRowFunction?: 'none'|'sum'|'average'|'count'|'countNums'|'max'|'min'|'stdDev'|'var'|'custom';
  };
  const columns: ColDef[] = [
    { name: 'Date',       filterButton: true },
    { name: 'Libellé',    filterButton: true },
    { name: 'Débit CHF',  filterButton: true, totalsRowFunction: 'sum' },
    { name: 'Crédit CHF', filterButton: true, totalsRowFunction: 'sum' },
  ];
  if (hasSolde) columns.push({ name: 'Solde CHF', filterButton: true });

  ws.addTable({
    name:      `Compte${account.number}`,
    ref:       'A3',
    headerRow: true,
    totalsRow: true,
    style:     { theme: 'TableStyleMedium2', showRowStripes: true },
    columns,
    rows: tableRows,
  });

  // Formats cellules après création du tableau
  const DATA_START = 4;
  const TOTAL_ROW  = DATA_START + n; // ligne de total (gérée par la table pour Débit/Crédit)

  account.rows.forEach((_, i) => {
    const rowNum = DATA_START + i;
    const dateCell = ws.getCell(rowNum, 1);
    dateCell.numFmt    = 'DD.MM';
    dateCell.alignment = { horizontal: 'left' };
    ws.getCell(rowNum, 3).numFmt = '#,##0.00';
    ws.getCell(rowNum, 4).numFmt = '#,##0.00';
    if (hasSolde) {
      const soldeCell = ws.getCell(rowNum, 5);
      const t = `Compte${account.number}`;
      soldeCell.value = { formula: account.normalBalance === 'DEBIT'
        ? `SUM(INDEX(${t}[Débit CHF],1):${t}[[#This Row],[Débit CHF]])-SUM(INDEX(${t}[Crédit CHF],1):${t}[[#This Row],[Crédit CHF]])`
        : `SUM(INDEX(${t}[Crédit CHF],1):${t}[[#This Row],[Crédit CHF]])-SUM(INDEX(${t}[Débit CHF],1):${t}[[#This Row],[Débit CHF]])` };
      soldeCell.numFmt = '#,##0.00';
    }
  });

  // Formats sur la ligne de total (ExcelJS génère les formules SUBTOTAL pour Débit/Crédit)
  ws.getCell(TOTAL_ROW, 3).numFmt = '#,##0.00';
  ws.getCell(TOTAL_ROW, 4).numFmt = '#,##0.00';

  // Mise en page impression — workaround ExcelJS : $-ligne en entrée → format $A$1 absolu en sortie
  ws.pageSetup.printArea      = `A$1:${lastColLetter}$${TOTAL_ROW}`;
  ws.pageSetup.printTitlesRow = '1:3';
  ws.pageSetup.orientation    = 'portrait';
  ws.pageSetup.paperSize      = 9;
  ws.pageSetup.fitToPage      = true;
  ws.pageSetup.fitToWidth     = 1;
  ws.pageSetup.fitToHeight    = 0;
}
