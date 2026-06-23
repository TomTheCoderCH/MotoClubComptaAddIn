# Écritures de clôture automatiques — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre la clôture automatique d'un exercice (soldage 3xx/4xx → 900 → 290, marquage is_closed=1) avec aperçu avant confirmation et réouverture possible.

**Architecture:** Deux nouvelles fonctions DB (`getClosingPreview`, `closeFiscalYear`, `reopenFiscalYear`) exposées via 3 canaux IPC, un composant `ClosingModal` d'aperçu/confirmation, et une nouvelle colonne "Actions" dans `FiscalYearsPage`. La réouverture utilise le composant `ConfirmDialog` déjà existant.

**Tech Stack:** Electron + React + TypeScript + SQLite (better-sqlite3) + Vitest + React Testing Library

## Global Constraints

- Montants en **centimes** (INTEGER) — jamais de float pour les CHF
- Inline styles `const s = {...} as const` dans tous les composants React
- Mocker `electron` **avant** tout import dans les fichiers de tests IPC
- Tests DB : SQLite **en mémoire** (`:memory:`) via `openDatabase(':memory:')`
- Commande de test : `cd app && npm test` (Vitest, pas Jest)
- Framework UI : React avec `window.api` (contextBridge) — pas d'accès direct à `ipcRenderer`
- Les montants nuls sont omis des lignes d'écriture (filtrés avant insert)
- Les lignes DB respectent la contrainte : `debit NOT NULL AND credit IS NULL` OR `debit IS NULL AND credit NOT NULL`
- Spec : `docs/superpowers/specs/2026-06-22-closing-entries-design.md`

---

## Task 1 — Types + fonctions DB + tests DB

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/db/index.ts`
- Modify: `app/src/__tests__/db.test.ts`

**Interfaces:**
- Produces:
  - `ClosingAccountLine` (type)
  - `ClosingPreview` (type)
  - `getClosingPreview(fiscalYearId: number): ClosingPreview`
  - `closeFiscalYear(fiscalYearId: number): void`
  - `reopenFiscalYear(fiscalYearId: number): void`

---

- [ ] **Step 1 — Ajouter les types dans `app/src/types/index.ts`**

Ajouter à la fin du fichier (après l'interface `OpeningBalanceLine`) :

```ts
export interface ClosingAccountLine {
  accountId: number;
  accountNumber: string;
  accountName: string;
  type: 'PRODUIT' | 'CHARGE';
  soldeCents: number; // positif = solde normal, négatif = solde inversé (rare)
}

export interface ClosingPreview {
  blockers: string[];             // ex. ["Twint (102) : solde CHF 45.00 doit être à 0"]
  accounts: ClosingAccountLine[]; // comptes 3xx/4xx avec solde ≠ 0
  netResultCents: number;         // positif = bénéfice, négatif = perte
}
```

- [ ] **Step 2 — Écrire les tests qui échouent dans `app/src/__tests__/db.test.ts`**

**2a.** Étendre la ligne d'import en haut du fichier :

```ts
import {
  openDatabase,
  getDb,
  getAllAccounts,
  getActiveAccounts,
  getAllFiscalYears,
  createFiscalYear,
  getJournalEntries,
  createJournalEntry,
  getAccountBalances,
  updateJournalEntry,
  deleteJournalEntry,
  getOpeningBalanceSuggestions,
  createOpeningBalanceEntry,
  getClosingPreview,
  closeFiscalYear,
  reopenFiscalYear,
} from '../db';
```

**2b.** Ajouter à la fin du fichier les deux blocs `describe` suivants :

```ts
describe('getClosingPreview', () => {
  let fiscalYearId: number;
  let raiffeisenId: number;
  let twintId: number;
  let cotisationsId: number;
  let assurancesId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    raiffeisenId  = accounts.find(a => a.number === '101')!.id;
    twintId       = accounts.find(a => a.number === '102')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    assurancesId  = accounts.find(a => a.number === '400')!.id;
  });

  it('retourne un blocker si Twint a un solde non nul', () => {
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-01',
      description: 'Encaissement Twint',
      lines: [
        { account_id: twintId,        debit:  4500 },
        { account_id: cotisationsId,  credit: 4500 },
      ],
    });
    const preview = getClosingPreview(fiscalYearId);
    expect(preview.blockers).toHaveLength(1);
    expect(preview.blockers[0]).toMatch(/Twint/);
    expect(preview.blockers[0]).toMatch(/45\.00/);
  });

  it('retourne accounts et netResultCents corrects', () => {
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-01',
      description: 'Cotisations',
      lines: [
        { account_id: raiffeisenId,  debit:  141000 },
        { account_id: cotisationsId, credit: 141000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-04-01',
      description: 'Assurances',
      lines: [
        { account_id: assurancesId,  debit:  35000 },
        { account_id: raiffeisenId,  credit: 35000 },
      ],
    });
    const preview = getClosingPreview(fiscalYearId);
    expect(preview.blockers).toHaveLength(0);
    expect(preview.accounts).toHaveLength(2);
    expect(preview.netResultCents).toBe(106000); // 1410 - 350 = 1060 CHF
  });

  it('retourne listes vides et netResultCents = 0 sans mouvements 3xx/4xx', () => {
    const preview = getClosingPreview(fiscalYearId);
    expect(preview.blockers).toHaveLength(0);
    expect(preview.accounts).toHaveLength(0);
    expect(preview.netResultCents).toBe(0);
  });
});

describe('closeFiscalYear + reopenFiscalYear', () => {
  let fiscalYearId: number;
  let raiffeisenId: number;
  let cotisationsId: number;
  let assurancesId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    raiffeisenId  = accounts.find(a => a.number === '101')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    assurancesId  = accounts.find(a => a.number === '400')!.id;
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-01',
      description: 'Cotisations',
      lines: [
        { account_id: raiffeisenId,  debit:  141000 },
        { account_id: cotisationsId, credit: 141000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-04-01',
      description: 'Assurances',
      lines: [
        { account_id: assurancesId,  debit:  35000 },
        { account_id: raiffeisenId,  credit: 35000 },
      ],
    });
  });

  it('génère 2 écritures is_closing_entry et marque is_closed = 1', () => {
    closeFiscalYear(fiscalYearId);
    const entries = getDb()
      .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fiscalYearId) as any[];
    expect(entries).toHaveLength(2);
    const fy = getDb()
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(fiscalYearId) as { is_closed: number };
    expect(fy.is_closed).toBe(1);
  });

  it('génère 1 seule écriture si netResultCents = 0 (pas d\'écriture 2)', () => {
    const fy2 = createFiscalYear(2026);
    const fraisBancairesId = getAllAccounts().find(a => a.number === '401')!.id;
    createJournalEntry({
      fiscal_year_id: fy2.id,
      date: '2026-03-01',
      description: 'Produit égal charge',
      lines: [
        { account_id: raiffeisenId,     debit:  10000 },
        { account_id: cotisationsId,    credit: 10000 },
      ],
    });
    createJournalEntry({
      fiscal_year_id: fy2.id,
      date: '2026-03-01',
      description: 'Charge égale produit',
      lines: [
        { account_id: fraisBancairesId, debit:  10000 },
        { account_id: raiffeisenId,     credit: 10000 },
      ],
    });
    closeFiscalYear(fy2.id);
    const entries = getDb()
      .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fy2.id) as any[];
    expect(entries).toHaveLength(1);
  });

  it('lève une erreur si des blockers existent (Twint non soldé)', () => {
    const twintId = getAllAccounts().find(a => a.number === '102')!.id;
    createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-05-01',
      description: 'Twint non soldé',
      lines: [
        { account_id: twintId,        debit:  1000 },
        { account_id: cotisationsId,  credit: 1000 },
      ],
    });
    expect(() => closeFiscalYear(fiscalYearId)).toThrow('impossible');
  });

  it('lève une erreur si déjà clôturé (idempotence)', () => {
    closeFiscalYear(fiscalYearId);
    expect(() => closeFiscalYear(fiscalYearId)).toThrow('déjà clôturé');
  });

  it('les écritures de clôture ont la date YYYY-12-31', () => {
    closeFiscalYear(fiscalYearId);
    const entries = getDb()
      .prepare('SELECT date FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fiscalYearId) as { date: string }[];
    for (const e of entries) {
      expect(e.date).toBe('2025-12-31');
    }
  });

  it('reopenFiscalYear supprime les écritures de clôture et remet is_closed = 0', () => {
    closeFiscalYear(fiscalYearId);
    reopenFiscalYear(fiscalYearId);
    const entries = getDb()
      .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .all(fiscalYearId) as any[];
    expect(entries).toHaveLength(0);
    const fy = getDb()
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(fiscalYearId) as { is_closed: number };
    expect(fy.is_closed).toBe(0);
  });

  it('reopenFiscalYear lève une erreur si exercice non clôturé', () => {
    expect(() => reopenFiscalYear(fiscalYearId)).toThrow('n\'est pas clôturé');
  });
});
```

- [ ] **Step 3 — Lancer les tests, vérifier qu'ils échouent**

```
cd app && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|PASS|getClosingPreview|closeFiscalYear|reopenFiscalYear)"
```

Expected: les 10 nouveaux tests échouent avec `getClosingPreview is not a function`.

- [ ] **Step 4 — Implémenter `getClosingPreview` dans `app/src/db/index.ts`**

Ajouter les imports nécessaires en haut du fichier (ajouter `ClosingAccountLine, ClosingPreview` dans l'import de types) :

```ts
import type {
  Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance,
  CreateJournalEntryPayload, UpdateJournalEntryPayload,
  OpeningBalanceSuggestion, OpeningBalanceLine,
  ClosingAccountLine, ClosingPreview,
} from '../types';
```

Ajouter la fonction après `createOpeningBalanceEntry` :

```ts
// ─── Clôture ──────────────────────────────────────────────────────────────────

export function getClosingPreview(fiscalYearId: number): ClosingPreview {
  const fy = getDb()
    .prepare('SELECT year FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');

  // Vérification comptes devant être à zéro
  const zeroRows = getDb().prepare(`
    SELECT
      a.number, a.name,
      COALESCE(
        CASE a.normal_balance
          WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit, 0))  - SUM(COALESCE(l.credit, 0))
          WHEN 'CREDIT' THEN SUM(COALESCE(l.credit, 0)) - SUM(COALESCE(l.debit, 0))
        END,
        0
      ) AS solde
    FROM accounts a
    LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      AND EXISTS (
        SELECT 1 FROM journal_entries e
        WHERE e.id = l.journal_entry_id AND e.fiscal_year_id = @fiscalYearId
      )
    WHERE a.must_be_zero_at_closing = 1 AND a.is_active = 1
    GROUP BY a.id
  `).all({ fiscalYearId }) as { number: string; name: string; solde: number }[];

  const blockers: string[] = [];
  for (const row of zeroRows) {
    if (row.solde !== 0) {
      const chf = (Math.abs(row.solde) / 100).toFixed(2);
      blockers.push(`${row.name} (${row.number}) : solde CHF ${chf} doit être à 0`);
    }
  }

  // Soldes des comptes de classe 3 et 4
  const rows = getDb().prepare(`
    SELECT
      a.id       AS accountId,
      a.number   AS accountNumber,
      a.name     AS accountName,
      a.type,
      COALESCE(
        CASE a.normal_balance
          WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit, 0))  - SUM(COALESCE(l.credit, 0))
          WHEN 'CREDIT' THEN SUM(COALESCE(l.credit, 0)) - SUM(COALESCE(l.debit, 0))
        END,
        0
      ) AS soldeCents
    FROM accounts a
    LEFT JOIN journal_entry_lines l ON l.account_id = a.id
      AND EXISTS (
        SELECT 1 FROM journal_entries e
        WHERE e.id = l.journal_entry_id AND e.fiscal_year_id = @fiscalYearId
      )
    WHERE a.class IN (3, 4) AND a.is_active = 1
    GROUP BY a.id
    ORDER BY a.number
  `).all({ fiscalYearId }) as ClosingAccountLine[];

  const accounts = rows.filter(r => r.soldeCents !== 0);

  const netResultCents = accounts.reduce((sum, a) => {
    if (a.type === 'PRODUIT') return sum + a.soldeCents;
    return sum - a.soldeCents;
  }, 0);

  return { blockers, accounts, netResultCents };
}
```

- [ ] **Step 5 — Implémenter `closeFiscalYear` dans `app/src/db/index.ts`**

Ajouter après `getClosingPreview` :

```ts
export function closeFiscalYear(fiscalYearId: number): void {
  const fy = getDb()
    .prepare('SELECT year, is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { year: number; is_closed: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');
  if (fy.is_closed) throw new Error('Cet exercice est déjà clôturé');

  const existing = getDb()
    .prepare('SELECT id FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
    .get(fiscalYearId);
  if (existing) throw new Error('Des écritures de clôture existent déjà pour cet exercice');

  const preview = getClosingPreview(fiscalYearId);
  if (preview.blockers.length > 0) {
    throw new Error(`Clôture impossible : ${preview.blockers.join('; ')}`);
  }

  const account900 = getDb()
    .prepare('SELECT id FROM accounts WHERE is_closing_account = 1')
    .get() as { id: number } | undefined;
  if (!account900) throw new Error('Compte Profits et Pertes (900) introuvable');

  const account290 = getDb()
    .prepare("SELECT id FROM accounts WHERE type = 'FONDS_PROPRES' AND is_active = 1")
    .get() as { id: number } | undefined;
  if (!account290) throw new Error('Compte Capital (290) introuvable');

  getDb().transaction(() => {
    const year = fy.year;
    const lineStmt = getDb().prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (@entry_id, @account_id, @debit, @credit)
    `);

    // Écriture 1 : soldage P&L
    if (preview.accounts.length > 0) {
      const entry1 = getDb().prepare(`
        INSERT INTO journal_entries (fiscal_year_id, date, description, is_closing_entry)
        VALUES (@fiscal_year_id, @date, @description, 1)
      `).run({
        fiscal_year_id: fiscalYearId,
        date: `${year}-12-31`,
        description: `Clôture — Soldage résultat ${year}`,
      });

      const lines: Array<{ account_id: number; debit: number | null; credit: number | null }> = [];
      for (const a of preview.accounts) {
        const amt = Math.abs(a.soldeCents);
        if (a.type === 'PRODUIT') {
          if (a.soldeCents > 0) {
            lines.push({ account_id: a.accountId,    debit: amt,  credit: null });
            lines.push({ account_id: account900!.id, debit: null, credit: amt  });
          } else {
            lines.push({ account_id: a.accountId,    debit: null, credit: amt  });
            lines.push({ account_id: account900!.id, debit: amt,  credit: null });
          }
        } else { // CHARGE
          if (a.soldeCents > 0) {
            lines.push({ account_id: a.accountId,    debit: null, credit: amt  });
            lines.push({ account_id: account900!.id, debit: amt,  credit: null });
          } else {
            lines.push({ account_id: a.accountId,    debit: amt,  credit: null });
            lines.push({ account_id: account900!.id, debit: null, credit: amt  });
          }
        }
      }
      validateEntryBalance(lines);
      for (const l of lines) {
        lineStmt.run({ entry_id: entry1.lastInsertRowid, account_id: l.account_id, debit: l.debit, credit: l.credit });
      }
    }

    // Écriture 2 : transfert vers Capital
    if (preview.netResultCents !== 0) {
      const entry2 = getDb().prepare(`
        INSERT INTO journal_entries (fiscal_year_id, date, description, is_closing_entry)
        VALUES (@fiscal_year_id, @date, @description, 1)
      `).run({
        fiscal_year_id: fiscalYearId,
        date: `${year}-12-31`,
        description: `Clôture — Transfert vers Capital ${year}`,
      });

      const amt = Math.abs(preview.netResultCents);
      if (preview.netResultCents > 0) {
        // Bénéfice : DÉBIT 900, CRÉDIT 290
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account900!.id, debit: amt,  credit: null });
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account290!.id, debit: null, credit: amt  });
      } else {
        // Perte : CRÉDIT 900, DÉBIT 290
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account900!.id, debit: null, credit: amt  });
        lineStmt.run({ entry_id: entry2.lastInsertRowid, account_id: account290!.id, debit: amt,  credit: null });
      }
    }

    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fiscalYearId);
  })();
}
```

- [ ] **Step 6 — Implémenter `reopenFiscalYear` dans `app/src/db/index.ts`**

Ajouter après `closeFiscalYear` :

```ts
export function reopenFiscalYear(fiscalYearId: number): void {
  const fy = getDb()
    .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { is_closed: number } | undefined;
  if (!fy) throw new Error('Exercice introuvable');
  if (!fy.is_closed) throw new Error('Cet exercice n\'est pas clôturé');

  getDb().transaction(() => {
    getDb()
      .prepare('DELETE FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1')
      .run(fiscalYearId);
    getDb()
      .prepare('UPDATE fiscal_years SET is_closed = 0 WHERE id = ?')
      .run(fiscalYearId);
  })();
}
```

- [ ] **Step 7 — Lancer les tests et vérifier le passage**

```
cd app && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: **259 tests pass** (249 existants + 10 nouveaux). Zero failures.

- [ ] **Step 8 — Commit**

```
git add app/src/types/index.ts app/src/db/index.ts app/src/__tests__/db.test.ts
git commit -m "feat: types + DB — getClosingPreview, closeFiscalYear, reopenFiscalYear"
```

---

## Task 2 — IPC handlers + preload + window.d.ts + tests IPC

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Create: `app/src/__tests__/ipc-closing-handlers.test.ts`

**Interfaces:**
- Consumes (from Task 1):
  - `getClosingPreview(fiscalYearId: number): ClosingPreview`
  - `closeFiscalYear(fiscalYearId: number): void`
  - `reopenFiscalYear(fiscalYearId: number): void`
  - `ClosingPreview` (type)
- Produces:
  - `window.api.getClosingPreview(fiscalYearId: number): Promise<ClosingPreview>`
  - `window.api.closeFiscalYear(fiscalYearId: number): Promise<void>`
  - `window.api.reopenFiscalYear(fiscalYearId: number): Promise<void>`

---

- [ ] **Step 1 — Écrire le fichier de tests IPC (il doit échouer)**

Créer `app/src/__tests__/ipc-closing-handlers.test.ts` :

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
  getClosingPreview:            vi.fn(),
  closeFiscalYear:              vi.fn(),
  reopenFiscalYear:             vi.fn(),
  getDb:    vi.fn(),
  getDbDir: vi.fn().mockReturnValue('/tmp'),
}));

vi.mock('../backup',   () => ({ listBackups: vi.fn(), formatBackupFilename: vi.fn() }));
vi.mock('../settings', () => ({ readSettings: vi.fn(), writeSettings: vi.fn() }));
vi.mock('../migrate',  () => ({ migrateDataDir: vi.fn() }));

import { getClosingPreview, closeFiscalYear, reopenFiscalYear } from '../db';
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
  it('enregistre closing:getPreview, closing:close, closing:reopen', () => {
    expect(handlers.has('closing:getPreview')).toBe(true);
    expect(handlers.has('closing:close')).toBe(true);
    expect(handlers.has('closing:reopen')).toBe(true);
  });
});

describe('closing:getPreview', () => {
  it('délègue à getClosingPreview et retourne le résultat', async () => {
    const preview = { blockers: [], accounts: [], netResultCents: 0 };
    vi.mocked(getClosingPreview).mockReturnValue(preview);
    const result = await call('closing:getPreview', 1);
    expect(getClosingPreview).toHaveBeenCalledWith(1);
    expect(result).toBe(preview);
  });

  it('propage les erreurs de getClosingPreview', async () => {
    vi.mocked(getClosingPreview).mockImplementation(() => { throw new Error('Exercice introuvable'); });
    await expect(call('closing:getPreview', 999)).rejects.toThrow('Exercice introuvable');
  });
});

describe('closing:close', () => {
  it('délègue à closeFiscalYear', async () => {
    vi.mocked(closeFiscalYear).mockReturnValue(undefined);
    await call('closing:close', 1);
    expect(closeFiscalYear).toHaveBeenCalledWith(1);
  });

  it('propage les erreurs de closeFiscalYear', async () => {
    vi.mocked(closeFiscalYear).mockImplementation(() => { throw new Error('déjà clôturé'); });
    await expect(call('closing:close', 1)).rejects.toThrow('déjà clôturé');
  });
});

describe('closing:reopen', () => {
  it('délègue à reopenFiscalYear', async () => {
    vi.mocked(reopenFiscalYear).mockReturnValue(undefined);
    await call('closing:reopen', 1);
    expect(reopenFiscalYear).toHaveBeenCalledWith(1);
  });

  it('propage les erreurs de reopenFiscalYear', async () => {
    vi.mocked(reopenFiscalYear).mockImplementation(() => { throw new Error('n\'est pas clôturé'); });
    await expect(call('closing:reopen', 1)).rejects.toThrow('n\'est pas clôturé');
  });
});
```

- [ ] **Step 2 — Lancer les tests, vérifier qu'ils échouent**

```
cd app && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|closing:)"
```

Expected: les 6 nouveaux tests échouent avec `Canal non enregistré : closing:getPreview`.

- [ ] **Step 3 — Ajouter les imports dans `app/src/ipc-handlers.ts`**

Remplacer la ligne d'import depuis `'./db'` par :

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
  getClosingPreview,
  closeFiscalYear,
  reopenFiscalYear,
  getDb,
  getDbDir,
} from './db';
```

- [ ] **Step 4 — Enregistrer les 3 nouveaux canaux dans `app/src/ipc-handlers.ts`**

Ajouter après le bloc `// ─── Soldes à nouveau ───` (avant la dernière accolade de `registerIpcHandlers`) :

```ts
  // ─── Clôture ─────────────────────────────────────────────────────────────────
  ipcMain.handle('closing:getPreview', (_e, fiscalYearId: number) =>
    getClosingPreview(fiscalYearId));

  ipcMain.handle('closing:close', (_e, fiscalYearId: number) =>
    closeFiscalYear(fiscalYearId));

  ipcMain.handle('closing:reopen', (_e, fiscalYearId: number) =>
    reopenFiscalYear(fiscalYearId));
```

- [ ] **Step 5 — Mettre à jour `app/src/preload.ts`**

**5a.** Étendre l'import des types (ajouter `ClosingPreview`) :

```ts
import type {
  Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance,
  CreateJournalEntryPayload, UpdateJournalEntryPayload,
  BackupInfo, OpeningBalanceSuggestion, OpeningBalanceLine,
  ClosingPreview,
} from './types';
```

**5b.** Ajouter dans l'objet `contextBridge.exposeInMainWorld` (après `createOpeningBalance`) :

```ts
  // Clôture
  getClosingPreview: (fiscalYearId: number) =>
    ipcRenderer.invoke('closing:getPreview', fiscalYearId),
  closeFiscalYear:   (fiscalYearId: number) =>
    ipcRenderer.invoke('closing:close', fiscalYearId),
  reopenFiscalYear:  (fiscalYearId: number) =>
    ipcRenderer.invoke('closing:reopen', fiscalYearId),
```

**5c.** Ajouter dans le type `ElectronAPI` (après `createOpeningBalance`) :

```ts
  getClosingPreview: (fiscalYearId: number) => Promise<ClosingPreview>;
  closeFiscalYear:   (fiscalYearId: number) => Promise<void>;
  reopenFiscalYear:  (fiscalYearId: number) => Promise<void>;
```

- [ ] **Step 6 — Mettre à jour `app/src/window.d.ts`**

**6a.** Ajouter `ClosingPreview` dans l'import :

```ts
import type {
  Account,
  FiscalYear,
  JournalEntry,
  JournalEntryLine,
  AccountBalance,
  CreateJournalEntryPayload,
  UpdateJournalEntryPayload,
  BackupInfo,
  OpeningBalanceSuggestion,
  OpeningBalanceLine,
  ClosingPreview,
} from './types';
```

**6b.** Ajouter dans l'interface `Window['api']` (après `createOpeningBalance`) :

```ts
      getClosingPreview: (fiscalYearId: number) => Promise<ClosingPreview>;
      closeFiscalYear:   (fiscalYearId: number) => Promise<void>;
      reopenFiscalYear:  (fiscalYearId: number) => Promise<void>;
```

- [ ] **Step 7 — Lancer les tests et vérifier le passage**

```
cd app && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: **265 tests pass** (259 + 6 nouveaux). Zero failures.

- [ ] **Step 8 — Commit**

```
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts app/src/__tests__/ipc-closing-handlers.test.ts
git commit -m "feat: IPC handlers + preload — closing:getPreview, closing:close, closing:reopen"
```

---

## Task 3 — Composant ClosingModal + tests

**Files:**
- Create: `app/src/components/ClosingModal.tsx`
- Create: `app/src/__tests__/renderer/ClosingModal.test.tsx`

**Interfaces:**
- Consumes (from Tasks 1–2):
  - `ClosingPreview` (type depuis `../types`)
  - `window.api.closeFiscalYear(fiscalYearId: number): Promise<void>`
- Produces:
  ```ts
  interface ClosingModalProps {
    fiscalYearId: number;
    year: number;
    preview: ClosingPreview;
    onClose: () => void;
    onSuccess: () => void;
  }
  ```

---

- [ ] **Step 1 — Écrire les tests (ils doivent échouer)**

Créer `app/src/__tests__/renderer/ClosingModal.test.tsx` :

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClosingPreview } from '../../types';
import ClosingModal from '../../components/ClosingModal';

const mockPreview: ClosingPreview = {
  blockers: [],
  accounts: [
    { accountId: 10, accountNumber: '300', accountName: 'Cotisations membres', type: 'PRODUIT', soldeCents: 141000 },
    { accountId: 11, accountNumber: '400', accountName: 'Assurances',           type: 'CHARGE', soldeCents:  35000 },
  ],
  netResultCents: 106000,
};

beforeEach(() => {
  vi.stubGlobal('api', {
    closeFiscalYear:  vi.fn().mockResolvedValue(undefined),
    reopenFiscalYear: vi.fn().mockResolvedValue(undefined),
  });
});

describe('ClosingModal', () => {
  it('affiche le titre avec l\'année', () => {
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Clôture de l'exercice 2025/ })).toBeInTheDocument();
  });

  it('affiche la table des comptes à solder', () => {
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
    expect(screen.getByText('Assurances')).toBeInTheDocument();
  });

  it('affiche le résultat net (bénéfice)', () => {
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Bénéfice CHF 1060\.00/)).toBeInTheDocument();
  });

  it('affiche les blockers et désactive le bouton Confirmer', () => {
    const previewBlocked: ClosingPreview = {
      ...mockPreview,
      blockers: ['Twint (102) : solde CHF 45.00 doit être à 0'],
    };
    render(<ClosingModal fiscalYearId={1} year={2025} preview={previewBlocked} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Twint/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer la clôture' })).toBeDisabled();
  });

  it('"Annuler" appelle onClose sans appel API', async () => {
    const onClose = vi.fn();
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={onClose} onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(window.api.closeFiscalYear).not.toHaveBeenCalled();
  });

  it('"Confirmer la clôture" appelle closeFiscalYear puis onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
    expect(window.api.closeFiscalYear).toHaveBeenCalledWith(1);
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('affiche un bandeau erreur si closeFiscalYear rejette', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      closeFiscalYear: vi.fn().mockRejectedValue(new Error('Clôture impossible')),
    });
    render(<ClosingModal fiscalYearId={1} year={2025} preview={mockPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la clôture' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Clôture impossible');
  });

  it('affiche le résultat net perte si netResultCents < 0', () => {
    const lossPreview: ClosingPreview = { ...mockPreview, netResultCents: -5000 };
    render(<ClosingModal fiscalYearId={1} year={2025} preview={lossPreview} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Perte CHF 50\.00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 — Lancer les tests, vérifier qu'ils échouent**

```
cd app && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|ClosingModal)"
```

Expected: les 8 tests échouent avec `Cannot find module '../../components/ClosingModal'`.

- [ ] **Step 3 — Créer `app/src/components/ClosingModal.tsx`**

```tsx
import { useState } from 'react';
import type { ClosingPreview } from '../types';

interface ClosingModalProps {
  fiscalYearId: number;
  year: number;
  preview: ClosingPreview;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ClosingModal({ fiscalYearId, year, preview, onClose, onSuccess }: ClosingModalProps) {
  const [closing, setClosing] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const hasBlockers = preview.blockers.length > 0;

  async function handleConfirm() {
    setClosing(true);
    setError(null);
    try {
      await window.api.closeFiscalYear(fiscalYearId);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClosing(false);
    }
  }

  const netCHF    = (Math.abs(preview.netResultCents) / 100).toFixed(2);
  const isProfit  = preview.netResultCents >= 0;

  return (
    <div style={s.overlay}>
      <div style={s.card} role="dialog" aria-modal="true" aria-labelledby="closing-title">
        <h2 id="closing-title" style={s.title}>Clôture de l&apos;exercice {year}</h2>

        {error && <div role="alert" style={s.alertError}>{error}</div>}

        <p style={s.warning}>
          ⚠ Cette opération peut être annulée via &quot;Rouvrir l&apos;exercice&quot;.
        </p>

        {hasBlockers ? (
          <div style={s.blockerBox}>
            {preview.blockers.map((b, i) => (
              <p key={i} style={s.blockerLine}>✗ {b}</p>
            ))}
            <p style={s.blockerHint}>La clôture ne peut pas être effectuée.</p>
          </div>
        ) : (
          <>
            {preview.accounts.length > 0 && (
              <>
                <p style={s.sectionLabel}>Comptes soldés vers 900 — Profits et Pertes</p>
                <table style={s.table}>
                  <tbody>
                    {preview.accounts.map(a => (
                      <tr key={a.accountId} style={s.row}>
                        <td style={s.tdNum}>{a.accountNumber}</td>
                        <td style={s.tdName}>{a.accountName}</td>
                        <td style={s.tdType}>{a.type === 'PRODUIT' ? 'Produit' : 'Charge'}</td>
                        <td style={s.tdAmount}>{(Math.abs(a.soldeCents) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p style={s.result}>
              Résultat net : <strong>{isProfit ? 'Bénéfice' : 'Perte'} CHF {netCHF}</strong>
              {preview.netResultCents !== 0 && ' → 900 Profits et Pertes → 290 Capital'}
            </p>
          </>
        )}

        <div style={s.actions}>
          <button onClick={onClose} disabled={closing} style={s.btnCancel}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={hasBlockers || closing}
            style={{ ...s.btnConfirm, ...(hasBlockers || closing ? s.btnDisabled : {}) }}
          >
            {closing ? 'Clôture en cours…' : 'Confirmer la clôture'}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay:      { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  card:         { background: '#fff', borderRadius: '10px', padding: '1.75rem', width: '560px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' as const, boxShadow: '0 8px 32px rgba(0,0,0,.18)' },
  title:        { margin: '0 0 1rem', fontSize: '1.1rem', color: '#0f172a' },
  alertError:   { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.6rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem', color: '#dc2626', fontSize: '0.875rem' },
  warning:      { margin: '0 0 1rem', fontSize: '0.85rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.5rem 0.75rem', borderRadius: '6px' },
  blockerBox:   { background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem' },
  blockerLine:  { margin: '0 0 0.25rem', color: '#dc2626', fontSize: '0.875rem' },
  blockerHint:  { margin: '0.5rem 0 0', color: '#7f1d1d', fontSize: '0.8rem', fontStyle: 'italic' as const },
  sectionLabel: { margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: '#334155' },
  table:        { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', marginBottom: '1rem', background: '#f8fafc', borderRadius: '6px', overflow: 'hidden' },
  row:          { borderBottom: '1px solid #e2e8f0' },
  tdNum:        { padding: '0.35rem 0.75rem', color: '#64748b', fontFamily: 'monospace' },
  tdName:       { padding: '0.35rem 0.5rem', color: '#334155', width: '100%' },
  tdType:       { padding: '0.35rem 0.5rem', color: '#64748b', whiteSpace: 'nowrap' as const },
  tdAmount:     { padding: '0.35rem 0.75rem', textAlign: 'right' as const, fontFamily: 'monospace', color: '#334155' },
  result:       { margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#334155' },
  actions:      { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' },
  btnCancel:    { padding: '0.45rem 1rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' },
  btnConfirm:   { padding: '0.45rem 1.1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 as const },
  btnDisabled:  { background: '#94a3b8', cursor: 'not-allowed' },
} as const;
```

- [ ] **Step 4 — Lancer les tests et vérifier le passage**

```
cd app && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: **273 tests pass** (265 + 8 nouveaux). Zero failures.

- [ ] **Step 5 — Commit**

```
git add app/src/components/ClosingModal.tsx app/src/__tests__/renderer/ClosingModal.test.tsx
git commit -m "feat: composant ClosingModal (aperçu + confirmation clôture)"
```

---

## Task 4 — Intégration FiscalYearsPage + tests

**Files:**
- Modify: `app/src/pages/FiscalYearsPage.tsx`
- Modify: `app/src/__tests__/renderer/FiscalYearsPage.test.tsx`

**Interfaces:**
- Consumes (from Tasks 1–3):
  - `ClosingPreview` (type)
  - `ClosingModal` (composant, props: `fiscalYearId, year, preview, onClose, onSuccess`)
  - `ConfirmDialog` (composant existant — `app/src/components/ConfirmDialog.tsx`, props: `message, onConfirm, onCancel`)
  - `window.api.getClosingPreview(fiscalYearId): Promise<ClosingPreview>`
  - `window.api.closeFiscalYear(fiscalYearId): Promise<void>`
  - `window.api.reopenFiscalYear(fiscalYearId): Promise<void>`

---

- [ ] **Step 1 — Écrire les nouveaux tests dans `app/src/__tests__/renderer/FiscalYearsPage.test.tsx`**

**1a.** Mettre à jour la fonction `mockApi` pour inclure les nouvelles méthodes (ajouter au corps de `vi.stubGlobal`) :

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
    getClosingPreview:  vi.fn().mockResolvedValue({ blockers: [], accounts: [], netResultCents: 0 }),
    closeFiscalYear:    vi.fn().mockResolvedValue(undefined),
    reopenFiscalYear:   vi.fn().mockResolvedValue(undefined),
  });
}
```

**1b.** Ajouter le bloc `describe` suivant à la fin du fichier :

```ts
describe('FiscalYearsPage — clôture', () => {
  it('affiche la colonne "Actions"', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('affiche le bouton "Clôturer l\'exercice" sur un exercice ouvert', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('button', { name: 'Clôturer l\'exercice' })).toBeInTheDocument();
  });

  it('affiche le bouton "Rouvrir" sur un exercice clôturé', async () => {
    mockApi([fy2024closed]);
    render(<FiscalYearsPage />);
    expect(await screen.findByRole('button', { name: 'Rouvrir' })).toBeInTheDocument();
  });

  it('ClosingModal s\'ouvre après clic "Clôturer l\'exercice"', async () => {
    mockApi([fy2025]);
    render(<FiscalYearsPage />);
    await screen.findByText('2025');
    await userEvent.click(screen.getByRole('button', { name: 'Clôturer l\'exercice' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('ConfirmDialog s\'affiche après clic "Rouvrir"', async () => {
    mockApi([fy2024closed]);
    render(<FiscalYearsPage />);
    await screen.findByText('2024');
    await userEvent.click(screen.getByRole('button', { name: 'Rouvrir' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('la liste se rafraîchit après une réouverture confirmée', async () => {
    const getFiscalYears = vi.fn()
      .mockResolvedValueOnce([fy2024closed])
      .mockResolvedValueOnce([{ ...fy2024closed, is_closed: false }]);
    vi.stubGlobal('api', { ...window.api, getFiscalYears });
    render(<FiscalYearsPage />);
    await screen.findByText('2024');
    await userEvent.click(screen.getByRole('button', { name: 'Rouvrir' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
    expect(getFiscalYears).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2 — Lancer les tests, vérifier qu'ils échouent**

```
cd app && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|clôture)"
```

Expected: les 6 nouveaux tests échouent (colonne Actions et boutons absents).

- [ ] **Step 3 — Mettre à jour `app/src/pages/FiscalYearsPage.tsx`**

**3a.** Modifier les imports en haut du fichier :

```ts
import { useEffect, useState } from 'react';
import type { FiscalYear, OpeningBalanceSuggestion, ClosingPreview } from '../types';
import OpeningBalanceModal from '../components/OpeningBalanceModal';
import ClosingModal from '../components/ClosingModal';
import ConfirmDialog from '../components/ConfirmDialog';
```

**3b.** Ajouter les deux nouveaux états après les états existants (`modalFiscalYear`, `suggestions`) :

```ts
  const [closingModal,  setClosingModal]  = useState<{ id: number; year: number; preview: ClosingPreview } | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<{ id: number; year: number } | null>(null);
```

**3c.** Ajouter les deux nouveaux handlers après `handleModalSuccess` :

```ts
  async function handleCloseExercise(y: FiscalYear) {
    try {
      const preview = await window.api.getClosingPreview(y.id);
      setClosingModal({ id: y.id, year: y.year, preview });
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  function handleReopenClick(y: FiscalYear) {
    setConfirmReopen({ id: y.id, year: y.year });
  }

  async function handleReopenConfirm() {
    if (!confirmReopen) return;
    try {
      await window.api.reopenFiscalYear(confirmReopen.id);
      setConfirmReopen(null);
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
      setConfirmReopen(null);
    }
  }

  function handleClosingSuccess() {
    setClosingModal(null);
    load();
  }
```

**3d.** Modifier le `<thead>` de la table pour ajouter la colonne Actions. Remplacer :

```tsx
              <tr style={s.theadRow}>
                <th style={s.th}>Année</th>
                <th style={s.th}>Début</th>
                <th style={s.th}>Fin</th>
                <th style={s.th}>Statut</th>
                <th style={s.th}>Soldes à nouveau</th>
              </tr>
```

par :

```tsx
              <tr style={s.theadRow}>
                <th style={s.th}>Année</th>
                <th style={s.th}>Début</th>
                <th style={s.th}>Fin</th>
                <th style={s.th}>Statut</th>
                <th style={s.th}>Soldes à nouveau</th>
                <th style={s.th}>Actions</th>
              </tr>
```

**3e.** Ajouter la cellule Actions dans chaque ligne `<tr>`. À l'intérieur du `.map(y => (...))`, après la cellule `<td>` des soldes à nouveau, ajouter :

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
                  </td>
```

**3f.** Ajouter le style `btnReopen` dans l'objet `s` :

```ts
  btnReopen: { padding: '0.25rem 0.6rem', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: '5px', fontSize: '0.78rem', cursor: 'pointer' },
```

**3g.** Ajouter les deux composants conditionnels à la fin du `return`, après le bloc `{modalFiscalYear && <OpeningBalanceModal .../>}` :

```tsx
      {closingModal && (
        <ClosingModal
          fiscalYearId={closingModal.id}
          year={closingModal.year}
          preview={closingModal.preview}
          onClose={() => setClosingModal(null)}
          onSuccess={handleClosingSuccess}
        />
      )}
      {confirmReopen && (
        <ConfirmDialog
          message={`Rouvrir l'exercice ${confirmReopen.year} ? Les écritures de clôture seront supprimées et l'exercice repassera en statut ouvert.`}
          onConfirm={handleReopenConfirm}
          onCancel={() => setConfirmReopen(null)}
        />
      )}
```

- [ ] **Step 4 — Lancer la suite complète**

```
cd app && npm test -- --reporter=verbose 2>&1 | tail -20
```

Expected: **279 tests pass** (273 + 6 nouveaux). Zero failures.

- [ ] **Step 5 — Commit**

```
git add app/src/pages/FiscalYearsPage.tsx app/src/__tests__/renderer/FiscalYearsPage.test.tsx
git commit -m "feat: intégration FiscalYearsPage — clôture et réouverture d'exercice"
```
