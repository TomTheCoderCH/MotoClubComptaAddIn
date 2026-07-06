import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import ExcelJS from 'exceljs';
import { exportMembersToExcel } from '../excel/export-members';
import type { MemberWithDues, FiscalYear } from '../types';

let tmpDir: string;
let tmpFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-excel-members-test-'));
  tmpFile = path.join(tmpDir, 'test.xlsx');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const fiscalYears: FiscalYear[] = [
  { id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
    is_closed: false, created_at: '', hasOpeningBalance: false },
];

const memberPaid: MemberWithDues = {
  id: 1, last_name: 'Merli', first_name: 'Thomas',
  entry_date: '2020-01-01', is_active: 1, inactive_note: null, created_at: '',
  dues: [{ id: 1, member_id: 1, year: 2025, paid: 1, payment_note: null,
           payment_date: '2025-03-01', amount_cents: 3000, journal_entry_id: 10, created_at: '' }],
};

const memberArrears: MemberWithDues = {
  id: 2, last_name: 'Dupont', first_name: 'Jean',
  entry_date: '2020-01-01', is_active: 1, inactive_note: null, created_at: '',
  dues: [],
};

const memberInactive: MemberWithDues = {
  id: 3, last_name: 'Inactif', first_name: 'Ancien',
  entry_date: '2020-01-01', is_active: 0, inactive_note: 'Démission 2024', created_at: '',
  dues: [],
};

describe('exportMembersToExcel — structure', () => {
  it('crée un fichier .xlsx non vide avec une feuille "Membres"', async () => {
    await exportMembersToExcel([memberPaid], fiscalYears, { start: 2025, end: 2025 }, false, tmpFile);
    expect(fs.existsSync(tmpFile)).toBe(true);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    expect(wb.worksheets.length).toBe(1);
    expect(wb.worksheets[0].name).toBe('Membres');
  });

  it('affiche le titre avec la plage d\'années', async () => {
    await exportMembersToExcel([memberPaid], fiscalYears, { start: 2023, end: 2025 }, false, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    expect(ws.getCell(1, 1).value).toContain('2023');
    expect(ws.getCell(1, 1).value).toContain('2025');
  });

  it('affiche les en-têtes Nom, Prénom, Entrée, Statut puis une colonne par année', async () => {
    await exportMembersToExcel([memberPaid], fiscalYears, { start: 2024, end: 2025 }, false, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    const headerRow = 3;
    expect(ws.getCell(headerRow, 1).value).toBe('Nom');
    expect(ws.getCell(headerRow, 2).value).toBe('Prénom');
    expect(ws.getCell(headerRow, 3).value).toBe('Entrée');
    expect(ws.getCell(headerRow, 4).value).toBe('Statut');
    expect(ws.getCell(headerRow, 5).value).toBe(2024);
    expect(ws.getCell(headerRow, 6).value).toBe(2025);
  });
});

describe('exportMembersToExcel — contenu', () => {
  it('affiche ✓ pour une année payée et — pour une année non payée', async () => {
    await exportMembersToExcel([memberPaid, memberArrears], fiscalYears, { start: 2025, end: 2025 }, false, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    // Ligne 4 = Dupont Jean (trié avant Merli Thomas), ligne 5 = Merli Thomas
    expect(ws.getCell(4, 5).value).toBe('—'); // Dupont, 2025, non payé
    expect(ws.getCell(5, 5).value).toBe('✓'); // Merli, 2025, payé
  });

  it('applique un fond rouge clair sur les cellules en arriéré', async () => {
    await exportMembersToExcel([memberArrears], fiscalYears, { start: 2025, end: 2025 }, false, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    const cell = ws.getCell(4, 5); // Dupont, 2025, non payé, entry_date 2020 → arriéré
    expect(cell.fill).toMatchObject({ fgColor: { argb: 'FFFEE2E2' } });
  });

  it('n\'applique pas de fond rouge sur une cellule payée', async () => {
    await exportMembersToExcel([memberPaid], fiscalYears, { start: 2025, end: 2025 }, false, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    const cell = ws.getCell(4, 5); // Merli, 2025, payé
    // Après un aller-retour disque, exceljs sérialise une cellule sans remplissage
    // comme { type: 'pattern', pattern: 'none' } plutôt que `undefined`.
    expect(cell.fill).toMatchObject({ pattern: 'none' });
  });

  it('formate la date d\'entrée en DD.MM.YYYY', async () => {
    await exportMembersToExcel([memberPaid], fiscalYears, { start: 2025, end: 2025 }, false, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    expect(ws.getCell(4, 3).value).toBe('01.01.2020');
  });

  it('exclut les membres inactifs si showInactive=false', async () => {
    await exportMembersToExcel([memberPaid, memberInactive], fiscalYears, { start: 2025, end: 2025 }, false, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    // Une seule ligne de données (ligne 4) : Merli — Inactif exclu
    expect(ws.getCell(4, 1).value).toBe('Merli');
    expect(ws.getCell(5, 1).value).toBeNull();
  });

  it('inclut les membres inactifs si showInactive=true', async () => {
    await exportMembersToExcel([memberPaid, memberInactive], fiscalYears, { start: 2025, end: 2025 }, true, tmpFile);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tmpFile);
    const ws = wb.worksheets[0];
    // Triés par nom : Inactif (ligne 4), Merli (ligne 5)
    expect(ws.getCell(4, 1).value).toBe('Inactif');
    expect(ws.getCell(4, 4).value).toBe('Inactif');
    expect(ws.getCell(5, 1).value).toBe('Merli');
    expect(ws.getCell(5, 4).value).toBe('Actif');
  });
});
