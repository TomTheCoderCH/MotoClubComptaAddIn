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
