# Export Excel du récapitulatif Membres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un bouton "Exporter Excel" sur la page Membres qui génère un classeur `.xlsx` reproduisant exactement le tableau récapitulatif affiché (plage d'années, filtre actifs/inactifs, signalement des arriérés en rouge clair).

**Architecture:** Extraction de la règle métier `isPaid`/`isArrears` (actuellement locale à `MembresPage.tsx`) vers un module partagé `app/src/lib/members.ts`, importable par le renderer et le main process. Un nouveau module `app/src/excel/export-members.ts` génère le classeur à partir de données déjà chargées (pas d'accès DB direct — testable indépendamment de SQLite). Un handler IPC `excel:exportMembers` orchestre le dialogue de sauvegarde, le chargement des données DB, et l'appel au module d'export, suivant exactement le contrat déjà établi par `excel:export` (export comptable existant).

**Tech Stack:** TypeScript, exceljs, Electron IPC, React, Vitest

## Global Constraints

- Branche : `feature/members-dues` (déjà existante) — commiter directement dessus
- L'export reproduit exactement l'écran : même plage d'années (`yearRange` actuel), même filtre `showInactive` actuel — aucun paramètre supplémentaire demandé à l'export
- `exportMembersToExcel` ne fait aucun accès DB — reçoit `members: MemberWithDues[]`, `fiscalYears: FiscalYear[]` déjà chargés
- Une seule feuille "Membres" : titre fusionné en ligne 1, en-têtes en ligne 3 (Nom, Prénom, Entrée, Statut, une colonne par année), une ligne par membre (triés nom puis prénom, filtrés selon `showInactive`)
- Cellules années : `✓` si payé, `—` si non payé ; fond `#FEE2E2` (ARGB `FFFEE2E2`) si `!isPaid && isArrears` — même règle que l'écran
- Entrée formatée `DD.MM.YYYY` via `formatDate` de `lib/format.ts` (existant), vide si absente
- Nom de fichier par défaut du dialogue : `mcy-membres-{début}-{fin}.xlsx`
- Handler IPC retourne `{ path }` (succès), `{ error: message }` (échec), ou `null` (annulé) — même contrat que `excel:export`
- Pas de légende explicative dans le fichier
- Ne pas toucher `app/src/excel/export.ts` (fichier séparé, responsabilité distincte)

---

## Task 1 : Module partagé `lib/members.ts` (isPaid + isArrears)

**Files:**
- Create: `app/src/lib/members.ts`
- Modify: `app/src/pages/MembresPage.tsx`
- Test: `app/src/__tests__/lib-members.test.ts`

**Interfaces:**
- Consumes: `MemberWithDues` (déjà défini dans `../types`)
- Produces: `isPaid(member: MemberWithDues, year: number): boolean`, `isArrears(member: MemberWithDues, year: number): boolean` — exportées depuis `app/src/lib/members.ts`, consommées par Task 2 (export Excel) et par `MembresPage.tsx`

- [ ] **Step 1 : Écrire les tests du module partagé**

Créer `app/src/__tests__/lib-members.test.ts` :

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isPaid, isArrears } from '../lib/members';
import type { MemberWithDues } from '../types';

function makeMember(overrides: Partial<MemberWithDues> = {}): MemberWithDues {
  return {
    id: 1, last_name: 'Test', first_name: 'Membre',
    entry_date: null, is_active: 1, inactive_note: null, created_at: '',
    dues: [],
    ...overrides,
  };
}

describe('isPaid', () => {
  it('retourne true si une cotisation payée existe pour cette année', () => {
    const m = makeMember({
      dues: [{ id: 1, member_id: 1, year: 2024, paid: 1, payment_note: null,
               payment_date: '2024-03-01', amount_cents: 3000, journal_entry_id: 1, created_at: '' }],
    });
    expect(isPaid(m, 2024)).toBe(true);
  });

  it('retourne false si aucune cotisation payée pour cette année', () => {
    const m = makeMember({ dues: [] });
    expect(isPaid(m, 2024)).toBe(false);
  });

  it('retourne false si la cotisation existe mais paid=0', () => {
    const m = makeMember({
      dues: [{ id: 1, member_id: 1, year: 2024, paid: 0, payment_note: null,
               payment_date: null, amount_cents: null, journal_entry_id: null, created_at: '' }],
    });
    expect(isPaid(m, 2024)).toBe(false);
  });
});

describe('isArrears', () => {
  afterEach(() => vi.restoreAllMocks());

  it('signale une année non future si entry_date est absente', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: null });
    expect(isArrears(m, 2024)).toBe(true);
  });

  it('ne signale jamais une année future, même sans entry_date', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: null });
    expect(isArrears(m, 2027)).toBe(false);
  });

  it('ne signale pas une année antérieure à entry_date', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: '2022-06-01' });
    expect(isArrears(m, 2020)).toBe(false);
  });

  it('signale une année égale ou postérieure à entry_date', () => {
    vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
    const m = makeMember({ entry_date: '2022-06-01' });
    expect(isArrears(m, 2022)).toBe(true);
    expect(isArrears(m, 2024)).toBe(true);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- lib-members.test --reporter=verbose 2>&1 | tail -20
```

Expected : FAIL — `app/src/lib/members.ts` n'existe pas encore.

- [ ] **Step 3 : Créer `app/src/lib/members.ts`**

```typescript
import type { MemberWithDues } from '../types';

export function isPaid(member: MemberWithDues, year: number): boolean {
  return member.dues.some(d => d.year === year && d.paid === 1);
}

export function isArrears(member: MemberWithDues, year: number): boolean {
  const currentYear = new Date().getFullYear();
  if (year > currentYear) return false;
  if (!member.entry_date) return true;
  const entryYear = parseInt(member.entry_date.slice(0, 4), 10);
  return year >= entryYear;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd app && npm test -- lib-members.test --reporter=verbose 2>&1 | tail -20
```

Expected : tous PASS.

- [ ] **Step 5 : Mettre à jour `MembresPage.tsx` pour importer depuis le module partagé**

Supprimer les définitions locales de `isArrears` (lignes 24-30) et `isPaid` (lignes 142-143), et ajouter l'import en haut du fichier :

```typescript
import { isPaid, isArrears } from '../lib/members';
```

Le reste du fichier (usage de `isPaid(m, y)` et `isArrears(m, y)`) ne change pas — les deux fonctions ont exactement la même signature.

- [ ] **Step 6 : Vérifier que la suite complète passe (pas de régression)**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 684 + 7 (nouveaux tests `lib-members.test.ts`) = 691.

- [ ] **Step 7 : Commit**

```bash
git add app/src/lib/members.ts app/src/pages/MembresPage.tsx app/src/__tests__/lib-members.test.ts
git commit -m "refactor(members): extrait isPaid/isArrears vers lib/members.ts (module partagé)"
```

---

## Task 2 : Module d'export Excel `excel/export-members.ts`

**Files:**
- Create: `app/src/excel/export-members.ts`
- Test: `app/src/__tests__/excel-export-members.test.ts`

**Interfaces:**
- Consumes: `isPaid`, `isArrears` depuis `../lib/members` (Task 1), `formatDate` depuis `../lib/format` (existant), types `MemberWithDues`, `FiscalYear` depuis `../types`
- Produces: `exportMembersToExcel(members: MemberWithDues[], fiscalYears: FiscalYear[], range: { start: number; end: number }, showInactive: boolean, outputPath: string): Promise<void>` — consommée par Task 3 (handler IPC)

- [ ] **Step 1 : Écrire les tests du module d'export**

Créer `app/src/__tests__/excel-export-members.test.ts` :

```typescript
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
    expect(cell.fill).toBeUndefined();
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
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- excel-export-members.test --reporter=verbose 2>&1 | tail -40
```

Expected : FAIL — `app/src/excel/export-members.ts` n'existe pas encore.

- [ ] **Step 3 : Créer `app/src/excel/export-members.ts`**

```typescript
import ExcelJS from 'exceljs';
import { isPaid, isArrears } from '../lib/members';
import { formatDate } from '../lib/format';
import type { MemberWithDues, FiscalYear } from '../types';

const HEADER_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
const ARREARS_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

export async function exportMembersToExcel(
  members: MemberWithDues[],
  _fiscalYears: FiscalYear[],
  range: { start: number; end: number },
  showInactive: boolean,
  outputPath: string,
): Promise<void> {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const visible = members
    .filter(m => showInactive || m.is_active === 1)
    .sort((a, b) => {
      const byLastName = a.last_name.localeCompare(b.last_name);
      return byLastName !== 0 ? byLastName : a.first_name.localeCompare(b.first_name);
    });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCY Compta';
  const ws = wb.addWorksheet('Membres');

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 10;
  for (let i = 0; i < years.length; i++) {
    ws.getColumn(5 + i).width = 8;
  }

  const titleCell = ws.getCell(1, 1);
  titleCell.value = `Membres et cotisations — ${start}–${end}`;
  titleCell.font  = { bold: true, size: 13 };
  ws.mergeCells(1, 1, 1, 4 + years.length);

  const headerRow = 3;
  const headers = ['Nom', 'Prénom', 'Entrée', 'Statut', ...years];
  headers.forEach((label, i) => {
    const c = ws.getCell(headerRow, i + 1);
    c.value = label;
    c.font  = { bold: true };
    c.fill  = HEADER_BG;
  });

  let row = headerRow + 1;
  for (const member of visible) {
    ws.getCell(row, 1).value = member.last_name;
    ws.getCell(row, 2).value = member.first_name;
    ws.getCell(row, 3).value = member.entry_date ? formatDate(member.entry_date) : '';
    ws.getCell(row, 4).value = member.is_active === 1 ? 'Actif' : 'Inactif';

    years.forEach((year, i) => {
      const cell = ws.getCell(row, 5 + i);
      const paid = isPaid(member, year);
      cell.value = paid ? '✓' : '—';
      cell.alignment = { horizontal: 'center' };
      if (!paid && isArrears(member, year)) {
        cell.fill = ARREARS_BG;
      }
    });

    row++;
  }

  await wb.xlsx.writeFile(outputPath);
}
```

Note : le paramètre `_fiscalYears` n'est actuellement pas utilisé dans le corps de la fonction (la plage d'années suffit à générer les colonnes, indépendamment des exercices comptables réels) — il est conservé dans la signature pour cohérence avec l'appelant (Task 3) et pour une éventuelle utilisation future (ex. distinguer visuellement les années avec exercice comptable), préfixé `_` pour éviter un avertissement TypeScript de paramètre inutilisé.

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd app && npm test -- excel-export-members.test --reporter=verbose 2>&1 | tail -40
```

Expected : tous PASS.

- [ ] **Step 5 : Vérifier que la suite complète passe**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 691 + 9 (nouveaux tests `excel-export-members.test.ts`) = 700.

- [ ] **Step 6 : Commit**

```bash
git add app/src/excel/export-members.ts app/src/__tests__/excel-export-members.test.ts
git commit -m "feat(members): module d'export Excel du récapitulatif (excel/export-members.ts)"
```

---

## Task 3 : Handler IPC + bouton UI

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Modify: `app/src/pages/MembresPage.tsx`
- Modify: `app/src/main/__tests__/ipc-members-handlers.test.ts`
- Modify: `app/src/__tests__/renderer/MembresPage.test.tsx`

**Interfaces:**
- Consumes: `exportMembersToExcel` depuis `../excel/export-members` (Task 2), `getAllMembers`/`getAllFiscalYears` depuis `./db` (déjà importés dans `ipc-handlers.ts`)
- Produces: `window.api.exportMembers(range: { start: number; end: number }, showInactive: boolean): Promise<{ path: string } | { error: string } | null>`

- [ ] **Step 1 : Écrire les tests du handler IPC**

Le fichier `app/src/main/__tests__/ipc-members-handlers.test.ts` mocke déjà `electron` avec `dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }` (aucune modification nécessaire de ce côté) et mocke déjà `getAllFiscalYears` dans le bloc `vi.mock('../../db', () => ({ ... }))`, mais celui-ci n'est actuellement PAS présent dans l'import de haut niveau du fichier de test (seuls `getAllMembers, createMember, updateMember, deleteMember, setHistoricalDues, recordPayment` y sont importés). Modifier cet import pour ajouter `getAllFiscalYears` :

```typescript
import {
  getAllMembers, getAllFiscalYears, createMember, updateMember, deleteMember,
  setHistoricalDues, recordPayment,
} from '../../db';
```

Ajouter le mock du nouveau module d'export juste après le bloc `vi.mock('../../settings', ...)` existant (avant les imports de haut niveau) :

```typescript
vi.mock('../../excel/export-members', () => ({
  exportMembersToExcel: vi.fn(),
}));
```

Ajouter les imports `dialog` et `exportMembersToExcel` avec les autres imports de haut niveau du fichier (juste après l'import de `'../../db'` modifié ci-dessus, avant `import { registerIpcHandlers } from '../../ipc-handlers';`) :

```typescript
import { dialog } from 'electron';
import { exportMembersToExcel } from '../../excel/export-members';
```

Ajouter un nouveau bloc `describe` à la fin du fichier :

```typescript
describe('members:exportExcel', () => {
  it('enregistre le canal members:exportExcel', () => {
    expect(handlers.has('members:exportExcel')).toBe(true);
  });

  it('retourne null si l\'utilisateur annule le dialogue', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: true, filePath: undefined });
    const result = await call('members:exportExcel', { start: 2024, end: 2025 }, false);
    expect(result).toBeNull();
    expect(exportMembersToExcel).not.toHaveBeenCalled();
  });

  it('appelle exportMembersToExcel et retourne { path } en cas de succès', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/tmp/mcy-membres-2024-2025.xlsx' });
    vi.mocked(getAllMembers).mockReturnValue([]);
    vi.mocked(getAllFiscalYears).mockReturnValue([]);
    vi.mocked(exportMembersToExcel).mockResolvedValue(undefined);
    const result = await call('members:exportExcel', { start: 2024, end: 2025 }, true);
    expect(exportMembersToExcel).toHaveBeenCalledWith([], [], { start: 2024, end: 2025 }, true, '/tmp/mcy-membres-2024-2025.xlsx');
    expect(result).toEqual({ path: '/tmp/mcy-membres-2024-2025.xlsx' });
  });

  it('retourne { error } si exportMembersToExcel lève une exception', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: '/tmp/mcy-membres-2024-2025.xlsx' });
    vi.mocked(getAllMembers).mockReturnValue([]);
    vi.mocked(getAllFiscalYears).mockReturnValue([]);
    vi.mocked(exportMembersToExcel).mockRejectedValue(new Error('Disque plein'));
    const result = await call('members:exportExcel', { start: 2024, end: 2025 }, false);
    expect(result).toEqual({ error: 'Disque plein' });
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- ipc-members-handlers --reporter=verbose 2>&1 | tail -40
```

Expected : FAIL — `handlers.has('members:exportExcel')` est `false`.

- [ ] **Step 3 : Ajouter le handler IPC**

Dans `app/src/ipc-handlers.ts`, ajouter l'import en haut du fichier (avec les autres imports de modules) :

```typescript
import { exportMembersToExcel } from './excel/export-members';
```

Ajouter le handler juste après le bloc des handlers `members:*` existants (après `members:importFromExcel`) :

```typescript
  ipcMain.handle('members:exportExcel', async (_e, range: { start: number; end: number }, showInactive: boolean) => {
    const result = await dialog.showSaveDialog({
      title: 'Exporter les membres en Excel',
      defaultPath: `mcy-membres-${range.start}-${range.end}.xlsx`,
      filters: [{ name: 'Classeur Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return null;

    try {
      const members = getAllMembers();
      const fiscalYears = getAllFiscalYears();
      await exportMembersToExcel(members, fiscalYears, range, showInactive, result.filePath);
      return { path: result.filePath };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
```

- [ ] **Step 4 : Exposer la méthode dans `preload.ts`**

Dans `app/src/preload.ts`, section `contextBridge.exposeInMainWorld('api', { ... })`, ajouter juste après `importMembersFromExcel` :

```typescript
  exportMembers: (range: { start: number; end: number }, showInactive: boolean): Promise<{ path: string } | { error: string } | null> =>
    ipcRenderer.invoke('members:exportExcel', range, showInactive),
```

Dans le bloc `export type ElectronAPI = { ... }`, ajouter juste après `importMembersFromExcel` :

```typescript
  exportMembers: (range: { start: number; end: number }, showInactive: boolean) => Promise<{ path: string } | { error: string } | null>;
```

- [ ] **Step 5 : Mettre à jour `window.d.ts`**

Ajouter juste après `importMembersFromExcel:` dans `interface Window { api: { ... } }` :

```typescript
      exportMembers: (range: { start: number; end: number }, showInactive: boolean) => Promise<{ path: string } | { error: string } | null>;
```

- [ ] **Step 6 : Vérifier que les tests IPC passent**

```bash
cd app && npm test -- ipc-members-handlers --reporter=verbose 2>&1 | tail -40
```

Expected : tous PASS.

- [ ] **Step 7 : Écrire les tests du bouton UI**

Dans `app/src/__tests__/renderer/MembresPage.test.tsx`, ajouter `exportMembers: vi.fn().mockResolvedValue(null)` au `beforeEach` global (`vi.stubGlobal('api', { ... })`, ligne ~29-36).

Ajouter un nouveau `describe` à la fin du fichier :

```typescript
describe('Export Excel', () => {
  it('affiche le bouton Exporter Excel', async () => {
    render(<MembresPage />);
    await screen.findByRole('button', { name: /exporter excel/i });
  });

  it('appelle exportMembers avec la plage et le filtre courants, affiche un toast de succès', async () => {
    const exportMembers = vi.fn().mockResolvedValue({ path: '/tmp/mcy-membres-2025-2025.xlsx' });
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
      exportMembers,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    await userEvent.click(screen.getByRole('button', { name: /exporter excel/i }));
    expect(exportMembers).toHaveBeenCalledWith({ start: 2025, end: 2025 }, false);
    await screen.findByText(/fichier exporté/i);
  });

  it('affiche un toast d\'erreur si exportMembers retourne { error }', async () => {
    const exportMembers = vi.fn().mockResolvedValue({ error: 'Disque plein' });
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
      exportMembers,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    await userEvent.click(screen.getByRole('button', { name: /exporter excel/i }));
    await screen.findByText('Disque plein');
  });

  it('n\'affiche aucun toast si l\'export est annulé (retour null)', async () => {
    const exportMembers = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
      exportMembers,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    await userEvent.click(screen.getByRole('button', { name: /exporter excel/i }));
    await Promise.resolve(); // laisse le microtask du then() se résoudre
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8 : Vérifier que les tests échouent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | tail -40
```

Expected : FAIL — bouton "Exporter Excel" introuvable.

- [ ] **Step 9 : Ajouter le bouton et son handler dans `MembresPage.tsx`**

Ajouter l'état et le handler juste après `handleImport` (avant `return (`) :

```typescript
  const handleExportExcel = async () => {
    if (!yearRange) return;
    try {
      const result = await window.api.exportMembers(yearRange, showInactive);
      if (result === null) {
        // annulé par l'utilisateur — pas de feedback
      } else if ('error' in result) {
        setToast({ message: result.error, variant: 'error' });
      } else {
        setToast({ message: `Fichier exporté : ${result.path}`, variant: 'success' });
      }
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Erreur lors de l\'export', variant: 'error' });
    }
  };
```

Ajouter le bouton dans `headerRight`, entre le bouton "Importer depuis Excel" et le bouton "Nouveau membre" :

```typescript
          <button
            className={styles.btnSecondary}
            onClick={handleExportExcel}
          >
            <FileSpreadsheet size={16} /> Exporter Excel
          </button>
```

Ajouter `FileSpreadsheet` à l'import `lucide-react` en haut du fichier :

```typescript
import { Plus, Pencil, Trash2, Upload, UserX, UserCheck, FileSpreadsheet } from 'lucide-react';
```

- [ ] **Step 10 : Vérifier que tous les tests passent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | tail -40
```

Expected : tous PASS.

- [ ] **Step 11 : Vérifier que la suite complète passe**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 700 + 3 (IPC) + 4 (renderer) = 707.

- [ ] **Step 12 : Commit**

```bash
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts \
        app/src/pages/MembresPage.tsx \
        app/src/main/__tests__/ipc-members-handlers.test.ts \
        app/src/__tests__/renderer/MembresPage.test.tsx
git commit -m "feat(members): bouton Exporter Excel + handler IPC members:exportExcel"
```

---

## Auto-révision du plan

**Couverture spec :**
- Extraction `isPaid`/`isArrears` vers module partagé → Task 1.
- `exportMembersToExcel` pure, sans accès DB, testable indépendamment → Task 2.
- Handler IPC suivant le contrat `{ path } | { error } | null` → Task 3.
- Nom de fichier par défaut `mcy-membres-{début}-{fin}.xlsx` → Task 3 Step 3.
- Contenu de la feuille (titre, en-têtes, tri, filtre showInactive, formatage date, couleur arriérés) → Task 2 Step 3, testé Step 1.
- Bouton UI reflétant `yearRange`/`showInactive` courants → Task 3 Step 9.
- Pas de légende, pas de paramètre supplémentaire à l'export → respecté (aucune UI de configuration ajoutée).
- `excel/export.ts` non modifié → confirmé, aucune tâche ne touche ce fichier.

**Scan placeholders :** aucun trouvé — chaque étape contient le code exact.

**Cohérence des types :** `{ start: number; end: number }` cohérent entre Task 2 (`exportMembersToExcel`) et Task 3 (handler IPC, preload, window.d.ts, `MembresPage.tsx`). `isPaid`/`isArrears` ont la même signature `(member: MemberWithDues, year: number): boolean` en Task 1, consommée telle quelle en Task 2. Retour du handler `{ path: string } | { error: string } | null` cohérent entre Task 3 Step 3 (handler), Step 4 (preload), Step 5 (window.d.ts), Step 9 (usage renderer).
