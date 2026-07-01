import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { formatCHF, formatDate } from '../lib/format';

// A4 dimensions in points (1 pt = 1/72 inch)
const PW = 595.28;
const PH = 841.89;
const M  = 40;           // margin
const W  = PW - 2 * M;  // usable width ≈ 515

// Colors
const BLUE_DK    = '#1D4ED8';
const BLUE_LT    = '#DBEAFE';
const BLUE_TEXT  = '#1E3A8A';
const GRAY_ALT   = '#F8FAFC';
const GRAY_TOTAL = '#E2E8F0';
const GRAY_LINE  = '#CBD5E1';
const WHITE      = '#FFFFFF';
const BLACK      = '#111827';
const GRAY       = '#6B7280';
const GREEN      = '#15803D';
const RED        = '#B91C1C';

// Row heights
const RH  = 13;  // normal row
const HH  = 15;  // section title bar
const LH  = 11;  // column-label row

// Font sizes
const FS  = 8;   // normal
const FSL = 7;   // label / small
const FSS = 10;  // section title

// Two-column bilan/P&L layout
const HALF = (W - 10) / 2;
const GAP  = 10;
const XL   = M;
const XR   = M + HALF + GAP;
const C_NUM  = 28;
const C_SLD  = 52;
const C_NAME = HALF - C_NUM - C_SLD;

// Journal column widths (total = W = 515)
const JW_DATE   = 55;
const JW_PIECE  = 28;
const JW_DESC   = 192;
const JW_ACCT   = 148;
const JW_DEBIT  = 46;
const JW_CREDIT = 46;

interface BalRow {
  number:        string;
  name:          string;
  type:          string;
  class:         number;
  normalBalance: string;
  solde:         number;  // centimes
}

interface JRow {
  entryId:        number;
  date:           string;
  piece:          string | null;
  description:    string;
  isOpeningBalance: number;
  isClosingEntry:   number;
  accountNumber:  string;
  accountName:    string;
  debit:          number | null;
  credit:         number | null;
}

export async function exportFiscalYearToPdf(
  db: Database.Database,
  fiscalYearId: number,
  outputPath: string,
): Promise<void> {
  const fy = db
    .prepare('SELECT year, is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number; is_closed: number } | undefined;
  if (!fy) throw new Error(`Exercice ${fiscalYearId} introuvable`);

  const BALANCE_SQL = (excludeClosing: boolean) => `
    SELECT a.number, a.name, a.type, a.class, a.normal_balance AS normalBalance,
           CASE a.normal_balance
             WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0))  - SUM(COALESCE(l.credit,0))
             WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
           END AS solde
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ?${excludeClosing ? ' AND e.is_closing_entry = 0' : ''}
    GROUP BY a.id
    ORDER BY a.number
  `;

  const allBal = db.prepare(BALANCE_SQL(false)).all(fiscalYearId) as BalRow[];
  const plBal  = db.prepare(BALANCE_SQL(true)).all(fiscalYearId)  as BalRow[];

  const jRows = db.prepare(`
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
             e.date, e.id, (l.debit IS NOT NULL) DESC, l.id
  `).all(fiscalYearId) as JRow[];

  // ── Build PDF ────────────────────────────────────────────────────────────

  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  let y = M;

  // ── Primitive helpers ─────────────────────────────────────────────────────

  function np(): void {
    doc.addPage({ size: 'A4', margin: 0 });
    y = M;
  }

  function ensure(need: number): void {
    if (y + need > PH - M) np();
  }

  function fill(x: number, yp: number, w: number, h: number, c: string): void {
    doc.save().rect(x, yp, w, h).fill(c).restore();
  }

  function tx(
    str: string,
    x: number, yp: number, w: number,
    opts: {
      align?: 'left' | 'right' | 'center';
      bold?: boolean;
      size?: number;
      color?: string;
    } = {},
  ): void {
    doc.save()
      .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(opts.size ?? FS)
      .fillColor(opts.color ?? BLACK)
      .text(str, x + 2, yp + 2, {
        width: Math.max(w - 4, 1),
        align: opts.align ?? 'left',
        lineBreak: false,
        ellipsis: true,
      })
      .restore();
  }

  function hRule(yp: number, color = GRAY_LINE): void {
    doc.save().strokeColor(color).lineWidth(0.4)
      .moveTo(M, yp).lineTo(M + W, yp).stroke().restore();
  }

  function vRule(x: number, y1: number, y2: number): void {
    doc.save().strokeColor(GRAY_LINE).lineWidth(0.4)
      .moveTo(x, y1).lineTo(x, y2).stroke().restore();
  }

  function sectionBar(title: string): void {
    fill(M, y, W, HH + 2, BLUE_DK);
    tx(title, M + 4, y + 2, W - 8, { bold: true, size: FSS, color: WHITE });
    y += HH + 6;
  }

  // ── Cover page ────────────────────────────────────────────────────────────

  const coverY = PH / 3 - 50;
  fill(M, coverY - 10, W, 100, BLUE_LT);
  tx('MCY -- Moto Club Yvorne', M, coverY, W, {
    align: 'center', bold: true, size: 22, color: BLUE_DK,
  });
  tx('Rapport comptable', M, coverY + 30, W, {
    align: 'center', size: 14,
  });
  tx(`Exercice ${fy.year}`, M, coverY + 50, W, {
    align: 'center', bold: true, size: 16,
  });
  hRule(coverY + 80, BLUE_DK);
  tx(fy.is_closed ? 'Exercice cloture' : 'Exercice en cours', M, coverY + 88, W, {
    align: 'center', size: 9, color: GRAY,
  });
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${pad2(now.getDate())}.${pad2(now.getMonth() + 1)}.${now.getFullYear()}`;
  tx(`Genere le ${todayStr}`, M, coverY + 102, W, {
    align: 'center', size: 9, color: GRAY,
  });

  // ── Two-column section (Bilan / Compte de résultat) ───────────────────────

  interface ColItem { n: string; name: string; solde: number }

  function twoColSection(
    title: string,
    leftHead: string,  leftRows: ColItem[],
    rightHead: string, rightRows: ColItem[],
    leftTotal: number, rightTotal: number,
    resultLabel?: string, resultValue?: number,
  ): void {
    np();
    sectionBar(title);

    const startY = y;

    // Sub-headers
    fill(XL, y, HALF, HH, BLUE_LT);
    tx(leftHead,  XL + 2, y + 1, HALF - 4, { bold: true, size: FSL, color: BLUE_TEXT, align: 'center' });
    fill(XR, y, HALF, HH, BLUE_LT);
    tx(rightHead, XR + 2, y + 1, HALF - 4, { bold: true, size: FSL, color: BLUE_TEXT, align: 'center' });
    y += HH;

    // Column labels
    const colLabelY = y;
    tx('N', XL + 2, colLabelY, C_NUM - 2, { bold: true, size: FSL, color: '#374151' });
    tx('Compte', XL + C_NUM + 2, colLabelY, C_NAME - 2, { bold: true, size: FSL, color: '#374151' });
    tx('CHF', XL + C_NUM + C_NAME + 2, colLabelY, C_SLD - 4, { bold: true, size: FSL, color: '#374151', align: 'right' });
    tx('N', XR + 2, colLabelY, C_NUM - 2, { bold: true, size: FSL, color: '#374151' });
    tx('Compte', XR + C_NUM + 2, colLabelY, C_NAME - 2, { bold: true, size: FSL, color: '#374151' });
    tx('CHF', XR + C_NUM + C_NAME + 2, colLabelY, C_SLD - 4, { bold: true, size: FSL, color: '#374151', align: 'right' });
    y += LH;
    hRule(y);

    const extraRight: ColItem[] = resultLabel !== undefined && resultValue !== undefined
      ? [{ n: '', name: resultLabel, solde: resultValue }]
      : [];
    const rightAll = [...rightRows, ...extraRight];
    const len = Math.max(leftRows.length, rightAll.length);

    for (let i = 0; i < len; i++) {
      ensure(RH);
      const alt = i % 2 === 1;
      if (alt) {
        fill(XL, y, HALF, RH, GRAY_ALT);
        fill(XR, y, HALF, RH, GRAY_ALT);
      }
      if (i < leftRows.length) {
        const r = leftRows[i];
        tx(r.n, XL + 2, y, C_NUM - 2);
        tx(r.name, XL + C_NUM + 2, y, C_NAME - 2);
        tx(formatCHF(r.solde), XL + C_NUM + C_NAME + 2, y, C_SLD - 4, { align: 'right' });
      }
      if (i < rightAll.length) {
        const r = rightAll[i];
        const isResult = i === rightRows.length && resultLabel !== undefined;
        const clr = isResult ? (resultValue! >= 0 ? GREEN : RED) : BLACK;
        tx(r.n, XR + 2, y, C_NUM - 2, { color: clr });
        tx(r.name, XR + C_NUM + 2, y, C_NAME - 2, { color: clr, bold: isResult });
        tx(formatCHF(r.solde), XR + C_NUM + C_NAME + 2, y, C_SLD - 4, { align: 'right', color: clr, bold: isResult });
      }
      y += RH;
    }

    // Total row
    ensure(RH + 4);
    hRule(y);
    y += 2;
    fill(XL, y, HALF, RH, GRAY_TOTAL);
    tx('TOTAL', XL + 2, y, C_NUM + C_NAME - 2, { bold: true });
    tx(formatCHF(leftTotal), XL + C_NUM + C_NAME + 2, y, C_SLD - 4, { bold: true, align: 'right' });
    fill(XR, y, HALF, RH, GRAY_TOTAL);
    tx('TOTAL', XR + 2, y, C_NUM + C_NAME - 2, { bold: true });
    tx(formatCHF(rightTotal), XR + C_NUM + C_NAME + 2, y, C_SLD - 4, { bold: true, align: 'right' });
    y += RH + 4;

    // Vertical divider for the entire two-column area
    vRule(M + HALF + GAP / 2, startY, y);
  }

  // ── Compute balances ──────────────────────────────────────────────────────

  const actif   = allBal.filter(r => r.class === 1 && r.solde !== 0)
                         .map(r => ({ n: r.number, name: r.name, solde: r.solde }));
  const passif  = allBal.filter(r => r.class === 2 && r.type !== 'FONDS_PROPRES' && r.solde !== 0)
                         .map(r => ({ n: r.number, name: r.name, solde: r.solde }));
  const fp      = allBal.filter(r => r.type === 'FONDS_PROPRES' && r.solde !== 0)
                         .map(r => ({ n: r.number, name: r.name, solde: r.solde }));

  const produits = plBal.filter(r => r.class === 3).reduce((s, r) => s + r.solde, 0);
  const charges  = plBal.filter(r => r.class === 4).reduce((s, r) => s + r.solde, 0);
  const resultat = produits - charges;

  const totalActif  = actif.reduce((s, r) => s + r.solde, 0);
  const totalPassif = passif.reduce((s, r) => s + r.solde, 0)
                    + fp.reduce((s, r) => s + r.solde, 0)
                    + resultat;

  const chargesItems  = plBal.filter(r => r.class === 4 && r.solde !== 0)
                              .map(r => ({ n: r.number, name: r.name, solde: r.solde }));
  const produitsItems = plBal.filter(r => r.class === 3 && r.solde !== 0)
                              .map(r => ({ n: r.number, name: r.name, solde: r.solde }));

  // ── Bilan ─────────────────────────────────────────────────────────────────

  twoColSection(
    `BILAN AU 31 DECEMBRE ${fy.year}`,
    'ACTIF',            [...actif],
    'PASSIF + FP',      [...passif, ...fp],
    totalActif, totalPassif,
    resultat >= 0 ? 'Benefice net' : 'Perte nette', resultat,
  );

  // ── Compte de résultat ────────────────────────────────────────────────────

  twoColSection(
    `COMPTE DE RESULTAT -- EXERCICE ${fy.year}`,
    'CHARGES',  chargesItems,
    'PRODUITS', produitsItems,
    charges, produits,
    resultat >= 0 ? 'Benefice' : 'Perte', Math.abs(resultat),
  );

  // ── Journal général ───────────────────────────────────────────────────────

  function journalHeader(suite: boolean): void {
    sectionBar(`JOURNAL GENERAL -- EXERCICE ${fy.year}${suite ? ' (suite)' : ''}`);
    fill(M, y, W, LH, BLUE_LT);
    let xj = M;
    tx('Date',   xj + 2, y, JW_DATE  - 2, { bold: true, size: FSL, color: BLUE_TEXT }); xj += JW_DATE;
    tx('Piece',  xj + 2, y, JW_PIECE - 2, { bold: true, size: FSL, color: BLUE_TEXT }); xj += JW_PIECE;
    tx('Libelle',xj + 2, y, JW_DESC  - 2, { bold: true, size: FSL, color: BLUE_TEXT }); xj += JW_DESC;
    tx('Compte', xj + 2, y, JW_ACCT  - 2, { bold: true, size: FSL, color: BLUE_TEXT }); xj += JW_ACCT;
    tx('Debit',  xj + 2, y, JW_DEBIT - 2, { bold: true, size: FSL, color: BLUE_TEXT, align: 'right' }); xj += JW_DEBIT;
    tx('Credit', xj + 2, y, JW_CREDIT - 2, { bold: true, size: FSL, color: BLUE_TEXT, align: 'right' });
    y += LH;
    hRule(y);
  }

  np();
  journalHeader(false);

  let totalDebit  = 0;
  let totalCredit = 0;
  let entryColorIdx = 0;
  let prevEntryId = -1;
  let firstEntry = true;

  for (const r of jRows) {
    const isNewEntry = r.entryId !== prevEntryId;

    // Page break check
    if (y + RH > PH - M - 20) {
      np();
      journalHeader(true);
      entryColorIdx = 0;
      firstEntry = true;
    }

    if (isNewEntry) {
      if (!firstEntry) {
        hRule(y, GRAY_ALT);  // thin separator between entries
        entryColorIdx++;
      }
      firstEntry = false;
    }

    const alt = entryColorIdx % 2 === 1;
    if (alt) fill(M, y, W, RH, GRAY_ALT);

    let xj = M;
    tx(isNewEntry ? formatDate(r.date) : '',                   xj + 2, y, JW_DATE  - 2); xj += JW_DATE;
    tx(isNewEntry && r.piece ? r.piece : '',                   xj + 2, y, JW_PIECE - 2); xj += JW_PIECE;
    tx(isNewEntry ? r.description : '',                        xj + 2, y, JW_DESC  - 2); xj += JW_DESC;
    tx(`${r.accountNumber} ${r.accountName}`,                  xj + 2, y, JW_ACCT  - 2); xj += JW_ACCT;
    tx(r.debit  !== null ? formatCHF(r.debit)  : '', xj + 2, y, JW_DEBIT  - 2, { align: 'right' }); xj += JW_DEBIT;
    tx(r.credit !== null ? formatCHF(r.credit) : '', xj + 2, y, JW_CREDIT - 2, { align: 'right' });

    if (r.debit  !== null) totalDebit  += r.debit;
    if (r.credit !== null) totalCredit += r.credit;

    prevEntryId = r.entryId;
    y += RH;
  }

  // Journal total row
  ensure(RH + 4);
  hRule(y);
  y += 2;
  fill(M, y, W, RH, GRAY_TOTAL);
  tx('TOTAL', M + 2, y, JW_DATE + JW_PIECE + JW_DESC + JW_ACCT - 2, { bold: true });
  const xTot = M + JW_DATE + JW_PIECE + JW_DESC + JW_ACCT;
  tx(formatCHF(totalDebit),  xTot + 2, y, JW_DEBIT  - 2, { bold: true, align: 'right' });
  tx(formatCHF(totalCredit), xTot + JW_DEBIT + 2, y, JW_CREDIT - 2, { bold: true, align: 'right' });
  y += RH;

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
