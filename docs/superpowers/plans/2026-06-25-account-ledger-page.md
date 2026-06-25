# Page Grand-livre (AccountLedgerPage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page grand-livre par compte, accessible depuis la page Soldes en cliquant sur une ligne, affichant toutes les écritures du compte pour un exercice avec contreparties et solde courant (bilan uniquement).

**Architecture:** Nouveau handler IPC `account:getLedger` interroge SQLite via deux requêtes synchrones `better-sqlite3` ; `BalancesPage` reçoit une prop `onOpenLedger` et rend ses lignes cliquables ; `AccountLedgerPage` est un composant autonome avec props `accountId`, `fiscalYearId`, `onBack`. Aucune entrée sidebar.

**Tech Stack:** TypeScript, React, CSS Modules, Electron IPC, better-sqlite3, Vitest, React Testing Library.

## Global Constraints

- Montants stockés en **centimes** (INTEGER SQLite) — jamais de float pour les montants CHF
- CSS Modules colocalisés (`.module.css` par composant)
- Valeurs négatives : `data-negative={val < 0 || undefined}` + sélecteur CSS `[data-negative]`
- Jamais `window.confirm` — utiliser `ConfirmDialog`
- `Tooltip.tsx` (`app/src/components/Tooltip.tsx`) pour les info-bulles CSS pur `:hover`
- `Modal.tsx` pour toute modale (non utilisé ici)
- Tests Vitest uniquement dans `app/src/**` (ne pas toucher le dossier `e2e/`)
- Commande de test : `cd app && npm test` (lance `pretest` → rebuild better-sqlite3 pour Node)

---

### Task 1: Types — `id` dans `AccountBalance` + `LedgerLine` + `AccountLedgerData`

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/__tests__/renderer/BalancesPage.test.tsx`
- Modify: `app/src/__tests__/renderer/BilanPage.test.tsx`

**Interfaces:**
- Produces: `AccountBalance.id: number`, `LedgerLine`, `AccountLedgerData` — utilisés par Tasks 2, 3, 4, 5

- [ ] **Step 1 : Mettre à jour `app/src/types/index.ts`**

Ajouter `id: number` à l'interface `AccountBalance` existante et ajouter les deux nouveaux types après elle :

```typescript
// Modifier l'interface AccountBalance existante — ajouter id en premier champ :
export interface AccountBalance {
  id: number;           // ← nouveau
  number: string;
  name: string;
  class: number;
  total_debit: number;
  total_credit: number;
  solde: number;
}

// Ajouter après AccountBalance :
export interface LedgerLine {
  entryId: number;
  date: string;
  piece: string | null;
  description: string;
  isOpeningBalance: boolean;
  isClosingEntry: boolean;
  debit: number | null;   // centimes CHF, null si ligne au crédit
  credit: number | null;  // centimes CHF, null si ligne au débit
  counterparts: Array<{ number: string; name: string }>;
}

export interface AccountLedgerData {
  account: {
    id: number;
    number: string;
    name: string;
    type: AccountType;
    normal_balance: NormalBalance;
    class: number;
  };
  lines: LedgerLine[];
}
```

- [ ] **Step 2 : Mettre à jour le fixture dans `app/src/__tests__/renderer/BalancesPage.test.tsx`**

Ajouter `id` à chaque objet `AccountBalance` du fixture (TypeScript refusera de compiler sans) :

```typescript
const balancesFixture: AccountBalance[] = [
  { id: 1, number: '100', name: 'Caisse',              class: 1, total_debit: 120000, total_credit: 80000,  solde: 40000  },
  { id: 5, number: '300', name: 'Cotisations membres', class: 3, total_debit: 0,      total_credit: 141000, solde: 141000 },
];
```

Les valeurs `id: 1` et `id: 5` sont arbitraires — elles seront utilisées dans le test de navigation (Task 5).

- [ ] **Step 3 : Mettre à jour le fixture dans `app/src/__tests__/renderer/BilanPage.test.tsx`**

Ajouter `id` à chaque objet `AccountBalance` :

```typescript
const balancesFixture: AccountBalance[] = [
  { id: 1, number: '100', name: 'Caisse',               class: 1, total_debit: 150000, total_credit: 110000, solde: 40000  },
  { id: 2, number: '101', name: 'Raiffeisen',           class: 1, total_debit: 500000, total_credit: 300000, solde: 200000 },
  { id: 3, number: '200', name: 'Passifs transitoires', class: 2, total_debit: 0,      total_credit: 10000,  solde: 10000  },
  { id: 4, number: '290', name: 'Capital',              class: 2, total_debit: 0,      total_credit: 200000, solde: 200000 },
  { id: 5, number: '300', name: 'Cotisations membres',  class: 3, total_debit: 0,      total_credit: 141000, solde: 141000 },
  { id: 6, number: '310', name: 'Vente boissons',       class: 3, total_debit: 0,      total_credit: 20000,  solde: 20000  },
  { id: 7, number: '400', name: 'Assurances',           class: 4, total_debit: 50000,  total_credit: 0,      solde: 50000  },
  { id: 8, number: '401', name: 'Frais bancaires',      class: 4, total_debit: 10000,  total_credit: 0,      solde: 10000  },
];
```

- [ ] **Step 4 : Vérifier que les tests passent**

```
cd app && npm test 2>&1 | tail -5
```

Expected : PASS — 506 tests. Des erreurs `Property 'id' is missing in type` indiquent un fixture oublié.

- [ ] **Step 5 : Commit**

```bash
git add app/src/types/index.ts app/src/__tests__/renderer/BalancesPage.test.tsx app/src/__tests__/renderer/BilanPage.test.tsx
git commit -m "feat(types): ajouter id à AccountBalance + types LedgerLine / AccountLedgerData"
```

---

### Task 2: DB — `getAccountBalances` (ajouter `id`) + nouvelle fonction `getAccountLedger`

**Files:**
- Modify: `app/src/db/index.ts`
- Modify: `app/src/__tests__/db.test.ts`

**Interfaces:**
- Consumes: `AccountBalance` (avec `id`), `LedgerLine`, `AccountLedgerData` (Task 1)
- Produces: `getAccountLedger(fiscalYearId: number, accountId: number): AccountLedgerData` — utilisé par Task 3

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/db.test.ts`**

Ajouter `getAccountLedger` aux imports existants en haut du fichier :

```typescript
import {
  // ...tous les imports existants...
  getAccountLedger,
} from '../db';
```

Ajouter ce bloc `describe` à la fin du fichier :

```typescript
describe('getAccountLedger', () => {
  beforeEach(freshDb);

  it('retourne les infos du compte et une liste vide sans écriture', () => {
    const fy = createFiscalYear(2025);
    const caisse = getAllAccounts().find(a => a.number === '100')!;
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.account.number).toBe('100');
    expect(result.account.name).toBe('Caisse');
    expect(result.lines).toHaveLength(0);
  });

  it('retourne la ligne avec contrepartie unique et flags corrects', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const cotis  = accounts.find(a => a.number === '300')!;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-03-08', description: 'Cotisations',
      lines: [
        { account_id: caisse.id, debit: 141000 },
        { account_id: cotis.id,  credit: 141000 },
      ],
    });
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].debit).toBe(141000);
    expect(result.lines[0].credit).toBeNull();
    expect(result.lines[0].description).toBe('Cotisations');
    expect(result.lines[0].isOpeningBalance).toBe(false);
    expect(result.lines[0].isClosingEntry).toBe(false);
    expect(result.lines[0].counterparts).toHaveLength(1);
    expect(result.lines[0].counterparts[0].number).toBe('300');
  });

  it('retourne plusieurs contreparties pour écriture multi-lignes', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const assur  = accounts.find(a => a.number === '400')!;
    const elect  = accounts.find(a => a.number === '410')!;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-04-01', description: 'Charges diverses',
      lines: [
        { account_id: assur.id,  debit: 30000  },
        { account_id: elect.id,  debit: 20000  },
        { account_id: caisse.id, credit: 50000 },
      ],
    });
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.lines[0].counterparts).toHaveLength(2);
    const nums = result.lines[0].counterparts.map(c => c.number).sort();
    expect(nums).toEqual(['400', '410']);
  });

  it('retourne les lignes en ordre chronologique', () => {
    const fy = createFiscalYear(2025);
    const accounts = getAllAccounts();
    const caisse = accounts.find(a => a.number === '100')!;
    const raiff  = accounts.find(a => a.number === '101')!;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-05-01', description: 'Retrait',
      lines: [{ account_id: caisse.id, debit: 10000 }, { account_id: raiff.id, credit: 10000 }],
    });
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-03-01', description: 'Dépôt',
      lines: [{ account_id: caisse.id, credit: 20000 }, { account_id: raiff.id, debit: 20000 }],
    });
    const result = getAccountLedger(fy.id, caisse.id);
    expect(result.lines[0].description).toBe('Dépôt');
    expect(result.lines[1].description).toBe('Retrait');
  });

  it('lève une erreur si le compte est introuvable', () => {
    const fy = createFiscalYear(2025);
    expect(() => getAccountLedger(fy.id, 9999)).toThrow('Compte introuvable');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test -- db.test.ts 2>&1 | tail -10
```

Expected : FAIL — `getAccountLedger is not a function` ou erreur d'import.

- [ ] **Step 3 : Mettre à jour `getAccountBalances` dans `app/src/db/index.ts`**

Ajouter `a.id` à la requête SELECT (après le commentaire `-- ─── Soldes ───`) :

```typescript
export function getAccountBalances(fiscalYearId: number): AccountBalance[] {
  return getDb().prepare(`
    SELECT
      a.id,
      a.number,
      a.name,
      a.class,
      SUM(COALESCE(l.debit, 0))  AS total_debit,
      SUM(COALESCE(l.credit, 0)) AS total_credit,
      CASE a.normal_balance
        WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0)) - SUM(COALESCE(l.credit,0))
        WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
      END AS solde
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ?
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as AccountBalance[];
}
```

- [ ] **Step 4 : Ajouter `getAccountLedger` dans `app/src/db/index.ts`**

Ajouter `LedgerLine, AccountLedgerData` aux imports de types en haut du fichier :

```typescript
import type {
  // ...existants...
  LedgerLine,
  AccountLedgerData,
} from '../types';
```

Ajouter la fonction après `getAccountBalances` :

```typescript
export function getAccountLedger(fiscalYearId: number, accountId: number): AccountLedgerData {
  const account = getDb().prepare(`
    SELECT id, number, name, type, normal_balance, class
    FROM accounts WHERE id = ?
  `).get(accountId) as AccountLedgerData['account'] | undefined;

  if (!account) throw new Error('Compte introuvable');

  const rows = getDb().prepare(`
    SELECT
      e.id   AS entry_id,
      e.date,
      e.piece,
      e.description,
      e.is_opening_balance,
      e.is_closing_entry,
      l.debit,
      l.credit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.journal_entry_id
    WHERE l.account_id = ? AND e.fiscal_year_id = ?
    ORDER BY e.date, e.id
  `).all(accountId, fiscalYearId) as Array<{
    entry_id: number;
    date: string;
    piece: string | null;
    description: string;
    is_opening_balance: number;
    is_closing_entry: number;
    debit: number | null;
    credit: number | null;
  }>;

  const cpStmt = getDb().prepare(`
    SELECT a.number, a.name
    FROM journal_entry_lines l
    JOIN accounts a ON a.id = l.account_id
    WHERE l.journal_entry_id = ? AND l.account_id != ?
    ORDER BY a.number
  `);

  const lines: LedgerLine[] = rows.map(r => ({
    entryId:          r.entry_id,
    date:             r.date,
    piece:            r.piece,
    description:      r.description,
    isOpeningBalance: r.is_opening_balance === 1,
    isClosingEntry:   r.is_closing_entry   === 1,
    debit:            r.debit,
    credit:           r.credit,
    counterparts:     cpStmt.all(r.entry_id, accountId) as Array<{ number: string; name: string }>,
  }));

  return { account, lines };
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```
cd app && npm test -- db.test.ts 2>&1 | tail -10
```

Expected : PASS — 5 nouveaux tests + tous les tests db existants.

- [ ] **Step 6 : Commit**

```bash
git add app/src/db/index.ts app/src/__tests__/db.test.ts
git commit -m "feat(db): getAccountLedger + id dans getAccountBalances"
```

---

### Task 3: IPC handler + preload + window.d.ts

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Modify: `app/src/__tests__/ipc-handlers.test.ts`

**Interfaces:**
- Consumes: `getAccountLedger` (Task 2), `AccountLedgerData` (Task 1)
- Produces: canal IPC `account:getLedger`, `window.api.getAccountLedger(fiscalYearId, accountId)` — utilisé par Task 4

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/ipc-handlers.test.ts`**

Ajouter `getAccountLedger` dans le bloc `vi.mock('../db', () => ({ ... }))` :

```typescript
vi.mock('../db', () => ({
  // ...tous les existants...
  getAccountLedger: vi.fn(),
}));
```

Ajouter l'import dans la liste des imports depuis `'../db'` :

```typescript
import {
  // ...tous les existants...
  getAccountLedger,
} from '../db';
```

Ajouter un nouveau `describe` en fin de fichier :

```typescript
describe('account:getLedger', () => {
  it('délègue à getAccountLedger avec fiscalYearId et accountId', async () => {
    const mockData = {
      account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
      lines: [],
    };
    vi.mocked(getAccountLedger).mockReturnValue(mockData as any);
    const result = await call('account:getLedger', 1, 42);
    expect(getAccountLedger).toHaveBeenCalledWith(1, 42);
    expect(result).toBe(mockData);
  });

  it('propage une erreur de getAccountLedger', async () => {
    vi.mocked(getAccountLedger).mockImplementation(() => {
      throw new Error('Compte introuvable');
    });
    await expect(call('account:getLedger', 1, 9999)).rejects.toThrow('Compte introuvable');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test -- ipc-handlers.test.ts 2>&1 | tail -10
```

Expected : FAIL — canal `account:getLedger` non enregistré.

- [ ] **Step 3 : Enregistrer le handler dans `app/src/ipc-handlers.ts`**

Ajouter `getAccountLedger` aux imports depuis `'./db'` :

```typescript
import {
  // ...tous les existants...
  getAccountLedger,
} from './db';
```

Ajouter le handler dans `registerIpcHandlers()`, section `// ─── Comptes ──` :

```typescript
ipcMain.handle('account:getLedger', (_e, fiscalYearId: number, accountId: number) =>
  getAccountLedger(fiscalYearId, accountId)
);
```

- [ ] **Step 4 : Exposer dans `app/src/preload.ts`**

Ajouter `AccountLedgerData` aux imports de types (ligne 2) :

```typescript
import type {
  // ...tous les existants...
  AccountLedgerData,
} from './types';
```

Ajouter dans l'objet `contextBridge.exposeInMainWorld('api', { ... })` :

```typescript
  // Grand-livre
  getAccountLedger: (fiscalYearId: number, accountId: number): Promise<AccountLedgerData> =>
    ipcRenderer.invoke('account:getLedger', fiscalYearId, accountId),
```

Ajouter dans le type `ElectronAPI` :

```typescript
  getAccountLedger: (fiscalYearId: number, accountId: number) => Promise<AccountLedgerData>;
```

- [ ] **Step 5 : Déclarer dans `app/src/window.d.ts`**

Ajouter `AccountLedgerData` aux imports de types :

```typescript
import type {
  // ...tous les existants...
  AccountLedgerData,
} from './types';
```

Ajouter dans l'interface `Window.api` :

```typescript
      getAccountLedger: (fiscalYearId: number, accountId: number) => Promise<AccountLedgerData>;
```

- [ ] **Step 6 : Vérifier que les tests passent**

```
cd app && npm test -- ipc-handlers.test.ts 2>&1 | tail -10
```

Expected : PASS — 2 nouveaux tests + tous les existants.

- [ ] **Step 7 : Commit**

```bash
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts app/src/__tests__/ipc-handlers.test.ts
git commit -m "feat(ipc): handler account:getLedger + preload + window.d.ts"
```

---

### Task 4: Composant `AccountLedgerPage`

**Files:**
- Create: `app/src/pages/AccountLedgerPage.tsx`
- Create: `app/src/pages/AccountLedgerPage.module.css`
- Create: `app/src/__tests__/renderer/AccountLedgerPage.test.tsx`

**Interfaces:**
- Consumes: `window.api.getAccountLedger` (Task 3), `AccountLedgerData`, `LedgerLine` (Task 1), `Tooltip` (`app/src/components/Tooltip.tsx`), `formatCHF`, `formatDate` (`app/src/lib/format.ts`)
- Produces: `<AccountLedgerPage accountId={n} fiscalYearId={n} onBack={fn} />` — utilisé par Task 5

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/renderer/AccountLedgerPage.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountLedgerData } from '../../types';
import AccountLedgerPage from '../../pages/AccountLedgerPage';

const bilanData: AccountLedgerData = {
  account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
  lines: [
    {
      entryId: 1, date: '2025-03-08', piece: null,
      description: 'Cotisations membres',
      isOpeningBalance: false, isClosingEntry: false,
      debit: null, credit: 141000,
      counterparts: [{ number: '300', name: 'Cotisations membres' }],
    },
    {
      entryId: 2, date: '2025-04-01', piece: 'F-12',
      description: 'Assurance AXA',
      isOpeningBalance: false, isClosingEntry: false,
      debit: 45000, credit: null,
      counterparts: [
        { number: '101', name: 'Raiffeisen' },
        { number: '400', name: 'Assurances' },
      ],
    },
  ],
};

const resultData: AccountLedgerData = {
  account: { id: 5, number: '300', name: 'Cotisations membres', type: 'PRODUIT', normal_balance: 'CREDIT', class: 3 },
  lines: [
    {
      entryId: 1, date: '2025-03-08', piece: null,
      description: 'Cotisations membres',
      isOpeningBalance: false, isClosingEntry: false,
      debit: null, credit: 141000,
      counterparts: [{ number: '100', name: 'Caisse' }],
    },
  ],
};

function mockApi(data: AccountLedgerData) {
  vi.stubGlobal('api', {
    getAccountLedger: vi.fn().mockResolvedValue(data),
  });
}

beforeEach(() => mockApi(bilanData));

describe('AccountLedgerPage — affichage', () => {
  it('affiche le titre avec numéro et nom du compte', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('100 Caisse');
  });

  it('affiche la colonne Solde CHF pour un compte de bilan (classe 1)', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('Solde CHF')).toBeInTheDocument();
  });

  it("n'affiche pas Solde CHF pour un compte de résultat (classe 3)", async () => {
    mockApi(resultData);
    render(<AccountLedgerPage accountId={5} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Solde CHF')).not.toBeInTheDocument();
  });

  it('affiche la contrepartie unique directement', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText('300 Cotisations membres')).toBeInTheDocument();
  });

  it('affiche "Divers" pour les contreparties multiples', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText('Divers')).toBeInTheDocument();
  });

  it('affiche les montants débit et crédit', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText('1410.00')).toBeInTheDocument();
    expect(screen.getByText('450.00')).toBeInTheDocument();
  });

  it('affiche la ligne Total en pied de tableau', async () => {
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText('Total')).toBeInTheDocument();
  });

  it('affiche un message vide si aucun mouvement', async () => {
    mockApi({
      account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
      lines: [],
    });
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    expect(await screen.findByText(/Aucun mouvement/)).toBeInTheDocument();
  });

  it('le bouton Retour appelle onBack', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={onBack} />);
    await screen.findByRole('heading', { level: 1 });
    await user.click(screen.getByRole('button', { name: /Retour/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('la ligne d\'ouverture a la classe CSS rowOpening', async () => {
    mockApi({
      account: { id: 1, number: '100', name: 'Caisse', type: 'ACTIF', normal_balance: 'DEBIT', class: 1 },
      lines: [{
        entryId: 1, date: '2025-01-01', piece: null, description: 'Solde à nouveau',
        isOpeningBalance: true, isClosingEntry: false,
        debit: 500000, credit: null,
        counterparts: [{ number: '290', name: 'Capital' }],
      }],
    });
    const { container } = render(<AccountLedgerPage accountId={1} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByText('Solde à nouveau');
    const row = container.querySelector('tbody tr');
    expect(row?.className).toContain('rowOpening');
  });

  it('la ligne de clôture a la classe CSS rowClosing', async () => {
    mockApi({
      account: { id: 4, number: '290', name: 'Capital', type: 'FONDS_PROPRES', normal_balance: 'CREDIT', class: 2 },
      lines: [{
        entryId: 99, date: '2025-12-31', piece: null, description: 'Clôture vers Capital',
        isOpeningBalance: false, isClosingEntry: true,
        debit: null, credit: 337000,
        counterparts: [{ number: '900', name: 'Profits et Pertes' }],
      }],
    });
    const { container } = render(<AccountLedgerPage accountId={4} fiscalYearId={1} onBack={vi.fn()} />);
    await screen.findByText('Clôture vers Capital');
    const row = container.querySelector('tbody tr');
    expect(row?.className).toContain('rowClosing');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test -- AccountLedgerPage.test.tsx 2>&1 | tail -10
```

Expected : FAIL — `Cannot find module '../../pages/AccountLedgerPage'`.

- [ ] **Step 3 : Créer `app/src/pages/AccountLedgerPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { AccountLedgerData } from '../types';
import { formatCHF as fmt, formatDate } from '../lib/format';
import Tooltip from '../components/Tooltip';
import styles from './AccountLedgerPage.module.css';

interface AccountLedgerPageProps {
  accountId:    number;
  fiscalYearId: number;
  onBack:       () => void;
}

export default function AccountLedgerPage({ accountId, fiscalYearId, onBack }: AccountLedgerPageProps) {
  const [data,    setData]    = useState<AccountLedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    window.api.getAccountLedger(fiscalYearId, accountId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fiscalYearId, accountId]);

  const isBilan = data ? data.account.class <= 2 : false;

  const totalDebit  = data?.lines.reduce((s, l) => s + (l.debit  ?? 0), 0) ?? 0;
  const totalCredit = data?.lines.reduce((s, l) => s + (l.credit ?? 0), 0) ?? 0;
  const totalSolde  = data
    ? (data.account.normal_balance === 'DEBIT' ? totalDebit - totalCredit : totalCredit - totalDebit)
    : 0;

  return (
    <div>
      <button onClick={onBack} className={styles.backBtn}>← Retour aux soldes</button>

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      {loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : data && (
        <>
          <h1 className={styles.h1}>{data.account.number} {data.account.name}</h1>

          {data.lines.length === 0 ? (
            <p className={styles.empty}>Aucun mouvement pour ce compte dans cet exercice.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr className={styles.theadRow}>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Pièce</th>
                  <th className={styles.th}>Libellé</th>
                  <th className={styles.th}>Contrepartie</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Débit CHF</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Crédit CHF</th>
                  {isBilan && <th className={`${styles.th} ${styles.thRight}`}>Solde CHF</th>}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = 0;
                  return data.lines.map((line, i) => {
                    if (isBilan) {
                      running += data.account.normal_balance === 'DEBIT'
                        ? (line.debit ?? 0) - (line.credit ?? 0)
                        : (line.credit ?? 0) - (line.debit ?? 0);
                    }
                    const rowClass =
                      line.isOpeningBalance ? styles.rowOpening :
                      line.isClosingEntry   ? styles.rowClosing :
                      styles.dataRow;
                    return (
                      <tr key={`${line.entryId}-${i}`} className={rowClass}>
                        <td className={styles.td}>{formatDate(line.date)}</td>
                        <td className={styles.td}>{line.piece ?? ''}</td>
                        <td className={styles.td}>{line.description}</td>
                        <td className={styles.td}>
                          <CounterpartCell counterparts={line.counterparts} />
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.debit != null ? fmt(line.debit) : ''}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.credit != null ? fmt(line.credit) : ''}
                        </td>
                        {isBilan && (
                          <td
                            className={`${styles.td} ${styles.tdRight}`}
                            data-negative={running < 0 || undefined}
                          >
                            {fmt(running)}
                          </td>
                        )}
                      </tr>
                    );
                  });
                })()}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={4} className={styles.totalLabel}>Total</td>
                  <td className={`${styles.totalCell} ${styles.tdRight}`}>{fmt(totalDebit)}</td>
                  <td className={`${styles.totalCell} ${styles.tdRight}`}>{fmt(totalCredit)}</td>
                  {isBilan && (
                    <td
                      className={`${styles.totalCell} ${styles.tdRight}`}
                      data-negative={totalSolde < 0 || undefined}
                    >
                      {fmt(totalSolde)}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function CounterpartCell({ counterparts }: { counterparts: Array<{ number: string; name: string }> }) {
  if (counterparts.length === 0) return <span className={styles.counterpartNone}>—</span>;
  if (counterparts.length === 1) {
    return <span>{counterparts[0].number} {counterparts[0].name}</span>;
  }
  return (
    <Tooltip
      content={
        <ul className={styles.tooltipList}>
          {counterparts.map(cp => (
            <li key={cp.number}>{cp.number} {cp.name}</li>
          ))}
        </ul>
      }
    >
      <span className={styles.divers}>Divers</span>
    </Tooltip>
  );
}
```

- [ ] **Step 4 : Créer `app/src/pages/AccountLedgerPage.module.css`**

```css
.backBtn {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  margin-bottom: 1.25rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.backBtn:hover { text-decoration: underline; }

.h1 {
  font-size: 1.5rem;
  color: #0f172a;
  margin: 0 0 1.5rem;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.empty { color: #64748b; font-size: 0.875rem; }

.table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.theadRow { background: #1e3a5f; }

.th {
  text-align: left;
  padding: 0.6rem 1rem;
  font-weight: 600;
  color: #e2e8f0;
  border-bottom: 1px solid #2d5282;
}
.thRight { text-align: right; }

.dataRow   { border-bottom: 1px solid #f1f5f9; }
.rowOpening {
  border-bottom: 1px solid #f1f5f9;
  font-style: italic;
  color: #64748b;
}
.rowClosing {
  border-bottom: 1px solid #f1f5f9;
  background: #f8fafc;
  color: #475569;
}

.td { padding: 0.4rem 1rem; color: #334155; }

.tdRight {
  text-align: right;
  font-family: monospace;
}
.tdRight[data-negative] { color: #dc2626; }

.totalRow { background: #e2e8f0; border-top: 2px solid #cbd5e1; }
.totalLabel { padding: 0.45rem 1rem; font-weight: 600; color: #334155; }

.totalCell {
  padding: 0.45rem 1rem;
  font-family: monospace;
  font-weight: 600;
  color: #334155;
}
.totalCell[data-negative] { color: #dc2626; }

.divers {
  color: #2563eb;
  cursor: default;
  text-decoration: underline dotted;
}
.counterpartNone { color: #94a3b8; }

.tooltipList {
  margin: 0;
  padding: 0 0 0 1rem;
  list-style: disc;
}
.tooltipList li {
  white-space: nowrap;
  font-size: 0.8rem;
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```
cd app && npm test -- AccountLedgerPage.test.tsx 2>&1 | tail -10
```

Expected : PASS — 11 tests.

- [ ] **Step 6 : Commit**

```bash
git add app/src/pages/AccountLedgerPage.tsx app/src/pages/AccountLedgerPage.module.css app/src/__tests__/renderer/AccountLedgerPage.test.tsx
git commit -m "feat(ui): page AccountLedgerPage (grand-livre par compte)"
```

---

### Task 5: Navigation — App.tsx + BalancesPage clickable + CLAUDE.md

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/pages/BalancesPage.tsx`
- Modify: `app/src/pages/BalancesPage.module.css`
- Modify: `app/src/__tests__/renderer/BalancesPage.test.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `AccountLedgerPage` (Task 4), `AccountBalance.id` (Task 1), `onOpenLedger` signature
- Produces: navigation complète Soldes → Grand-livre → Retour aux soldes

- [ ] **Step 1 : Écrire le test de navigation dans `app/src/__tests__/renderer/BalancesPage.test.tsx`**

Ajouter en fin du dernier `describe` :

```typescript
it('appelle onOpenLedger avec accountId et fiscalYearId au clic sur une ligne', async () => {
  const user = userEvent.setup();
  const onOpenLedger = vi.fn();
  mockApi([fy2025], balancesFixture);
  render(<BalancesPage onOpenLedger={onOpenLedger} />);
  await screen.findByText('Caisse');
  await user.click(screen.getByText('Caisse'));
  // balancesFixture[0] : id=1, fy2025.id=1
  expect(onOpenLedger).toHaveBeenCalledWith(1, 1);
});
```

- [ ] **Step 2 : Vérifier que le test échoue**

```
cd app && npm test -- BalancesPage.test.tsx 2>&1 | tail -10
```

Expected : FAIL — prop inconnue ou clic sans effet.

- [ ] **Step 3 : Mettre à jour `app/src/pages/BalancesPage.tsx`**

Ajouter une interface de props et modifier la signature de la fonction, puis mettre à jour `GroupRows` :

```tsx
// Ajouter avant la fonction BalancesPage :
interface BalancesPageProps {
  onOpenLedger?: (accountId: number, fiscalYearId: number) => void;
}

// Modifier la signature :
export default function BalancesPage({ onOpenLedger }: BalancesPageProps) {
  // ...tout le code existant inchangé jusqu'à...

  // Modifier l'appel à GroupRows (passer les nouvelles props) :
  {groups.map(group => (
    <GroupRows
      key={group.class}
      group={group}
      selectedYearId={selectedYearId}
      onOpenLedger={onOpenLedger}
    />
  ))}
}

// Remplacer la fonction GroupRows existante par :
function GroupRows({
  group,
  selectedYearId,
  onOpenLedger,
}: {
  group: BalanceGroup;
  selectedYearId: number | null;
  onOpenLedger?: (accountId: number, fiscalYearId: number) => void;
}) {
  const clickable = !!onOpenLedger;
  return (
    <>
      <tr>
        <td colSpan={5} className={styles.groupCell}>{group.label}</td>
      </tr>
      {group.rows.map(row => (
        <tr
          key={row.number}
          className={`${styles.dataRow}${clickable ? ` ${styles.dataRowClickable}` : ''}`}
          onClick={() => clickable && selectedYearId != null && onOpenLedger!(row.id, selectedYearId)}
        >
          <td className={`${styles.td} ${styles.tdMono}`}>{row.number}</td>
          <td className={styles.td}>{row.name}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.total_debit)}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.total_credit)}</td>
          <td className={`${styles.td} ${styles.tdRight}`} data-negative={row.solde < 0 || undefined}>
            {fmt(row.solde)}
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={2} className={`${styles.subtotalCell} ${styles.subtotalCellItalic}`}>
          Sous-total {group.label}
        </td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`}>{fmt(group.totalDebit)}</td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`}>{fmt(group.totalCredit)}</td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`} data-negative={group.totalSolde < 0 || undefined}>
          {fmt(group.totalSolde)}
        </td>
      </tr>
    </>
  );
}
```

- [ ] **Step 4 : Ajouter les styles dans `app/src/pages/BalancesPage.module.css`**

Ajouter à la fin du fichier :

```css
.dataRowClickable {
  cursor: pointer;
}
.dataRowClickable:hover {
  background: #eff6ff;
}
```

- [ ] **Step 5 : Vérifier que les tests BalancesPage passent**

```
cd app && npm test -- BalancesPage.test.tsx 2>&1 | tail -10
```

Expected : PASS — 7 tests (6 existants + 1 nouveau).

- [ ] **Step 6 : Mettre à jour `app/src/App.tsx`**

```tsx
// 1. Ajouter l'import (avec les autres imports de pages) :
import AccountLedgerPage from './pages/AccountLedgerPage';

// 2. Mettre à jour le type Page (ajouter 'ledger') :
export type Page = 'dashboard' | 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'analytics' | 'bilan' | 'ledger' | 'settings' | 'welcome';

// 3. Ajouter l'état après const [currentPage, ...] :
const [ledgerParams, setLedgerParams] = useState<{ accountId: number; fiscalYearId: number } | null>(null);

// 4. Ajouter la fonction openLedger avant le return :
function openLedger(accountId: number, fiscalYearId: number) {
  setLedgerParams({ accountId, fiscalYearId });
  setCurrentPage('ledger');
}

// 5. Dans renderPage(), remplacer case 'balances' et ajouter case 'ledger' :
case 'balances': return <BalancesPage onOpenLedger={openLedger} />;
case 'ledger':
  return ledgerParams
    ? <AccountLedgerPage
        accountId={ledgerParams.accountId}
        fiscalYearId={ledgerParams.fiscalYearId}
        onBack={() => setCurrentPage('balances')}
      />
    : <BalancesPage onOpenLedger={openLedger} />;
```

- [ ] **Step 7 : Lancer la suite complète de tests**

```
cd app && npm test 2>&1 | tail -5
```

Expected : PASS — ~524 tests (506 existants + 5 db + 2 ipc + 11 composant + 1 nav + ajustements).

- [ ] **Step 8 : Mettre à jour `CLAUDE.md`**

Dans la section **Fonctionnalités** > **À faire**, ajouter dans la liste **Fait** :

```markdown
- [x] Page **Grand-livre** (`AccountLedgerPage`) — grand-livre par compte accessible depuis Soldes, colonnes Date/Pièce/Libellé/Contrepartie/Débit/Crédit/Solde courant (bilan uniquement), tooltip "Divers" pour contreparties multiples — NNN tests
```

Dans la section **Idées futures**, supprimer la ligne :

```markdown
- [ ] Page **Compte** (grand-livre par compte) — détail de toutes les écritures d'un compte pour un exercice donné, colonnes Débit / Crédit / Solde courant (total running), total en pied de page ; total courant pertinent uniquement pour les comptes de bilan (1xx, 2xx)
```

- [ ] **Step 9 : Commit final**

```bash
git add app/src/App.tsx app/src/pages/BalancesPage.tsx app/src/pages/BalancesPage.module.css app/src/__tests__/renderer/BalancesPage.test.tsx CLAUDE.md
git commit -m "feat(nav): navigation Soldes → Grand-livre + lignes BalancesPage cliquables"
```
