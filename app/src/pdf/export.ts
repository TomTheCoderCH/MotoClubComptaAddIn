import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import {
  loadExportData, computeSolde, groupJournalEntries, buildAccountLedger, centsToCHF,
  type AccountData, type EntryDetail, type JournalRow,
} from '../data/export-data';

// ─── Layout constants ─────────────────────────────────────────────────────────

const ML = 40;    // margin left & right
const MT = 40;    // margin top
const MB = 40;    // margin bottom
const PW = 515.28; // usable width (595.28 − 2 × 40)
const PH = 841.89; // page height A4

// ─── Colours ─────────────────────────────────────────────────────────────────

const C_HEADER_BG  = '#2E74B5';
const C_HEADER_FG  = '#FFFFFF';
const C_COLS_BG    = '#D6E4F0';
const C_ROW_ALT    = '#F2F7FB';
const C_GREEN      = '#107C10';
const C_RED        = '#CC0000';
const C_LINE       = '#AAAAAA';

// ─── Row heights ─────────────────────────────────────────────────────────────

const ROW_H  = 13;   // data row
const HEAD_H = 16;   // section header bar
const COL_H  = 13;   // column header row
const ACCT_H = 14;   // per-account header bar

// ─── Number formatter ────────────────────────────────────────────────────────
//
// toLocaleString('fr-CH') peut produire   (espace fine insécable) comme
// séparateur de milliers selon la version ICU. Ce caractère n'est pas dans
// l'encodage WinAnsi de Helvetica (PDFKit) et s'affiche comme '/'.
// On utilise donc un formateur manuel avec l'apostrophe ASCII standard.

function fmtChf(n: number): string {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const [int, dec] = abs.toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${sign}${grouped}.${dec}`;
}

function isoToDisplay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string): void {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function hLine(doc: PDFKit.PDFDocument, y: number, color = C_LINE): void {
  doc.save().strokeColor(color).lineWidth(0.5)
    .moveTo(ML, y).lineTo(ML + PW, y).stroke().restore();
}

// tx — texte dans une cellule avec clip strict pour éviter tout débordement.
// Le clip sur (x, y, w, h) garantit qu'aucun texte ne sort de la cellule,
// même si PDFKit décide de wrapper malgré lineBreak:false.
function tx(
  doc: PDFKit.PDFDocument,
  str: string,
  x: number, y: number, w: number,
  opts: {
    bold?: boolean; italic?: boolean;
    size?: number; color?: string; align?: PDFKit.Align;
    clipH?: number;  // hauteur de clip — par défaut ROW_H
  } = {},
): void {
  if (!str) return;
  const h = opts.clipH ?? ROW_H;
  doc.save();
  doc.rect(x, y, w, h).clip();
  doc.font(opts.bold ? 'Helvetica-Bold' : opts.italic ? 'Helvetica-Oblique' : 'Helvetica')
    .fontSize(opts.size ?? 8)
    .fillColor(opts.color ?? '#000000')
    .text(str, x + 2, y + 2, {
      width:     Math.max(w - 4, 1),
      align:     opts.align ?? 'left',
      lineBreak: false,
      ellipsis:  true,
    });
  doc.restore();
}

// ─── Page management ─────────────────────────────────────────────────────────

function ensurePage(doc: PDFKit.PDFDocument, need: number): boolean {
  if (doc.y + need > PH - MB) {
    doc.addPage();
    return true;
  }
  return false;
}

function sectionHeaderBar(doc: PDFKit.PDFDocument, label: string, y: number): number {
  fillRect(doc, ML, y, PW, HEAD_H, C_HEADER_BG);
  tx(doc, label, ML + 4, y + 3, PW - 8,
    { bold: true, color: C_HEADER_FG, size: 9, clipH: HEAD_H });
  return y + HEAD_H;
}

// ─── Two-column bilan layout ──────────────────────────────────────────────────

// Each half: N°(30) + Compte(157) + Solde(60) = 247 ; gutter = 21.28
const COL_W = 247;
const GAP   = Math.round(PW - 2 * COL_W);  // = 21
const LX    = ML;
const RX    = ML + COL_W + GAP;
const C_NUM  = 30;
const C_NAME = 157;
const C_AMT  = 60;

function bilanColHeaders(doc: PDFKit.PDFDocument, y: number): void {
  fillRect(doc, LX, y, COL_W, COL_H, C_COLS_BG);
  fillRect(doc, RX, y, COL_W, COL_H, C_COLS_BG);
  for (const bx of [LX, RX]) {
    tx(doc, 'N°',        bx,                 y + 1, C_NUM,  { bold: true, size: 7.5, clipH: COL_H });
    tx(doc, 'Compte',    bx + C_NUM,          y + 1, C_NAME, { bold: true, size: 7.5, clipH: COL_H });
    tx(doc, 'Solde CHF', bx + C_NUM + C_NAME, y + 1, C_AMT,
      { bold: true, size: 7.5, align: 'right', clipH: COL_H });
  }
}

function bilanDataRow(
  doc: PDFKit.PDFDocument,
  y: number, alt: boolean,
  left:  { num?: string; name: string; val: number | null; bold?: boolean } | null,
  right: { num?: string; name: string; val: number | null; bold?: boolean } | null,
  topBorder = false,
): void {
  if (alt) fillRect(doc, ML, y, PW, ROW_H, C_ROW_ALT);
  if (topBorder) hLine(doc, y, '#444444');

  const drawSide = (bx: number, item: typeof left) => {
    if (!item) return;
    tx(doc, item.num ?? '',    bx,                 y + 1, C_NUM,
      { bold: item.bold, size: 7.5 });
    tx(doc, item.name,         bx + C_NUM,          y + 1, C_NAME,
      { bold: item.bold, size: 7.5 });
    if (item.val !== null) {
      tx(doc, fmtChf(item.val), bx + C_NUM + C_NAME, y + 1, C_AMT,
        { bold: item.bold, size: 7.5, align: 'right',
          color: item.val < 0 ? C_RED : '#000000' });
    }
  };
  drawSide(LX, left);
  drawSide(RX, right);
}

// ─── Journal column layout ────────────────────────────────────────────────────

// Total: 52+28+155+100+100+80 = 515 = PW
const J_DATE  = 52;
const J_PIECE = 28;
const J_LABEL = 155;
const J_DEBIT = 100;
const J_CRED  = 100;
const J_AMT   = 80;

function journalColHeaders(doc: PDFKit.PDFDocument, y: number): void {
  fillRect(doc, ML, y, PW, COL_H, C_COLS_BG);
  const cols: Array<[string, number, PDFKit.Align]> = [
    ['Date',          J_DATE,  'left'],
    ['Pièce',         J_PIECE, 'left'],
    ['Libellé',       J_LABEL, 'left'],
    ['Débit compte',  J_DEBIT, 'left'],
    ['Crédit compte', J_CRED,  'left'],
    ['Montant CHF',   J_AMT,   'right'],
  ];
  let x = ML;
  for (const [label, w, align] of cols) {
    tx(doc, label, x, y + 1, w, { bold: true, size: 7.5, align, clipH: COL_H });
    x += w;
  }
}

// ─── Account ledger column layout ─────────────────────────────────────────────

// Total: 50+170+130+83+82 = 515 = PW
const A_DATE  = 50;
const A_LABEL = 170;
const A_CONTR = 130;
const A_DEBIT = 83;
const A_CRED  = 82;

function accountColHeaders(doc: PDFKit.PDFDocument, y: number): void {
  fillRect(doc, ML, y, PW, COL_H, C_COLS_BG);
  const cols: Array<[string, number, PDFKit.Align]> = [
    ['Date',         A_DATE,  'left'],
    ['Libellé',      A_LABEL, 'left'],
    ['Contrepartie', A_CONTR, 'left'],
    ['Débit CHF',    A_DEBIT, 'right'],
    ['Crédit CHF',   A_CRED,  'right'],
  ];
  let x = ML;
  for (const [label, w, align] of cols) {
    tx(doc, label, x, y + 1, w, { bold: true, size: 7.5, align, clipH: COL_H });
    x += w;
  }
}

// ─── Bilan & Résultat section ─────────────────────────────────────────────────

function addBilanSection(
  doc: PDFKit.PDFDocument,
  accountMap: Map<string, AccountData>,
  year: number,
): void {
  const actif    = [...accountMap.values()].filter(a => a.type === 'ACTIF');
  const passif   = [...accountMap.values()].filter(a => a.type === 'PASSIF' || a.type === 'FONDS_PROPRES');
  const produits = [...accountMap.values()].filter(a => a.type === 'PRODUIT');
  const charges  = [...accountMap.values()].filter(a => a.type === 'CHARGE');

  const totalActif    = actif.reduce((s, a) => s + computeSolde(a), 0);
  const totalPassif   = passif.reduce((s, a) => s + computeSolde(a), 0);
  const totalProduits = produits.reduce((s, a) => s + computeSolde(a), 0);
  const totalCharges  = charges.reduce((s, a) => s + computeSolde(a), 0);
  const netResult     = Math.round((totalProduits - totalCharges) * 100) / 100;
  const totalPassifFP = Math.round((totalPassif + netResult) * 100) / 100;

  // ── BILAN ─────────────────────────────────────────────────────────────────
  ensurePage(doc, HEAD_H + COL_H + ROW_H * 2 + 40);
  let y = doc.y;

  fillRect(doc, LX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'ACTIF', LX + 4, y + 4, COL_W - 8,
    { bold: true, color: C_HEADER_FG, size: 8, clipH: HEAD_H });
  fillRect(doc, RX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'PASSIF & FONDS PROPRES', RX + 4, y + 4, COL_W - 8,
    { bold: true, color: C_HEADER_FG, size: 8, clipH: HEAD_H });
  y += HEAD_H;
  bilanColHeaders(doc, y);
  y += COL_H;

  const rightPassif: Array<{ num?: string; name: string; val: number }> = [
    ...passif.map(a => ({ num: a.number, name: a.name, val: computeSolde(a) })),
    { num: '', name: "Résultat de l'exercice", val: netResult },
  ];
  const bilanLen = Math.max(actif.length, rightPassif.length);

  for (let i = 0; i < bilanLen; i++) {
    if (ensurePage(doc, ROW_H + 4)) {
      y = doc.y;
      bilanColHeaders(doc, y);
      y += COL_H;
    }
    const la = i < actif.length       ? { num: actif[i].number,      name: actif[i].name,      val: computeSolde(actif[i]) }   : null;
    const rp = i < rightPassif.length ? { num: rightPassif[i].num,   name: rightPassif[i].name, val: rightPassif[i].val }      : null;
    bilanDataRow(doc, y, i % 2 === 1, la, rp);
    y += ROW_H;
  }

  if (ensurePage(doc, ROW_H + 20)) { y = doc.y; }
  bilanDataRow(doc, y, false,
    { name: 'Total actif',       val: totalActif,    bold: true },
    { name: 'Total passif & FP', val: totalPassifFP, bold: true },
    true,
  );
  y += ROW_H + 4;

  // Balance check
  const diff   = Math.abs(totalActif - totalPassifFP);
  const balMsg = diff < 0.02 ? 'Bilan équilibré ✓' : `Écart : CHF ${fmtChf(diff)}`;
  tx(doc, balMsg, ML, y, PW,
    { italic: true, color: diff < 0.02 ? C_GREEN : C_RED, size: 8, clipH: 14 });
  y += 16;
  doc.y = y + 8;

  // ── COMPTE DE RÉSULTAT ─────────────────────────────────────────────────────
  ensurePage(doc, HEAD_H + COL_H + ROW_H * 2 + 40);
  y = doc.y;

  fillRect(doc, LX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'PRODUITS', LX + 4, y + 4, COL_W - 8,
    { bold: true, color: C_HEADER_FG, size: 8, clipH: HEAD_H });
  fillRect(doc, RX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'CHARGES',  RX + 4, y + 4, COL_W - 8,
    { bold: true, color: C_HEADER_FG, size: 8, clipH: HEAD_H });
  y += HEAD_H;

  fillRect(doc, LX, y, COL_W, COL_H, C_COLS_BG);
  fillRect(doc, RX, y, COL_W, COL_H, C_COLS_BG);
  for (const bx of [LX, RX]) {
    tx(doc, 'N°',        bx,                 y + 1, C_NUM,  { bold: true, size: 7.5, clipH: COL_H });
    tx(doc, 'Compte',    bx + C_NUM,          y + 1, C_NAME, { bold: true, size: 7.5, clipH: COL_H });
    tx(doc, 'Total CHF', bx + C_NUM + C_NAME, y + 1, C_AMT,
      { bold: true, size: 7.5, align: 'right', clipH: COL_H });
  }
  y += COL_H;

  const plLen = Math.max(produits.length, charges.length);
  for (let i = 0; i < plLen; i++) {
    if (ensurePage(doc, ROW_H + 4)) { y = doc.y; }
    const lp = i < produits.length ? { num: produits[i].number, name: produits[i].name, val: computeSolde(produits[i]) } : null;
    const rc = i < charges.length  ? { num: charges[i].number,  name: charges[i].name,  val: computeSolde(charges[i])  } : null;
    bilanDataRow(doc, y, i % 2 === 1, lp, rc);
    y += ROW_H;
  }

  if (ensurePage(doc, ROW_H + 20)) { y = doc.y; }
  bilanDataRow(doc, y, false,
    { name: 'Total produits', val: totalProduits, bold: true },
    { name: 'Total charges',  val: totalCharges,  bold: true },
    true,
  );
  y += ROW_H + 4;

  // Résultat net
  const netLabel = netResult >= 0 ? 'Bénéfice net' : 'Perte nette';
  tx(doc, `${netLabel} (Produits − Charges)`, ML, y, PW - C_AMT - 4,
    { bold: true, size: 8, clipH: 14 });
  tx(doc, fmtChf(netResult), ML + PW - C_AMT, y, C_AMT,
    { bold: true, size: 8, align: 'right',
      color: netResult >= 0 ? C_GREEN : C_RED, clipH: 14 });
  hLine(doc, y, '#444444');
  y += 14;
  doc.y = y;
}

// ─── Journal général ──────────────────────────────────────────────────────────

function addJournalSection(doc: PDFKit.PDFDocument, journalRows: JournalRow[], year: number): void {
  doc.addPage();
  let y = doc.y;
  y = sectionHeaderBar(doc, `Journal général — Exercice ${year}`, y);
  journalColHeaders(doc, y);
  y += COL_H;

  const grouped = groupJournalEntries(journalRows);
  let rowIndex  = 0;

  for (const entry of grouped) {
    const displayDate = isoToDisplay(entry.date);

    type JLine = { date: string; piece: string; desc: string; debit: string; credit: string; amt: number };
    const lines: JLine[] = [];

    if (entry.isOpeningBalance) {
      for (const d of entry.debits) {
        lines.push({ date: displayDate, piece: entry.piece ?? '', desc: entry.description,
          debit: `${d.accountNumber} ${d.account}`, credit: '', amt: centsToCHF(d.amount) });
      }
      for (const cr of entry.credits) {
        lines.push({ date: displayDate, piece: entry.piece ?? '', desc: entry.description,
          debit: '', credit: `${cr.accountNumber} ${cr.account}`, amt: centsToCHF(cr.amount) });
      }
    } else {
      const rowCount = Math.max(entry.debits.length, entry.credits.length);
      for (let i = 0; i < rowCount; i++) {
        const da  = i < entry.debits.length  ? entry.debits[i]  : entry.debits[entry.debits.length   - 1];
        const ca  = i < entry.credits.length ? entry.credits[i] : entry.credits[entry.credits.length - 1];
        const amt = (i < entry.debits.length ? entry.debits[i] : entry.credits[i])?.amount ?? 0;
        lines.push({ date: displayDate, piece: entry.piece ?? '', desc: entry.description,
          debit:  da ? `${da.accountNumber} ${da.account}`  : '',
          credit: ca ? `${ca.accountNumber} ${ca.account}`  : '',
          amt: centsToCHF(amt) });
      }
    }

    for (const lr of lines) {
      if (doc.y + ROW_H > PH - MB) {
        doc.addPage();
        y = doc.y;
        journalColHeaders(doc, y);
        y += COL_H;
        rowIndex = 0;
      }

      if (rowIndex % 2 === 1) fillRect(doc, ML, y, PW, ROW_H, C_ROW_ALT);

      let x = ML;
      tx(doc, lr.date,        x, y + 1, J_DATE,  { size: 7.5 }); x += J_DATE;
      tx(doc, lr.piece,       x, y + 1, J_PIECE, { size: 7.5 }); x += J_PIECE;
      tx(doc, lr.desc,        x, y + 1, J_LABEL, { size: 7.5 }); x += J_LABEL;
      tx(doc, lr.debit,       x, y + 1, J_DEBIT, { size: 7.5 }); x += J_DEBIT;
      tx(doc, lr.credit,      x, y + 1, J_CRED,  { size: 7.5 }); x += J_CRED;
      tx(doc, fmtChf(lr.amt), x, y + 1, J_AMT,   { size: 7.5, align: 'right' });

      y += ROW_H;
      rowIndex++;
    }
  }

  hLine(doc, y);
  doc.y = y + 6;
}

// ─── Feuilles de compte (grand-livre par compte) ──────────────────────────────

function addAccountsSection(
  doc: PDFKit.PDFDocument,
  accountMap: Map<string, AccountData>,
  entries: EntryDetail[],
  year: number,
): void {
  doc.addPage();

  for (const account of accountMap.values()) {
    const ledgerRows = buildAccountLedger(entries, account.number);
    if (ledgerRows.length === 0) continue;

    // Ensure enough room for account header + column header + at least one row
    ensurePage(doc, ACCT_H + COL_H + ROW_H + 4);
    let y = doc.y;

    // Account header bar (lighter shade to differentiate from section headers)
    fillRect(doc, ML, y, PW, ACCT_H, '#4A90C4');
    tx(doc, `${account.number}  ${account.name}`, ML + 6, y + 3, PW - 12,
      { bold: true, color: C_HEADER_FG, size: 8.5, clipH: ACCT_H });
    y += ACCT_H;

    accountColHeaders(doc, y);
    y += COL_H;

    let totalDebit  = 0;
    let totalCredit = 0;
    let rowIdx      = 0;

    for (const row of ledgerRows) {
      if (doc.y + ROW_H > PH - MB) {
        doc.addPage();
        y = doc.y;
        // Reprint account header + col headers on continuation page
        fillRect(doc, ML, y, PW, ACCT_H, '#4A90C4');
        tx(doc, `${account.number}  ${account.name} (suite)`, ML + 6, y + 3, PW - 12,
          { bold: true, color: C_HEADER_FG, size: 8.5, clipH: ACCT_H });
        y += ACCT_H;
        accountColHeaders(doc, y);
        y += COL_H;
        rowIdx = 0;
      }

      if (rowIdx % 2 === 1) fillRect(doc, ML, y, PW, ROW_H, C_ROW_ALT);

      const debitStr  = row.debit  !== null ? fmtChf(row.debit)  : '';
      const creditStr = row.credit !== null ? fmtChf(row.credit) : '';

      let x = ML;
      tx(doc, isoToDisplay(row.date), x, y + 1, A_DATE,  { size: 7.5 }); x += A_DATE;
      tx(doc, row.description,        x, y + 1, A_LABEL, { size: 7.5 }); x += A_LABEL;
      tx(doc, row.contra,             x, y + 1, A_CONTR, { size: 7.5, italic: row.isOpeningBalance }); x += A_CONTR;
      tx(doc, debitStr,               x, y + 1, A_DEBIT, { size: 7.5, align: 'right' }); x += A_DEBIT;
      tx(doc, creditStr,              x, y + 1, A_CRED,  { size: 7.5, align: 'right' });

      if (row.debit  !== null) totalDebit  += row.debit;
      if (row.credit !== null) totalCredit += row.credit;

      y += ROW_H;
      rowIdx++;
    }

    // Totals row for this account
    ensurePage(doc, ROW_H + 4);
    if (doc.y + ROW_H > PH - MB) {
      y = doc.y;
    }
    hLine(doc, y, '#888888');
    fillRect(doc, ML, y, PW, ROW_H, '#E8EFF6');

    let x = ML + A_DATE + A_LABEL + A_CONTR;
    tx(doc, fmtChf(totalDebit),  x, y + 1, A_DEBIT, { bold: true, size: 7.5, align: 'right' }); x += A_DEBIT;
    tx(doc, fmtChf(totalCredit), x, y + 1, A_CRED,  { bold: true, size: 7.5, align: 'right' });
    y += ROW_H + 6;  // small gap between accounts

    doc.y = y;
  }
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportFiscalYearToPdf(
  db: Database.Database,
  fiscalYearId: number,
  outputPath: string,
): Promise<void> {
  const data = loadExportData(db, fiscalYearId);
  const { year, isClosed, accountMap, journalRows, entries } = data;

  const doc = new PDFDocument({
    size:    'A4',
    margins: { top: MT, bottom: MB, left: ML, right: ML },
    info:    { Title: `MCY Compta — Exercice ${year}`, Author: 'MCY Compta' },
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  // ── Page de couverture ───────────────────────────────────────────────────
  const today    = new Date();
  const todayStr = today.toLocaleDateString('fr-CH',
    { day: '2-digit', month: '2-digit', year: 'numeric' });

  doc.font('Helvetica-Bold').fontSize(18).fillColor(C_HEADER_BG)
    .text('MCY — Moto Club Yvorne', ML, MT + 30, { width: PW, align: 'center' });
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000')
    .text(`Rapport de clôture — Exercice ${year}`, { width: PW, align: 'center' });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor('#555555')
    .text(isClosed ? 'Exercice clôturé' : 'Exercice en cours', { width: PW, align: 'center' });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9).fillColor('#777777')
    .text(`Généré le ${todayStr}`, { width: PW, align: 'center' });

  hLine(doc, doc.y + 10);
  doc.moveDown(2);

  // ── Bilan & Résultat ────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
    .text(`Bilan & Résultat — Exercice ${year}`, ML, doc.y, { width: PW });
  doc.moveDown(0.5);

  addBilanSection(doc, accountMap, year);

  // ── Journal général ────────────────────────────────────────────────────
  addJournalSection(doc, journalRows, year);

  // ── Feuilles de compte ─────────────────────────────────────────────────
  addAccountsSection(doc, accountMap, entries, year);

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
