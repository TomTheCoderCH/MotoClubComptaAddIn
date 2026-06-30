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
  isClosingEntry: number;
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

// Full entry with all lines — used to build per-account grand-livres with contra info
interface EntryDetail {
  entryId: number;
  date: string;
  piece: string | null;
  description: string;
  isOpeningBalance: boolean;
  isClosingEntry: boolean;
  lines: Array<{ accountNumber: string; accountName: string; debit: number | null; credit: number | null }>;
}

// One row in a per-account grand-livre
interface LedgerRow {
  date: string;
  description: string;
  piece: string | null;
  isOpeningBalance: boolean;
  debit: number | null;   // in CHF
  credit: number | null;  // in CHF
}

function groupEntriesWithLines(rows: JournalRow[]): EntryDetail[] {
  const map = new Map<number, EntryDetail>();
  for (const r of rows) {
    if (!map.has(r.entryId)) {
      map.set(r.entryId, {
        entryId: r.entryId,
        date: r.date,
        piece: r.piece,
        description: r.description,
        isOpeningBalance: r.isOpeningBalance === 1,
        isClosingEntry: r.isClosingEntry === 1,
        lines: [],
      });
    }
    map.get(r.entryId)!.lines.push({
      accountNumber: r.accountNumber,
      accountName: r.accountName,
      debit: r.debit,
      credit: r.credit,
    });
  }
  return Array.from(map.values());
}

// Build the grand-livre rows for a single account.
//
// For entries with exactly 1 contra line: show own amount (standard case).
// For entries with multiple contra lines (e.g. Décompte Twint → Raiffeisen + Frais):
//   explode into one row per contra using the contra's amount, so the decomposition
//   is visible exactly as in the journal.
// Opening balances: show own amount without a contrepartie.
function buildAccountLedger(entries: EntryDetail[], accountNumber: string): LedgerRow[] {
  const result: LedgerRow[] = [];
  for (const entry of entries) {
    const ownLines = entry.lines.filter(l => l.accountNumber === accountNumber);
    if (ownLines.length === 0) continue;
    for (const ownLine of ownLines) {
      if (entry.isOpeningBalance) {
        result.push({
          date: entry.date,
          description: entry.description,
          piece: entry.piece,
          isOpeningBalance: true,
          debit:  ownLine.debit  !== null ? centsToCHF(ownLine.debit)  : null,
          credit: ownLine.credit !== null ? centsToCHF(ownLine.credit) : null,
        });
        continue;
      }
      const isDebit = ownLine.debit !== null;
      const contraLines = entry.lines.filter(l =>
        l.accountNumber !== accountNumber &&
        (isDebit ? l.credit !== null : l.debit !== null),
      );
      if (contraLines.length <= 1) {
        result.push({
          date: entry.date,
          description: entry.description,
          piece: entry.piece,
          isOpeningBalance: false,
          debit:  isDebit  ? centsToCHF(ownLine.debit!)  : null,
          credit: !isDebit ? centsToCHF(ownLine.credit!) : null,
        });
      } else {
        for (const cl of contraLines) {
          const cAmt = isDebit ? (cl.credit ?? 0) : (cl.debit ?? 0);
          result.push({
            date: entry.date,
            description: entry.description,
            piece: entry.piece,
            isOpeningBalance: false,
            debit:  isDebit  ? centsToCHF(cAmt) : null,
            credit: !isDebit ? centsToCHF(cAmt) : null,
          });
        }
      }
    }
  }
  return result;
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

  const entries = groupEntriesWithLines(journalRows);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCY Compta';

  const usedSheetNames = new Set<string>();
  addBilanSheet(wb, accountMap, fy.year, usedSheetNames);
  addJournalSheet(wb, journalRows, fy.year, usedSheetNames);
  for (const account of accountMap.values()) {
    addAccountSheet(wb, account, entries, fy.year, usedSheetNames);
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function centsToCHF(cents: number | null): number {
  return cents !== null ? Math.round(cents) / 100 : 0;
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

const SECT_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E74B5' } };
const COLS_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };

// ─── Bilan & Résultat (two-column layout) ────────────────────────────────────

function addBilanSheet(
  wb: ExcelJS.Workbook,
  accountMap: Map<string, AccountData>,
  year: number,
  used: Set<string>,
): void {
  const bilanName = 'Bilan & Résultat';
  used.add(bilanName);
  const ws = wb.addWorksheet(bilanName);

  // A:C = left column, D = spacer, E:G = right column
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 2;
  ws.getColumn(5).width = 6;
  ws.getColumn(6).width = 28;
  ws.getColumn(7).width = 13;

  // Exclut les écritures de clôture (is_closing_entry=1) pour reproduire le
  // comportement de getAccountBalancesExcludingClosing : Capital = solde d'ouverture,
  // Résultat = produits − charges réels avant soldage, même après clôture.
  function computeSolde(data: AccountData): number {
    const rows = data.rows.filter(r => r.isClosingEntry === 0);
    const totalDebit  = rows.reduce((s, r) => s + (r.debit  ?? 0), 0);
    const totalCredit = rows.reduce((s, r) => s + (r.credit ?? 0), 0);
    return data.normalBalance === 'DEBIT'
      ? centsToCHF(totalDebit - totalCredit)
      : centsToCHF(totalCredit - totalDebit);
  }

  function writePair(
    row: number,
    leftCol: number,
    leftLabel: string, leftValue: number | string | null,
    rightCol: number,
    rightLabel: string, rightValue: number | string | null,
    opts: { bold?: boolean; topBorder?: boolean; italic?: boolean; color?: string } = {},
  ) {
    const lc = ws.getCell(row, leftCol + 1);
    lc.value = leftLabel;
    if (opts.bold)   lc.font  = { ...(lc.font ?? {}), bold: true };
    if (opts.italic) lc.font  = { ...(lc.font ?? {}), italic: true };
    if (opts.color)  lc.font  = { ...(lc.font ?? {}), color: { argb: opts.color } };
    ws.mergeCells(row, leftCol, row, leftCol + 1);

    if (leftValue !== null) {
      const lv = ws.getCell(row, leftCol + 2);
      lv.value     = leftValue;
      lv.numFmt    = '#,##0.00';
      lv.alignment = { horizontal: 'right' };
      if (opts.bold)   lv.font   = { ...(lv.font ?? {}), bold: true };
      if (opts.topBorder) lv.border = { top: { style: 'thin' } };
    }

    const rc = ws.getCell(row, rightCol + 1);
    rc.value = rightLabel;
    if (opts.bold)   rc.font  = { ...(rc.font ?? {}), bold: true };
    if (opts.italic) rc.font  = { ...(rc.font ?? {}), italic: true };
    if (opts.color)  rc.font  = { ...(rc.font ?? {}), color: { argb: opts.color } };
    ws.mergeCells(row, rightCol, row, rightCol + 1);

    if (rightValue !== null) {
      const rv = ws.getCell(row, rightCol + 2);
      rv.value     = rightValue;
      rv.numFmt    = '#,##0.00';
      rv.alignment = { horizontal: 'right' };
      if (opts.bold)   rv.font   = { ...(rv.font ?? {}), bold: true };
      if (opts.topBorder) rv.border = { top: { style: 'thin' } };
    }
  }

  function writeSectionHeaders(row: number, leftTitle: string, rightTitle: string): number {
    const lh = ws.getCell(row, 1);
    lh.value = leftTitle;
    lh.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    lh.fill  = SECT_BG;
    ws.mergeCells(row, 1, row, 3);
    const rh = ws.getCell(row, 5);
    rh.value = rightTitle;
    rh.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    rh.fill  = SECT_BG;
    ws.mergeCells(row, 5, row, 7);
    return row + 1;
  }

  function writeColHeaders(row: number, leftLabel: string, rightLabel: string): number {
    for (const [col, label] of [[1, 'N°'], [2, 'Compte'], [3, leftLabel]] as [number, string][]) {
      const c = ws.getCell(row, col);
      c.value = label;
      c.font  = { bold: true };
      c.fill  = COLS_BG;
    }
    for (const [col, label] of [[5, 'N°'], [6, 'Compte'], [7, rightLabel]] as [number, string][]) {
      const c = ws.getCell(row, col);
      c.value = label;
      c.font  = { bold: true };
      c.fill  = COLS_BG;
    }
    return row + 1;
  }

  function writeAccountRow(row: number, startCol: number, number: string, name: string, value: number) {
    ws.getCell(row, startCol).value = number;
    ws.getCell(row, startCol + 1).value = name;
    const vc = ws.getCell(row, startCol + 2);
    vc.value     = value;
    vc.numFmt    = '#,##0.00';
    vc.alignment = { horizontal: 'right' };
  }

  const actif   = [...accountMap.values()].filter(a => a.type === 'ACTIF');
  const passif  = [...accountMap.values()].filter(a => a.type === 'PASSIF' || a.type === 'FONDS_PROPRES');
  const produits = [...accountMap.values()].filter(a => a.type === 'PRODUIT');
  const charges  = [...accountMap.values()].filter(a => a.type === 'CHARGE');

  const totalActif     = actif.reduce((s, a)    => s + computeSolde(a), 0);
  const totalPassif    = passif.reduce((s, a)   => s + computeSolde(a), 0);
  const totalProduits  = produits.reduce((s, a) => s + computeSolde(a), 0);
  const totalCharges   = charges.reduce((s, a)  => s + computeSolde(a), 0);
  const netResult      = Math.round((totalProduits - totalCharges) * 100) / 100;
  const totalPassifFP  = Math.round((totalPassif + netResult) * 100) / 100;

  let r = 1;

  // Title
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `Bilan & Résultat — Exercice ${year}`;
  titleCell.font  = { bold: true, size: 13 };
  ws.mergeCells(r, 1, r, 7);
  r += 2;

  // ── BILAN ──────────────────────────────────────────────────────────────────
  r = writeSectionHeaders(r, 'ACTIF', 'PASSIF & FONDS PROPRES');
  r = writeColHeaders(r, 'Solde CHF', 'Solde CHF');

  const rightPassif = [
    ...passif.map(a => ({ number: a.number, name: a.name, value: computeSolde(a) })),
    { number: '', name: "Résultat de l'exercice", value: netResult },
  ];
  const bilanRows = Math.max(actif.length, rightPassif.length);
  for (let i = 0; i < bilanRows; i++) {
    if (i < actif.length)    writeAccountRow(r, 1, actif[i].number,     actif[i].name,     computeSolde(actif[i]));
    if (i < rightPassif.length) writeAccountRow(r, 5, rightPassif[i].number, rightPassif[i].name, rightPassif[i].value);
    r++;
  }
  writePair(r, 1, 'Total actif', totalActif, 5, 'Total passif & FP', totalPassifFP,
    { bold: true, topBorder: true });
  r++;

  // Balance check
  r++;
  const balDiff  = Math.abs(totalActif - totalPassifFP);
  const balCell  = ws.getCell(r, 1);
  balCell.value  = balDiff < 0.02
    ? 'Bilan équilibré ✓'
    : `Écart : CHF ${balDiff.toFixed(2)}`;
  balCell.font   = { italic: true, color: { argb: balDiff < 0.02 ? 'FF107C10' : 'FFFF0000' } };
  ws.mergeCells(r, 1, r, 7);
  r += 2;

  // ── COMPTE DE RÉSULTAT ─────────────────────────────────────────────────────
  r = writeSectionHeaders(r, 'PRODUITS', 'CHARGES');
  r = writeColHeaders(r, 'Total CHF', 'Total CHF');

  const plRows = Math.max(produits.length, charges.length);
  for (let i = 0; i < plRows; i++) {
    if (i < produits.length) writeAccountRow(r, 1, produits[i].number, produits[i].name, computeSolde(produits[i]));
    if (i < charges.length)  writeAccountRow(r, 5, charges[i].number,  charges[i].name,  computeSolde(charges[i]));
    r++;
  }
  writePair(r, 1, 'Total produits', totalProduits, 5, 'Total charges', totalCharges,
    { bold: true, topBorder: true });
  r++;

  // Résultat net
  r++;
  const netLabelCell = ws.getCell(r, 1);
  netLabelCell.value = 'Résultat net (Produits − Charges)';
  netLabelCell.font  = { bold: true };
  ws.mergeCells(r, 1, r, 6);
  const netValCell = ws.getCell(r, 7);
  netValCell.value     = netResult;
  netValCell.numFmt    = '#,##0.00';
  netValCell.font      = { bold: true };
  netValCell.border    = { top: { style: 'thin' } };
  netValCell.alignment = { horizontal: 'right' };

  ws.pageSetup.printArea   = `A$1:G$${r}`;
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.paperSize   = 9;
  ws.pageSetup.fitToPage   = true;
  ws.pageSetup.fitToWidth  = 1;
  ws.pageSetup.fitToHeight = 0;
}

// ─── Journal ─────────────────────────────────────────────────────────────────

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

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];

  const titleCell = ws.getCell('A1');
  titleCell.value = `Journal — Exercice ${year}`;
  titleCell.font = { bold: true, size: 13 };
  ws.mergeCells('A1:F1');

  type TableRow = [Date, string, string, string, string, number];
  const tableRows: TableRow[] = [];

  for (const entry of groupJournalEntries(rows)) {
    if (entry.isOpeningBalance) {
      for (const d of entry.debits) {
        tableRows.push([isoToDate(entry.date), entry.piece ?? '', entry.description, d.account, '', centsToCHF(d.amount)]);
      }
      for (const cr of entry.credits) {
        tableRows.push([isoToDate(entry.date), entry.piece ?? '', entry.description, '', cr.account, centsToCHF(cr.amount)]);
      }
      continue;
    }

    const rowCount = Math.max(entry.debits.length, entry.credits.length);
    for (let i = 0; i < rowCount; i++) {
      const debitAccount  = (i < entry.debits.length  ? entry.debits[i]  : entry.debits[entry.debits.length   - 1])?.account ?? '';
      const creditAccount = (i < entry.credits.length ? entry.credits[i] : entry.credits[entry.credits.length - 1])?.account ?? '';
      const amount = (i < entry.debits.length ? entry.debits[i] : entry.credits[i])?.amount ?? 0;
      tableRows.push([isoToDate(entry.date), entry.piece ?? '', entry.description, debitAccount, creditAccount, centsToCHF(amount)]);
    }
  }

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

  const DATA_START = 4;
  tableRows.forEach((_, i) => {
    const dateCell = ws.getCell(DATA_START + i, 1);
    dateCell.numFmt    = 'DD.MM';
    dateCell.alignment = { horizontal: 'left' };
    const amtCell = ws.getCell(DATA_START + i, 6);
    amtCell.numFmt    = '#,##0.00';
    amtCell.alignment = { horizontal: 'right' };
  });

  const lastRow = DATA_START - 1 + tableRows.length;
  ws.pageSetup.printArea      = `A$1:F$${lastRow}`;
  ws.pageSetup.printTitlesRow = '1:3';
  ws.pageSetup.orientation    = 'portrait';
  ws.pageSetup.paperSize      = 9;
  ws.pageSetup.fitToPage      = true;
  ws.pageSetup.fitToWidth     = 1;
  ws.pageSetup.fitToHeight    = 0;
}

// ─── Feuilles de compte ───────────────────────────────────────────────────────
//
// Colonnes : Date | Libellé | Débit CHF | Crédit CHF | [Solde CHF]
//
// Pour les écritures à plusieurs contreparties (ex. Décompte Twint → Raiffeisen +
// Frais Twint), une ligne par contrepartie est générée avec le montant exact de
// chaque mouvement — la décomposition est ainsi visible telle que dans le journal.

function addAccountSheet(
  wb: ExcelJS.Workbook,
  account: AccountData,
  entries: EntryDetail[],
  year: number,
  used: Set<string>,
): void {
  const sheetName = sanitizeSheetName(account.number, account.name, used);
  const ws = wb.addWorksheet(sheetName);

  const hasSolde = account.type === 'ACTIF' && !account.mustBeZeroAtClosing;
  // Columns: Date(1) Libellé(2) Débit(3) Crédit(4) [Solde(5)]
  const colCount = hasSolde ? 5 : 4;
  const lastColLetter = ['', 'A', 'B', 'C', 'D', 'E'][colCount];

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;
  if (hasSolde) ws.getColumn(5).width = 14;

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3, topLeftCell: 'A4' }];

  const titleCell = ws.getCell('A1');
  titleCell.value = `${account.number} ${account.name} — Exercice ${year}`;
  titleCell.font  = { bold: true, size: 13 };
  ws.mergeCells(`A1:${lastColLetter}1`);

  const ledgerRows = buildAccountLedger(entries, account.number);
  const n = ledgerRows.length;

  type TRow = (Date | string | number | null)[];
  const tableRows: TRow[] = ledgerRows.map(r => {
    const row: TRow = [
      isoToDate(r.date),
      r.description,
      r.debit,
      r.credit,
    ];
    if (hasSolde) row.push(null); // placeholder for running balance formula
    return row;
  });

  type ColDef = {
    name: string; filterButton?: boolean;
    totalsRowFunction?: 'none'|'sum'|'average'|'count'|'countNums'|'max'|'min'|'stdDev'|'var'|'custom';
  };
  const columns: ColDef[] = [
    { name: 'Date',       filterButton: true },
    { name: 'Libellé',   filterButton: true },
    { name: 'Débit CHF', filterButton: true, totalsRowFunction: 'sum' },
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

  const DATA_START = 4;
  const TOTAL_ROW  = DATA_START + n;

  ledgerRows.forEach((_, i) => {
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

  ws.getCell(TOTAL_ROW, 3).numFmt = '#,##0.00';
  ws.getCell(TOTAL_ROW, 4).numFmt = '#,##0.00';

  ws.pageSetup.printArea      = `A$1:${lastColLetter}$${TOTAL_ROW}`;
  ws.pageSetup.printTitlesRow = '1:3';
  ws.pageSetup.orientation    = 'portrait';
  ws.pageSetup.paperSize      = 9;
  ws.pageSetup.fitToPage      = true;
  ws.pageSetup.fitToWidth     = 1;
  ws.pageSetup.fitToHeight    = 0;
}
