import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ExcelJS from 'exceljs';

vi.mock('electron', () => ({ app: { getPath: vi.fn() } }));

import { openDatabase, createFiscalYear, createJournalEntry, getActiveAccounts } from '../db';
import { exportFiscalYearToExcel } from '../excel/export';
import type Database from 'better-sqlite3';

let tmpDir: string;
let tmpFile: string;
let db: Database.Database;
let fiscalYearId: number;

async function setup() {
  db = openDatabase(':memory:');
  const fy = createFiscalYear(2025);
  fiscalYearId = fy.id;
  const accounts = getActiveAccounts();
  // account 101 Raiffeisen (id depends on seed order — find by number)
  const raiff = accounts.find(a => a.number === '101')!;
  const cotis = accounts.find(a => a.number === '300')!;
  createJournalEntry({
    fiscal_year_id: fiscalYearId,
    date: '2025-03-01',
    description: 'Cotisations annuelles',
    lines: [
      { account_id: raiff.id, debit: 141000 },   // CHF 1410.00
      { account_id: cotis.id, credit: 141000 },
    ],
  });
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-excel-test-'));
  tmpFile = path.join(tmpDir, 'test.xlsx');
  await setup();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('exportFiscalYearToExcel — structure', () => {
  it('crée un fichier .xlsx non vide', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(true);
    expect(fs.statSync(tmpFile).size).toBeGreaterThan(0);
  });

  it('crée 3 feuilles : Bilan & Résultat + Journal + 2 comptes actifs (Raiffeisen + Cotisations)', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    // Bilan + Journal + Raiffeisen + Cotisations membres = 4
    expect(wb.worksheets.length).toBe(4);
  });

  it('la première feuille est "Bilan & Résultat"', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    expect(wb.worksheets[0].name).toBe('Bilan & Résultat');
  });

  it('la deuxième feuille est "Journal"', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    expect(wb.worksheets[1].name).toBe('Journal');
  });

  it('les feuilles de compte suivent dans l\'ordre du numéro de compte', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    expect(wb.worksheets[2].name).toBe('Raiffeisen');
    expect(wb.worksheets[3].name).toBe('Cotisations membres');
  });

  it('lève une erreur si l\'exercice n\'existe pas', async () => {
    await expect(exportFiscalYearToExcel(db, 9999, tmpFile)).rejects.toThrow('9999');
  });
});

describe('exportFiscalYearToExcel — feuille de compte (Raiffeisen)', () => {
  it('ligne 2 contient le nom du compte en A2', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Raiffeisen')!;
    expect(ws.getCell('A2').value).toBe('Raiffeisen');
  });

  it('ligne 2 contient "Total" en C2', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Raiffeisen')!;
    expect(ws.getCell('C2').value).toBe('Total');
  });

  it('ligne 5 contient les en-têtes Date / Libellé / Doit / Avoir', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Raiffeisen')!;
    expect(ws.getCell('A5').value).toBe('Date');
    expect(ws.getCell('B5').value).toBe('Libellé');
    expect(ws.getCell('C5').value).toBe('Doit');
    expect(ws.getCell('D5').value).toBe('Avoir');
  });

  it('ligne 6 (première donnée) contient la date et la description', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Raiffeisen')!;
    expect(ws.getCell('A6').value).toBe('2025-03-01');
    expect(ws.getCell('B6').value).toBe('Cotisations annuelles');
  });

  it('le débit est en CHF (pas en centimes) dans la colonne Doit', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Raiffeisen')!;
    // 141000 centimes = 1410.00 CHF
    expect(ws.getCell('C6').value).toBe(1410);
  });

  it('la ligne Total contient une formule SUBTOTAL en C', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Raiffeisen')!;
    // 1 data row → total is at row 7
    const cell = ws.getCell('C7');
    const v = cell.value as { formula: string };
    expect(v?.formula).toMatch(/SUBTOTAL\(109/);
  });

  it('la feuille Cotisations membres n\'a PAS de colonne Courant (compte PRODUIT)', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Cotisations membres')!;
    expect(ws.getCell('E5').value).toBeNull();
  });
});

describe('exportFiscalYearToExcel — colonne Courant (Caisse)', () => {
  it('la feuille Caisse a la colonne Courant en E5', async () => {
    // Add a Caisse entry
    const accounts = getActiveAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const capital = accounts.find(a => a.number === '290')!;
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-01-01',
      description: 'Solde à nouveau',
      lines: [
        { account_id: caisse.id, debit: 590800 },  // CHF 5908.00
        { account_id: capital.id, credit: 590800 },
      ],
    });
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Caisse')!;
    expect(ws.getCell('E5').value).toBe('Courant');
  });

  it('la colonne Courant contient une formule SUM en E6', async () => {
    const accounts = getActiveAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const capital = accounts.find(a => a.number === '290')!;
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-01-01',
      description: 'Solde à nouveau',
      lines: [
        { account_id: caisse.id, debit: 590800 },
        { account_id: capital.id, credit: 590800 },
      ],
    });
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Caisse')!;
    const cell = ws.getCell('E6');
    const v = cell.value as { formula: string };
    expect(v?.formula).toMatch(/SUM\(\$C\$6/);
  });
});

describe('exportFiscalYearToExcel — feuille Journal', () => {
  it('la ligne 1 contient les en-têtes Date / Libellé / Montant / Pièce', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    expect(ws.getCell('A1').value).toBe('Date');
    expect(ws.getCell('B1').value).toBe('Libellé');
    expect(ws.getCell('C1').value).toBe('Montant');
    expect(ws.getCell('D1').value).toBe('Pièce');
  });

  it('contient autant de lignes que de journal_entry_lines', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    // Setup creates 1 entry with 2 lines → 2 data rows + 1 header = 3
    expect(ws.rowCount).toBe(3);
  });

  it('le libellé est "{Compte} — {Description}"', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    const label = ws.getCell('B2').value as string;
    expect(label).toContain('Raiffeisen');
    expect(label).toContain('Cotisations annuelles');
  });

  it('le montant est en CHF (pas en centimes)', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    expect(ws.getCell('C2').value).toBe(1410);
  });
});

describe('exportFiscalYearToExcel — feuille Bilan & Résultat', () => {
  it('contient une section Actifs', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Bilan & Résultat')!;
    const values = ws.getColumn(1).values as string[];
    expect(values).toContain('Actifs');
  });

  it('contient une section Produits', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Bilan & Résultat')!;
    const values = ws.getColumn(1).values as string[];
    expect(values).toContain('Produits');
  });

  it('contient une ligne Résultat net', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Bilan & Résultat')!;
    const values = ws.getColumn(1).values as string[];
    expect(values.some(v => typeof v === 'string' && v.toLowerCase().includes('résultat net'))).toBe(true);
  });

  it('le solde de Cotisations membres (300) est 1410.00 CHF', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Bilan & Résultat')!;
    // Find the row for Cotisations membres
    let found = false;
    ws.eachRow((row) => {
      if (row.getCell(2).value === 'Cotisations membres') {
        expect(row.getCell(3).value).toBe(1410);
        found = true;
      }
    });
    expect(found).toBe(true);
  });
});
