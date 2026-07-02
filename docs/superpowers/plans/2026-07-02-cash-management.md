# Gestion de la caisse — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la page Caisse avec arrêtés de caisse physiques (Level 1) et l'infrastructure Level 2 (sessions de manifestation, handlers sans UI).

**Architecture:** Migration SQLite v3 (3 tables), 7 handlers IPC `cash:*`, composant `CashCountModal` avec grille bidirectionnelle Qté↔Total sur 12 coupures CHF, page `CaissePage` avec onglets Arrêtés / Manifestations (placeholder Level 2), entrée sidebar "Caisse" entre Journal et Exercices.

**Tech Stack:** React, TypeScript, better-sqlite3, Vitest, React Testing Library, CSS Modules, Lucide React

## Global Constraints

- Branche active : `feature/cash-management` (déjà créée depuis `main`)
- Montants en centimes (INTEGER) — `formatCHF(centimes)` pour l'affichage
- CSS Modules obligatoires — zéro `style={{...}}` dans les composants
- Modales via `Modal.tsx` comme racine — jamais de `.overlay` dans un CSS module propre
- `window.confirm` banni — utiliser `ConfirmDialog` pour les confirmations destructives
- Icônes Lucide React sur tous les boutons d'action (icône + texte dans un `flex` row)
- Toasts pour les retours utilisateur : succès vert 2.5 s, erreur rouge 6 s
- TDD : écrire les tests avant l'implémentation, les faire passer, commiter
- `npm test` dans `app/` pour lancer Vitest (commande : `npm test -- --reporter=verbose <fichier>` pour cibler un fichier)

---

### Task 1 — Types, constantes cash, migration v3, fonctions DB

**Files:**
- Modify: `app/src/types/index.ts`
- Create: `app/src/lib/cash.ts`
- Modify: `app/src/db/schema-migrations.ts`
- Modify: `app/src/db/index.ts`
- Create: `app/src/main/__tests__/cash.test.ts`

**Interfaces:**
- Produit : `CashContext`, `CashCountLine`, `CashCount`, `CashSession`, `CashCountPayload`, `CashSessionPayload` dans `types/index.ts`
- Produit : `DENOMINATIONS`, `PIECES`, `BILLETS`, `formatDenom()`, `emptyLines()` dans `lib/cash.ts`
- Produit : `createCashCount`, `getCashCounts`, `getCashCountById`, `deleteCashCount`, `createCashSession`, `getCashSessions`, `deleteCashSession` dans `db/index.ts`

- [ ] **Étape 1 : Écrire les tests migration (fichier vide, ils vont échouer)**

Créer `app/src/main/__tests__/cash.test.ts` :

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/mcy-test') },
}));

import {
  openDatabase,
  getAllAccounts,
  createFiscalYear,
  createJournalEntry,
} from '../../db';
import type { CashCountPayload, CashSessionPayload } from '../../types';

function freshDb() { openDatabase(':memory:'); }

// ── Migration ────────────────────────────────────────────────────────────────

describe('Migration v3 — tables cash', () => {
  beforeEach(freshDb);

  it('crée les tables cash_sessions, cash_counts, cash_count_lines', () => {
    const db = openDatabase(':memory:');
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cash_%'"
    ).all() as { name: string }[];
    expect(tables.map(t => t.name).sort()).toEqual([
      'cash_count_lines', 'cash_counts', 'cash_sessions',
    ]);
  });

  it('schema version est 3', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(3);
  });
});
```

- [ ] **Étape 2 : Vérifier que les tests échouent**

```
cd app && npm test -- --reporter=verbose src/main/__tests__/cash.test.ts
```

Attendu : FAIL — `cash_sessions` introuvable ou version != 3.

- [ ] **Étape 3 : Ajouter les types dans `app/src/types/index.ts`**

Ajouter à la fin du fichier (avant le dernier `export`) :

```typescript
// ─── Caisse ────────────────────────────────────────────────────────────────

export type CashContext = 'AVANT' | 'FONDS' | 'APRES' | 'LIBRE';

export interface CashCountLine {
  denomination: number; // centimes : 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000
  quantity: number;
}

export interface CashCount {
  id: number;
  fiscal_year_id: number;
  session_id: number | null;
  session_label: string | null;   // from JOIN cash_sessions
  date: string;                   // ISO 8601
  label: string;
  context: CashContext;
  notes: string | null;
  total: number;                  // centimes — SUM(denomination * quantity)
  theoretical_balance: number;    // centimes — solde compte 100 à cette date
  created_at: string;
  lines?: CashCountLine[];        // présent uniquement dans getCashCountById
}

export interface CashSession {
  id: number;
  fiscal_year_id: number;
  label: string;
  account_group: string | null;
  notes: string | null;
  created_at: string;
}

export interface CashCountPayload {
  fiscal_year_id: number;
  session_id?: number;
  date: string;
  label: string;
  context: CashContext;
  notes?: string;
  lines: CashCountLine[];         // 12 lignes, quantity peut être 0
}

export interface CashSessionPayload {
  fiscal_year_id: number;
  label: string;
  account_group?: string;
  notes?: string;
}
```

- [ ] **Étape 4 : Créer `app/src/lib/cash.ts`**

```typescript
export const DENOMINATIONS = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

export const PIECES  = DENOMINATIONS.filter(d => d < 1000)  as readonly number[];
export const BILLETS = DENOMINATIONS.filter(d => d >= 1000) as readonly number[];

/** Denomination en centimes → libellé affiché "0.05 CHF", "1.00 CHF", "200.00 CHF" */
export function formatDenom(cents: number): string {
  return (cents / 100).toFixed(2) + ' CHF';
}

/** Retourne 12 lignes vides (qty = 0) pour un nouvel arrêté */
export function emptyLines(): Array<{ denomination: number; quantity: number }> {
  return DENOMINATIONS.map(d => ({ denomination: d, quantity: 0 }));
}
```

- [ ] **Étape 5 : Ajouter migration v3 dans `app/src/db/schema-migrations.ts`**

Dans le tableau `MIGRATIONS`, après l'entrée `version: 2`, ajouter :

```typescript
  {
    version: 3,
    description: 'Tables gestion de la caisse (cash_sessions, cash_counts, cash_count_lines)',
    sql: `
CREATE TABLE cash_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  label          TEXT    NOT NULL,
  account_group  TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE cash_counts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  session_id     INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
  date           TEXT    NOT NULL,
  label          TEXT    NOT NULL,
  context        TEXT    NOT NULL DEFAULT 'LIBRE',
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (context IN ('AVANT','FONDS','APRES','LIBRE'))
);
CREATE TABLE cash_count_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_count_id INTEGER NOT NULL REFERENCES cash_counts(id) ON DELETE CASCADE,
  denomination  INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 0,
  CHECK (denomination > 0),
  CHECK (quantity >= 0)
);
CREATE INDEX idx_cash_counts_fiscal_year ON cash_counts(fiscal_year_id);
CREATE INDEX idx_cash_counts_session     ON cash_counts(session_id);
CREATE INDEX idx_cash_count_lines_count  ON cash_count_lines(cash_count_id);
    `.trim(),
  },
```

- [ ] **Étape 6 : Vérifier que les tests migration passent**

```
cd app && npm test -- --reporter=verbose src/main/__tests__/cash.test.ts
```

Attendu : 2 tests PASS.

- [ ] **Étape 7 : Écrire les tests CRUD DB (failing)**

Compléter `app/src/main/__tests__/cash.test.ts` en ajoutant après les imports :

```typescript
import {
  createCashCount, getCashCounts, getCashCountById, deleteCashCount,
  createCashSession, getCashSessions, deleteCashSession,
} from '../../db';
import { emptyLines } from '../../lib/cash';
```

Puis ajouter les `describe` suivants après le bloc Migration :

```typescript
// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFiscalYear(): number {
  return createFiscalYear(2025).id;
}

function makeEntry100(fyId: number, amountCents: number, date: string) {
  const accounts = getAllAccounts();
  const c100 = accounts.find(a => a.number === '100')!;
  const c290 = accounts.find(a => a.number === '290')!;
  createJournalEntry({
    fiscal_year_id: fyId, date, description: 'Seed',
    lines: [
      { account_id: c100.id, debit: amountCents },
      { account_id: c290.id, credit: amountCents },
    ],
  });
}

// ── createCashCount ───────────────────────────────────────────────────────────

describe('createCashCount', () => {
  beforeEach(freshDb);

  it('persiste 12 lignes et calcule le total', () => {
    const fyId = makeFiscalYear();
    const lines = emptyLines();
    lines[4].quantity = 38; // 100 centimes × 38 = 3 800 centimes
    const count = createCashCount({
      fiscal_year_id: fyId, date: '2025-03-08',
      label: 'Test arrêté', context: 'LIBRE', lines,
    });
    expect(count.label).toBe('Test arrêté');
    expect(count.context).toBe('LIBRE');
    expect(count.total).toBe(3800);
    expect(count.lines).toHaveLength(12);
    expect(count.lines!.find(l => l.denomination === 100)!.quantity).toBe(38);
  });

  it('theoretical_balance reflète les écritures du compte 100', () => {
    const fyId = makeFiscalYear();
    makeEntry100(fyId, 500000, '2025-01-01'); // 5 000 CHF
    const count = createCashCount({
      fiscal_year_id: fyId, date: '2025-01-01',
      label: 'Début', context: 'LIBRE', lines: emptyLines(),
    });
    expect(count.theoretical_balance).toBe(500000);
  });

  it("theoretical_balance exclut les écritures postérieures à la date", () => {
    const fyId = makeFiscalYear();
    makeEntry100(fyId, 500000, '2025-01-01');
    makeEntry100(fyId, 200000, '2025-03-15'); // après la date du count
    const count = createCashCount({
      fiscal_year_id: fyId, date: '2025-01-31',
      label: 'Janvier', context: 'LIBRE', lines: emptyLines(),
    });
    expect(count.theoretical_balance).toBe(500000);
  });
});

// ── getCashCounts ─────────────────────────────────────────────────────────────

describe('getCashCounts', () => {
  beforeEach(freshDb);

  it('retourne les arrêtés triés par date décroissante', () => {
    const fyId = makeFiscalYear();
    createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'A', context: 'LIBRE', lines: emptyLines() });
    createCashCount({ fiscal_year_id: fyId, date: '2025-03-08', label: 'B', context: 'AVANT', lines: emptyLines() });
    const counts = getCashCounts(fyId);
    expect(counts).toHaveLength(2);
    expect(counts[0].label).toBe('B');
    expect(counts[1].label).toBe('A');
  });

  it('ne retourne pas les arrêtés des autres exercices', () => {
    const fy1 = makeFiscalYear();
    createFiscalYear(2026);
    const fy2 = getAllFiscalYears().find(f => f.year === 2026)!.id;
    createCashCount({ fiscal_year_id: fy1, date: '2025-01-01', label: 'FY1', context: 'LIBRE', lines: emptyLines() });
    createCashCount({ fiscal_year_id: fy2, date: '2026-01-01', label: 'FY2', context: 'LIBRE', lines: emptyLines() });
    expect(getCashCounts(fy1)).toHaveLength(1);
    expect(getCashCounts(fy2)).toHaveLength(1);
  });
});

// ── getCashCountById ─────────────────────────────────────────────────────────

describe('getCashCountById', () => {
  beforeEach(freshDb);

  it('retourne le count avec ses lignes', () => {
    const fyId = makeFiscalYear();
    const c = createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'X', context: 'LIBRE', lines: emptyLines() });
    const byId = getCashCountById(c.id);
    expect(byId.id).toBe(c.id);
    expect(byId.lines).toHaveLength(12);
  });

  it('lève une erreur si l\'id est introuvable', () => {
    openDatabase(':memory:');
    expect(() => getCashCountById(999)).toThrow('introuvable');
  });
});

// ── deleteCashCount ───────────────────────────────────────────────────────────

describe('deleteCashCount', () => {
  beforeEach(freshDb);

  it('supprime le count et ses lignes (CASCADE)', () => {
    const fyId = makeFiscalYear();
    const c = createCashCount({ fiscal_year_id: fyId, date: '2025-01-01', label: 'X', context: 'LIBRE', lines: emptyLines() });
    deleteCashCount(c.id);
    expect(getCashCounts(fyId)).toHaveLength(0);
    const db = openDatabase(':memory:');
    const lines = db.prepare('SELECT * FROM cash_count_lines WHERE cash_count_id = ?').all(c.id);
    expect(lines).toHaveLength(0);
  });
});

// ── Sessions Level 2 ─────────────────────────────────────────────────────────

describe('CashSession CRUD', () => {
  beforeEach(freshDb);

  it('crée et liste une session', () => {
    const fyId = makeFiscalYear();
    const s = createCashSession({ fiscal_year_id: fyId, label: 'Marché 2025' });
    expect(s.label).toBe('Marché 2025');
    expect(getCashSessions(fyId)).toHaveLength(1);
  });

  it('supprime une session — les counts gardent session_id NULL', () => {
    const fyId = makeFiscalYear();
    const s = createCashSession({ fiscal_year_id: fyId, label: 'Marché' });
    const c = createCashCount({
      fiscal_year_id: fyId, date: '2025-01-01', label: 'Avant',
      context: 'AVANT', session_id: s.id, lines: emptyLines(),
    });
    deleteCashSession(s.id);
    expect(getCashCountById(c.id).session_id).toBeNull();
    expect(getCashCountById(c.id).session_label).toBeNull();
  });
});
```

Aussi ajouter l'import manquant en haut du fichier :
```typescript
import { getAllFiscalYears } from '../../db';
```

- [ ] **Étape 8 : Vérifier que les tests CRUD échouent (fonctions manquantes)**

```
cd app && npm test -- --reporter=verbose src/main/__tests__/cash.test.ts
```

Attendu : FAIL — `createCashCount is not a function`.

- [ ] **Étape 9 : Implémenter les fonctions DB dans `app/src/db/index.ts`**

Ajouter l'import en tête du fichier :
```typescript
import type {
  // ... imports existants ...
  CashCount, CashCountLine, CashSession,
  CashCountPayload, CashSessionPayload,
} from '../types';
```

Ajouter en fin de fichier, avant les exports existants :

```typescript
// ─── Caisse ────────────────────────────────────────────────────────────────

const CASH_COUNT_SELECT = `
  SELECT
    cc.id,
    cc.fiscal_year_id,
    cc.session_id,
    cs.label      AS session_label,
    cc.date,
    cc.label,
    cc.context,
    cc.notes,
    cc.created_at,
    COALESCE((SELECT SUM(denomination * quantity)
              FROM cash_count_lines WHERE cash_count_id = cc.id), 0) AS total,
    COALESCE((
      SELECT SUM(COALESCE(jel.debit,0)) - SUM(COALESCE(jel.credit,0))
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounts a         ON a.id  = jel.account_id
      WHERE a.number = '100'
        AND je.fiscal_year_id = cc.fiscal_year_id
        AND je.date <= cc.date
    ), 0) AS theoretical_balance
  FROM cash_counts cc
  LEFT JOIN cash_sessions cs ON cs.id = cc.session_id
`;

export function getCashCounts(fiscalYearId: number): CashCount[] {
  return getDb().prepare(`
    ${CASH_COUNT_SELECT}
    WHERE cc.fiscal_year_id = ?
    ORDER BY cc.date DESC, cc.created_at DESC
  `).all(fiscalYearId) as CashCount[];
}

export function getCashCountById(id: number): CashCount {
  const row = getDb().prepare(`
    ${CASH_COUNT_SELECT} WHERE cc.id = ?
  `).get(id) as CashCount | undefined;
  if (!row) throw new Error(`Arrêté de caisse ${id} introuvable`);
  const lines = getDb().prepare(
    'SELECT denomination, quantity FROM cash_count_lines WHERE cash_count_id = ? ORDER BY denomination'
  ).all(id) as CashCountLine[];
  return { ...row, lines };
}

export function createCashCount(payload: CashCountPayload): CashCount {
  const { fiscal_year_id, session_id, date, label, context, notes, lines } = payload;
  return getDb().transaction((): CashCount => {
    const r = getDb().prepare(`
      INSERT INTO cash_counts (fiscal_year_id, session_id, date, label, context, notes)
      VALUES (@fiscal_year_id, @session_id, @date, @label, @context, @notes)
    `).run({
      fiscal_year_id, session_id: session_id ?? null,
      date, label, context, notes: notes ?? null,
    });
    const stmt = getDb().prepare(`
      INSERT INTO cash_count_lines (cash_count_id, denomination, quantity)
      VALUES (@cash_count_id, @denomination, @quantity)
    `);
    for (const l of lines) {
      stmt.run({ cash_count_id: r.lastInsertRowid, denomination: l.denomination, quantity: l.quantity });
    }
    return getCashCountById(Number(r.lastInsertRowid));
  })();
}

export function deleteCashCount(id: number): void {
  getDb().prepare('DELETE FROM cash_counts WHERE id = ?').run(id);
}

export function getCashSessions(fiscalYearId: number): CashSession[] {
  return getDb().prepare(`
    SELECT id, fiscal_year_id, label, account_group, notes, created_at
    FROM cash_sessions WHERE fiscal_year_id = ? ORDER BY created_at DESC
  `).all(fiscalYearId) as CashSession[];
}

export function createCashSession(payload: CashSessionPayload): CashSession {
  const { fiscal_year_id, label, account_group, notes } = payload;
  const r = getDb().prepare(`
    INSERT INTO cash_sessions (fiscal_year_id, label, account_group, notes)
    VALUES (@fiscal_year_id, @label, @account_group, @notes)
  `).run({ fiscal_year_id, label, account_group: account_group ?? null, notes: notes ?? null });
  return getDb().prepare(
    'SELECT id, fiscal_year_id, label, account_group, notes, created_at FROM cash_sessions WHERE id = ?'
  ).get(r.lastInsertRowid) as CashSession;
}

export function deleteCashSession(id: number): void {
  getDb().prepare('DELETE FROM cash_sessions WHERE id = ?').run(id);
}
```

- [ ] **Étape 10 : Vérifier que tous les tests passent**

```
cd app && npm test -- --reporter=verbose src/main/__tests__/cash.test.ts
```

Attendu : ~14 tests PASS.

- [ ] **Étape 11 : Commit**

```
git add app/src/types/index.ts app/src/lib/cash.ts app/src/db/schema-migrations.ts app/src/db/index.ts app/src/main/__tests__/cash.test.ts
git commit -m "feat(cash): types, migration v3 et fonctions DB"
```

---

### Task 2 — Handlers IPC + Preload

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Create: `app/src/main/__tests__/ipc-cash-handlers.test.ts`

**Interfaces:**
- Consomme : `createCashCount`, `getCashCounts`, `getCashCountById`, `deleteCashCount`, `createCashSession`, `getCashSessions`, `deleteCashSession` (Task 1)
- Produit : `window.api.getCashCounts`, `.getCashCountById`, `.createCashCount`, `.deleteCashCount`, `.getCashSessions`, `.createCashSession`, `.deleteCashSession`

- [ ] **Étape 1 : Écrire les tests handlers (failing)**

Créer `app/src/main/__tests__/ipc-cash-handlers.test.ts` :

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: null, ...a: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  app:    { getPath: vi.fn(), isPackaged: false },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

vi.mock('../db', () => ({
  // Cash
  getCashCounts:     vi.fn(),
  getCashCountById:  vi.fn(),
  createCashCount:   vi.fn(),
  deleteCashCount:   vi.fn(),
  getCashSessions:   vi.fn(),
  createCashSession: vi.fn(),
  deleteCashSession: vi.fn(),
  // Non-cash (requis par registerIpcHandlers)
  getAllAccounts:     vi.fn(),
  getActiveAccounts: vi.fn(),
  getAllFiscalYears:  vi.fn(),
  createFiscalYear:  vi.fn(),
  getJournalEntries: vi.fn(),
  createJournalEntry:vi.fn(),
  updateJournalEntry:vi.fn(),
  deleteJournalEntry:vi.fn(),
  getAccountBalances:vi.fn(),
  getAccountBalancesExcludingClosing: vi.fn(),
  updateAccount:     vi.fn(),
  createAccount:     vi.fn(),
  deleteAccount:     vi.fn(),
  getDashboardData:  vi.fn(),
  getTwintSummary:   vi.fn(),
  getAnalyticsData:  vi.fn(),
  getAccountLedger:  vi.fn(),
  getOpeningBalanceSuggestions: vi.fn(),
  createOpeningBalanceEntry:    vi.fn(),
  getClosingPreview: vi.fn(),
  closeFiscalYear:   vi.fn(),
  reopenFiscalYear:  vi.fn(),
  getDb:             vi.fn(() => ({ pragma: vi.fn(), prepare: vi.fn(() => ({ pluck: vi.fn(() => ({ get: vi.fn(() => 0) })) })) })),
  getDbDir:          vi.fn(),
  openDatabase:      vi.fn(),
  hasDbChanges:      vi.fn(),
  getSchemaVersion:  vi.fn(),
}));

vi.mock('../settings', () => ({
  readSettings:  vi.fn(() => ({ dataDir: '/tmp', dashboardCards: [] })),
  writeSettings: vi.fn(),
}));

import {
  getCashCounts, getCashCountById, createCashCount, deleteCashCount,
  getCashSessions, createCashSession, deleteCashSession,
} from '../db';
import { registerIpcHandlers } from '../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  registerIpcHandlers();
});

function call(channel: string, ...args: unknown[]) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Handler non enregistré : ${channel}`);
  return fn(null, ...args);
}

describe('cash:getAll', () => {
  it('délègue à getCashCounts avec fiscalYearId', () => {
    (getCashCounts as ReturnType<typeof vi.fn>).mockReturnValue([]);
    call('cash:getAll', 1);
    expect(getCashCounts).toHaveBeenCalledWith(1);
  });
});

describe('cash:getById', () => {
  it('délègue à getCashCountById avec id', () => {
    (getCashCountById as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1 });
    call('cash:getById', 42);
    expect(getCashCountById).toHaveBeenCalledWith(42);
  });
});

describe('cash:create', () => {
  it('délègue à createCashCount avec le payload', () => {
    const payload = { fiscal_year_id: 1, date: '2025-01-01', label: 'Test', context: 'LIBRE', lines: [] };
    (createCashCount as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1, ...payload });
    call('cash:create', payload);
    expect(createCashCount).toHaveBeenCalledWith(payload);
  });
});

describe('cash:delete', () => {
  it('délègue à deleteCashCount avec id', () => {
    call('cash:delete', 7);
    expect(deleteCashCount).toHaveBeenCalledWith(7);
  });
});

describe('cash:getSessions', () => {
  it('délègue à getCashSessions', () => {
    (getCashSessions as ReturnType<typeof vi.fn>).mockReturnValue([]);
    call('cash:getSessions', 2);
    expect(getCashSessions).toHaveBeenCalledWith(2);
  });
});

describe('cash:createSession', () => {
  it('délègue à createCashSession', () => {
    const payload = { fiscal_year_id: 1, label: 'Marché' };
    (createCashSession as ReturnType<typeof vi.fn>).mockReturnValue({ id: 1, ...payload });
    call('cash:createSession', payload);
    expect(createCashSession).toHaveBeenCalledWith(payload);
  });
});

describe('cash:deleteSession', () => {
  it('délègue à deleteCashSession', () => {
    call('cash:deleteSession', 3);
    expect(deleteCashSession).toHaveBeenCalledWith(3);
  });
});
```

- [ ] **Étape 2 : Vérifier que les tests échouent**

```
cd app && npm test -- --reporter=verbose src/main/__tests__/ipc-cash-handlers.test.ts
```

Attendu : FAIL — handlers non enregistrés.

- [ ] **Étape 3 : Ajouter les handlers dans `app/src/ipc-handlers.ts`**

Dans les imports existants, ajouter :
```typescript
import {
  // ... imports existants ...
  getCashCounts, getCashCountById, createCashCount, deleteCashCount,
  getCashSessions, createCashSession, deleteCashSession,
} from './db';
import type { CashCountPayload, CashSessionPayload } from './types';
```

Dans la fonction `registerIpcHandlers()`, ajouter à la fin :

```typescript
  // ── Caisse ────────────────────────────────────────────────────────────────
  ipcMain.handle('cash:getAll',        (_e, fiscalYearId: number)         => getCashCounts(fiscalYearId));
  ipcMain.handle('cash:getById',       (_e, id: number)                   => getCashCountById(id));
  ipcMain.handle('cash:create',        (_e, payload: CashCountPayload)    => createCashCount(payload));
  ipcMain.handle('cash:delete',        (_e, id: number)                   => deleteCashCount(id));
  ipcMain.handle('cash:getSessions',   (_e, fiscalYearId: number)         => getCashSessions(fiscalYearId));
  ipcMain.handle('cash:createSession', (_e, payload: CashSessionPayload)  => createCashSession(payload));
  ipcMain.handle('cash:deleteSession', (_e, id: number)                   => deleteCashSession(id));
```

- [ ] **Étape 4 : Mettre à jour `app/src/preload.ts`**

Dans les imports, ajouter :
```typescript
import type { CashCountPayload, CashSessionPayload, CashCount, CashSession } from '../types';
```

Dans `contextBridge.exposeInMainWorld('api', { ... })`, ajouter :

```typescript
  // Caisse
  getCashCounts:     (fiscalYearId: number): Promise<CashCount[]>         => ipcRenderer.invoke('cash:getAll', fiscalYearId),
  getCashCountById:  (id: number): Promise<CashCount>                     => ipcRenderer.invoke('cash:getById', id),
  createCashCount:   (payload: CashCountPayload): Promise<CashCount>      => ipcRenderer.invoke('cash:create', payload),
  deleteCashCount:   (id: number): Promise<void>                          => ipcRenderer.invoke('cash:delete', id),
  getCashSessions:   (fiscalYearId: number): Promise<CashSession[]>       => ipcRenderer.invoke('cash:getSessions', fiscalYearId),
  createCashSession: (payload: CashSessionPayload): Promise<CashSession>  => ipcRenderer.invoke('cash:createSession', payload),
  deleteCashSession: (id: number): Promise<void>                          => ipcRenderer.invoke('cash:deleteSession', id),
```

Dans `export type ElectronAPI = { ... }`, ajouter les mêmes signatures.

- [ ] **Étape 5 : Vérifier que tous les tests passent**

```
cd app && npm test -- --reporter=verbose src/main/__tests__/ipc-cash-handlers.test.ts
```

Attendu : 7 tests PASS.

- [ ] **Étape 6 : Lancer la suite complète**

```
cd app && npm test
```

Attendu : tous les tests existants passent toujours.

- [ ] **Étape 7 : Commit**

```
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/main/__tests__/ipc-cash-handlers.test.ts
git commit -m "feat(cash): handlers IPC cash:* et preload"
```

---

### Task 3 — CashCountModal

**Files:**
- Create: `app/src/components/CashCountModal.tsx`
- Create: `app/src/components/CashCountModal.module.css`
- Create: `app/src/renderer/__tests__/CashCountModal.test.tsx`

**Interfaces:**
- Consomme : `window.api.getCashCounts`, `.createCashCount`, `CashCountPayload`, `CashCount`, `CashContext` (Task 1+2)
- Consomme : `Modal` depuis `./Modal`, `formatCHF` depuis `../lib/format`, `DENOMINATIONS`, `PIECES`, `BILLETS`, `formatDenom`, `emptyLines` depuis `../lib/cash`
- Produit : `<CashCountModal fiscalYearId onClose onSaved />` — modale de création d'un arrêté

- [ ] **Étape 1 : Écrire les tests (failing)**

Créer `app/src/renderer/__tests__/CashCountModal.test.tsx` :

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CashCountModal from '../../components/CashCountModal';
import type { CashCount } from '../../types';

const mockCount: CashCount = {
  id: 1, fiscal_year_id: 1, session_id: null, session_label: null,
  date: '2025-03-08', label: 'Test', context: 'LIBRE',
  notes: null, total: 3800, theoretical_balance: 3800,
  created_at: '2025-03-08T10:00:00',
  lines: [],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createCashCount: vi.fn().mockResolvedValue(mockCount),
  });
});

const defaultProps = { fiscalYearId: 1, onClose: vi.fn(), onSaved: vi.fn() };

describe('CashCountModal', () => {
  it('affiche les champs de saisie (date, libellé, contexte)', () => {
    render(<CashCountModal {...defaultProps} />);
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/libellé/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contexte/i)).toBeInTheDocument();
  });

  it('affiche 12 lignes de coupures', () => {
    render(<CashCountModal {...defaultProps} />);
    // 12 libellés : 0.05 CHF, 0.10 CHF ... 200.00 CHF
    expect(screen.getByText('0.05 CHF')).toBeInTheDocument();
    expect(screen.getByText('200.00 CHF')).toBeInTheDocument();
    // 12 qty inputs + 12 total inputs = 24 inputs numériques pour les coupures
    expect(screen.getAllByTestId(/^qty-/)).toHaveLength(12);
    expect(screen.getAllByTestId(/^total-/)).toHaveLength(12);
  });

  it('saisir une quantité met à jour le total de la ligne et le total général', async () => {
    render(<CashCountModal {...defaultProps} />);
    const qtyInput = screen.getByTestId('qty-100'); // 1.00 CHF
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, '38');
    // Total de la ligne : 38 × 1.00 = 38.00
    expect((screen.getByTestId('total-100') as HTMLInputElement).value).toBe('38.00');
    // Total général affiché quelque part
    expect(screen.getByText(/38\.00/)).toBeInTheDocument();
  });

  it('saisir un total met à jour la quantité (floor)', async () => {
    render(<CashCountModal {...defaultProps} />);
    const totalInput = screen.getByTestId('total-200'); // 2.00 CHF
    await userEvent.clear(totalInput);
    await userEvent.type(totalInput, '15');
    // floor(1500 / 200) = 7, total recalé = 14.00
    expect((screen.getByTestId('qty-200') as HTMLInputElement).value).toBe('7');
    expect((screen.getByTestId('total-200') as HTMLInputElement).value).toBe('14.00');
  });

  it('bouton Enregistrer désactivé si toutes les quantités sont 0', () => {
    render(<CashCountModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it('bouton Enregistrer actif dès qu\'une quantité > 0', async () => {
    render(<CashCountModal {...defaultProps} />);
    const qty = screen.getByTestId('qty-100');
    await userEvent.clear(qty);
    await userEvent.type(qty, '5');
    expect(screen.getByRole('button', { name: /enregistrer/i })).not.toBeDisabled();
  });

  it('enregistrer appelle window.api.createCashCount avec le bon payload', async () => {
    render(<CashCountModal {...defaultProps} />);
    await userEvent.type(screen.getByLabelText(/libellé/i), 'Avant Marché');
    await userEvent.clear(screen.getByTestId('qty-100'));
    await userEvent.type(screen.getByTestId('qty-100'), '5');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => {
      expect(window.api.createCashCount).toHaveBeenCalledWith(
        expect.objectContaining({
          fiscal_year_id: 1,
          label: 'Avant Marché',
          context: 'LIBRE',
          lines: expect.arrayContaining([
            expect.objectContaining({ denomination: 100, quantity: 5 }),
          ]),
        })
      );
    });
  });

  it('appelle onSaved après un enregistrement réussi', async () => {
    const onSaved = vi.fn();
    render(<CashCountModal {...defaultProps} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText(/libellé/i), 'Test');
    await userEvent.clear(screen.getByTestId('qty-100'));
    await userEvent.type(screen.getByTestId('qty-100'), '1');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('bouton Annuler appelle onClose', async () => {
    const onClose = vi.fn();
    render(<CashCountModal {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /annuler/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Étape 2 : Vérifier que les tests échouent**

```
cd app && npm test -- --reporter=verbose src/renderer/__tests__/CashCountModal.test.tsx
```

Attendu : FAIL — composant inexistant.

- [ ] **Étape 3 : Créer `app/src/components/CashCountModal.tsx`**

```tsx
import { useState, useCallback } from 'react';
import { Save, X } from 'lucide-react';
import Modal from './Modal';
import { DENOMINATIONS, PIECES, BILLETS, formatDenom, emptyLines } from '../lib/cash';
import { formatCHF } from '../lib/format';
import type { CashContext, CashCountPayload } from '../types';
import styles from './CashCountModal.module.css';

interface Props {
  fiscalYearId: number;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CashCountModal({ fiscalYearId, onClose, onSaved }: Props) {
  const [date,     setDate]     = useState(todayISO());
  const [label,    setLabel]    = useState('');
  const [context,  setContext]  = useState<CashContext>('LIBRE');
  const [notes,    setNotes]    = useState('');
  const [qtys,     setQtys]     = useState<Record<number, number>>(
    () => Object.fromEntries(DENOMINATIONS.map(d => [d, 0]))
  );
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const setQty = useCallback((denom: number, raw: string) => {
    const qty = Math.max(0, parseInt(raw) || 0);
    setQtys(prev => ({ ...prev, [denom]: qty }));
  }, []);

  const setTotal = useCallback((denom: number, raw: string) => {
    const cents = Math.round((parseFloat(raw) || 0) * 100);
    const qty   = Math.floor(cents / denom);
    setQtys(prev => ({ ...prev, [denom]: Math.max(0, qty) }));
  }, []);

  const grandTotal = DENOMINATIONS.reduce((s, d) => s + d * qtys[d], 0);
  const hasAny     = DENOMINATIONS.some(d => qtys[d] > 0);

  const handleSave = async () => {
    if (!label.trim()) { setError('Le libellé est requis'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: CashCountPayload = {
        fiscal_year_id: fiscalYearId,
        date, label: label.trim(), context,
        notes: notes.trim() || undefined,
        lines: emptyLines().map(l => ({ ...l, quantity: qtys[l.denomination] })),
      };
      await window.api.createCashCount(payload);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde');
      setSaving(false);
    }
  };

  const renderRow = (denom: number) => {
    const qty   = qtys[denom];
    const total = (qty * denom / 100).toFixed(2);
    return (
      <tr key={denom}>
        <td className={styles.denomLabel}>{formatDenom(denom)}</td>
        <td>
          <input
            type="number" min="0" step="1"
            value={qty === 0 ? '' : qty}
            onChange={e => setQty(denom, e.target.value)}
            className={styles.numInput}
            data-testid={`qty-${denom}`}
          />
        </td>
        <td>
          <input
            type="number" min="0" step="0.01"
            value={qty === 0 ? '' : total}
            onChange={e => setTotal(denom, e.target.value)}
            className={styles.numInput}
            data-testid={`total-${denom}`}
          />
        </td>
      </tr>
    );
  };

  return (
    <Modal onClose={onClose} className={styles.modal}>
      <h2 className={styles.title}>Nouvel arrêté de caisse</h2>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Date" />
        </label>
        <label className={styles.field}>
          <span>Libellé</span>
          <input
            type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="ex : Avant Marché 2026" aria-label="Libellé"
          />
        </label>
        <label className={styles.field}>
          <span>Contexte</span>
          <select value={context} onChange={e => setContext(e.target.value as CashContext)} aria-label="Contexte">
            <option value="LIBRE">Libre</option>
            <option value="AVANT">Avant manifestation</option>
            <option value="FONDS">Fonds de caisse</option>
            <option value="APRES">Après manifestation</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Notes</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </label>
      </div>

      <div className={styles.grid}>
        <table className={styles.denomTable}>
          <thead>
            <tr>
              <th>Pièces</th><th>Qté</th><th>Total</th>
              <th className={styles.sep} />
              <th>Billets</th><th>Qté</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            {PIECES.map((d, i) => {
              const b = BILLETS[i];
              const qtyP = qtys[d]; const totalP = (qtyP * d / 100).toFixed(2);
              const qtyB = b ? qtys[b] : null;
              const totalB = b ? (qtyB! * b / 100).toFixed(2) : null;
              return (
                <tr key={d}>
                  <td className={styles.denomLabel}>{formatDenom(d)}</td>
                  <td><input type="number" min="0" step="1"
                    value={qtyP === 0 ? '' : qtyP}
                    onChange={e => setQty(d, e.target.value)}
                    className={styles.numInput} data-testid={`qty-${d}`} /></td>
                  <td><input type="number" min="0" step="0.01"
                    value={qtyP === 0 ? '' : totalP}
                    onChange={e => setTotal(d, e.target.value)}
                    className={styles.numInput} data-testid={`total-${d}`} /></td>
                  <td className={styles.sep} />
                  {b ? <>
                    <td className={styles.denomLabel}>{formatDenom(b)}</td>
                    <td><input type="number" min="0" step="1"
                      value={qtyB === 0 ? '' : qtyB!}
                      onChange={e => setQty(b, e.target.value)}
                      className={styles.numInput} data-testid={`qty-${b}`} /></td>
                    <td><input type="number" min="0" step="0.01"
                      value={qtyB === 0 ? '' : totalB!}
                      onChange={e => setTotal(b, e.target.value)}
                      className={styles.numInput} data-testid={`total-${b}`} /></td>
                  </> : <><td /><td /><td /></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.totals}>
        <span className={styles.totalLabel}>Total compté</span>
        <span className={styles.totalValue}>{formatCHF(grandTotal)} CHF</span>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" onClick={onClose} className={styles.btnSecondary}>
          <X size={16} /> Annuler
        </button>
        <button
          type="button" onClick={handleSave}
          disabled={!hasAny || saving} className={styles.btnPrimary}
        >
          <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Étape 4 : Créer `app/src/components/CashCountModal.module.css`**

```css
.modal    { width: 720px; max-width: 95vw; }
.title    { margin: 0 0 1rem; font-size: 1.1rem; font-weight: 600; }

.fields   { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.field    { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
.field input,
.field select,
.field textarea { padding: 0.375rem 0.5rem; border: 1px solid var(--border); border-radius: 4px; font-size: 0.875rem; }

.grid         { overflow-x: auto; margin-bottom: 0.75rem; }
.denomTable   { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.denomTable th,
.denomTable td { padding: 0.25rem 0.5rem; text-align: right; }
.denomTable th  { font-weight: 600; border-bottom: 1px solid var(--border); }
.denomLabel   { text-align: left; white-space: nowrap; }
.sep          { width: 1.5rem; }
.numInput     { width: 80px; text-align: right; padding: 0.2rem 0.4rem;
                border: 1px solid var(--border); border-radius: 4px; font-size: 0.875rem; }
.numInput:focus { outline: 2px solid var(--accent); }

.totals       { display: flex; justify-content: flex-end; align-items: center; gap: 1rem;
                padding: 0.5rem 0; border-top: 2px solid var(--border); margin-bottom: 0.75rem; }
.totalLabel   { font-size: 0.875rem; color: var(--text-muted); }
.totalValue   { font-size: 1.1rem; font-weight: 700; font-variant-numeric: tabular-nums; }

.error        { color: var(--error, #dc2626); font-size: 0.875rem; margin-bottom: 0.5rem; }

.actions      { display: flex; justify-content: flex-end; gap: 0.5rem; }
.btnPrimary   { display: inline-flex; align-items: center; gap: 0.375rem;
                padding: 0.5rem 1rem; background: var(--accent); color: white;
                border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; }
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }
.btnSecondary { display: inline-flex; align-items: center; gap: 0.375rem;
                padding: 0.5rem 1rem; background: transparent;
                border: 1px solid var(--border); border-radius: 6px;
                cursor: pointer; font-size: 0.875rem; }
```

- [ ] **Étape 5 : Vérifier que les tests passent**

```
cd app && npm test -- --reporter=verbose src/renderer/__tests__/CashCountModal.test.tsx
```

Attendu : ~9 tests PASS.

- [ ] **Étape 6 : Commit**

```
git add app/src/components/CashCountModal.tsx app/src/components/CashCountModal.module.css app/src/renderer/__tests__/CashCountModal.test.tsx
git commit -m "feat(cash): composant CashCountModal (grille bidirectionnelle 12 coupures)"
```

---

### Task 4 — CaissePage

**Files:**
- Create: `app/src/pages/CaissePage.tsx`
- Create: `app/src/pages/CaissePage.module.css`
- Create: `app/src/renderer/__tests__/CaissePage.test.tsx`

**Interfaces:**
- Consomme : `window.api.getFiscalYears`, `.getCashCounts`, `.deleteCashCount` (Task 1+2)
- Consomme : `CashCountModal` (Task 3), `ConfirmDialog`, `Toast` depuis `../components/`
- Produit : `<CaissePage />` — page sans props

- [ ] **Étape 1 : Écrire les tests (failing)**

Créer `app/src/renderer/__tests__/CaissePage.test.tsx` :

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CaissePage from '../../pages/CaissePage';
import type { FiscalYear, CashCount } from '../../types';

const mockYear: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '2025-01-01', hasOpeningBalance: false,
};

const mockCount: CashCount = {
  id: 1, fiscal_year_id: 1, session_id: null, session_label: null,
  date: '2025-03-08', label: 'Avant Marché', context: 'AVANT',
  notes: null, total: 137830, theoretical_balance: 137830,
  created_at: '2025-03-08T10:00:00',
};

beforeEach(() => {
  vi.stubGlobal('api', {
    getFiscalYears:  vi.fn().mockResolvedValue([mockYear]),
    getCashCounts:   vi.fn().mockResolvedValue([mockCount]),
    deleteCashCount: vi.fn().mockResolvedValue(undefined),
  });
});

describe('CaissePage', () => {
  it('affiche un message si aucun exercice', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getCashCounts:  vi.fn().mockResolvedValue([]),
    });
    render(<CaissePage />);
    await screen.findByText(/aucun exercice/i);
  });

  it('affiche les onglets Arrêtés et Manifestations', async () => {
    render(<CaissePage />);
    await screen.findByRole('tab', { name: /arrêtés/i });
    expect(screen.getByRole('tab', { name: /manifestations/i })).toBeInTheDocument();
  });

  it('affiche un arrêté dans la liste avec libellé et montants', async () => {
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    expect(screen.getByText('1\'378.30')).toBeInTheDocument(); // total
    expect(screen.getByText('0.00')).toBeInTheDocument();      // écart = 0
  });

  it('le bouton Nouvel arrêté ouvre la modale', async () => {
    render(<CaissePage />);
    await screen.findByRole('button', { name: /nouvel arrêté/i });
    await userEvent.click(screen.getByRole('button', { name: /nouvel arrêté/i }));
    expect(screen.getByText(/nouvel arrêté de caisse/i)).toBeInTheDocument();
  });

  it('supprimer un arrêté appelle deleteCashCount après confirmation', async () => {
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    await userEvent.click(screen.getByRole('button', { name: /supprimer/i }));
    // ConfirmDialog apparaît
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /confirmer|supprimer/i }));
    await waitFor(() => expect(window.api.deleteCashCount).toHaveBeenCalledWith(1));
  });

  it('l\'écart est coloré en rouge si non nul', async () => {
    const diverged = { ...mockCount, theoretical_balance: 138000 }; // différent du total
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([mockYear]),
      getCashCounts:  vi.fn().mockResolvedValue([diverged]),
      deleteCashCount: vi.fn(),
    });
    render(<CaissePage />);
    await screen.findByText('Avant Marché');
    const ecartCell = screen.getByTestId('ecart-1');
    expect(ecartCell).toHaveAttribute('data-negative');
  });
});
```

- [ ] **Étape 2 : Vérifier que les tests échouent**

```
cd app && npm test -- --reporter=verbose src/renderer/__tests__/CaissePage.test.tsx
```

Attendu : FAIL — `CaissePage` introuvable.

- [ ] **Étape 3 : Créer `app/src/pages/CaissePage.tsx`**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import CashCountModal from '../components/CashCountModal';
import ConfirmDialog  from '../components/ConfirmDialog';
import Toast          from '../components/Toast';
import { formatCHF }  from '../lib/format';
import { formatDate } from '../lib/format';
import type { FiscalYear, CashCount, CashContext } from '../types';
import styles from './CaissePage.module.css';

const CONTEXT_LABELS: Record<CashContext, string> = {
  LIBRE: 'Libre', AVANT: 'Avant', FONDS: 'Fonds de caisse', APRES: 'Après',
};

type Tab = 'counts' | 'sessions';

export default function CaissePage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [counts,         setCounts]         = useState<CashCount[]>([]);
  const [activeTab,      setActiveTab]      = useState<Tab>('counts');
  const [showModal,      setShowModal]      = useState(false);
  const [deleteId,       setDeleteId]       = useState<number | null>(null);
  const [toast,          setToast]          = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [loading,        setLoading]        = useState(false);

  useEffect(() => {
    window.api.getFiscalYears().then(ys => {
      setYears(ys);
      const open = ys.find(y => !y.is_closed) ?? ys[0];
      if (open) setSelectedYearId(open.id);
    });
  }, []);

  const loadCounts = useCallback(() => {
    if (!selectedYearId) return;
    setLoading(true);
    window.api.getCashCounts(selectedYearId)
      .then(setCounts)
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const handleSaved = () => {
    setShowModal(false);
    setToast({ message: 'Arrêté enregistré', variant: 'success' });
    loadCounts();
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.api.deleteCashCount(deleteId);
      setToast({ message: 'Arrêté supprimé', variant: 'success' });
      loadCounts();
    } catch {
      setToast({ message: 'Erreur lors de la suppression', variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  };

  const selectedYear = years.find(y => y.id === selectedYearId);

  if (years.length === 0) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Aucun exercice trouvé. Créez un exercice d'abord.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Caisse</h1>
          <select
            value={selectedYearId ?? ''}
            onChange={e => setSelectedYearId(Number(e.target.value))}
            className={styles.yearSelect}
          >
            {years.map(y => <option key={y.id} value={y.id}>{y.year}</option>)}
          </select>
        </div>
        {activeTab === 'counts' && (
          <button
            className={styles.btnPrimary}
            onClick={() => setShowModal(true)}
            disabled={!selectedYear || selectedYear.is_closed}
          >
            <Plus size={16} /> Nouvel arrêté
          </button>
        )}
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          role="tab" aria-selected={activeTab === 'counts'}
          className={activeTab === 'counts' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('counts')}
        >
          Arrêtés
        </button>
        <button
          role="tab" aria-selected={activeTab === 'sessions'}
          className={activeTab === 'sessions' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('sessions')}
        >
          Manifestations
        </button>
      </div>

      {activeTab === 'counts' && (
        loading ? <p className={styles.empty}>Chargement…</p> :
        counts.length === 0 ? (
          <p className={styles.empty}>Aucun arrêté de caisse pour cet exercice.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th>Contexte</th>
                <th className={styles.num}>Total compté</th>
                <th className={styles.num}>Solde théorique</th>
                <th className={styles.num}>Écart</th>
                <th>Session</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {counts.map(c => {
                const ecart = c.total - c.theoretical_balance;
                return (
                  <tr key={c.id} className={styles.row}>
                    <td>{formatDate(c.date)}</td>
                    <td>{c.label}</td>
                    <td>{CONTEXT_LABELS[c.context]}</td>
                    <td className={styles.num}>{formatCHF(c.total)}</td>
                    <td className={styles.num}>{formatCHF(c.theoretical_balance)}</td>
                    <td
                      className={styles.num}
                      data-negative={ecart !== 0 || undefined}
                      data-testid={`ecart-${c.id}`}
                    >
                      {formatCHF(Math.abs(ecart))}{ecart === 0 ? ' ✓' : ecart > 0 ? ' ▲' : ' ▼'}
                    </td>
                    <td className={styles.session}>{c.session_label ?? '—'}</td>
                    <td>
                      <button
                        className={styles.btnDanger}
                        onClick={() => setDeleteId(c.id)}
                        aria-label="Supprimer"
                      >
                        <Trash2 size={14} /> Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {activeTab === 'sessions' && (
        <p className={styles.empty}>
          La gestion des sessions de manifestation sera disponible dans une prochaine version.
        </p>
      )}

      {showModal && selectedYearId && (
        <CashCountModal
          fiscalYearId={selectedYearId}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {deleteId !== null && (
        <ConfirmDialog
          message="Supprimer cet arrêté de caisse ? Cette action est irréversible."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Étape 4 : Créer `app/src/pages/CaissePage.module.css`**

```css
.page    { padding: 1.5rem; max-width: 1100px; }
.header  { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
.headerLeft { display: flex; align-items: center; gap: 1rem; }
.title   { margin: 0; font-size: 1.25rem; font-weight: 700; }
.yearSelect { padding: 0.35rem 0.6rem; border: 1px solid var(--border); border-radius: 4px; font-size: 0.875rem; }

.tabs       { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 1.25rem; }
.tab        { padding: 0.5rem 1.25rem; background: none; border: none; cursor: pointer;
              font-size: 0.875rem; color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -2px; }
.tabActive  { padding: 0.5rem 1.25rem; background: none; border: none; cursor: pointer;
              font-size: 0.875rem; font-weight: 600; color: var(--accent);
              border-bottom: 2px solid var(--accent); margin-bottom: -2px; }

.table      { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.table th   { text-align: left; padding: 0.5rem 0.75rem; font-weight: 600;
              border-bottom: 2px solid var(--border); white-space: nowrap; }
.table td   { padding: 0.45rem 0.75rem; border-bottom: 1px solid var(--border-light, #f0f0f0); }
.row:hover td { background: var(--hover, #f9f9f9); }
.num        { text-align: right; font-variant-numeric: tabular-nums; }
.session    { color: var(--text-muted); font-size: 0.8rem; }

/* Écart négatif (ou positif inattendu) */
[data-negative] { color: var(--error, #dc2626); font-weight: 600; }

.empty   { color: var(--text-muted); font-style: italic; padding: 2rem 0; }

.btnPrimary  { display: inline-flex; align-items: center; gap: 0.375rem;
               padding: 0.45rem 0.875rem; background: var(--accent); color: white;
               border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; }
.btnPrimary:disabled { opacity: 0.5; cursor: not-allowed; }
.btnDanger   { display: inline-flex; align-items: center; gap: 0.25rem;
               padding: 0.3rem 0.6rem; background: none; color: var(--error, #dc2626);
               border: 1px solid var(--error, #dc2626); border-radius: 4px;
               cursor: pointer; font-size: 0.8rem; }
.btnDanger:hover { background: var(--error, #dc2626); color: white; }
```

- [ ] **Étape 5 : Vérifier que les tests passent**

```
cd app && npm test -- --reporter=verbose src/renderer/__tests__/CaissePage.test.tsx
```

Attendu : ~6 tests PASS.

- [ ] **Étape 6 : Commit**

```
git add app/src/pages/CaissePage.tsx app/src/pages/CaissePage.module.css app/src/renderer/__tests__/CaissePage.test.tsx
git commit -m "feat(cash): page CaissePage (arrêtés + onglet Manifestations placeholder)"
```

---

### Task 5 — Intégration App + Sidebar + HelpDrawer

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/Sidebar.tsx`
- Modify: `app/src/components/HelpDrawer.tsx`

**Interfaces:**
- Consomme : `CaissePage` (Task 4)
- Produit : `'cash'` dans le type `Page`, entrée "Caisse" dans la sidebar, section aide caisse

- [ ] **Étape 1 : Modifier `app/src/App.tsx`**

Changer la ligne du type `Page` :
```typescript
// Avant
export type Page = 'dashboard' | 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'analytics' | 'bilan' | 'ledger' | 'settings' | 'welcome';
// Après
export type Page = 'dashboard' | 'accounts' | 'journal' | 'cash' | 'fiscal-years' | 'balances' | 'analytics' | 'bilan' | 'ledger' | 'settings' | 'welcome';
```

Ajouter l'import de `CaissePage` :
```typescript
import CaissePage from './pages/CaissePage';
```

Ajouter le case dans `renderPage()` avant le case `'fiscal-years'` :
```typescript
      case 'cash':         return <CaissePage />;
```

- [ ] **Étape 2 : Modifier `app/src/components/Sidebar.tsx`**

Dans le tableau `NAV_ITEMS`, insérer après `{ id: 'journal', label: 'Journal' }` :
```typescript
  { id: 'cash',         label: 'Caisse'        },
```

- [ ] **Étape 3 : Modifier `app/src/components/HelpDrawer.tsx`**

Dans la fonction `AppTab`, ajouter une nouvelle section à la suite des sections existantes :

```tsx
      <h3 className={styles.sectionTitle}>Caisse</h3>
      <p className={styles.para}>
        La page <strong>Caisse</strong> permet d'enregistrer les arrêtés de caisse physiques
        (comptage pièce par pièce). Pour chaque coupure, saisissez la quantité <em>ou</em> le
        montant total — l'autre champ se calcule automatiquement.
      </p>
      <p className={styles.para}>
        Chaque arrêté affiche l'écart entre le total compté et le solde théorique du compte
        100 (Caisse) à la même date. Un écart nul est affiché en vert (<strong>✓</strong>),
        un écart non nul en rouge.
      </p>
      <p className={styles.para}>
        Les contextes disponibles : <strong>Libre</strong> (arrêté courant),
        <strong> Avant</strong> / <strong>Fonds de caisse</strong> / <strong>Après</strong>
        (pour les manifestations — groupement en sessions dans une version future).
      </p>
```

- [ ] **Étape 4 : Lancer la suite complète**

```
cd app && npm test
```

Attendu : tous les tests passent (nombre total > précédent).

- [ ] **Étape 5 : Commit**

```
git add app/src/App.tsx app/src/components/Sidebar.tsx app/src/components/HelpDrawer.tsx
git commit -m "feat(cash): intégration sidebar, routing App.tsx, aide HelpDrawer"
```

---

## Auto-revue du plan

**Couverture du spec :**
- Migration v3 (3 tables + index) → Task 1 ✓
- Types CashCount, CashSession, CashCountPayload, CashSessionPayload, CashContext → Task 1 ✓
- 7 handlers IPC (getAll, getById, create, delete + sessions CRUD) → Task 2 ✓
- Preload contextBridge + ElectronAPI → Task 2 ✓
- CashCountModal grille 12 coupures bidirectionnelle Qté↔Total → Task 3 ✓
- CaissePage onglets Arrêtés / Manifestations placeholder → Task 4 ✓
- Sidebar entrée "Caisse" entre Journal et Exercices → Task 5 ✓
- HelpDrawer section Caisse → Task 5 ✓
- Tests Vitest pour chaque couche → Tasks 1–4 ✓
- Branche `feature/cash-management` — commits après chaque task ✓
- Icônes Lucide (Plus, Trash2, Save, X) — présentes dans les composants ✓
- ConfirmDialog pour suppression — Task 4 ✓
- Toast pour retours — Task 4 ✓
- `formatCHF(centimes)` utilisé partout — vérifié ✓

**Types cohérents :**
- `CashCount.fiscal_year_id` (snake_case) utilisé identiquement dans les fonctions DB, handlers et payload ✓
- `CashCountPayload.fiscal_year_id` — cohérent avec `CreateJournalEntryPayload.fiscal_year_id` ✓
- `DENOMINATIONS` défini dans `lib/cash.ts`, importé dans `CashCountModal` et les tests ✓
- `data-testid={qty-${denom}}` et `data-testid={total-${denom}}` — même nommage dans composant et tests ✓

**Aucun placeholder :** pas de TBD, pas de "implement later", chaque step a du code complet.
