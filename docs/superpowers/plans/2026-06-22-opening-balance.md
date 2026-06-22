# Soldes à nouveau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre la saisie des soldes d'ouverture (report d'exercice) via un modal déclenché depuis FiscalYearsPage, avec pré-remplissage automatique depuis l'exercice précédent et calcul automatique du Capital (290).

**Architecture:** Couche DB (nouvelles fonctions dans `db/index.ts`) → IPC handlers (`openingBalance:getSuggested` et `openingBalance:create`) → composant `OpeningBalanceModal` → intégration dans `FiscalYearsPage`. Le Capital (`type = 'FONDS_PROPRES'`) est calculé côté renderer comme `Σ(ACTIF) − Σ(PASSIF)`, ce qui garantit l'équilibre sans validation supplémentaire.

**Tech Stack:** better-sqlite3 (synchrone), React + TypeScript, Vitest + React Testing Library

## Global Constraints

- Montants stockés en **centimes (INTEGER)** — jamais de float pour les valeurs CHF
- Écriture d'ouverture : `is_opening_balance = 1`, date = `{year}-01-01`, description = `"Soldes à nouveau {year}"`
- Seuls les comptes `class IN (1, 2)` et `is_active = 1` participent aux soldes à nouveau
- Lignes à montant nul (`amountCents = 0`) exclues avant insertion (contrainte DB `CHECK (COALESCE(debit, credit) > 0)`)
- `validateEntryBalance` de `lib/accounting.ts` appelé avant toute insertion
- Styles inline `const s = {...} as const` — pattern existant dans tous les composants
- Pas de commentaires de code sauf pour les invariants non évidents
- Chaque tâche se termine par un `git commit`
- Commande de test : `npx vitest run` depuis `app/`

---

### Task 1: Types + couche données + IPC handlers

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/db/index.ts`
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Modify: `app/src/__tests__/db.test.ts` (ajout de 2 `describe` à la fin)
- Create: `app/src/__tests__/ipc-opening-balance-handlers.test.ts`

**Interfaces:**
- Produit: `getOpeningBalanceSuggestions(fiscalYearId: number): OpeningBalanceSuggestion[]` exportée depuis `db/index.ts`
- Produit: `createOpeningBalanceEntry(fiscalYearId: number, lines: OpeningBalanceLine[]): void` exportée depuis `db/index.ts`
- Produit: `window.api.getOpeningBalanceSuggestions(fiscalYearId: number): Promise<OpeningBalanceSuggestion[]>`
- Produit: `window.api.createOpeningBalance(fiscalYearId: number, lines: OpeningBalanceLine[]): Promise<void>`
- Produit: `FiscalYear.hasOpeningBalance: boolean` (0/1 depuis SQLite, valide en condition JS)

---

- [ ] **Step 1 : Écrire les tests DB dans `db.test.ts`**

Ajouter ces deux `describe` à la fin de `app/src/__tests__/db.test.ts` :

```ts
describe('getAllFiscalYears — hasOpeningBalance', () => {
  let fy2025Id: number;
  let caisseId: number;
  let capitalId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fy2025Id = fy.id;
    const accounts = getAllAccounts();
    caisseId  = accounts.find(a => a.number === '100')!.id;
    capitalId = accounts.find(a => a.number === '290')!.id;
  });

  it('retourne hasOpeningBalance falsy quand aucune écriture d\'ouverture', () => {
    const years = getAllFiscalYears();
    expect(years[0].hasOpeningBalance).toBeFalsy();
  });

  it('retourne hasOpeningBalance truthy après createOpeningBalanceEntry', () => {
    createOpeningBalanceEntry(fy2025Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ]);
    const years = getAllFiscalYears();
    expect(years[0].hasOpeningBalance).toBeTruthy();
  });
});

describe('getOpeningBalanceSuggestions + createOpeningBalanceEntry', () => {
  let fy2025Id: number;
  let fy2026Id: number;
  let caisseId: number;
  let raiffeisenId: number;
  let capitalId: number;
  let passifsId: number;

  beforeEach(() => {
    freshDb();
    const accounts = getAllAccounts();
    caisseId     = accounts.find(a => a.number === '100')!.id;
    raiffeisenId = accounts.find(a => a.number === '101')!.id;
    capitalId    = accounts.find(a => a.number === '290')!.id;
    passifsId    = accounts.find(a => a.number === '200')!.id;

    // Exercice 2025 avec quelques soldes
    const fy2025 = createFiscalYear(2025);
    fy2025Id = fy2025.id;
    const cotisationsId = accounts.find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy2025Id,
      date: '2025-03-08',
      description: 'Cotisations',
      lines: [
        { account_id: caisseId,      debit:  100000 },
        { account_id: cotisationsId, credit: 100000 },
      ],
    });
    fy2026Id = createFiscalYear(2026).id;
  });

  it('getSuggested retourne tous les comptes class 1 et 2 actifs', () => {
    const sugg = getOpeningBalanceSuggestions(fy2026Id);
    const numbers = sugg.map(s => s.accountNumber);
    expect(numbers).toContain('100');
    expect(numbers).toContain('101');
    expect(numbers).toContain('290');
    // Pas de classe 3 ou 4
    expect(sugg.every(s => [1, 2].includes(
      getAllAccounts().find(a => a.number === s.accountNumber)!.class
    ))).toBe(true);
  });

  it('getSuggested retourne le solde de l\'exercice précédent pour la Caisse', () => {
    const sugg = getOpeningBalanceSuggestions(fy2026Id);
    const caisse = sugg.find(s => s.accountNumber === '100');
    expect(caisse).toBeDefined();
    expect(caisse!.suggestedAmountCents).toBe(100000);
  });

  it('getSuggested retourne 0 pour les comptes sans mouvement en N-1', () => {
    const sugg = getOpeningBalanceSuggestions(fy2026Id);
    const raiffeisen = sugg.find(s => s.accountNumber === '101');
    expect(raiffeisen!.suggestedAmountCents).toBe(0);
  });

  it('getSuggested retourne 0 pour tous les comptes si premier exercice (pas de N-1)', () => {
    const fy2023Id = createFiscalYear(2023).id;
    const sugg = getOpeningBalanceSuggestions(fy2023Id);
    expect(sugg.every(s => s.suggestedAmountCents === 0)).toBe(true);
  });

  it('createOpeningBalanceEntry insère avec is_opening_balance = 1 et date YYYY-01-01', () => {
    createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ]);
    const entries = getJournalEntries(fy2026Id);
    expect(entries).toHaveLength(1);
    expect(entries[0].is_opening_balance).toBeTruthy();
    expect(entries[0].date).toBe('2026-01-01');
    expect(entries[0].description).toBe('Soldes à nouveau 2026');
    expect(entries[0].lines).toHaveLength(2);
  });

  it('createOpeningBalanceEntry rejette si déséquilibre', () => {
    expect(() => createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents:  50000 },
    ])).toThrow('déséquilibr');
  });

  it('createOpeningBalanceEntry ignore les lignes à montant nul', () => {
    createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,     amountCents: 100000 },
      { accountId: raiffeisenId, amountCents:       0 },
      { accountId: capitalId,    amountCents: 100000 },
    ]);
    const lines = getJournalEntries(fy2026Id)[0].lines;
    expect(lines).toHaveLength(2); // raiffeisen exclu
  });

  it('createOpeningBalanceEntry rejette si exercice clôturé', () => {
    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fy2026Id);
    expect(() => createOpeningBalanceEntry(fy2026Id, [
      { accountId: caisseId,  amountCents: 100000 },
      { accountId: capitalId, amountCents: 100000 },
    ])).toThrow('clôturé');
  });
});
```

Ajouter ces imports supplémentaires en tête du fichier (après les imports existants) :

```ts
import {
  getOpeningBalanceSuggestions,
  createOpeningBalanceEntry,
} from '../db';
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npx vitest run src/__tests__/db.test.ts
```

Attendu : `FAIL` — `getOpeningBalanceSuggestions is not a function` (ou similaire)

- [ ] **Step 3 : Étendre `types/index.ts`**

Ajouter `hasOpeningBalance: boolean` à l'interface `FiscalYear` (après `created_at`) :

```ts
export interface FiscalYear {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  created_at: string;
  hasOpeningBalance: boolean;
}
```

Ajouter à la fin du fichier :

```ts
export interface OpeningBalanceSuggestion {
  accountId: number;
  accountNumber: string;
  accountName: string;
  type: AccountType;
  normalBalance: NormalBalance;
  suggestedAmountCents: number;
}

export interface OpeningBalanceLine {
  accountId: number;
  amountCents: number;
}
```

- [ ] **Step 4 : Modifier `getAllFiscalYears()` dans `db/index.ts`**

Remplacer le corps de `getAllFiscalYears()` :

```ts
export function getAllFiscalYears(): FiscalYear[] {
  return getDb().prepare(`
    SELECT
      fy.*,
      CASE WHEN COUNT(je.id) > 0 THEN 1 ELSE 0 END AS hasOpeningBalance
    FROM fiscal_years fy
    LEFT JOIN journal_entries je
      ON je.fiscal_year_id = fy.id
      AND je.is_opening_balance = 1
    GROUP BY fy.id
    ORDER BY fy.year DESC
  `).all() as FiscalYear[];
}
```

- [ ] **Step 5 : Ajouter `getOpeningBalanceSuggestions()` dans `db/index.ts`**

Ajouter l'import en tête (modifier la ligne d'import de `types`) :

```ts
import type {
  Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance,
  CreateJournalEntryPayload, UpdateJournalEntryPayload,
  OpeningBalanceSuggestion, OpeningBalanceLine,
} from '../types';
```

Ajouter la fonction après `getAccountBalances` :

```ts
export function getOpeningBalanceSuggestions(fiscalYearId: number): OpeningBalanceSuggestion[] {
  const currentFy = getDb()
    .prepare('SELECT year FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number } | undefined;
  if (!currentFy) throw new Error('Exercice introuvable');

  const prevFy = getDb()
    .prepare('SELECT id FROM fiscal_years WHERE year = ?')
    .get(currentFy.year - 1) as { id: number } | undefined;
  const prevFyId = prevFy?.id ?? null;

  const rows = getDb().prepare(`
    SELECT
      a.id            AS accountId,
      a.number        AS accountNumber,
      a.name          AS accountName,
      a.type,
      a.normal_balance AS normalBalance,
      COALESCE(
        CASE a.normal_balance
          WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit, 0))  - SUM(COALESCE(l.credit, 0))
          WHEN 'CREDIT' THEN SUM(COALESCE(l.credit, 0)) - SUM(COALESCE(l.debit, 0))
        END,
        0
      ) AS suggestedAmountCents
    FROM accounts a
    LEFT JOIN journal_entry_lines l ON l.account_id = a.id
    LEFT JOIN journal_entries e
      ON e.id = l.journal_entry_id
      AND e.fiscal_year_id = @prevFyId
    WHERE a.class IN (1, 2) AND a.is_active = 1
    GROUP BY a.id
    ORDER BY a.number
  `).all({ prevFyId }) as OpeningBalanceSuggestion[];

  return rows.map(r => ({
    ...r,
    suggestedAmountCents: Math.max(0, r.suggestedAmountCents),
  }));
}
```

- [ ] **Step 6 : Ajouter `createOpeningBalanceEntry()` dans `db/index.ts`**

Ajouter la fonction après `getOpeningBalanceSuggestions` :

```ts
export function createOpeningBalanceEntry(
  fiscalYearId: number,
  lines: OpeningBalanceLine[],
): void {
  const fy = getDb()
    .prepare('SELECT year, is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number; is_closed: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');
  if (fy.is_closed) throw new Error('Cet exercice est clôturé — aucune modification possible');

  const nonZero = lines.filter(l => l.amountCents > 0);

  const entryLines = nonZero.map(l => {
    const account = getDb()
      .prepare('SELECT normal_balance FROM accounts WHERE id = ?')
      .get(l.accountId) as { normal_balance: string } | undefined;
    if (!account) throw new Error(`Compte introuvable : ${l.accountId}`);
    return account.normal_balance === 'DEBIT'
      ? { account_id: l.accountId, debit: l.amountCents, credit: null }
      : { account_id: l.accountId, debit: null, credit: l.amountCents };
  });

  validateEntryBalance(entryLines);

  getDb().transaction(() => {
    const info = getDb().prepare(`
      INSERT INTO journal_entries (fiscal_year_id, date, description, is_opening_balance)
      VALUES (@fiscal_year_id, @date, @description, 1)
    `).run({
      fiscal_year_id: fiscalYearId,
      date: `${fy.year}-01-01`,
      description: `Soldes à nouveau ${fy.year}`,
    });

    const stmt = getDb().prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (@journal_entry_id, @account_id, @debit, @credit)
    `);
    for (const l of entryLines) {
      stmt.run({
        journal_entry_id: info.lastInsertRowid,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
      });
    }
  })();
}
```

- [ ] **Step 7 : Vérifier que les tests DB passent**

```
cd app && npx vitest run src/__tests__/db.test.ts
```

Attendu : tous les tests verts

- [ ] **Step 8 : Écrire `ipc-opening-balance-handlers.test.ts`**

Créer `app/src/__tests__/ipc-opening-balance-handlers.test.ts` :

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  app:    { relaunch: vi.fn(), exit: vi.fn() },
}));

vi.mock('../db', () => ({
  getAllAccounts:               vi.fn(),
  getActiveAccounts:            vi.fn(),
  getAllFiscalYears:             vi.fn(),
  createFiscalYear:             vi.fn(),
  getJournalEntries:            vi.fn(),
  createJournalEntry:           vi.fn(),
  updateJournalEntry:           vi.fn(),
  deleteJournalEntry:           vi.fn(),
  getAccountBalances:           vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getDb:    vi.fn(),
  getDbDir: vi.fn(),
}));

vi.mock('../backup',   () => ({ listBackups: vi.fn(), formatBackupFilename: vi.fn() }));
vi.mock('../settings', () => ({ readSettings: vi.fn(), writeSettings: vi.fn() }));
vi.mock('../migrate',  () => ({ migrateDataDir: vi.fn() }));

import { getOpeningBalanceSuggestions, createOpeningBalanceEntry } from '../db';
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

describe('registration', () => {
  it('enregistre openingBalance:getSuggested et openingBalance:create', () => {
    expect(handlers.has('openingBalance:getSuggested')).toBe(true);
    expect(handlers.has('openingBalance:create')).toBe(true);
  });
});

describe('openingBalance:getSuggested', () => {
  it('délègue à getOpeningBalanceSuggestions et retourne le résultat', async () => {
    const mockSugg = [{ accountId: 1, accountNumber: '100', accountName: 'Caisse',
      type: 'ACTIF', normalBalance: 'DEBIT', suggestedAmountCents: 100000 }];
    vi.mocked(getOpeningBalanceSuggestions).mockReturnValue(mockSugg as any);
    const result = await call('openingBalance:getSuggested', 1);
    expect(getOpeningBalanceSuggestions).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockSugg);
  });

  it('propage une erreur si getOpeningBalanceSuggestions throw', async () => {
    vi.mocked(getOpeningBalanceSuggestions).mockImplementation(() => {
      throw new Error('Exercice introuvable');
    });
    await expect(call('openingBalance:getSuggested', 9999)).rejects.toThrow('Exercice introuvable');
  });
});

describe('openingBalance:create', () => {
  it('délègue à createOpeningBalanceEntry', async () => {
    vi.mocked(createOpeningBalanceEntry).mockReturnValue(undefined);
    const lines = [{ accountId: 1, amountCents: 100000 }];
    await call('openingBalance:create', 1, lines);
    expect(createOpeningBalanceEntry).toHaveBeenCalledWith(1, lines);
  });

  it('propage une erreur si createOpeningBalanceEntry throw', async () => {
    vi.mocked(createOpeningBalanceEntry).mockImplementation(() => {
      throw new Error('clôturé');
    });
    await expect(call('openingBalance:create', 1, [])).rejects.toThrow('clôturé');
  });
});
```

- [ ] **Step 9 : Vérifier que les tests IPC échouent**

```
cd app && npx vitest run src/__tests__/ipc-opening-balance-handlers.test.ts
```

Attendu : FAIL — canaux non enregistrés

- [ ] **Step 10 : Enregistrer les canaux dans `ipc-handlers.ts`**

Ajouter l'import des nouvelles fonctions (modifier la ligne d'import `./db`) :

```ts
import {
  getAllAccounts,
  getActiveAccounts,
  getAllFiscalYears,
  createFiscalYear,
  getJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  getAccountBalances,
  getOpeningBalanceSuggestions,
  createOpeningBalanceEntry,
  getDb,
  getDbDir,
} from './db';
```

Ajouter à la fin de `registerIpcHandlers()`, avant la fermeture `}` :

```ts
  // ─── Soldes à nouveau ────────────────────────────────────────────────────────
  ipcMain.handle('openingBalance:getSuggested', (_e, fiscalYearId: number) =>
    getOpeningBalanceSuggestions(fiscalYearId));

  ipcMain.handle('openingBalance:create', (_e, fiscalYearId: number, lines: OpeningBalanceLine[]) =>
    createOpeningBalanceEntry(fiscalYearId, lines));
```

Ajouter l'import du type en tête de `ipc-handlers.ts` :

```ts
import type { CreateJournalEntryPayload, UpdateJournalEntryPayload, OpeningBalanceLine } from './types';
```

- [ ] **Step 11 : Étendre `preload.ts`**

Dans `contextBridge.exposeInMainWorld('api', { ... })` ajouter après `getAccountBalances` :

```ts
  // Soldes à nouveau
  getOpeningBalanceSuggestions: (fiscalYearId: number) =>
    ipcRenderer.invoke('openingBalance:getSuggested', fiscalYearId),
  createOpeningBalance: (fiscalYearId: number, lines: import('./types').OpeningBalanceLine[]) =>
    ipcRenderer.invoke('openingBalance:create', fiscalYearId, lines),
```

Dans `ElectronAPI` ajouter :

```ts
  getOpeningBalanceSuggestions: (fiscalYearId: number) => Promise<OpeningBalanceSuggestion[]>;
  createOpeningBalance: (fiscalYearId: number, lines: OpeningBalanceLine[]) => Promise<void>;
```

Ajouter `OpeningBalanceSuggestion, OpeningBalanceLine` aux imports de `./types` dans `preload.ts`.

- [ ] **Step 12 : Étendre `window.d.ts`**

Ajouter aux imports :

```ts
import type {
  Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance,
  CreateJournalEntryPayload, UpdateJournalEntryPayload, BackupInfo,
  OpeningBalanceSuggestion, OpeningBalanceLine,
} from './types';
```

Ajouter dans `Window['api']` :

```ts
      getOpeningBalanceSuggestions: (fiscalYearId: number) => Promise<OpeningBalanceSuggestion[]>;
      createOpeningBalance: (fiscalYearId: number, lines: OpeningBalanceLine[]) => Promise<void>;
```

- [ ] **Step 13 : Vérifier tous les tests**

```
cd app && npx vitest run
```

Attendu : tous les tests passent

- [ ] **Step 14 : Commit**

```bash
git add app/src/types/index.ts app/src/db/index.ts app/src/ipc-handlers.ts \
        app/src/preload.ts app/src/window.d.ts \
        app/src/__tests__/db.test.ts \
        app/src/__tests__/ipc-opening-balance-handlers.test.ts
git commit -m "feat: soldes à nouveau — types, DB functions, IPC handlers"
```

---

### Task 2: Composant `OpeningBalanceModal`

**Files:**
- Create: `app/src/components/OpeningBalanceModal.tsx`
- Create: `app/src/__tests__/renderer/OpeningBalanceModal.test.tsx`

**Interfaces:**
- Consomme (depuis Task 1): `OpeningBalanceSuggestion`, `OpeningBalanceLine` de `../types` ; `window.api.createOpeningBalance`
- Produit: `OpeningBalanceModal` avec props `{ fiscalYearId, year, suggestions, onClose, onSuccess }`

---

- [ ] **Step 1 : Écrire les tests**

Créer `app/src/__tests__/renderer/OpeningBalanceModal.test.tsx` :

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OpeningBalanceSuggestion } from '../../types';
import OpeningBalanceModal from '../../components/OpeningBalanceModal';

const suggestions: OpeningBalanceSuggestion[] = [
  { accountId: 1, accountNumber: '100', accountName: 'Caisse',
    type: 'ACTIF', normalBalance: 'DEBIT', suggestedAmountCents: 100000 },
  { accountId: 2, accountNumber: '101', accountName: 'Raiffeisen',
    type: 'ACTIF', normalBalance: 'DEBIT', suggestedAmountCents: 50000 },
  { accountId: 3, accountNumber: '200', accountName: 'Passifs transitoires',
    type: 'PASSIF', normalBalance: 'CREDIT', suggestedAmountCents: 0 },
  { accountId: 4, accountNumber: '290', accountName: 'Capital',
    type: 'FONDS_PROPRES', normalBalance: 'CREDIT', suggestedAmountCents: 150000 },
];

const defaultProps = {
  fiscalYearId: 1,
  year: 2025,
  suggestions,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createOpeningBalance: vi.fn().mockResolvedValue(undefined),
  });
});

describe('OpeningBalanceModal — affichage', () => {
  it('affiche le titre avec l\'année', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    expect(screen.getByRole('heading', { name: /Soldes à nouveau.*2025/ })).toBeInTheDocument();
  });

  it('affiche les comptes ACTIF et PASSIF comme champs éditables', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    expect(screen.getByRole('textbox', { name: /Solde Caisse/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Solde Raiffeisen/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Solde Passifs transitoires/ })).toBeInTheDocument();
  });

  it('affiche Capital (FONDS_PROPRES) en lecture seule', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    const capitalInput = screen.getByRole('textbox', { name: /Solde Capital/ });
    expect(capitalInput).toHaveAttribute('readonly');
  });

  it('pré-remplit les montants suggérés en CHF', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    expect(screen.getByRole('textbox', { name: /Solde Caisse/ })).toHaveValue('1000.00');
    expect(screen.getByRole('textbox', { name: /Solde Raiffeisen/ })).toHaveValue('500.00');
  });
});

describe('OpeningBalanceModal — calcul Capital', () => {
  it('Capital affiche la différence Actifs − Passifs initiale', () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    // Actifs = 1000 + 500 = 1500, Passifs = 0 → Capital = 1500
    expect(screen.getByRole('textbox', { name: /Solde Capital/ })).toHaveValue('1500.00');
  });

  it('Capital se recalcule quand un actif change', async () => {
    render(<OpeningBalanceModal {...defaultProps} />);
    const caisseInput = screen.getByRole('textbox', { name: /Solde Caisse/ });
    await userEvent.clear(caisseInput);
    await userEvent.type(caisseInput, '200.00');
    // Actifs = 200 + 500 = 700, Passifs = 0 → Capital = 700
    expect(screen.getByRole('textbox', { name: /Solde Capital/ })).toHaveValue('700.00');
  });
});

describe('OpeningBalanceModal — actions', () => {
  it('"Passer cette étape" appelle onClose sans appel API', async () => {
    const onClose = vi.fn();
    render(<OpeningBalanceModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Passer cette étape' }));
    expect(onClose).toHaveBeenCalled();
    expect(window.api.createOpeningBalance).not.toHaveBeenCalled();
  });

  it('"Enregistrer les soldes" appelle createOpeningBalance avec les bons montants (centimes)', async () => {
    const onSuccess = vi.fn();
    render(<OpeningBalanceModal {...defaultProps} onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les soldes' }));
    expect(window.api.createOpeningBalance).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([
        { accountId: 1, amountCents: 100000 }, // Caisse
        { accountId: 2, amountCents:  50000 }, // Raiffeisen
        { accountId: 4, amountCents: 150000 }, // Capital calculé
      ]),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it('affiche un bandeau d\'erreur si createOpeningBalance rejette', async () => {
    vi.stubGlobal('api', {
      createOpeningBalance: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    render(<OpeningBalanceModal {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les soldes' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npx vitest run src/__tests__/renderer/OpeningBalanceModal.test.tsx
```

Attendu : FAIL — module introuvable

- [ ] **Step 3 : Implémenter `OpeningBalanceModal.tsx`**

Créer `app/src/components/OpeningBalanceModal.tsx` :

```tsx
import { useState } from 'react';
import type { OpeningBalanceSuggestion, OpeningBalanceLine } from '../types';

export interface OpeningBalanceModalProps {
  fiscalYearId: number;
  year: number;
  suggestions: OpeningBalanceSuggestion[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function OpeningBalanceModal({
  fiscalYearId, year, suggestions, onClose, onSuccess,
}: OpeningBalanceModalProps) {
  const editable = suggestions.filter(s => s.type !== 'FONDS_PROPRES');
  const capital  = suggestions.filter(s => s.type === 'FONDS_PROPRES');

  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(editable.map(s => [s.accountId, formatCHF(s.suggestedAmountCents)]))
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const actifCents = suggestions
    .filter(s => s.type === 'ACTIF')
    .reduce((sum, s) => sum + parseCHF(amounts[s.accountId] ?? '0'), 0);

  const passifCents = suggestions
    .filter(s => s.type === 'PASSIF')
    .reduce((sum, s) => sum + parseCHF(amounts[s.accountId] ?? '0'), 0);

  const capitalCents = actifCents - passifCents;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const lines: OpeningBalanceLine[] = [
        ...editable.map(s => ({
          accountId: s.accountId,
          amountCents: parseCHF(amounts[s.accountId] ?? '0'),
        })),
        ...capital.map(s => ({ accountId: s.accountId, amountCents: capitalCents })),
      ];
      await window.api.createOpeningBalance(fiscalYearId, lines);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const actifAccounts  = suggestions.filter(s => s.type === 'ACTIF');
  const passifAccounts = suggestions.filter(s => s.type === 'PASSIF');

  return (
    <div style={s.overlay} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div style={s.modal}>
        <h2 id="ob-title" style={s.h2}>Soldes à nouveau — Exercice {year}</h2>

        {error && <div role="alert" style={s.alert}>{error}</div>}

        <table style={s.table}>
          <tbody>
            <tr><td colSpan={2} style={s.sectionHeader}>Classe 1 — Actifs</td></tr>
            {actifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td style={s.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td style={s.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    style={s.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            <tr><td colSpan={2} style={s.sectionHeader}>Classe 2 — Passifs et fonds propres</td></tr>
            {passifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td style={s.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td style={s.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    style={s.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            {capital.map(sg => (
              <tr key={sg.accountId}>
                <td style={s.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td style={s.amountCell}>
                  <input
                    type="text"
                    readOnly
                    value={formatCHF(capitalCents)}
                    style={{ ...s.input, ...s.inputReadOnly }}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={s.actions}>
          <button onClick={onClose} disabled={saving} style={s.btnSecondary}>
            Passer cette étape
          </button>
          <button onClick={handleSave} disabled={saving} style={s.btn}>
            {saving ? 'Enregistrement…' : 'Enregistrer les soldes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseCHF(str: string): number {
  const n = parseFloat(str.replace(',', '.'));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

function formatCHF(cents: number): string {
  return (cents / 100).toFixed(2);
}

const s = {
  overlay:       { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:         { background: '#fff', borderRadius: '10px', padding: '2rem', minWidth: '480px', maxWidth: '640px', boxShadow: '0 8px 32px rgba(0,0,0,.18)' },
  h2:            { margin: '0 0 1.25rem', fontSize: '1.1rem', color: '#0f172a' },
  alert:         { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.6rem 0.75rem', borderRadius: '6px', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' },
  table:         { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '1.5rem', fontSize: '0.875rem' },
  sectionHeader: { padding: '0.5rem 0 0.25rem', fontWeight: 600, color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  accountCell:   { padding: '0.3rem 0', color: '#334155', width: '60%' },
  amountCell:    { padding: '0.3rem 0', textAlign: 'right' as const },
  input:         { width: '120px', padding: '0.3rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '0.875rem', textAlign: 'right' as const, fontFamily: 'monospace' },
  inputReadOnly: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' },
  actions:       { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' },
  btn:           { padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500 },
  btnSecondary:  { padding: '0.5rem 1rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer' },
} as const;
```

- [ ] **Step 4 : Vérifier les tests du composant**

```
cd app && npx vitest run src/__tests__/renderer/OpeningBalanceModal.test.tsx
```

Attendu : tous les tests verts

- [ ] **Step 5 : Vérifier la suite complète**

```
cd app && npx vitest run
```

Attendu : tous les tests passent

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/OpeningBalanceModal.tsx \
        app/src/__tests__/renderer/OpeningBalanceModal.test.tsx
git commit -m "feat: composant OpeningBalanceModal (soldes à nouveau)"
```

---

### Task 3: Intégration dans `FiscalYearsPage`

**Files:**
- Modify: `app/src/pages/FiscalYearsPage.tsx`
- Modify: `app/src/__tests__/renderer/FiscalYearsPage.test.tsx`

**Interfaces:**
- Consomme (Task 1): `window.api.getOpeningBalanceSuggestions`, `FiscalYear.hasOpeningBalance`
- Consomme (Task 2): `<OpeningBalanceModal>` avec ses props

---

- [ ] **Step 1 : Mettre à jour les mocks et ajouter les tests dans `FiscalYearsPage.test.tsx`**

Modifier les fixtures existantes pour ajouter `hasOpeningBalance: false` :

```ts
const fy2025: FiscalYear = {
  id: 1, year: 2025,
  start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '2025-01-01T00:00:00.000Z',
  hasOpeningBalance: false,
};
const fy2024closed: FiscalYear = {
  id: 2, year: 2024,
  start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '2024-01-01T00:00:00.000Z',
  hasOpeningBalance: true,
};
```

Modifier `mockApi` pour inclure les nouvelles méthodes :

```ts
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
  });
}
```

Ajouter un nouveau `describe` après les blocs existants :

```ts
describe('FiscalYearsPage — soldes à nouveau', () => {
  it('affiche la colonne "Soldes à nouveau" dans le tableau', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('columnheader', { name: 'Soldes à nouveau' })).toBeInTheDocument();
  });

  it('affiche le bouton "Saisir les soldes à nouveau" si !hasOpeningBalance', async () => {
    mockApi([fy2025]); // hasOpeningBalance: false
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('button', { name: 'Saisir les soldes à nouveau' })).toBeInTheDocument();
  });

  it('n\'affiche pas le bouton si hasOpeningBalance est vrai', async () => {
    const fy2025WithBalance: FiscalYear = { ...fy2025, hasOpeningBalance: true };
    mockApi([fy2025WithBalance]);
    render(<FiscalYearsPage />);
    await screen.findByText('2025');
    expect(screen.queryByRole('button', { name: 'Saisir les soldes à nouveau' })).not.toBeInTheDocument();
  });

  it('ouvre le modal automatiquement après création si exercice N-1 détecté', async () => {
    // fy2025 est déjà dans la liste ; on crée 2026
    const fy2026: FiscalYear = {
      id: 99, year: 2026,
      start_date: '2026-01-01', end_date: '2026-12-31',
      is_closed: false, created_at: new Date().toISOString(),
      hasOpeningBalance: false,
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn()
        .mockResolvedValueOnce([fy2025])   // chargement initial
        .mockResolvedValueOnce([fy2026, fy2025]), // après création
      createFiscalYear: vi.fn().mockResolvedValue(fy2026),
      getOpeningBalanceSuggestions: vi.fn().mockResolvedValue([]),
      createOpeningBalance: vi.fn().mockResolvedValue(undefined),
    });

    render(<FiscalYearsPage />);
    await screen.findByText('2025');

    const input = screen.getByLabelText('Année');
    await userEvent.clear(input);
    await userEvent.type(input, '2026');
    await userEvent.click(screen.getByRole('button', { name: /Créer l'exercice 2026/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('n\'ouvre pas le modal si c\'est le premier exercice (pas de N-1)', async () => {
    const fy2023: FiscalYear = {
      id: 99, year: 2023,
      start_date: '2023-01-01', end_date: '2023-12-31',
      is_closed: false, created_at: new Date().toISOString(),
      hasOpeningBalance: false,
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn()
        .mockResolvedValueOnce([])        // pas d'exercice existant
        .mockResolvedValueOnce([fy2023]),
      createFiscalYear: vi.fn().mockResolvedValue(fy2023),
      getOpeningBalanceSuggestions: vi.fn().mockResolvedValue([]),
      createOpeningBalance: vi.fn().mockResolvedValue(undefined),
    });

    render(<FiscalYearsPage />);
    await screen.findByText(/Aucun exercice/);

    const input = screen.getByLabelText('Année');
    await userEvent.clear(input);
    await userEvent.type(input, '2023');
    await userEvent.click(screen.getByRole('button', { name: /Créer l'exercice 2023/ }));

    await screen.findByText('2023');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

```
cd app && npx vitest run src/__tests__/renderer/FiscalYearsPage.test.tsx
```

Attendu : FAIL sur les nouveaux tests

- [ ] **Step 3 : Mettre à jour `FiscalYearsPage.tsx`**

Remplacer le contenu complet de `app/src/pages/FiscalYearsPage.tsx` :

```tsx
import { useEffect, useState } from 'react';
import type { FiscalYear, OpeningBalanceSuggestion } from '../types';
import OpeningBalanceModal from '../components/OpeningBalanceModal';

export default function FiscalYearsPage() {
  const [years,    setYears]    = useState<FiscalYear[]>([]);
  const [newYear,  setNewYear]  = useState<number>(new Date().getFullYear());
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [modalFiscalYear, setModalFiscalYear] = useState<{ id: number; year: number } | null>(null);
  const [suggestions,     setSuggestions]     = useState<OpeningBalanceSuggestion[]>([]);

  useEffect(() => { load(); }, []);

  async function load(): Promise<FiscalYear[]> {
    try {
      const data = await window.api.getFiscalYears();
      setYears(data);
      return data;
    } catch (e: unknown) {
      setError((e as Error).message);
      return [];
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await window.api.createFiscalYear(newYear);
      const updatedYears = await load();
      setNewYear(n => n + 1);

      const prevYear = updatedYears.find(y => y.year === newYear - 1);
      if (prevYear) {
        const sugg = await window.api.getOpeningBalanceSuggestions(created.id);
        setSuggestions(sugg);
        setModalFiscalYear({ id: created.id, year: newYear });
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenModal(y: FiscalYear) {
    try {
      const sugg = await window.api.getOpeningBalanceSuggestions(y.id);
      setSuggestions(sugg);
      setModalFiscalYear({ id: y.id, year: y.year });
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  function handleModalClose() {
    setModalFiscalYear(null);
    setSuggestions([]);
  }

  function handleModalSuccess() {
    setModalFiscalYear(null);
    setSuggestions([]);
    load();
  }

  const yearAlreadyExists = years.some(y => y.year === newYear);

  return (
    <div>
      <h1 style={s.h1}>Exercices</h1>

      {error && <div role="alert" style={s.error}>Erreur : {error}</div>}

      <section style={s.section}>
        <h2 style={s.h2}>Créer un exercice</h2>
        <form onSubmit={handleCreate} style={s.form}>
          <label htmlFor="year-input" style={s.label}>Année</label>
          <input
            id="year-input"
            type="number"
            value={newYear}
            onChange={e => setNewYear(Number(e.target.value))}
            min={2000}
            max={2100}
            style={s.input}
          />
          {yearAlreadyExists && (
            <span style={s.warn}>L'exercice {newYear} existe déjà</span>
          )}
          <button
            type="submit"
            disabled={creating || yearAlreadyExists}
            style={{ ...s.btn, ...(creating || yearAlreadyExists ? s.btnDisabled : {}) }}
          >
            {creating ? 'Création…' : `Créer l'exercice ${newYear}`}
          </button>
        </form>
      </section>

      <section style={s.section}>
        <h2 style={s.h2}>Exercices enregistrés</h2>
        {years.length === 0 ? (
          <p style={s.empty}>Aucun exercice créé pour l'instant.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.theadRow}>
                <th style={s.th}>Année</th>
                <th style={s.th}>Début</th>
                <th style={s.th}>Fin</th>
                <th style={s.th}>Statut</th>
                <th style={s.th}>Soldes à nouveau</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => (
                <tr key={y.id} style={s.row}>
                  <td style={{ ...s.td, fontWeight: 600 }}>{y.year}</td>
                  <td style={s.td}>{formatDate(y.start_date)}</td>
                  <td style={s.td}>{formatDate(y.end_date)}</td>
                  <td style={s.td}>
                    <span style={y.is_closed ? s.badgeClosed : s.badgeOpen}>
                      {y.is_closed ? 'Clôturé' : 'Ouvert'}
                    </span>
                  </td>
                  <td style={s.td}>
                    {y.hasOpeningBalance ? (
                      <span style={s.badgeOb}>Saisis</span>
                    ) : !y.is_closed ? (
                      <button
                        onClick={() => handleOpenModal(y)}
                        style={s.btnSmall}
                      >
                        Saisir les soldes à nouveau
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modalFiscalYear && (
        <OpeningBalanceModal
          fiscalYearId={modalFiscalYear.id}
          year={modalFiscalYear.year}
          suggestions={suggestions}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const s = {
  h1:          { margin: '0 0 1.5rem', fontSize: '1.5rem', color: '#0f172a' },
  h2:          { margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: '#334155' },
  section:     { marginBottom: '2rem' },
  error:       { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' },
  form:        { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  label:       { fontWeight: 500, fontSize: '0.875rem', color: '#475569' },
  input:       { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.875rem', width: '90px', color: '#0f172a' },
  warn:        { fontSize: '0.8rem', color: '#d97706' },
  btn:         { padding: '0.45rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 },
  btnDisabled: { background: '#94a3b8', cursor: 'not-allowed' },
  btnSmall:    { padding: '0.25rem 0.6rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '5px', fontSize: '0.78rem', cursor: 'pointer' },
  empty:       { color: '#64748b', fontSize: '0.875rem' },
  table:       { borderCollapse: 'collapse' as const, width: '100%', maxWidth: '760px', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow:    { background: '#f1f5f9' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  row:         { borderBottom: '1px solid #f1f5f9' },
  td:          { padding: '0.5rem 1rem', color: '#334155' },
  badgeOpen:   { display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 500 },
  badgeClosed: { display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#f1f5f9', color: '#64748b', fontSize: '0.75rem', fontWeight: 500 },
  badgeOb:     { display: 'inline-block', padding: '0.2rem 0.5rem', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 500 },
} as const;
```

- [ ] **Step 4 : Vérifier les tests FiscalYearsPage**

```
cd app && npx vitest run src/__tests__/renderer/FiscalYearsPage.test.tsx
```

Attendu : tous les tests verts (anciens + nouveaux)

- [ ] **Step 5 : Vérifier la suite complète**

```
cd app && npx vitest run
```

Attendu : tous les tests passent (≥ 242)

- [ ] **Step 6 : Commit**

```bash
git add app/src/pages/FiscalYearsPage.tsx \
        app/src/__tests__/renderer/FiscalYearsPage.test.tsx
git commit -m "feat: intégration modal soldes à nouveau dans FiscalYearsPage"
```
