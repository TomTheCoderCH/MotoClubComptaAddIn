# Vue Analytique + Gestion du Plan Comptable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un champ `account_group` sur les comptes (migration v2), une page "Plan comptable" éditable (renommer, ajouter, désactiver, assigner un groupe), et une nouvelle page "Analytique" affichant le P&L par groupe analytique + section "Non groupés".

**Architecture:** Migration SQLite v2 ajoute `account_group TEXT` sur `accounts`. Trois nouvelles fonctions DB (`updateAccount`, `createAccount`, `getAnalyticsData`) exposées via IPC. `AccountsPage` enrichie avec une modale `AccountFormModal` (create/edit). Nouvelle page `AnalyticsPage` sur le modèle de `BalancesPage`. Entrée "Analytique" ajoutée dans la sidebar.

**Tech Stack:** TypeScript, React, better-sqlite3, Vitest, React Testing Library, CSS Modules.

## Global Constraints

- Montants stockés en **centimes** (INTEGER) — `fmt(centimes)` = `(centimes / 100).toFixed(2)`
- CSS Modules : `.module.css` colocalisé, zéro `style={{}}` inline, couleurs conditionnelles via `data-negative`
- Solde normal dérivé du type : ACTIF/CHARGE → DEBIT, tous les autres → CREDIT (jamais demandé à l'utilisateur)
- Classe dérivée du premier chiffre du numéro de compte (`parseInt(number[0], 10)`)
- Types interdits à l'édition via UI : `number` (jamais), `type` (bloqué si écritures)
- Tests : `npm test` dans `app/` — Vitest, SQLite `:memory:`, jsdom pour le renderer
- Convention commit : `feat:`, `fix:`, `refactor:`, `docs:` + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## Structure des fichiers

```
app/src/
├── db/
│   ├── schema-migrations.ts     MODIFY  — ajouter migration v2
│   └── index.ts                 MODIFY  — updateAccount, createAccount, getAnalyticsData
├── types/
│   └── index.ts                 MODIFY  — Account.account_group, nouveaux payloads et types analytics
├── ipc-handlers.ts              MODIFY  — 3 nouveaux handlers
├── preload.ts                   MODIFY  — exposer updateAccount, createAccount, getAnalytics
├── window.d.ts                  MODIFY  — déclarer les nouvelles méthodes
├── components/
│   ├── AccountFormModal.tsx     CREATE  — modale create/edit compte
│   └── AccountFormModal.module.css  CREATE
├── pages/
│   ├── AccountsPage.tsx         MODIFY  — tableau éditable + boutons + modale
│   ├── AccountsPage.module.css  MODIFY  — nouvelles classes
│   ├── AnalyticsPage.tsx        CREATE  — vue P&L par groupe
│   └── AnalyticsPage.module.css CREATE
├── App.tsx                      MODIFY  — ajouter page 'analytics'
└── components/Sidebar.tsx       MODIFY  — ajouter entrée nav

app/src/__tests__/
├── db.test.ts                   MODIFY  — migration v2, updateAccount, createAccount, getAnalyticsData
├── ipc-handlers.test.ts         MODIFY  — 3 nouveaux handlers
└── renderer/
    ├── AccountsPage.test.tsx    CREATE  — tests page plan comptable
    └── AnalyticsPage.test.tsx   CREATE  — tests page analytique
```

---

## Task 1 : Migration schéma v2 + types TypeScript

**Files:**
- Modify: `app/src/db/schema-migrations.ts`
- Modify: `app/src/types/index.ts`
- Modify: `app/src/__tests__/db.test.ts`

**Interfaces:**
- Produces:
  - `Account.account_group: string | null`
  - `UpdateAccountPayload`, `CreateAccountPayload`
  - `AnalyticsAccountRow`, `AnalyticsGroup`, `AnalyticsData`

---

- [ ] **Step 1 : Écrire le test de migration**

Dans `app/src/__tests__/db.test.ts`, ajouter à la fin :

```typescript
describe('Migration v2 — account_group', () => {
  it('la colonne account_group existe sur accounts', () => {
    openDatabase(':memory:');
    const cols = getDb()
      .prepare("PRAGMA table_info(accounts)")
      .all() as Array<{ name: string }>;
    expect(cols.some(c => c.name === 'account_group')).toBe(true);
  });

  it('account_group vaut null par défaut', () => {
    openDatabase(':memory:');
    const acc = getDb()
      .prepare("SELECT account_group FROM accounts WHERE number = '100'")
      .get() as { account_group: string | null };
    expect(acc.account_group).toBeNull();
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test -- --reporter=verbose 2>&1 | grep -A2 "account_group"
```
Attendu : FAIL — colonne account_group n'existe pas encore.

- [ ] **Step 3 : Ajouter la migration v2 dans `schema-migrations.ts`**

```typescript
const MIGRATIONS: Migration[] = [
  {
    version:     1,
    description: 'Schéma initial (fiscal_years, accounts, journal_entries, journal_entry_lines)',
    sql:         '',
  },
  {
    version:     2,
    description: 'Ajout account_group sur accounts (groupes analytiques)',
    sql:         "ALTER TABLE accounts ADD COLUMN account_group TEXT",
  },
];
```

- [ ] **Step 4 : Mettre à jour les types dans `types/index.ts`**

Ajouter `account_group` à `Account` :

```typescript
export interface Account {
  id: number;
  number: string;
  name: string;
  class: number;
  type: AccountType;
  normal_balance: NormalBalance;
  description: string | null;
  account_group: string | null;          // NEW
  must_be_zero_at_closing: boolean;
  is_closing_account: boolean;
  is_active: boolean;
  created_at: string;
}
```

Ajouter à la fin de `types/index.ts` :

```typescript
export interface UpdateAccountPayload {
  id: number;
  name?: string;
  description?: string;
  account_group?: string | null;
  is_active?: boolean;
}

export interface CreateAccountPayload {
  number: string;      // premier chiffre → class ; ex. '350'
  name: string;
  type: AccountType;   // normal_balance déduit automatiquement
  description?: string;
  account_group?: string | null;
}

export interface AnalyticsAccountRow {
  id: number;
  number: string;
  name: string;
  type: 'PRODUIT' | 'CHARGE';
  recettes: number;  // centimes — crédit net (pour PRODUIT)
  charges:  number;  // centimes — débit net (pour CHARGE)
}

export interface AnalyticsGroup {
  name:           string;
  accounts:       AnalyticsAccountRow[];
  totalRecettes:  number;  // centimes
  totalCharges:   number;  // centimes
  resultat:       number;  // centimes — totalRecettes - totalCharges
}

export interface AnalyticsData {
  groups:    AnalyticsGroup[];
  ungrouped: AnalyticsAccountRow[];
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```
cd app && npm test
```
Attendu : tous les tests passent (migration v2 appliquée, colonne présente).

- [ ] **Step 6 : Commit**

```
git add app/src/db/schema-migrations.ts app/src/types/index.ts app/src/__tests__/db.test.ts
git commit -m "feat(schema): migration v2 account_group + types AnalyticsData"
```

---

## Task 2 : Fonctions DB — `updateAccount`, `createAccount`, `getAnalyticsData`

**Files:**
- Modify: `app/src/db/index.ts`
- Modify: `app/src/__tests__/db.test.ts`

**Interfaces:**
- Consumes: `UpdateAccountPayload`, `CreateAccountPayload`, `AnalyticsData` (Task 1)
- Produces:
  - `updateAccount(payload: UpdateAccountPayload): Account`
  - `createAccount(payload: CreateAccountPayload): Account`
  - `getAnalyticsData(fiscalYearId: number): AnalyticsData`

---

- [ ] **Step 1 : Écrire les tests**

Ajouter dans `app/src/__tests__/db.test.ts` :

```typescript
import {
  // ... imports existants ...
  updateAccount,
  createAccount,
  getAnalyticsData,
} from '../db';
```

```typescript
describe('updateAccount', () => {
  beforeEach(freshDb);

  it('renomme un compte', () => {
    const acc = getAllAccounts().find(a => a.number === '100')!;
    const updated = updateAccount({ id: acc.id, name: 'Caisse principale' });
    expect(updated.name).toBe('Caisse principale');
  });

  it('assigne un groupe analytique', () => {
    const acc = getAllAccounts().find(a => a.number === '310')!;
    const updated = updateAccount({ id: acc.id, account_group: 'boissons' });
    expect(updated.account_group).toBe('boissons');
  });

  it('efface un groupe analytique (null)', () => {
    const acc = getAllAccounts().find(a => a.number === '310')!;
    updateAccount({ id: acc.id, account_group: 'boissons' });
    const cleared = updateAccount({ id: acc.id, account_group: null });
    expect(cleared.account_group).toBeNull();
  });

  it('désactive un compte', () => {
    const acc = getAllAccounts().find(a => a.number === '490')!;
    const updated = updateAccount({ id: acc.id, is_active: false });
    expect(updated.is_active).toBeFalsy();
  });

  it('lève une erreur si aucun champ fourni', () => {
    const acc = getAllAccounts().find(a => a.number === '100')!;
    expect(() => updateAccount({ id: acc.id })).toThrow('Aucun champ');
  });
});

describe('createAccount', () => {
  beforeEach(freshDb);

  it('crée un compte PRODUIT avec solde normal CREDIT déduit', () => {
    const acc = createAccount({ number: '395', name: 'Intérêts bancaires', type: 'PRODUIT' });
    expect(acc.number).toBe('395');
    expect(acc.normal_balance).toBe('CREDIT');
    expect(acc.class).toBe(3);
  });

  it('crée un compte CHARGE avec solde normal DEBIT déduit', () => {
    const acc = createAccount({ number: '495', name: 'Frais divers', type: 'CHARGE' });
    expect(acc.normal_balance).toBe('DEBIT');
    expect(acc.class).toBe(4);
  });

  it('crée un compte avec groupe analytique', () => {
    const acc = createAccount({
      number: '312', name: 'Vente café', type: 'PRODUIT', account_group: 'boissons',
    });
    expect(acc.account_group).toBe('boissons');
  });

  it('lève une erreur si numéro déjà utilisé', () => {
    expect(() => createAccount({ number: '100', name: 'Doublon', type: 'ACTIF' }))
      .toThrow('déjà utilisé');
  });

  it('lève une erreur si numéro invalide (non numérique)', () => {
    expect(() => createAccount({ number: 'ABC', name: 'Test', type: 'PRODUIT' }))
      .toThrow('invalide');
  });
});

describe('getAnalyticsData', () => {
  beforeEach(freshDb);

  it('retourne groups vide et ungrouped vide sans mouvement', () => {
    const fy = createFiscalYear(2025);
    const data = getAnalyticsData(fy.id);
    expect(data.groups).toHaveLength(0);
    expect(data.ungrouped).toHaveLength(0);
  });

  it('place les comptes sans groupe dans ungrouped', () => {
    const fy = createFiscalYear(2025);
    const caisse  = getAllAccounts().find(a => a.number === '100')!.id;
    const cotisations = getAllAccounts().find(a => a.number === '300')!.id;
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-03-01', description: 'Test',
      lines: [
        { account_id: caisse,      debit:  3000 },
        { account_id: cotisations, credit: 3000 },
      ],
    });
    const data = getAnalyticsData(fy.id);
    expect(data.ungrouped).toHaveLength(1);
    expect(data.ungrouped[0].number).toBe('300');
    expect(data.ungrouped[0].recettes).toBe(3000);
  });

  it('regroupe les comptes par account_group', () => {
    const fy = createFiscalYear(2025);
    const comptes = getAllAccounts();
    const prod = comptes.find(a => a.number === '310')!;
    const charge = comptes.find(a => a.number === '411')!;
    const caisse = comptes.find(a => a.number === '100')!;
    updateAccount({ id: prod.id,   account_group: 'boissons' });
    updateAccount({ id: charge.id, account_group: 'boissons' });
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-04-01', description: 'Vente boissons',
      lines: [
        { account_id: caisse.id, debit:  5000 },
        { account_id: prod.id,  credit: 5000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fy.id, date: '2025-04-15', description: 'Achat boissons',
      lines: [
        { account_id: charge.id, debit:  2000 },
        { account_id: caisse.id, credit: 2000 },
      ],
    });
    const data = getAnalyticsData(fy.id);
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0].name).toBe('boissons');
    expect(data.groups[0].totalRecettes).toBe(5000);
    expect(data.groups[0].totalCharges).toBe(2000);
    expect(data.groups[0].resultat).toBe(3000);
    expect(data.ungrouped).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test 2>&1 | grep -E "FAIL|updateAccount|createAccount|getAnalyticsData"
```
Attendu : FAIL — fonctions non définies.

- [ ] **Step 3 : Implémenter les fonctions dans `db/index.ts`**

Ajouter après les imports existants :

```typescript
import type {
  // ... types existants ...
  UpdateAccountPayload,
  CreateAccountPayload,
  AnalyticsAccountRow,
  AnalyticsGroup,
  AnalyticsData,
} from '../types';
```

Ajouter la fonction utilitaire (avant les exports) :

```typescript
function normalBalanceForType(type: AccountType): NormalBalance {
  return (type === 'ACTIF' || type === 'CHARGE') ? 'DEBIT' : 'CREDIT';
}
```

Ajouter après `isDbOpen()` :

```typescript
export function updateAccount(payload: UpdateAccountPayload): Account {
  const { id, name, description, account_group, is_active } = payload;
  const fields: string[]  = [];
  const values: unknown[] = [];

  if (name          !== undefined) { fields.push('name = ?');          values.push(name); }
  if (description   !== undefined) { fields.push('description = ?');   values.push(description); }
  if (account_group !== undefined) { fields.push('account_group = ?'); values.push(account_group); }
  if (is_active     !== undefined) { fields.push('is_active = ?');     values.push(is_active ? 1 : 0); }

  if (fields.length === 0) throw new Error('Aucun champ à mettre à jour');

  getDb()
    .prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values, id);

  return getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account;
}

export function createAccount(payload: CreateAccountPayload): Account {
  const { number, name, type, description, account_group } = payload;

  if (!/^\d/.test(number)) throw new Error(`Numéro de compte invalide : "${number}"`);

  const existing = getDb().prepare('SELECT id FROM accounts WHERE number = ?').get(number);
  if (existing) throw new Error(`Numéro de compte ${number} déjà utilisé`);

  const cls            = parseInt(number[0], 10);
  const normal_balance = normalBalanceForType(type);

  const result = getDb()
    .prepare(`
      INSERT INTO accounts (number, name, class, type, normal_balance, description, account_group)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(number, name, cls, type, normal_balance, description ?? null, account_group ?? null);

  return getDb()
    .prepare('SELECT * FROM accounts WHERE id = ?')
    .get(result.lastInsertRowid) as Account;
}

export function getAnalyticsData(fiscalYearId: number): AnalyticsData {
  type RawRow = {
    id: number; number: string; name: string;
    type: string; account_group: string | null;
    total_debit: number; total_credit: number;
  };

  const rows = getDb().prepare(`
    SELECT
      a.id, a.number, a.name, a.type, a.account_group,
      SUM(COALESCE(l.debit,  0)) AS total_debit,
      SUM(COALESCE(l.credit, 0)) AS total_credit
    FROM accounts a
    JOIN journal_entry_lines l ON l.account_id = a.id
    JOIN journal_entries e     ON e.id = l.journal_entry_id
    WHERE e.fiscal_year_id = ? AND a.class IN (3, 4)
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as RawRow[];

  const toRow = (r: RawRow): AnalyticsAccountRow => ({
    id:       r.id,
    number:   r.number,
    name:     r.name,
    type:     r.type as 'PRODUIT' | 'CHARGE',
    recettes: r.type === 'PRODUIT' ? r.total_credit - r.total_debit : 0,
    charges:  r.type === 'CHARGE'  ? r.total_debit - r.total_credit : 0,
  });

  const grouped   = rows.filter(r => r.account_group);
  const ungrouped = rows.filter(r => !r.account_group);

  const groupMap = new Map<string, RawRow[]>();
  for (const r of grouped) {
    const key  = r.account_group!;
    const list = groupMap.get(key) ?? [];
    list.push(r);
    groupMap.set(key, list);
  }

  const groups: AnalyticsGroup[] = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([name, accs]) => {
      const accounts      = accs.map(toRow);
      const totalRecettes = accounts.reduce((s, r) => s + r.recettes, 0);
      const totalCharges  = accounts.reduce((s, r) => s + r.charges,  0);
      return { name, accounts, totalRecettes, totalCharges, resultat: totalRecettes - totalCharges };
    });

  return { groups, ungrouped: ungrouped.map(toRow) };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```
cd app && npm test
```
Attendu : tous les tests passent.

- [ ] **Step 5 : Commit**

```
git add app/src/db/index.ts app/src/__tests__/db.test.ts
git commit -m "feat(db): updateAccount, createAccount, getAnalyticsData"
```

---

## Task 3 : IPC handlers + preload + window.d.ts

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Modify: `app/src/__tests__/ipc-handlers.test.ts`

**Interfaces:**
- Consumes: `updateAccount`, `createAccount`, `getAnalyticsData` (Task 2)
- Produces: `window.api.updateAccount`, `window.api.createAccount`, `window.api.getAnalytics`

---

- [ ] **Step 1 : Écrire les tests IPC**

Dans `app/src/__tests__/ipc-handlers.test.ts`, vérifier que le fichier mock `../db` inclut les nouvelles fonctions. Ajouter dans le `vi.mock('../db', ...)` :

```typescript
updateAccount:    vi.fn(),
createAccount:    vi.fn(),
getAnalyticsData: vi.fn(),
```

Ajouter les imports :

```typescript
import { updateAccount, createAccount, getAnalyticsData } from '../db';
```

Ajouter les tests :

```typescript
describe('accounts:update', () => {
  it('enregistre le canal', () => {
    expect(handlers.has('accounts:update')).toBe(true);
  });

  it('délègue à updateAccount', async () => {
    const payload = { id: 1, name: 'Caisse principale' };
    const updated = { id: 1, name: 'Caisse principale', number: '100' };
    vi.mocked(updateAccount).mockReturnValue(updated as any);
    const result = await call('accounts:update', payload);
    expect(updateAccount).toHaveBeenCalledWith(payload);
    expect(result).toBe(updated);
  });
});

describe('accounts:create', () => {
  it('enregistre le canal', () => {
    expect(handlers.has('accounts:create')).toBe(true);
  });

  it('délègue à createAccount', async () => {
    const payload = { number: '395', name: 'Test', type: 'PRODUIT' };
    const created = { id: 30, number: '395', name: 'Test' };
    vi.mocked(createAccount).mockReturnValue(created as any);
    const result = await call('accounts:create', payload);
    expect(createAccount).toHaveBeenCalledWith(payload);
    expect(result).toBe(created);
  });
});

describe('analytics:get', () => {
  it('enregistre le canal', () => {
    expect(handlers.has('analytics:get')).toBe(true);
  });

  it('délègue à getAnalyticsData', async () => {
    const data = { groups: [], ungrouped: [] };
    vi.mocked(getAnalyticsData).mockReturnValue(data);
    const result = await call('analytics:get', 1);
    expect(getAnalyticsData).toHaveBeenCalledWith(1);
    expect(result).toBe(data);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test 2>&1 | grep -E "accounts:update|accounts:create|analytics:get"
```
Attendu : FAIL.

- [ ] **Step 3 : Ajouter les handlers dans `ipc-handlers.ts`**

Dans `registerIpcHandlers()`, après les handlers Comptes existants :

```typescript
// ─── Gestion du plan comptable ───────────────────────────────────────────────
ipcMain.handle('accounts:update', (_e, payload: UpdateAccountPayload) =>
  updateAccount(payload));

ipcMain.handle('accounts:create', (_e, payload: CreateAccountPayload) =>
  createAccount(payload));

// ─── Analytique ──────────────────────────────────────────────────────────────
ipcMain.handle('analytics:get', (_e, fiscalYearId: number) =>
  getAnalyticsData(fiscalYearId));
```

Ajouter les imports manquants dans `ipc-handlers.ts` :

```typescript
import type { ..., UpdateAccountPayload, CreateAccountPayload } from './types';
import { ..., updateAccount, createAccount, getAnalyticsData } from './db';
```

- [ ] **Step 4 : Mettre à jour `preload.ts`**

Dans `contextBridge.exposeInMainWorld('api', { ... })`, ajouter :

```typescript
  // Gestion du plan comptable
  updateAccount: (payload: UpdateAccountPayload): Promise<Account> =>
    ipcRenderer.invoke('accounts:update', payload),
  createAccount: (payload: CreateAccountPayload): Promise<Account> =>
    ipcRenderer.invoke('accounts:create', payload),

  // Analytique
  getAnalytics: (fiscalYearId: number): Promise<AnalyticsData> =>
    ipcRenderer.invoke('analytics:get', fiscalYearId),
```

Ajouter les imports dans `preload.ts` :

```typescript
import type { ..., UpdateAccountPayload, CreateAccountPayload, AnalyticsData } from './types';
```

Ajouter dans le type `ElectronAPI` à la fin de `preload.ts` :

```typescript
  updateAccount: (payload: UpdateAccountPayload) => Promise<Account>;
  createAccount: (payload: CreateAccountPayload) => Promise<Account>;
  getAnalytics:  (fiscalYearId: number) => Promise<AnalyticsData>;
```

- [ ] **Step 5 : Mettre à jour `window.d.ts`**

Dans l'interface `Window['api']`, ajouter :

```typescript
      updateAccount: (payload: UpdateAccountPayload) => Promise<Account>;
      createAccount: (payload: CreateAccountPayload) => Promise<Account>;
      getAnalytics:  (fiscalYearId: number) => Promise<AnalyticsData>;
```

Ajouter l'import des nouveaux types en tête de `window.d.ts` :

```typescript
import type {
  // ... types existants ...
  UpdateAccountPayload,
  CreateAccountPayload,
  AnalyticsData,
} from './types';
```

- [ ] **Step 6 : Vérifier que les tests passent**

```
cd app && npm test
```
Attendu : tous les tests passent.

- [ ] **Step 7 : Commit**

```
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts app/src/__tests__/ipc-handlers.test.ts
git commit -m "feat(ipc): handlers accounts:update, accounts:create, analytics:get"
```

---

## Task 4 : `AccountFormModal` + `AccountsPage` enrichie

**Files:**
- Create: `app/src/components/AccountFormModal.tsx`
- Create: `app/src/components/AccountFormModal.module.css`
- Modify: `app/src/pages/AccountsPage.tsx`
- Modify: `app/src/pages/AccountsPage.module.css`
- Create: `app/src/__tests__/renderer/AccountsPage.test.tsx`

**Interfaces:**
- Consumes: `window.api.updateAccount`, `window.api.createAccount` (Task 3), `Account`, `AccountType`, `UpdateAccountPayload`, `CreateAccountPayload` (Task 1)

---

- [ ] **Step 1 : Écrire les tests de la page**

Créer `app/src/__tests__/renderer/AccountsPage.test.tsx` :

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from '../../types';
import AccountsPage from '../../pages/AccountsPage';

const mockAccounts: Account[] = [
  {
    id: 1, number: '100', name: 'Caisse', class: 1, type: 'ACTIF',
    normal_balance: 'DEBIT', description: null, account_group: null,
    must_be_zero_at_closing: false, is_closing_account: false,
    is_active: true, created_at: '',
  },
  {
    id: 2, number: '310', name: 'Vente boissons', class: 3, type: 'PRODUIT',
    normal_balance: 'CREDIT', description: null, account_group: 'boissons',
    must_be_zero_at_closing: false, is_closing_account: false,
    is_active: true, created_at: '',
  },
];

function mockApi(overrides: Partial<Window['api']> = {}) {
  vi.stubGlobal('api', {
    getAccounts:    vi.fn().mockResolvedValue(mockAccounts),
    updateAccount:  vi.fn().mockResolvedValue(mockAccounts[0]),
    createAccount:  vi.fn().mockResolvedValue({ ...mockAccounts[0], id: 30 }),
    ...overrides,
  });
}

beforeEach(() => mockApi());

describe('AccountsPage — affichage', () => {
  it('affiche le titre Plan comptable', async () => {
    render(<AccountsPage />);
    expect(await screen.findByRole('heading', { name: /Plan comptable/ })).toBeInTheDocument();
  });

  it('affiche les comptes chargés', async () => {
    render(<AccountsPage />);
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Vente boissons')).toBeInTheDocument();
  });

  it('affiche le groupe analytique', async () => {
    render(<AccountsPage />);
    expect(await screen.findByText('boissons')).toBeInTheDocument();
  });

  it('affiche un bouton Modifier par compte', async () => {
    render(<AccountsPage />);
    await screen.findByText('Caisse');
    const btns = screen.getAllByRole('button', { name: /Modifier/ });
    expect(btns).toHaveLength(mockAccounts.length);
  });

  it('affiche un bouton "Nouveau compte"', async () => {
    render(<AccountsPage />);
    expect(await screen.findByRole('button', { name: /Nouveau compte/ })).toBeInTheDocument();
  });
});

describe('AccountsPage — édition', () => {
  it('ouvre la modale d\'édition au clic sur Modifier', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click((await screen.findAllByRole('button', { name: /Modifier/ }))[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Caisse')).toBeInTheDocument();
  });

  it('appelle updateAccount à la soumission de l\'édition', async () => {
    const updateAccount = vi.fn().mockResolvedValue(mockAccounts[0]);
    mockApi({ updateAccount });
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click((await screen.findAllByRole('button', { name: /Modifier/ }))[0]);
    const input = screen.getByLabelText(/Libellé/);
    await user.clear(input);
    await user.type(input, 'Caisse principale');
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalled());
  });
});

describe('AccountsPage — création', () => {
  it('ouvre la modale de création au clic sur Nouveau compte', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click(await screen.findByRole('button', { name: /Nouveau compte/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/Numéro/)).toBeInTheDocument();
  });

  it('appelle createAccount à la soumission', async () => {
    const createAccount = vi.fn().mockResolvedValue({ ...mockAccounts[0], id: 30 });
    mockApi({ createAccount });
    const user = userEvent.setup();
    render(<AccountsPage />);
    await user.click(await screen.findByRole('button', { name: /Nouveau compte/ }));
    await user.type(screen.getByLabelText(/Numéro/), '395');
    await user.type(screen.getByLabelText(/Libellé/), 'Intérêts');
    await user.selectOptions(screen.getByLabelText(/Type/), 'PRODUIT');
    await user.click(screen.getByRole('button', { name: /Créer/ }));
    await waitFor(() => expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ number: '395', name: 'Intérêts', type: 'PRODUIT' })
    ));
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test 2>&1 | grep -E "FAIL|AccountsPage"
```
Attendu : FAIL — AccountsPage manque de fonctionnalités.

- [ ] **Step 3 : Créer `AccountFormModal.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 10px;
  padding: 1.5rem;
  width: 480px;
  max-width: 95vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
}

.h2 {
  margin: 0 0 1.25rem;
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-bottom: 0.75rem;
}

.label {
  font-size: 0.8rem;
  font-weight: 500;
  color: #475569;
}

.input, .select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  font-size: 0.875rem;
  color: #0f172a;
  background: #fff;
}

.readOnly {
  background: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  font-size: 0.875rem;
}

.deduced {
  font-size: 0.8rem;
  color: #64748b;
  font-style: italic;
  padding: 0.2rem 0;
}

.checkboxRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #334155;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.cancelBtn {
  padding: 0.45rem 1rem;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #475569;
}

.cancelBtn:hover { background: #f1f5f9; }

.submitBtn {
  padding: 0.45rem 1rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.submitBtn:hover    { background: #2563eb; }
.submitBtn:disabled { background: #94a3b8; cursor: not-allowed; }
```

- [ ] **Step 4 : Créer `AccountFormModal.tsx`**

```typescript
import { useState } from 'react';
import type { Account, AccountType, UpdateAccountPayload, CreateAccountPayload } from '../types';
import styles from './AccountFormModal.module.css';

const ACCOUNT_TYPES: AccountType[] = ['ACTIF', 'PASSIF', 'FONDS_PROPRES', 'PRODUIT', 'CHARGE'];

function normalBalanceLabel(type: AccountType): string {
  return (type === 'ACTIF' || type === 'CHARGE') ? 'DÉBIT' : 'CRÉDIT';
}

interface Props {
  account?:       Account;         // undefined = mode création
  existingGroups: string[];        // pour le datalist autocomplete
  onClose:        () => void;
  onSaved:        () => void;
}

export default function AccountFormModal({ account, existingGroups, onClose, onSaved }: Props) {
  const isEdit = account !== undefined;

  const [name,         setName]         = useState(account?.name ?? '');
  const [number,       setNumber]       = useState(account?.number ?? '');
  const [type,         setType]         = useState<AccountType>(account?.type ?? 'PRODUIT');
  const [description,  setDescription]  = useState(account?.description ?? '');
  const [accountGroup, setAccountGroup] = useState(account?.account_group ?? '');
  const [isActive,     setIsActive]     = useState(account?.is_active ?? true);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const canSubmit = name.trim() !== '' && (isEdit || number.trim() !== '') && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit) {
        const payload: UpdateAccountPayload = {
          id: account!.id,
          name:          name.trim(),
          description:   description.trim() || undefined,
          account_group: accountGroup.trim() || null,
          is_active:     isActive,
        };
        await window.api.updateAccount(payload);
      } else {
        const payload: CreateAccountPayload = {
          number:        number.trim(),
          name:          name.trim(),
          type,
          description:   description.trim() || undefined,
          account_group: accountGroup.trim() || null,
        };
        await window.api.createAccount(payload);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.h2}>
          {isEdit ? `Modifier — ${account!.number} ${account!.name}` : 'Nouveau compte'}
        </h2>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {!isEdit && (
            <div className={styles.field}>
              <label htmlFor="acc-number" className={styles.label}>Numéro *</label>
              <input
                id="acc-number"
                type="text"
                value={number}
                onChange={e => setNumber(e.target.value)}
                placeholder="Ex. : 395"
                required
                className={styles.input}
              />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="acc-name" className={styles.label}>Libellé *</label>
            <input
              id="acc-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className={styles.input}
            />
          </div>

          {!isEdit ? (
            <div className={styles.field}>
              <label htmlFor="acc-type" className={styles.label}>Type *</label>
              <select
                id="acc-type"
                value={type}
                onChange={e => setType(e.target.value as AccountType)}
                className={styles.select}
              >
                {ACCOUNT_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span className={styles.deduced}>
                Solde normal déduit : {normalBalanceLabel(type)}
              </span>
            </div>
          ) : (
            <div className={styles.field}>
              <span className={styles.label}>Type</span>
              <span className={styles.readOnly}>{account!.type}</span>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="acc-group" className={styles.label}>Groupe analytique</label>
            <input
              id="acc-group"
              type="text"
              list="groups-list"
              value={accountGroup}
              onChange={e => setAccountGroup(e.target.value)}
              placeholder="Ex. : boissons, marche, broche"
              className={styles.input}
            />
            <datalist id="groups-list">
              {existingGroups.map(g => <option key={g} value={g} />)}
            </datalist>
          </div>

          <div className={styles.field}>
            <label htmlFor="acc-desc" className={styles.label}>Description</label>
            <input
              id="acc-desc"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={styles.input}
            />
          </div>

          {isEdit && (
            <div className={styles.field}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={!!isActive}
                  onChange={e => setIsActive(e.target.checked)}
                />
                Compte actif
              </label>
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Annuler</button>
            <button type="submit" disabled={!canSubmit} className={styles.submitBtn}>
              {submitting ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5 : Mettre à jour `AccountsPage.module.css`**

Ajouter à la fin :

```css
.topBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.newBtn {
  padding: 0.45rem 1rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.newBtn:hover { background: #2563eb; }

.editBtn {
  padding: 0.2rem 0.6rem;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
}

.editBtn:hover { background: #e2e8f0; }

.inactive { opacity: 0.45; }

.groupTag {
  font-size: 0.75rem;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 4px;
  padding: 0.1rem 0.45rem;
}
```

- [ ] **Step 6 : Réécrire `AccountsPage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import type { Account } from '../types';
import AccountFormModal from '../components/AccountFormModal';
import styles from './AccountsPage.module.css';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const [modal,    setModal]    = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);

  function load() {
    window.api.getAccounts()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  function openEdit(acc: Account) {
    setSelected(acc);
    setModal('edit');
  }

  function openCreate() {
    setSelected(null);
    setModal('create');
  }

  function handleSaved() {
    setModal(null);
    load();
  }

  const existingGroups = [...new Set(
    accounts.map(a => a.account_group).filter(Boolean) as string[]
  )].sort();

  return (
    <div>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Plan comptable</h1>
        <button onClick={openCreate} className={styles.newBtn}>+ Nouveau compte</button>
      </div>

      {error && <div className={styles.error}>Erreur : {error}</div>}

      <p className={styles.subtitle}>{accounts.length} comptes</p>

      <table className={styles.table}>
        <thead>
          <tr className={styles.theadRow}>
            <th className={styles.th}>N°</th>
            <th className={styles.th}>Intitulé</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Balance</th>
            <th className={styles.th}>Groupe analytique</th>
            <th className={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id} className={`${styles.row} ${!a.is_active ? styles.inactive : ''}`}>
              <td className={styles.td}><code>{a.number}</code></td>
              <td className={styles.td}>{a.name}</td>
              <td className={styles.td}><span className={styles.badge}>{a.type}</span></td>
              <td className={styles.td}><span className={styles.badge}>{a.normal_balance}</span></td>
              <td className={styles.td}>
                {a.account_group && (
                  <span className={styles.groupTag}>{a.account_group}</span>
                )}
              </td>
              <td className={styles.td}>
                <button
                  onClick={() => openEdit(a)}
                  className={styles.editBtn}
                  aria-label={`Modifier ${a.name}`}
                >
                  Modifier
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal !== null && (
        <AccountFormModal
          account={modal === 'edit' ? selected ?? undefined : undefined}
          existingGroups={existingGroups}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 7 : Vérifier que les tests passent**

```
cd app && npm test
```
Attendu : tous les tests passent.

- [ ] **Step 8 : Commit**

```
git add app/src/components/AccountFormModal.tsx app/src/components/AccountFormModal.module.css \
        app/src/pages/AccountsPage.tsx app/src/pages/AccountsPage.module.css \
        app/src/__tests__/renderer/AccountsPage.test.tsx
git commit -m "feat(accounts): page plan comptable éditable + modale create/edit"
```

---

## Task 5 : `AnalyticsPage`

**Files:**
- Create: `app/src/pages/AnalyticsPage.tsx`
- Create: `app/src/pages/AnalyticsPage.module.css`
- Create: `app/src/__tests__/renderer/AnalyticsPage.test.tsx`

**Interfaces:**
- Consumes: `window.api.getAnalytics`, `window.api.getFiscalYears` (Task 3)
- Consumes: `AnalyticsData`, `AnalyticsGroup`, `AnalyticsAccountRow`, `FiscalYear` (Task 1)

---

- [ ] **Step 1 : Écrire les tests**

Créer `app/src/__tests__/renderer/AnalyticsPage.test.tsx` :

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, AnalyticsData } from '../../types';
import AnalyticsPage from '../../pages/AnalyticsPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '', hasOpeningBalance: false,
};

const analyticsFixture: AnalyticsData = {
  groups: [
    {
      name: 'boissons',
      accounts: [
        { id: 2, number: '310', name: 'Vente boissons', type: 'PRODUIT', recettes: 35000, charges: 0 },
        { id: 3, number: '411', name: 'Achats boissons', type: 'CHARGE', recettes: 0, charges: 18000 },
      ],
      totalRecettes: 35000,
      totalCharges:  18000,
      resultat:      17000,
    },
  ],
  ungrouped: [
    { id: 4, number: '490', name: 'Charges diverses', type: 'CHARGE', recettes: 0, charges: 4500 },
  ],
};

function mockApi(data: AnalyticsData = { groups: [], ungrouped: [] }) {
  vi.stubGlobal('api', {
    getFiscalYears: vi.fn().mockResolvedValue([fy2025]),
    getAnalytics:   vi.fn().mockResolvedValue(data),
  });
}

beforeEach(() => mockApi());

describe('AnalyticsPage — affichage', () => {
  it('affiche le titre Analytique', async () => {
    render(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: /Analytique/ })).toBeInTheDocument();
  });

  it('affiche un message vide sans exercice', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getAnalytics:   vi.fn().mockResolvedValue({ groups: [], ungrouped: [] }),
    });
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Aucun exercice/)).toBeInTheDocument();
  });

  it('affiche un groupe analytique avec son résultat', async () => {
    mockApi(analyticsFixture);
    render(<AnalyticsPage />);
    expect(await screen.findByText('boissons')).toBeInTheDocument();
    expect(screen.getByText('350.00')).toBeInTheDocument();  // recettes 35000 centimes
    expect(screen.getByText('180.00')).toBeInTheDocument();  // charges  18000 centimes
    expect(screen.getByText('170.00')).toBeInTheDocument();  // résultat 17000 centimes
  });

  it('affiche la section Non groupés', async () => {
    mockApi(analyticsFixture);
    render(<AnalyticsPage />);
    expect(await screen.findByText(/Non groupés/)).toBeInTheDocument();
    expect(screen.getByText('Charges diverses')).toBeInTheDocument();
  });

  it('ne montre pas la section Non groupés si tous les comptes sont groupés', async () => {
    mockApi({ groups: analyticsFixture.groups, ungrouped: [] });
    render(<AnalyticsPage />);
    await screen.findByText('boissons');
    expect(screen.queryByText(/Non groupés/)).not.toBeInTheDocument();
  });

  it('recharge les données au changement d\'exercice', async () => {
    const fy2: FiscalYear = { ...fy2025, id: 2, year: 2024, is_closed: true };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([fy2025, fy2]),
      getAnalytics:   vi.fn().mockResolvedValue({ groups: [], ungrouped: [] }),
    });
    const user = userEvent.setup();
    render(<AnalyticsPage />);
    await screen.findByRole('combobox');
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await waitFor(() => {
      expect(window.api.getAnalytics).toHaveBeenCalledWith(2);
    });
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test 2>&1 | grep -E "FAIL|AnalyticsPage"
```
Attendu : FAIL — page inexistante.

- [ ] **Step 3 : Créer `AnalyticsPage.module.css`**

```css
.header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}

.yearSelector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.label {
  font-size: 0.8rem;
  font-weight: 500;
  color: #475569;
}

.select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.875rem;
  color: #0f172a;
}

.empty {
  color: #64748b;
  font-size: 0.875rem;
  padding: 1rem 0;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.5rem;
}

.theadRow {
  border-bottom: 2px solid #e2e8f0;
}

.th {
  text-align: left;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.thRight {
  text-align: right;
}

.groupRow {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.groupCell {
  padding: 0.5rem 0.75rem;
  font-weight: 600;
  color: #334155;
  font-size: 0.875rem;
}

.dataRow:hover { background: #f1f5f9; }

.td {
  padding: 0.35rem 0.75rem;
  font-size: 0.875rem;
  color: #334155;
}

.tdMono {
  font-family: monospace;
  font-size: 0.8rem;
  color: #64748b;
}

.tdRight {
  text-align: right;
  font-family: monospace;
}

.totalRow {
  border-top: 2px solid #e2e8f0;
  font-weight: 600;
}

.totalCell {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  text-align: right;
  font-family: monospace;
}

.totalLabel {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  font-style: italic;
  color: #64748b;
}

[data-negative] { color: #dc2626; }

.sectionTitle {
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
  margin: 1.5rem 0 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #e2e8f0;
}
```

- [ ] **Step 4 : Créer `AnalyticsPage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import type { FiscalYear, AnalyticsData, AnalyticsGroup, AnalyticsAccountRow } from '../types';
import styles from './AnalyticsPage.module.css';

function fmt(centimes: number): string {
  return (centimes / 100).toFixed(2);
}

export default function AnalyticsPage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [data,           setData]           = useState<AnalyticsData | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    window.api.getFiscalYears()
      .then(ys => {
        setYears(ys);
        const open = ys.find(y => !y.is_closed);
        if (open)           setSelectedYearId(open.id);
        else if (ys.length) setSelectedYearId(ys[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedYearId === null) return;
    setLoading(true);
    window.api.getAnalytics(selectedYearId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  const grandTotalRecettes = data?.groups.reduce((s, g) => s + g.totalRecettes, 0) ?? 0;
  const grandTotalCharges  = data?.groups.reduce((s, g) => s + g.totalCharges,  0) ?? 0;
  const grandResultat      = grandTotalRecettes - grandTotalCharges;

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.h1}>Analytique</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="year-select" className={styles.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYearId ?? ''}
              onChange={e => setSelectedYearId(Number(e.target.value))}
              className={styles.select}
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>
                  {y.year}{y.is_closed ? ' (clôturé)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error   && <div role="alert" className={styles.error}>Erreur : {error}</div>}
      {loading && <p className={styles.empty}>Chargement…</p>}

      {years.length === 0 ? (
        <p className={styles.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : data && !loading && (
        <>
          {data.groups.length === 0 && data.ungrouped.length === 0 ? (
            <p className={styles.empty}>Aucun mouvement sur les comptes de résultat pour cet exercice.</p>
          ) : (
            <>
              {data.groups.length > 0 && (
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.theadRow}>
                      <th className={styles.th}>Groupe Analytique</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Recettes CHF</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Charges CHF</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Résultat CHF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map(g => (
                      <GroupRow key={g.name} group={g} />
                    ))}
                    <tr className={styles.totalRow}>
                      <td className={styles.totalLabel}>Total groupes</td>
                      <td className={styles.totalCell}>{fmt(grandTotalRecettes)}</td>
                      <td className={styles.totalCell}>{fmt(grandTotalCharges)}</td>
                      <td
                        className={styles.totalCell}
                        data-negative={grandResultat < 0 || undefined}
                      >
                        {fmt(grandResultat)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {data.ungrouped.length > 0 && (
                <>
                  <h2 className={styles.sectionTitle}>Non groupés</h2>
                  <table className={styles.table}>
                    <thead>
                      <tr className={styles.theadRow}>
                        <th className={styles.th}>N°</th>
                        <th className={styles.th}>Compte</th>
                        <th className={`${styles.th} ${styles.thRight}`}>Recettes CHF</th>
                        <th className={`${styles.th} ${styles.thRight}`}>Charges CHF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ungrouped.map(r => (
                        <UngroupedRow key={r.id} row={r} />
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function GroupRow({ group }: { group: AnalyticsGroup }) {
  return (
    <tr className={styles.dataRow}>
      <td className={styles.td}>{group.name}</td>
      <td className={`${styles.td} ${styles.tdRight}`}>{fmt(group.totalRecettes)}</td>
      <td className={`${styles.td} ${styles.tdRight}`}>{fmt(group.totalCharges)}</td>
      <td
        className={`${styles.td} ${styles.tdRight}`}
        data-negative={group.resultat < 0 || undefined}
      >
        {fmt(group.resultat)}
      </td>
    </tr>
  );
}

function UngroupedRow({ row }: { row: AnalyticsAccountRow }) {
  return (
    <tr className={styles.dataRow}>
      <td className={`${styles.td} ${styles.tdMono}`}>{row.number}</td>
      <td className={styles.td}>{row.name}</td>
      <td className={`${styles.td} ${styles.tdRight}`}>
        {row.recettes > 0 ? fmt(row.recettes) : '—'}
      </td>
      <td className={`${styles.td} ${styles.tdRight}`}>
        {row.charges > 0 ? fmt(row.charges) : '—'}
      </td>
    </tr>
  );
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```
cd app && npm test
```
Attendu : tous les tests passent.

- [ ] **Step 6 : Commit**

```
git add app/src/pages/AnalyticsPage.tsx app/src/pages/AnalyticsPage.module.css \
        app/src/__tests__/renderer/AnalyticsPage.test.tsx
git commit -m "feat(analytics): page Analytique — P&L par groupe + section Non groupés"
```

---

## Task 6 : Navigation sidebar + App.tsx

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `AnalyticsPage` (Task 5)

---

- [ ] **Step 1 : Mettre à jour `App.tsx`**

```typescript
import AnalyticsPage from './pages/AnalyticsPage';

export type Page = 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'analytics' | 'settings' | 'welcome';

// Dans renderPage() :
case 'analytics': return <AnalyticsPage />;
```

- [ ] **Step 2 : Mettre à jour `Sidebar.tsx`**

```typescript
const NAV_ITEMS: Array<{ id: Page; label: string }> = [
  { id: 'accounts',     label: 'Plan comptable' },
  { id: 'journal',      label: 'Journal'        },
  { id: 'fiscal-years', label: 'Exercices'      },
  { id: 'balances',     label: 'Soldes'         },
  { id: 'analytics',    label: 'Analytique'     },
  { id: 'settings',     label: 'Paramètres'     },
];
```

- [ ] **Step 3 : Vérifier que tous les tests passent**

```
cd app && npm test
```
Attendu : tous les tests passent.

- [ ] **Step 4 : Lancer l'app et vérifier manuellement**

```
cd app && npm start
```

Vérifier :
- "Analytique" apparaît dans la sidebar entre Soldes et Paramètres
- Plan comptable → boutons "Modifier" présents, "Nouveau compte" fonctionne
- Analytique → affiche les groupes et la section Non groupés
- Assigner un groupe dans "Plan comptable" → visible dans "Analytique"

- [ ] **Step 5 : Commit**

```
git add app/src/App.tsx app/src/components/Sidebar.tsx
git commit -m "feat(nav): ajouter page Analytique dans la sidebar"
```

---

## Mise à jour CLAUDE.md

Après tous les tests verts et la vérification manuelle, mettre à jour `CLAUDE.md` :

- Ajouter à l'État d'avancement la ligne avec le nombre de tests final
- Mettre à jour la section "Notes techniques actives" si nécessaire
- Commit séparé : `docs: mettre à jour CLAUDE.md — analytique + plan comptable`
