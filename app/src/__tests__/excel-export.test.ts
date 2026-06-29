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
    expect(wb.worksheets[2].name).toBe('101 Raiffeisen');
    expect(wb.worksheets[3].name).toBe('300 Cotisations membres');
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
    const ws = wb.getWorksheet('101 Raiffeisen')!;
    expect(ws.getCell('A2').value).toBe('Raiffeisen');
  });

  it('ligne 2 contient "Total" en C2', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('101 Raiffeisen')!;
    expect(ws.getCell('C2').value).toBe('Total');
  });

  it('ligne 5 contient les en-têtes Date / Libellé / Doit / Avoir', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('101 Raiffeisen')!;
    expect(ws.getCell('A5').value).toBe('Date');
    expect(ws.getCell('B5').value).toBe('Libellé');
    expect(ws.getCell('C5').value).toBe('Doit');
    expect(ws.getCell('D5').value).toBe('Avoir');
  });

  it('ligne 6 (première donnée) contient la date et la description', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('101 Raiffeisen')!;
    expect(ws.getCell('A6').value).toBe('2025-03-01');
    expect(ws.getCell('B6').value).toBe('Cotisations annuelles');
  });

  it('le débit est en CHF (pas en centimes) dans la colonne Doit', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('101 Raiffeisen')!;
    // 141000 centimes = 1410.00 CHF
    expect(ws.getCell('C6').value).toBe(1410);
  });

  it('la ligne Total contient une formule SUBTOTAL en C', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('101 Raiffeisen')!;
    // 1 data row → total is at row 7
    const cell = ws.getCell('C7');
    const v = cell.value as { formula: string };
    expect(v?.formula).toMatch(/SUBTOTAL\(109/);
  });

  it('la feuille Cotisations membres n\'a PAS de colonne Courant (compte PRODUIT)', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('300 Cotisations membres')!;
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
    const ws = wb.getWorksheet('100 Caisse')!;
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
    const ws = wb.getWorksheet('100 Caisse')!;
    const cell = ws.getCell('E6');
    const v = cell.value as { formula: string };
    expect(v?.formula).toMatch(/SUM\(\$C\$6/);
  });
});

describe('exportFiscalYearToExcel — feuille Journal', () => {
  it('la ligne 1 contient le titre Journal — Exercice YYYY', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    expect(ws.getCell('A1').value).toBe('Journal — Exercice 2025');
  });

  it('la ligne 3 contient les en-têtes Date / Pièce / Libellé / Compte / Débit CHF / Crédit CHF', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    expect(ws.getCell('A3').value).toBe('Date');
    expect(ws.getCell('B3').value).toBe('Pièce');
    expect(ws.getCell('C3').value).toBe('Libellé');
    expect(ws.getCell('D3').value).toBe('Compte');
    expect(ws.getCell('E3').value).toBe('Débit CHF');
    expect(ws.getCell('F3').value).toBe('Crédit CHF');
  });

  it('la première ligne de données contient la date au format DD.MM.YYYY', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    // première ligne de données = ligne 4
    expect(ws.getCell('A4').value).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('la colonne Compte contient le numéro et le nom du compte', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    const compte = ws.getCell('D4').value as string;
    expect(compte).toContain('101');
    expect(compte).toContain('Raiffeisen');
  });

  it('le montant débit est en CHF (pas en centimes)', async () => {
    await exportFiscalYearToExcel(db, fiscalYearId, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.getWorksheet('Journal')!;
    // ligne débit Raiffeisen = 1410 CHF
    expect(ws.getCell('E4').value).toBe(1410);
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

describe('exportFiscalYearToExcel — collision noms feuilles (330 et 430)', () => {
  it('ne plante pas quand 330 et 430 ont le même nom et crée deux feuilles distinctes', async () => {
    // Accounts 330 (Événement — Marché Villageois, PRODUIT) and 430 (same name, CHARGE)
    const acct330 = db.prepare("SELECT id FROM accounts WHERE number = '330'").get() as { id: number };
    const acct430 = db.prepare("SELECT id FROM accounts WHERE number = '430'").get() as { id: number };
    const acct101 = db.prepare("SELECT id FROM accounts WHERE number = '101'").get() as { id: number };

    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-05-15',
      description: 'Recette Marché Villageois',
      lines: [
        { account_id: acct101.id, debit: 50000 },
        { account_id: acct330.id, credit: 50000 },
      ],
    });

    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-05-16',
      description: 'Achat Marché Villageois',
      lines: [
        { account_id: acct430.id, debit: 20000 },
        { account_id: acct101.id, credit: 20000 },
      ],
    });

    // Must not throw "Worksheet name already exists"
    await expect(exportFiscalYearToExcel(db, fiscalYearId, tmpFile)).resolves.toBeUndefined();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const sheetNames = wb.worksheets.map(ws => ws.name);

    // Both 330 and 430 sheets must exist and be distinct
    const sheet330 = sheetNames.find(n => n.startsWith('330'));
    const sheet430 = sheetNames.find(n => n.startsWith('430'));
    expect(sheet330).toBeDefined();
    expect(sheet430).toBeDefined();
    expect(sheet330).not.toBe(sheet430);
  });
});
