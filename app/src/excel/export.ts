import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import {
  loadExportData, computeSolde, groupJournalEntries, buildAccountLedger,
  centsToCHF,
  type AccountData, type EntryDetail,
} from '../data/export-data';

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

export async function exportFiscalYearToExcel(
  db: Database.Database,
  fiscalYearId: number,
  outputPath: string,
): Promise<void> {
  const data = loadExportData(db, fiscalYearId);
  const { year, accountMap, journalRows, entries } = data;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCY Compta';

  const usedSheetNames = new Set<string>();
  addBilanSheet(wb, accountMap, year, usedSheetNames);
  addAnalyticsSheet(wb, db, fiscalYearId, year, usedSheetNames);
  addJournalSheet(wb, journalRows, year, usedSheetNames);
  for (const account of accountMap.values()) {
    addAccountSheet(wb, account, entries, year, usedSheetNames);
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

// ─── Analytique ──────────────────────────────────────────────────────────────

function addAnalyticsSheet(
  wb: ExcelJS.Workbook,
  db: Database.Database,
  fiscalYearId: number,
  year: number,
  used: Set<string>,
): void {
  type RawRow = {
    number: string; name: string; type: string;
    account_group: string | null;
    total_debit: number; total_credit: number;
  };

  const rows = db.prepare(`
    SELECT a.number, a.name, a.type, a.account_group,
           SUM(COALESCE(l.debit,  0)) AS total_debit,
           SUM(COALESCE(l.credit, 0)) AS total_credit
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ? AND a.class IN (3, 4) AND e.is_closing_entry = 0
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as RawRow[];

  if (rows.length === 0) return;

  const toRecettes = (r: RawRow) =>
    r.type === 'PRODUIT' ? centsToCHF(r.total_credit - r.total_debit) : 0;
  const toCharges = (r: RawRow) =>
    r.type === 'CHARGE' ? centsToCHF(r.total_debit - r.total_credit) : 0;

  const grouped   = rows.filter(r => r.account_group);
  const ungrouped = rows.filter(r => !r.account_group);

  const groupMap = new Map<string, RawRow[]>();
  for (const r of grouped) {
    if (!groupMap.has(r.account_group!)) groupMap.set(r.account_group!, []);
    groupMap.get(r.account_group!)!.push(r);
  }

  const groups = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([name, accs]) => {
      const totalRecettes = accs.reduce((s, r) => s + toRecettes(r), 0);
      const totalCharges  = accs.reduce((s, r) => s + toCharges(r),  0);
      return { name, accounts: accs, totalRecettes, totalCharges, resultat: totalRecettes - totalCharges };
    });

  used.add('Analytique');
  const ws = wb.addWorksheet('Analytique');

  const MONEY  = '#,##0.00';
  const GREEN  = 'FF107C10';
  const RED    = 'FFCC0000';

  ws.getColumn(1).width = 35;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 13;

  let r = 1;

  // Title
  ws.mergeCells(r, 1, r, 4);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `Analytique — Exercice ${year}`;
  titleCell.font  = { bold: true, size: 13 };
  r += 2;

  // ── Grouped section ───────────────────────────────────────────────────────
  if (groups.length > 0) {
    // Section header
    ws.mergeCells(r, 1, r, 4);
    const sh = ws.getCell(r, 1);
    sh.value = 'GROUPES ANALYTIQUES';
    sh.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    sh.fill  = SECT_BG;
    r++;

    // Column headers
    for (const [col, label, align] of [
      [1, 'Groupe Analytique', 'left'],
      [2, 'Recettes CHF', 'right'],
      [3, 'Charges CHF', 'right'],
      [4, 'Résultat CHF', 'right'],
    ] as [number, string, string][]) {
      const c = ws.getCell(r, col);
      c.value     = label;
      c.font      = { bold: true };
      c.fill      = COLS_BG;
      c.alignment = { horizontal: align as ExcelJS.Alignment['horizontal'] };
    }
    r++;

    for (const g of groups) {
      const resultatArgb = g.resultat >= 0 ? GREEN : RED;
      ws.getCell(r, 1).value = g.name;

      const recCell = ws.getCell(r, 2);
      recCell.value     = g.totalRecettes;
      recCell.numFmt    = MONEY;
      recCell.alignment = { horizontal: 'right' };

      const chrCell = ws.getCell(r, 3);
      chrCell.value     = g.totalCharges;
      chrCell.numFmt    = MONEY;
      chrCell.alignment = { horizontal: 'right' };

      const resCell = ws.getCell(r, 4);
      resCell.value     = g.resultat;
      resCell.numFmt    = MONEY;
      resCell.alignment = { horizontal: 'right' };
      resCell.font      = { color: { argb: resultatArgb } };
      r++;
    }

    // Total row
    const grandRecettes = groups.reduce((s, g) => s + g.totalRecettes, 0);
    const grandCharges  = groups.reduce((s, g) => s + g.totalCharges,  0);
    const grandResultat = grandRecettes - grandCharges;
    const GREY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

    for (let c = 1; c <= 4; c++) ws.getCell(r, c).fill = GREY_FILL;
    ws.getCell(r, 1).value = 'Total groupes';
    ws.getCell(r, 1).font  = { bold: true };

    const tRec = ws.getCell(r, 2);
    tRec.value = grandRecettes; tRec.numFmt = MONEY; tRec.font = { bold: true };
    tRec.alignment = { horizontal: 'right' };
    tRec.border    = { top: { style: 'thin' } };

    const tChr = ws.getCell(r, 3);
    tChr.value = grandCharges; tChr.numFmt = MONEY; tChr.font = { bold: true };
    tChr.alignment = { horizontal: 'right' };
    tChr.border    = { top: { style: 'thin' } };

    const tRes = ws.getCell(r, 4);
    tRes.value = grandResultat; tRes.numFmt = MONEY;
    tRes.font  = { bold: true, color: { argb: grandResultat >= 0 ? GREEN : RED } };
    tRes.alignment = { horizontal: 'right' };
    tRes.border    = { top: { style: 'thin' } };
    r++;
  }

  // ── Ungrouped section ─────────────────────────────────────────────────────
  if (ungrouped.length > 0) {
    r++;  // blank row

    ws.mergeCells(r, 1, r, 4);
    const sh2 = ws.getCell(r, 1);
    sh2.value = 'NON GROUPÉS';
    sh2.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    sh2.fill  = SECT_BG;
    r++;

    // Column headers
    for (const [col, label, align] of [
      [1, 'N°',           'left'],
      [2, 'Compte',       'left'],
      [3, 'Recettes CHF', 'right'],
      [4, 'Charges CHF',  'right'],
    ] as [number, string, string][]) {
      const c = ws.getCell(r, col);
      c.value     = label;
      c.font      = { bold: true };
      c.fill      = COLS_BG;
      c.alignment = { horizontal: align as ExcelJS.Alignment['horizontal'] };
    }
    // Override col 2 width for Compte (repurpose col 1 as narrow N° col)
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 32;
    r++;

    for (const row of ungrouped) {
      const rec = toRecettes(row);
      const chr = toCharges(row);
      ws.getCell(r, 1).value = row.number;

      ws.getCell(r, 2).value = row.name;

      if (rec > 0) {
        const c = ws.getCell(r, 3);
        c.value = rec; c.numFmt = MONEY; c.alignment = { horizontal: 'right' };
      }
      if (chr > 0) {
        const c = ws.getCell(r, 4);
        c.value = chr; c.numFmt = MONEY; c.alignment = { horizontal: 'right' };
      }
      r++;
    }
  }

  ws.pageSetup.printArea   = `A1:D${r - 1}`;
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.paperSize   = 9;
  ws.pageSetup.fitToPage   = true;
  ws.pageSetup.fitToWidth  = 1;
  ws.pageSetup.fitToHeight = 0;
}

// ─── Journal ─────────────────────────────────────────────────────────────────

function addJournalSheet(
  wb: ExcelJS.Workbook,
  rows: import('../data/export-data').JournalRow[],
  year: number,
  used: Set<string>,
): void {
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
  // Columns: Date(1) Libellé(2) Contrepartie(3) Débit(4) Crédit(5) [Solde(6)]
  const colCount = hasSolde ? 6 : 5;
  const lastColLetter = ['', 'A', 'B', 'C', 'D', 'E', 'F'][colCount];

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 12;
  if (hasSolde) ws.getColumn(6).width = 12;

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
      r.contra,
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
    { name: 'Date',          filterButton: true },
    { name: 'Libellé',      filterButton: true },
    { name: 'Contrepartie', filterButton: true },
    { name: 'Débit CHF',    filterButton: true, totalsRowFunction: 'sum' },
    { name: 'Crédit CHF',   filterButton: true, totalsRowFunction: 'sum' },
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
    ws.getCell(rowNum, 4).numFmt = '#,##0.00';
    ws.getCell(rowNum, 5).numFmt = '#,##0.00';
    if (hasSolde) {
      const soldeCell = ws.getCell(rowNum, 6);
      const t = `Compte${account.number}`;
      soldeCell.value = { formula: account.normalBalance === 'DEBIT'
        ? `SUM(INDEX(${t}[Débit CHF],1):${t}[[#This Row],[Débit CHF]])-SUM(INDEX(${t}[Crédit CHF],1):${t}[[#This Row],[Crédit CHF]])`
        : `SUM(INDEX(${t}[Crédit CHF],1):${t}[[#This Row],[Crédit CHF]])-SUM(INDEX(${t}[Débit CHF],1):${t}[[#This Row],[Débit CHF]])` };
      soldeCell.numFmt = '#,##0.00';
    }
  });

  ws.getCell(TOTAL_ROW, 4).numFmt = '#,##0.00';
  ws.getCell(TOTAL_ROW, 5).numFmt = '#,##0.00';

  ws.pageSetup.printArea      = `A$1:${lastColLetter}$${TOTAL_ROW}`;
  ws.pageSetup.printTitlesRow = '1:3';
  ws.pageSetup.orientation    = 'portrait';
  ws.pageSetup.paperSize      = 9;
  ws.pageSetup.fitToPage      = true;
  ws.pageSetup.fitToWidth     = 1;
  ws.pageSetup.fitToHeight    = 0;
}
