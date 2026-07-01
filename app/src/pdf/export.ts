import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type Database from 'better-sqlite3';
import {
  loadExportData, computeSolde, groupJournalEntries, buildAccountLedger, centsToCHF,
  type AccountData, type EntryDetail, type JournalRow,
} from '../data/export-data';

// ─── Polices Inter embarquées ─────────────────────────────────────────────────
//
// Inter (SIL OFL 1.1) — même famille que l'UI de l'application, couvre
// Unicode complet dont U+202F (espace fine insécable, séparateur fr-CH).
//
// Chemin résolu à l'exécution pour fonctionner en dev et en production
// packagée cross-platform (Windows / macOS / Linux) :
//   dev  → <app.getAppPath()>/resources/fonts/
//   prod → <process.resourcesPath>/fonts/    (extraResources dans forge.config.ts)

function fontsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'fonts')
    : path.join(app.getAppPath(), 'resources', 'fonts');
}

function font(bold?: boolean, italic?: boolean): string {
  if (bold && italic) return path.join(fontsDir(), 'Inter-BoldItalic.ttf');
  if (bold)           return path.join(fontsDir(), 'Inter-Bold.ttf');
  if (italic)         return path.join(fontsDir(), 'Inter-Italic.ttf');
  return path.join(fontsDir(), 'Inter-Regular.ttf');
}

// JetBrains Mono (Apache 2.0) — police monospace pour les colonnes de montants.
// En monospace, chaque caractère a la même largeur : avec align:'right', la
// virgule décimale tombe toujours au même X quelle que soit la valeur.
function fontMono(bold?: boolean): string {
  return bold
    ? path.join(fontsDir(), 'JetBrainsMono-Bold.ttf')
    : path.join(fontsDir(), 'JetBrainsMono-Regular.ttf');
}

// ─── Formatage des montants ───────────────────────────────────────────────────
//
// Notation comptable suisse traditionnelle : apostrophe ' comme séparateur
// de milliers, virgule comme séparateur décimal (ex. 1'494,26).
// On n'utilise pas toLocaleString('fr-CH') car il produit U+202F (espace fine
// insécable) absent de JetBrains Mono — s'afficherait en boîte.

function fmtChf(n: number): string {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const [intPart, decPart] = abs.toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${sign}${grouped},${decPart}`;
}

function isoToDisplay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const ML = 40;      // margin left & right
const MT = 40;      // margin top
const MB = 40;      // margin bottom
const PW = 515.28;  // usable width (595.28 − 2×40)
const PH = 841.89;  // page height A4

// ─── Couleurs ─────────────────────────────────────────────────────────────────

const C_HEADER_BG = '#2E74B5';
const C_HEADER_FG = '#FFFFFF';
const C_COLS_BG   = '#D6E4F0';
const C_ROW_ALT   = '#F2F7FB';
const C_GREEN     = '#107C10';
const C_RED       = '#CC0000';
const C_LINE      = '#AAAAAA';

// ─── Hauteurs de ligne ────────────────────────────────────────────────────────

const ROW_H  = 13;  // ligne de données (hauteur minimale)
const HEAD_H = 16;  // barre de section
const COL_H  = 13;  // en-tête de colonnes
const ACCT_H = 14;  // en-tête par compte

// ─── Primitives graphiques ────────────────────────────────────────────────────

function fillRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string): void {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function hLine(doc: PDFKit.PDFDocument, y: number, color = C_LINE): void {
  doc.save().strokeColor(color).lineWidth(0.5)
    .moveTo(ML, y).lineTo(ML + PW, y).stroke().restore();
}

// tx — affiche du texte dans une cellule.
// mono=true : utilise JetBrains Mono (montants CHF) pour l'alignement décimal.
// multiline=true : le texte peut s'enrouler et la cellule s'agrandit (hauteur
// calculée par l'appelant via cellH). multiline=false : lineBreak=false +
// ellipsis=true (cellules à hauteur fixe).
function tx(
  doc: PDFKit.PDFDocument,
  str: string,
  x: number, y: number, w: number,
  opts: {
    bold?: boolean; italic?: boolean; mono?: boolean;
    size?: number; color?: string; align?: PDFKit.Align;
    multiline?: boolean;
  } = {},
): void {
  if (!str) return;
  const multiline = opts.multiline ?? false;
  const f = opts.mono ? fontMono(opts.bold) : font(opts.bold, opts.italic);
  doc.save()
    .font(f)
    .fontSize(opts.size ?? 8)
    .fillColor(opts.color ?? '#000000')
    .text(str, x + 2, y + 2, {
      width:     Math.max(w - 4, 1),
      align:     opts.align ?? 'left',
      lineBreak: multiline,
      ellipsis:  !multiline,
    })
    .restore();
}

// cellH — calcule la hauteur nécessaire pour un texte dans une colonne donnée.
// Utilisé pour pré-calculer la hauteur des lignes de données variables.
function cellH(
  doc: PDFKit.PDFDocument,
  str: string,
  w: number,
  opts: { bold?: boolean; mono?: boolean; size?: number } = {},
): number {
  if (!str) return ROW_H;
  doc.font(opts.mono ? fontMono(opts.bold) : font(opts.bold));
  doc.fontSize(opts.size ?? 8);
  const h = doc.heightOfString(str, { width: Math.max(w - 4, 1) }) + 4; // +4 : padding vertical
  return Math.max(h, ROW_H);
}

// rowH — hauteur maximale sur toutes les cellules d'une ligne.
function rowH(doc: PDFKit.PDFDocument, cells: Array<{ str: string; w: number; size?: number; bold?: boolean; mono?: boolean }>): number {
  return cells.reduce((max, c) => Math.max(max, cellH(doc, c.str, c.w, { size: c.size, bold: c.bold, mono: c.mono })), ROW_H);
}

// ─── Gestion des pages ────────────────────────────────────────────────────────

function ensurePage(doc: PDFKit.PDFDocument, y: number, need: number): number {
  if (y + need > PH - MB) {
    doc.addPage();
    return MT;
  }
  return y;
}

function sectionHeaderBar(doc: PDFKit.PDFDocument, label: string, y: number): number {
  fillRect(doc, ML, y, PW, HEAD_H, C_HEADER_BG);
  tx(doc, label, ML + 4, y + 3, PW - 8, { bold: true, color: C_HEADER_FG, size: 9 });
  return y + HEAD_H;
}

// ─── Disposition bilan deux colonnes ─────────────────────────────────────────

// Chaque moitié : N°(30) + Compte(157) + Solde(60) = 247 ; espacement = 21
const COL_W = 247;
const GAP   = Math.round(PW - 2 * COL_W);
const LX    = ML;
const RX    = ML + COL_W + GAP;
const C_NUM  = 30;
const C_NAME = 157;
const C_AMT  = 60;

function bilanColHeaders(doc: PDFKit.PDFDocument, y: number): void {
  fillRect(doc, LX, y, COL_W, COL_H, C_COLS_BG);
  fillRect(doc, RX, y, COL_W, COL_H, C_COLS_BG);
  for (const bx of [LX, RX]) {
    tx(doc, 'N°',        bx,                 y + 1, C_NUM,  { bold: true, size: 7.5 });
    tx(doc, 'Compte',    bx + C_NUM,          y + 1, C_NAME, { bold: true, size: 7.5 });
    tx(doc, 'Solde CHF', bx + C_NUM + C_NAME, y + 1, C_AMT,  { bold: true, size: 7.5, align: 'right' });
  }
}

function bilanDataRow(
  doc: PDFKit.PDFDocument,
  y: number, alt: boolean,
  left:  { num?: string; name: string; val: number | null; bold?: boolean } | null,
  right: { num?: string; name: string; val: number | null; bold?: boolean } | null,
  topBorder = false,
): void {
  // Les noms de compte (C_NAME = 157pt) tiennent sur une ligne : pas d'auto-expand
  if (alt) fillRect(doc, ML, y, PW, ROW_H, C_ROW_ALT);
  if (topBorder) hLine(doc, y, '#444444');

  const drawSide = (bx: number, item: typeof left) => {
    if (!item) return;
    tx(doc, item.num ?? '',    bx,                 y + 1, C_NUM,  { bold: item.bold, size: 7.5 });
    tx(doc, item.name,         bx + C_NUM,          y + 1, C_NAME, { bold: item.bold, size: 7.5 });
    if (item.val !== null)
      tx(doc, fmtChf(item.val), bx + C_NUM + C_NAME, y + 1, C_AMT,
        { mono: true, bold: item.bold, size: 7.5, align: 'right',
          color: item.val < 0 ? C_RED : '#000000' });
  };
  drawSide(LX, left);
  drawSide(RX, right);
}

// ─── Colonnes Journal ─────────────────────────────────────────────────────────

// 52+28+155+100+100+80 = 515 = PW
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
    tx(doc, label, x, y + 1, w, { bold: true, size: 7.5, align });
    x += w;
  }
}

// ─── Colonnes Grand-livre ─────────────────────────────────────────────────────

// 50+170+130+83+82 = 515 = PW
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
    tx(doc, label, x, y + 1, w, { bold: true, size: 7.5, align });
    x += w;
  }
}

// ─── Section Bilan & Résultat ─────────────────────────────────────────────────

function addBilanSection(doc: PDFKit.PDFDocument, accountMap: Map<string, AccountData>, year: number): void {
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
  let y = ensurePage(doc, doc.y, HEAD_H + COL_H + ROW_H * 2 + 40);

  fillRect(doc, LX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'ACTIF', LX + 4, y + 4, COL_W - 8, { bold: true, color: C_HEADER_FG, size: 8 });
  fillRect(doc, RX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'PASSIF & FONDS PROPRES', RX + 4, y + 4, COL_W - 8, { bold: true, color: C_HEADER_FG, size: 8 });
  y += HEAD_H;
  bilanColHeaders(doc, y);
  y += COL_H;

  const rightPassif: Array<{ num?: string; name: string; val: number }> = [
    ...passif.map(a => ({ num: a.number, name: a.name, val: computeSolde(a) })),
    { num: '', name: "Résultat de l'exercice", val: netResult },
  ];
  const bilanLen = Math.max(actif.length, rightPassif.length);

  for (let i = 0; i < bilanLen; i++) {
    y = ensurePage(doc, y, ROW_H + 4);
    if (doc.y === MT && y === MT) { bilanColHeaders(doc, y); y += COL_H; }
    const la = i < actif.length       ? { num: actif[i].number, name: actif[i].name, val: computeSolde(actif[i]) } : null;
    const rp = i < rightPassif.length ? { num: rightPassif[i].num, name: rightPassif[i].name, val: rightPassif[i].val } : null;
    bilanDataRow(doc, y, i % 2 === 1, la, rp);
    y += ROW_H;
  }

  y = ensurePage(doc, y, ROW_H + 20);
  bilanDataRow(doc, y, false,
    { name: 'Total actif',       val: totalActif,    bold: true },
    { name: 'Total passif & FP', val: totalPassifFP, bold: true }, true);
  y += ROW_H + 4;

  const diff   = Math.abs(totalActif - totalPassifFP);
  const balMsg = diff < 0.02 ? 'Bilan équilibré ✓' : `Écart : CHF ${fmtChf(diff)}`;
  tx(doc, balMsg, ML, y, PW, { italic: true, color: diff < 0.02 ? C_GREEN : C_RED, size: 8 });
  y += 16;
  doc.y = y + 8;

  // ── COMPTE DE RÉSULTAT ─────────────────────────────────────────────────────
  y = ensurePage(doc, doc.y, HEAD_H + COL_H + ROW_H * 2 + 40);

  fillRect(doc, LX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'PRODUITS', LX + 4, y + 4, COL_W - 8, { bold: true, color: C_HEADER_FG, size: 8 });
  fillRect(doc, RX, y, COL_W, HEAD_H, C_HEADER_BG);
  tx(doc, 'CHARGES',  RX + 4, y + 4, COL_W - 8, { bold: true, color: C_HEADER_FG, size: 8 });
  y += HEAD_H;

  fillRect(doc, LX, y, COL_W, COL_H, C_COLS_BG);
  fillRect(doc, RX, y, COL_W, COL_H, C_COLS_BG);
  for (const bx of [LX, RX]) {
    tx(doc, 'N°',        bx,                 y + 1, C_NUM,  { bold: true, size: 7.5 });
    tx(doc, 'Compte',    bx + C_NUM,          y + 1, C_NAME, { bold: true, size: 7.5 });
    tx(doc, 'Total CHF', bx + C_NUM + C_NAME, y + 1, C_AMT,  { bold: true, size: 7.5, align: 'right' });
  }
  y += COL_H;

  const plLen = Math.max(produits.length, charges.length);
  for (let i = 0; i < plLen; i++) {
    y = ensurePage(doc, y, ROW_H + 4);
    const lp = i < produits.length ? { num: produits[i].number, name: produits[i].name, val: computeSolde(produits[i]) } : null;
    const rc = i < charges.length  ? { num: charges[i].number,  name: charges[i].name,  val: computeSolde(charges[i])  } : null;
    bilanDataRow(doc, y, i % 2 === 1, lp, rc);
    y += ROW_H;
  }

  y = ensurePage(doc, y, ROW_H + 20);
  bilanDataRow(doc, y, false,
    { name: 'Total produits', val: totalProduits, bold: true },
    { name: 'Total charges',  val: totalCharges,  bold: true }, true);
  y += ROW_H + 4;

  const netLabel = netResult >= 0 ? 'Bénéfice net' : 'Perte nette';
  tx(doc, `${netLabel} (Produits − Charges)`, ML, y, PW - C_AMT - 4, { bold: true, size: 8 });
  tx(doc, fmtChf(netResult), ML + PW - C_AMT, y, C_AMT,
    { mono: true, bold: true, size: 8, align: 'right', color: netResult >= 0 ? C_GREEN : C_RED });
  hLine(doc, y, '#444444');
  y += 14;
  doc.y = y;
}

// ─── Journal général ──────────────────────────────────────────────────────────

function addJournalSection(doc: PDFKit.PDFDocument, journalRows: JournalRow[], year: number): void {
  doc.addPage();
  let y = MT;
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
      for (const d of entry.debits)
        lines.push({ date: displayDate, piece: entry.piece ?? '', desc: entry.description,
          debit: `${d.accountNumber} ${d.account}`, credit: '', amt: centsToCHF(d.amount) });
      for (const cr of entry.credits)
        lines.push({ date: displayDate, piece: entry.piece ?? '', desc: entry.description,
          debit: '', credit: `${cr.accountNumber} ${cr.account}`, amt: centsToCHF(cr.amount) });
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
      // Calcul de la hauteur de ligne selon le contenu réel (auto-expand)
      const rh = rowH(doc, [
        { str: lr.date,        w: J_DATE,  size: 7.5 },
        { str: lr.piece,       w: J_PIECE, size: 7.5 },
        { str: lr.desc,        w: J_LABEL, size: 7.5 },
        { str: lr.debit,       w: J_DEBIT, size: 7.5 },
        { str: lr.credit,      w: J_CRED,  size: 7.5 },
        { str: fmtChf(lr.amt), w: J_AMT,   size: 7.5, mono: true },
      ]);

      if (y + rh > PH - MB) {
        doc.addPage();
        y = MT;
        journalColHeaders(doc, y);
        y += COL_H;
        rowIndex = 0;
      }

      if (rowIndex % 2 === 1) fillRect(doc, ML, y, PW, rh, C_ROW_ALT);

      let x = ML;
      tx(doc, lr.date,        x, y + 1, J_DATE,  { size: 7.5, multiline: true }); x += J_DATE;
      tx(doc, lr.piece,       x, y + 1, J_PIECE, { size: 7.5, multiline: true }); x += J_PIECE;
      tx(doc, lr.desc,        x, y + 1, J_LABEL, { size: 7.5, multiline: true }); x += J_LABEL;
      tx(doc, lr.debit,       x, y + 1, J_DEBIT, { size: 7.5, multiline: true }); x += J_DEBIT;
      tx(doc, lr.credit,      x, y + 1, J_CRED,  { size: 7.5, multiline: true }); x += J_CRED;
      tx(doc, fmtChf(lr.amt), x, y + 1, J_AMT,   { mono: true, size: 7.5, multiline: true, align: 'right' });

      y += rh;
      rowIndex++;
    }
  }

  hLine(doc, y);
  doc.y = y + 6;
}

// ─── Grand-livre par compte ───────────────────────────────────────────────────

function addAccountsSection(
  doc: PDFKit.PDFDocument,
  accountMap: Map<string, AccountData>,
  entries: EntryDetail[],
  year: number,
): void {
  doc.addPage();
  let y = MT;

  for (const account of accountMap.values()) {
    const ledgerRows = buildAccountLedger(entries, account.number);
    if (ledgerRows.length === 0) continue;

    // En-tête de compte + colonne : au moins une ligne de données
    y = ensurePage(doc, y, ACCT_H + COL_H + ROW_H + 4);

    // En-tête du compte
    fillRect(doc, ML, y, PW, ACCT_H, '#4A90C4');
    tx(doc, `${account.number}  ${account.name} — Exercice ${year}`, ML + 6, y + 3, PW - 12,
      { bold: true, color: C_HEADER_FG, size: 8.5 });
    y += ACCT_H;
    accountColHeaders(doc, y);
    y += COL_H;

    let totalDebit  = 0;
    let totalCredit = 0;
    let rowIdx      = 0;

    for (const row of ledgerRows) {
      const debitStr  = row.debit  !== null ? fmtChf(row.debit)  : '';
      const creditStr = row.credit !== null ? fmtChf(row.credit) : '';

      const rh = rowH(doc, [
        { str: isoToDisplay(row.date), w: A_DATE,  size: 7.5 },
        { str: row.description,        w: A_LABEL, size: 7.5 },
        { str: row.contra,             w: A_CONTR, size: 7.5 },
        { str: debitStr,               w: A_DEBIT, size: 7.5, mono: true },
        { str: creditStr,              w: A_CRED,  size: 7.5, mono: true },
      ]);

      if (y + rh > PH - MB) {
        doc.addPage();
        y = MT;
        fillRect(doc, ML, y, PW, ACCT_H, '#4A90C4');
        tx(doc, `${account.number}  ${account.name} (suite)`, ML + 6, y + 3, PW - 12,
          { bold: true, color: C_HEADER_FG, size: 8.5 });
        y += ACCT_H;
        accountColHeaders(doc, y);
        y += COL_H;
        rowIdx = 0;
      }

      if (rowIdx % 2 === 1) fillRect(doc, ML, y, PW, rh, C_ROW_ALT);

      let x = ML;
      tx(doc, isoToDisplay(row.date), x, y + 1, A_DATE,  { size: 7.5, multiline: true }); x += A_DATE;
      tx(doc, row.description,        x, y + 1, A_LABEL, { size: 7.5, multiline: true }); x += A_LABEL;
      tx(doc, row.contra,             x, y + 1, A_CONTR, { size: 7.5, multiline: true, italic: row.isOpeningBalance }); x += A_CONTR;
      tx(doc, debitStr,  x, y + 1, A_DEBIT, { mono: true, size: 7.5, multiline: true, align: 'right' }); x += A_DEBIT;
      tx(doc, creditStr, x, y + 1, A_CRED,  { mono: true, size: 7.5, multiline: true, align: 'right' });

      if (row.debit  !== null) totalDebit  += row.debit;
      if (row.credit !== null) totalCredit += row.credit;

      y += rh;
      rowIdx++;
    }

    // Ligne de totaux du compte
    y = ensurePage(doc, y, ROW_H + 4);
    hLine(doc, y, '#888888');
    fillRect(doc, ML, y, PW, ROW_H, '#E8EFF6');
    let x = ML + A_DATE + A_LABEL + A_CONTR;
    tx(doc, fmtChf(totalDebit),  x, y + 1, A_DEBIT, { mono: true, bold: true, size: 7.5, align: 'right' }); x += A_DEBIT;
    tx(doc, fmtChf(totalCredit), x, y + 1, A_CRED,  { mono: true, bold: true, size: 7.5, align: 'right' });
    y += ROW_H + 6;  // espace entre comptes

    doc.y = y;
  }
}

// ─── Export principal ─────────────────────────────────────────────────────────

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

  doc.font(font(true)).fontSize(18).fillColor(C_HEADER_BG)
    .text('MCY — Moto Club Yvorne', ML, MT + 30, { width: PW, align: 'center' });
  doc.moveDown(0.6);
  doc.font(font(true)).fontSize(13).fillColor('#000000')
    .text(`Rapport de clôture — Exercice ${year}`, { width: PW, align: 'center' });
  doc.moveDown(0.4);
  doc.font(font()).fontSize(10).fillColor('#555555')
    .text(isClosed ? 'Exercice clôturé' : 'Exercice en cours', { width: PW, align: 'center' });
  doc.moveDown(0.3);
  doc.font(font()).fontSize(9).fillColor('#777777')
    .text(`Généré le ${todayStr}`, { width: PW, align: 'center' });

  hLine(doc, doc.y + 10);
  doc.moveDown(2);

  // ── Bilan & Résultat ─────────────────────────────────────────────────────
  doc.font(font(true)).fontSize(11).fillColor('#000000')
    .text(`Bilan & Résultat — Exercice ${year}`, ML, doc.y, { width: PW });
  doc.moveDown(0.5);
  addBilanSection(doc, accountMap, year);

  // ── Journal général ───────────────────────────────────────────────────────
  addJournalSection(doc, journalRows, year);

  // ── Grand-livre par compte ────────────────────────────────────────────────
  addAccountsSection(doc, accountMap, entries, year);

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
