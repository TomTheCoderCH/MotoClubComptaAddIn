# Excel Export de Clôture Annuelle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a `.xlsx` workbook from SQLite data for a fiscal year, reproducing the MCY reference file structure (account sheets with SUBTOTAL formulas + running balance, Journal sheet, Bilan & Résultat summary sheet), with trigger buttons in FiscalYearsPage and SettingsPage.

**Architecture:** A pure exceljs function `exportFiscalYearToExcel(db, fiscalYearId, outputPath)` in `src/excel/export.ts` fetches data via two SQL queries and builds the workbook; an IPC handler `excel:export` wraps it with `showSaveDialog`; the renderer calls it via `window.api.exportExcel(fiscalYearId)`.

**Tech Stack:** exceljs ^4.x (no native rebuild), better-sqlite3 (existing), Electron IPC (existing pattern), React (existing pattern), Vitest (existing pattern).

## Global Constraints

- Amounts stored in DB as centimes (INTEGER) — always divide by 100 before writing to Excel
- Column C = Doit (debit), Column D = Avoir (credit) in all account sheets
- Courant column only for accounts with `type = 'ACTIF'` and `must_be_zero_at_closing = 0` (accounts 100 Caisse, 101 Raiffeisen)
- Courant formula direction: `SUM($C$6:Ci)-SUM($D$6:Di)` (Doit − Avoir = positive balance for assets)
- Row 2 net formula depends on `normal_balance`: DEBIT → `SUBTOTAL(109,Cn)-SUBTOTAL(109,Dn)` ; CREDIT → `SUBTOTAL(109,Dn)-SUBTOTAL(109,Cn)`
- All SUBTOTAL use function number 109 (ignores hidden rows)
- Data rows start at row 6 in all account sheets
- IPC return types: `{ path: string } | { error: string } | null` (null = user cancelled)
- Mock pattern: `vi.mock('electron', ...)` with `handlers` Map — see existing `ipc-backup-handlers.test.ts`
- All new renderer tests use `// @vitest-environment jsdom` header and `vi.stubGlobal('api', ...)` mock pattern

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `app/src/excel/export.ts` | exceljs workbook generation, pure function |
| Create | `app/src/__tests__/excel-export.test.ts` | Vitest tests for export.ts |
| Create | `app/src/__tests__/ipc-excel-handlers.test.ts` | IPC handler tests |
| Modify | `app/src/ipc-handlers.ts` | Add `excel:export` handler |
| Modify | `app/src/preload.ts` | Expose `exportExcel` via contextBridge |
| Modify | `app/src/window.d.ts` | Declare `exportExcel` type on `window.api` |
| Modify | `app/src/pages/FiscalYearsPage.tsx` | Add "Exporter Excel" button per row |
| Modify | `app/src/__tests__/renderer/FiscalYearsPage.test.tsx` | Test for new button |
| Modify | `app/src/pages/SettingsPage.tsx` | Add Excel export section |
| Modify | `app/src/__tests__/renderer/SettingsPage.test.tsx` | Test for new section |

---

## Task 1: Install exceljs + `src/excel/export.ts` skeleton + basic structure tests

**Files:**
- Create: `app/src/excel/export.ts`
- Create: `app/src/__tests__/excel-export.test.ts`

**Interfaces:**
- Produces: `exportFiscalYearToExcel(db: Database.Database, fiscalYearId: number, outputPath: string): Promise<void>`

- [ ] **Step 1: Install exceljs**

```bash
cd app && npm install exceljs
```

Expected: `exceljs` appears in `package.json` `dependencies`.

- [ ] **Step 2: Write the failing tests**

Create `app/src/__tests__/excel-export.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests — verify they all fail**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/excel-export.test.ts
```

Expected: 6 tests FAIL (module not found or function not implemented).

- [ ] **Step 4: Create `app/src/excel/` directory and `export.ts` skeleton**

Create `app/src/excel/export.ts`:

```typescript
import ExcelJS from 'exceljs';
import type Database from 'better-sqlite3';

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
  accountName: string;
  date: string;
  description: string;
  piece: string | null;
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
    SELECT a.name AS accountName, e.date, e.description, e.piece, l.debit, l.credit
    FROM journal_entries e
    JOIN journal_entry_lines l ON l.journal_entry_id = e.id
    JOIN accounts a ON a.id = l.account_id
    WHERE e.fiscal_year_id = ?
    ORDER BY e.date, e.id, l.id
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

  addBilanSheet(wb, accountMap, fy.year);
  addJournalSheet(wb, journalRows);
  for (const account of accountMap.values()) {
    addAccountSheet(wb, account);
  }

  await wb.xlsx.writeFile(outputPath);
}

function addBilanSheet(
  _wb: ExcelJS.Workbook,
  _accountMap: Map<string, AccountData>,
  _year: number,
): void {
  // TODO in Task 3
  _wb.addWorksheet('Bilan & Résultat');
}

function addJournalSheet(_wb: ExcelJS.Workbook, _rows: JournalRow[]): void {
  // TODO in Task 3
  _wb.addWorksheet('Journal');
}

function addAccountSheet(_wb: ExcelJS.Workbook, account: AccountData): void {
  // TODO in Task 2
  _wb.addWorksheet(account.name);
}
```

- [ ] **Step 5: Run tests — verify they all pass**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/excel-export.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd app && git add src/excel/export.ts src/__tests__/excel-export.test.ts package.json package-lock.json
git commit -m "feat(excel): install exceljs + export skeleton — 6 tests"
```

---

## Task 2: Account sheets — header, data rows, SUBTOTAL formulas, Courant column

**Files:**
- Modify: `app/src/excel/export.ts` — implement `addAccountSheet`
- Modify: `app/src/__tests__/excel-export.test.ts` — add account sheet tests

**Interfaces:**
- Consumes: `exportFiscalYearToExcel(db, fiscalYearId, outputPath)` from Task 1
- Consumes: setup() from Task 1 (fiscalYearId, db)

- [ ] **Step 1: Add failing tests for account sheet content**

Append to `app/src/__tests__/excel-export.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/excel-export.test.ts
```

Expected: 6 original tests PASS, 9 new tests FAIL.

- [ ] **Step 3: Implement `addAccountSheet` in `src/excel/export.ts`**

Replace the stub `addAccountSheet` function:

```typescript
function centsToCHF(cents: number | null): number {
  return cents !== null ? Math.round(cents) / 100 : 0;
}

function addAccountSheet(wb: ExcelJS.Workbook, account: AccountData): void {
  const ws = wb.addWorksheet(account.name);
  const n = account.rows.length;
  const firstRow = 6;
  const lastDataRow = firstRow + n - 1;
  const totalRow = lastDataRow + 1;
  const hasCourant =
    account.type === 'ACTIF' && !account.mustBeZeroAtClosing;

  // Row 2: account name | empty | 'Total' | net formula
  ws.getCell('A2').value = account.name;
  ws.getCell('C2').value = 'Total';
  if (n > 0) {
    const netFormula =
      account.normalBalance === 'DEBIT'
        ? `SUBTOTAL(109,C${firstRow}:C${lastDataRow})-SUBTOTAL(109,D${firstRow}:D${lastDataRow})`
        : `SUBTOTAL(109,D${firstRow}:D${lastDataRow})-SUBTOTAL(109,C${firstRow}:C${lastDataRow})`;
    ws.getCell('D2').value = { formula: netFormula };
  }

  // Row 3: Doit total | Avoir total
  if (n > 0) {
    ws.getCell('C3').value = {
      formula: `SUBTOTAL(109,C${firstRow}:C${lastDataRow})`,
    };
    ws.getCell('D3').value = {
      formula: `SUBTOTAL(109,D${firstRow}:D${lastDataRow})`,
    };
  }

  // Row 5: headers
  ws.getCell('A5').value = 'Date';
  ws.getCell('B5').value = 'Libellé';
  ws.getCell('C5').value = 'Doit';
  ws.getCell('D5').value = 'Avoir';
  if (hasCourant) ws.getCell('E5').value = 'Courant';

  // Data rows
  account.rows.forEach((r, idx) => {
    const rowNum = firstRow + idx;
    ws.getCell(`A${rowNum}`).value = r.date;
    ws.getCell(`B${rowNum}`).value = r.description;
    if (r.debit !== null) {
      const cell = ws.getCell(`C${rowNum}`);
      cell.value = centsToCHF(r.debit);
      cell.numFmt = '#,##0.00';
    }
    if (r.credit !== null) {
      const cell = ws.getCell(`D${rowNum}`);
      cell.value = centsToCHF(r.credit);
      cell.numFmt = '#,##0.00';
    }
    if (hasCourant) {
      const cell = ws.getCell(`E${rowNum}`);
      cell.value = {
        formula: `SUM($C$${firstRow}:C${rowNum})-SUM($D$${firstRow}:D${rowNum})`,
      };
      cell.numFmt = '#,##0.00';
    }
  });

  // Total row
  if (n > 0) {
    ws.getCell(`A${totalRow}`).value = 'Total';
    const doitCell = ws.getCell(`C${totalRow}`);
    doitCell.value = { formula: `SUBTOTAL(109,C${firstRow}:C${lastDataRow})` };
    doitCell.numFmt = '#,##0.00';
    const avoirCell = ws.getCell(`D${totalRow}`);
    avoirCell.value = { formula: `SUBTOTAL(109,D${firstRow}:D${lastDataRow})` };
    avoirCell.numFmt = '#,##0.00';
  }
}
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/excel-export.test.ts
```

Expected: 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/excel/export.ts src/__tests__/excel-export.test.ts
git commit -m "feat(excel): feuilles de compte — header, données, SUBTOTAL, Courant"
```

---

## Task 3: Journal sheet + Bilan & Résultat sheet

**Files:**
- Modify: `app/src/excel/export.ts` — implement `addJournalSheet` and `addBilanSheet`
- Modify: `app/src/__tests__/excel-export.test.ts` — add Journal + Bilan tests

**Interfaces:**
- Consumes: `exportFiscalYearToExcel` and `setup()` from Tasks 1–2

- [ ] **Step 1: Add failing tests**

Append to `app/src/__tests__/excel-export.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — verify new tests fail**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/excel-export.test.ts
```

Expected: 15 original tests PASS, 8 new tests FAIL.

- [ ] **Step 3: Implement `addJournalSheet`**

Replace the stub in `src/excel/export.ts`:

```typescript
function addJournalSheet(wb: ExcelJS.Workbook, rows: JournalRow[]): void {
  const ws = wb.addWorksheet('Journal');

  // Header row
  ws.getCell('A1').value = 'Date';
  ws.getCell('B1').value = 'Libellé';
  ws.getCell('C1').value = 'Montant';
  ws.getCell('D1').value = 'Pièce';

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    ws.getCell(`A${rowNum}`).value = r.date;
    ws.getCell(`B${rowNum}`).value = `${r.accountName} — ${r.description}`;
    const amount = r.debit !== null ? centsToCHF(r.debit) : centsToCHF(r.credit);
    const amountCell = ws.getCell(`C${rowNum}`);
    amountCell.value = amount;
    amountCell.numFmt = '#,##0.00';
    if (r.piece) ws.getCell(`D${rowNum}`).value = r.piece;
  });
}
```

- [ ] **Step 4: Implement `addBilanSheet`**

Replace the stub in `src/excel/export.ts`:

```typescript
function addBilanSheet(
  wb: ExcelJS.Workbook,
  accountMap: Map<string, AccountData>,
  year: number,
): void {
  const ws = wb.addWorksheet('Bilan & Résultat');
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
```

- [ ] **Step 5: Run all export tests — verify all 23 pass**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/excel-export.test.ts
```

Expected: 23 tests PASS.

- [ ] **Step 6: Run full test suite — verify no regressions**

```bash
cd app && npm test
```

Expected: all existing tests + 23 new = total count increases by 23, no failures.

- [ ] **Step 7: Commit**

```bash
cd app && git add src/excel/export.ts src/__tests__/excel-export.test.ts
git commit -m "feat(excel): feuilles Journal et Bilan & Résultat — 23 tests"
```

---

## Task 4: IPC handler `excel:export` + preload + window.d.ts

**Files:**
- Create: `app/src/__tests__/ipc-excel-handlers.test.ts`
- Modify: `app/src/ipc-handlers.ts` — add `excel:export` handler
- Modify: `app/src/preload.ts` — expose `exportExcel`
- Modify: `app/src/window.d.ts` — declare type

**Interfaces:**
- Produces: `window.api.exportExcel(fiscalYearId: number): Promise<{ path: string } | { error: string } | null>`

- [ ] **Step 1: Write the failing IPC test**

Create `app/src/__tests__/ipc-excel-handlers.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  },
}));

vi.mock('../db', () => ({
  getAllAccounts:       vi.fn(),
  getActiveAccounts:   vi.fn(),
  getAllFiscalYears:    vi.fn(),
  createFiscalYear:    vi.fn(),
  getJournalEntries:   vi.fn(),
  createJournalEntry:  vi.fn(),
  updateJournalEntry:  vi.fn(),
  deleteJournalEntry:  vi.fn(),
  getAccountBalances:  vi.fn(),
  getDb:               vi.fn(),
  getDbDir:            vi.fn(),
  openDatabase:        vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getClosingPreview:   vi.fn(),
  closeFiscalYear:     vi.fn(),
  reopenFiscalYear:    vi.fn(),
}));

vi.mock('../backup', () => ({
  listBackups:          vi.fn(),
  formatBackupFilename: vi.fn(),
}));

vi.mock('../settings', () => ({
  readSettings:  vi.fn(),
  writeSettings: vi.fn(),
}));

vi.mock('../migrate', () => ({
  migrateDataDir: vi.fn(),
}));

vi.mock('../excel/export', () => ({
  exportFiscalYearToExcel: vi.fn(),
}));

import { dialog } from 'electron';
import { getDb } from '../db';
import { exportFiscalYearToExcel } from '../excel/export';
import { registerIpcHandlers } from '../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.resetAllMocks();
  registerIpcHandlers();
});

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Canal non enregistré : ${channel}`);
  return fn(null, ...args);
}

describe('excel:export', () => {
  it('enregistre le canal excel:export', () => {
    expect(handlers.has('excel:export')).toBe(true);
  });

  it('retourne null si l\'utilisateur annule le dialog', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: true,
      filePath: undefined,
    } as Electron.SaveDialogReturnValue);
    const fakeDb = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ year: 2025 }) }),
    };
    vi.mocked(getDb).mockReturnValue(fakeDb as any);
    const result = await call('excel:export', 1);
    expect(result).toBeNull();
    expect(exportFiscalYearToExcel).not.toHaveBeenCalled();
  });

  it('retourne { path } si l\'export réussit', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: 'C:/tmp/mcy-compta-2025.xlsx',
    } as Electron.SaveDialogReturnValue);
    const fakeDb = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ year: 2025 }) }),
    };
    vi.mocked(getDb).mockReturnValue(fakeDb as any);
    vi.mocked(exportFiscalYearToExcel).mockResolvedValue(undefined);

    const result = await call('excel:export', 1);
    expect(result).toEqual({ path: 'C:/tmp/mcy-compta-2025.xlsx' });
    expect(exportFiscalYearToExcel).toHaveBeenCalledWith(
      fakeDb,
      1,
      'C:/tmp/mcy-compta-2025.xlsx',
    );
  });

  it('retourne { error } si exportFiscalYearToExcel lève une exception', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: 'C:/tmp/mcy-compta-2025.xlsx',
    } as Electron.SaveDialogReturnValue);
    const fakeDb = {
      prepare: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ year: 2025 }) }),
    };
    vi.mocked(getDb).mockReturnValue(fakeDb as any);
    vi.mocked(exportFiscalYearToExcel).mockRejectedValue(new Error('Disk full'));

    const result = await call('excel:export', 1);
    expect(result).toEqual({ error: 'Disk full' });
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/ipc-excel-handlers.test.ts
```

Expected: 4 tests FAIL (canal non enregistré).

- [ ] **Step 3: Add the `excel:export` handler to `ipc-handlers.ts`**

At the top of `src/ipc-handlers.ts`, add the import:
```typescript
import { exportFiscalYearToExcel } from './excel/export';
```

Then add this block inside `registerIpcHandlers()`, after the closing block:
```typescript
  // ─── Export Excel ────────────────────────────────────────────────────────────
  ipcMain.handle('excel:export', async (_e, fiscalYearId: number) => {
    const fy = getDb()
      .prepare('SELECT year FROM fiscal_years WHERE id = ?')
      .get(fiscalYearId) as { year: number } | undefined;
    if (!fy) throw new Error(`Exercice ${fiscalYearId} introuvable`);

    const result = await dialog.showSaveDialog({
      title: 'Exporter les comptes en Excel',
      defaultPath: `mcy-compta-${fy.year}.xlsx`,
      filters: [{ name: 'Classeur Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return null;

    try {
      await exportFiscalYearToExcel(getDb(), fiscalYearId, result.filePath);
      return { path: result.filePath };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
```

- [ ] **Step 4: Add `exportExcel` to `src/preload.ts`**

In the `contextBridge.exposeInMainWorld('api', { ... })` block, add after `changeDataDir`:
```typescript
  exportExcel: (fiscalYearId: number) => ipcRenderer.invoke('excel:export', fiscalYearId),
```

In the `ElectronAPI` type export, add:
```typescript
  exportExcel: (fiscalYearId: number) => Promise<{ path: string } | { error: string } | null>;
```

- [ ] **Step 5: Add `exportExcel` to `src/window.d.ts`**

In the `Window.api` interface, add:
```typescript
      exportExcel:  (fiscalYearId: number) => Promise<{ path: string } | { error: string } | null>;
```

- [ ] **Step 6: Run IPC test — verify 4 tests pass**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/ipc-excel-handlers.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 7: Run full test suite — no regressions**

```bash
cd app && npm test
```

Expected: all previous tests + 4 new = no failures.

- [ ] **Step 8: Commit**

```bash
cd app && git add src/excel/export.ts src/ipc-handlers.ts src/preload.ts src/window.d.ts src/__tests__/ipc-excel-handlers.test.ts
git commit -m "feat(excel): canal IPC excel:export + preload + types — 4 tests"
```

---

## Task 5: FiscalYearsPage — "Exporter Excel" button

**Files:**
- Modify: `app/src/pages/FiscalYearsPage.tsx` — add button + handler per fiscal year row
- Modify: `app/src/__tests__/renderer/FiscalYearsPage.test.tsx` — add test

**Interfaces:**
- Consumes: `window.api.exportExcel(fiscalYearId)` from Task 4

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to `app/src/__tests__/renderer/FiscalYearsPage.test.tsx`:

Also add `exportExcel` to the `mockApi` helper at the top of the file — update the `mockApi` function to include:
```typescript
    exportExcel: vi.fn().mockResolvedValue(null),
```

Then append the new describe block:
```typescript
describe('FiscalYearsPage — export Excel', () => {
  it('affiche le bouton "Exporter Excel" pour chaque exercice', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('button', { name: 'Exporter Excel' })).toBeInTheDocument();
  });

  it('appelle window.api.exportExcel avec l\'id de l\'exercice', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Exporter Excel' }));
    expect(window.api.exportExcel).toHaveBeenCalledWith(fy2025.id);
  });

  it('affiche un message de succès après export', async () => {
    mockApi([fy2025]);
    vi.stubGlobal('api', {
      ...window.api,
      exportExcel: vi.fn().mockResolvedValue({ path: 'C:/tmp/mcy-compta-2025.xlsx' }),
    });
    render(<FiscalYearsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Exporter Excel' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/exporté/i);
  });
});
```

- [ ] **Step 2: Run test — verify 3 new tests fail**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/renderer/FiscalYearsPage.test.tsx
```

Expected: existing tests PASS, 3 new tests FAIL.

- [ ] **Step 3: Update `mockApi` in `FiscalYearsPage.test.tsx`**

Find the `mockApi` function in the test file and add `exportExcel`:
```typescript
function mockApi(years: FiscalYear[] = []) {
  vi.stubGlobal('api', {
    getFiscalYears:   vi.fn().mockResolvedValue(years),
    createFiscalYear: vi.fn().mockImplementation(async (year: number) => ({
      id: 99, year,
      start_date: `${year}-01-01`, end_date: `${year}-12-31`,
      is_closed: false, created_at: new Date().toISOString(),
      hasOpeningBalance: false,
    })),
    getOpeningBalanceSuggestions: vi.fn().mockResolvedValue([]),
    createOpeningBalance:         vi.fn().mockResolvedValue(undefined),
    getClosingPreview:  vi.fn().mockResolvedValue({ blockers: [], accounts: [], netResultCents: 0 }),
    closeFiscalYear:    vi.fn().mockResolvedValue(undefined),
    reopenFiscalYear:   vi.fn().mockResolvedValue(undefined),
    exportExcel:        vi.fn().mockResolvedValue(null),  // ← new
  });
}
```

- [ ] **Step 4: Add handler + button to `FiscalYearsPage.tsx`**

Add state at the top of `FiscalYearsPage`:
```typescript
  const [exportStatus, setExportStatus] = useState<{ id: number; msg: string } | null>(null);
```

Add the handler function (after `handleClosingSuccess`):
```typescript
  async function handleExportExcel(y: FiscalYear) {
    setExportStatus(null);
    try {
      const result = await window.api.exportExcel(y.id);
      if (result && 'path' in result) {
        setExportStatus({ id: y.id, msg: `Fichier exporté : ${result.path}` });
      } else if (result && 'error' in result) {
        setError(result.error);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }
```

In the table row (after the existing "Actions" `<td>`), add a new `<td>` for export. Alternatively, add an "Exporter Excel" button inside the existing Actions `<td>` (after the Clôturer/Rouvrir button):

In the `<td style={s.td}>` that currently holds the Clôturer/Rouvrir button, add the export button and status message below:

```tsx
                  <td style={s.td}>
                    {!y.is_closed ? (
                      <button
                        onClick={() => handleCloseExercise(y)}
                        style={s.btnSmall}
                      >
                        Clôturer l&apos;exercice
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReopenClick(y)}
                        style={s.btnReopen}
                      >
                        Rouvrir
                      </button>
                    )}
                    {' '}
                    <button
                      onClick={() => handleExportExcel(y)}
                      style={s.btnExport}
                    >
                      Exporter Excel
                    </button>
                    {exportStatus?.id === y.id && (
                      <p role="status" style={s.exportSuccess}>{exportStatus.msg}</p>
                    )}
                  </td>
```

Add the style entry in the `s` object:
```typescript
  btnExport:     { padding: '0.25rem 0.6rem', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '5px', fontSize: '0.78rem', cursor: 'pointer' },
  exportSuccess: { margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#15803d' },
```

- [ ] **Step 5: Run tests — verify all pass**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/renderer/FiscalYearsPage.test.tsx
```

Expected: all previous tests + 3 new = all PASS.

- [ ] **Step 6: Run full test suite — no regressions**

```bash
cd app && npm test
```

- [ ] **Step 7: Commit**

```bash
cd app && git add src/pages/FiscalYearsPage.tsx src/__tests__/renderer/FiscalYearsPage.test.tsx
git commit -m "feat(excel): bouton Exporter Excel dans FiscalYearsPage — 3 tests"
```

---

## Task 6: SettingsPage — Excel export section

**Files:**
- Modify: `app/src/pages/SettingsPage.tsx` — add fiscal year selector + export button
- Modify: `app/src/__tests__/renderer/SettingsPage.test.tsx` — add tests

**Interfaces:**
- Consumes: `window.api.getFiscalYears()` (existing), `window.api.exportExcel(fiscalYearId)` from Task 4

- [ ] **Step 1: Write the failing tests**

Update `mockApi` in `SettingsPage.test.tsx` to add `getFiscalYears` and `exportExcel`:
```typescript
function mockApi(overrides: Partial<Window['api']> = {}) {
  vi.stubGlobal('api', {
    getDbPath:      vi.fn().mockResolvedValue('C:/Users/tm/AppData/data/mcy-compta.db'),
    listBackups:    vi.fn().mockResolvedValue(mockBackups),
    exportBackup:   vi.fn().mockResolvedValue(null),
    changeDataDir:  vi.fn().mockResolvedValue(null),
    getFiscalYears: vi.fn().mockResolvedValue([
      { id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31', is_closed: false, created_at: '', hasOpeningBalance: false },
    ]),
    exportExcel:    vi.fn().mockResolvedValue(null),
    ...overrides,
  });
}
```

Append a new describe block:
```typescript
describe('SettingsPage — export Excel', () => {
  it('affiche la section "Export Excel"', async () => {
    render(<SettingsPage />);
    expect(await screen.findByRole('heading', { level: 2, name: 'Export Excel' })).toBeInTheDocument();
  });

  it('affiche un sélecteur d\'exercice avec l\'exercice 2025', async () => {
    render(<SettingsPage />);
    expect(await screen.findByLabelText('Exercice')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: '2025' })).toBeInTheDocument();
  });

  it('appelle exportExcel avec l\'id sélectionné au clic', async () => {
    render(<SettingsPage />);
    await screen.findByLabelText('Exercice');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter en Excel' }));
    expect(window.api.exportExcel).toHaveBeenCalledWith(1);
  });

  it('affiche un message de succès après export', async () => {
    mockApi({
      exportExcel: vi.fn().mockResolvedValue({ path: 'C:/tmp/mcy-compta-2025.xlsx' }),
    });
    render(<SettingsPage />);
    await screen.findByLabelText('Exercice');
    await userEvent.click(screen.getByRole('button', { name: 'Exporter en Excel' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/exporté/i);
  });
});
```

Also add the `userEvent` import at the top if not already present:
```typescript
import userEvent from '@testing-library/user-event';
```

- [ ] **Step 2: Run tests — verify 4 new tests fail**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/renderer/SettingsPage.test.tsx
```

Expected: existing tests PASS, 4 new tests FAIL.

- [ ] **Step 3: Implement the Excel export section in `SettingsPage.tsx`**

Add state variables (after existing state declarations):
```typescript
  const [fiscalYears,      setFiscalYears]      = useState<FiscalYear[]>([]);
  const [selectedFyId,     setSelectedFyId]     = useState<number | null>(null);
  const [excelStatus,      setExcelStatus]      = useState<'idle' | 'loading' | 'success' | 'error' | 'cancelled'>('idle');
  const [excelPath,        setExcelPath]        = useState<string | null>(null);
```

Add `FiscalYear` to the import:
```typescript
import type { BackupInfo, FiscalYear } from '../types';
```

Extend the `useEffect` to also load fiscal years:
```typescript
  useEffect(() => {
    window.api.getDbPath()
      .then(setDbPath)
      .catch((e: Error) => setError(e.message));
    window.api.listBackups()
      .then(setBackups)
      .catch((e: Error) => setError(e.message));
    window.api.getFiscalYears()
      .then(years => {
        setFiscalYears(years);
        if (years.length > 0) setSelectedFyId(years[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
```

Add the handler:
```typescript
  async function handleExcelExport() {
    if (selectedFyId === null) return;
    setExcelStatus('loading');
    setExcelPath(null);
    try {
      const result = await window.api.exportExcel(selectedFyId);
      if (result === null) {
        setExcelStatus('cancelled');
      } else if ('error' in result) {
        setExcelStatus('error');
        setError(result.error);
      } else {
        setExcelStatus('success');
        setExcelPath(result.path);
      }
    } catch (e) {
      setExcelStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }
```

Add the JSX section before the closing `</div>` of the return, after the Sauvegardes section:
```tsx
      <section style={s.section}>
        <h2 style={s.h2}>Export Excel</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label htmlFor="excel-fy-select" style={{ fontWeight: 500, fontSize: '0.875rem', color: '#475569' }}>
            Exercice
          </label>
          <select
            id="excel-fy-select"
            aria-label="Exercice"
            value={selectedFyId ?? ''}
            onChange={e => setSelectedFyId(Number(e.target.value))}
            style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.875rem' }}
          >
            {fiscalYears.map(fy => (
              <option key={fy.id} value={fy.id}>{fy.year}</option>
            ))}
          </select>
          <button
            onClick={handleExcelExport}
            disabled={excelStatus === 'loading' || selectedFyId === null}
            style={s.btn}
          >
            {excelStatus === 'loading' ? 'Export en cours…' : 'Exporter en Excel'}
          </button>
        </div>
        {excelStatus === 'success' && excelPath && (
          <p style={s.success} role="status">
            Fichier exporté : {excelPath}
          </p>
        )}
        {excelStatus === 'cancelled' && (
          <p style={s.hint} role="status">Export annulé.</p>
        )}
      </section>
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
cd app && npm test -- --reporter=verbose src/__tests__/renderer/SettingsPage.test.tsx
```

Expected: all previous tests + 4 new = all PASS.

- [ ] **Step 5: Run full test suite — final check**

```bash
cd app && npm test
```

Expected: all tests pass (previous count + 23 excel-export + 4 ipc-excel + 3 FiscalYearsPage + 4 SettingsPage = +34 total).

- [ ] **Step 6: Commit**

```bash
cd app && git add src/pages/SettingsPage.tsx src/__tests__/renderer/SettingsPage.test.tsx
git commit -m "feat(excel): section Export Excel dans SettingsPage — 4 tests"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `src/excel/export.ts` pure function | Task 1 |
| Account sheets: header rows 1-5, data, SUBTOTAL, Courant | Task 2 |
| Journal sheet: one row per line, `account — description` | Task 3 |
| Bilan & Résultat sheet: Actifs/Passifs/Produits/Charges/Résultat net | Task 3 |
| IPC handler `excel:export` with showSaveDialog | Task 4 |
| preload + window.d.ts wiring | Task 4 |
| FiscalYearsPage: "Exporter Excel" button per row | Task 5 |
| SettingsPage: selector + button | Task 6 |
| Error: user cancels → null | Task 4 (IPC test) |
| Error: write failure → { error } | Task 4 (IPC test) |
| Error: exercice inexistant → throw | Task 1 (excel test) |
| Courant only for ACTIF + must_be_zero_at_closing=0 | Task 2 |
| Amounts in CHF (÷100) | Task 2 |
| Sheet order: Bilan → Journal → accounts by number | Task 1 |

**Placeholder scan:** No TBD or TODO in the task steps.

**Type consistency:**
- `exportFiscalYearToExcel(db: Database.Database, fiscalYearId: number, outputPath: string)` — consistent across Tasks 1, 3, 4.
- `{ path: string } | { error: string } | null` — consistent in Tasks 4, 5, 6.
- `window.api.exportExcel(fiscalYearId: number)` — consistent in Tasks 4, 5, 6.
