# Journal avec filtres, modification et suppression — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter des filtres (libellé, compte, dates) à la vue journal, une modale de saisie/modification, et la suppression d'écritures.

**Architecture:** Filtrage en mémoire côté renderer (pur TypeScript, pas d'IPC). Deux nouveaux handlers IPC pour update/delete. L'`EntryForm` existant est étendu avec un mode édition via une prop `editEntry?`. Une `EntryFormModal` wrape l'`EntryForm` dans un overlay.

**Tech Stack:** TypeScript, React, better-sqlite3, Vitest, React Testing Library, jsdom.

## Global Constraints

- Montants en centimes (INTEGER) — jamais de float. `formatAmount` / `parseAmount` dans `src/lib/accounting.ts`.
- `window.api` exposé via `contextBridge` — toute nouvelle fonction doit être déclarée dans `preload.ts`, `window.d.ts` et enregistrée dans `main.ts`.
- Tests renderer : `// @vitest-environment jsdom` en première ligne. API mockée via `vi.stubGlobal('api', {...})`.
- Tests DB : SQLite en mémoire via `openDatabase(':memory:')`, `vi.mock('electron', ...)` en premier.
- Commande de test depuis `app/` : `npm test` (tous) ou `npx vitest run src/__tests__/<fichier>` (ciblé).

---

### Task 1 — Nouveaux types dans types/index.ts

**Files:**
- Modify: `app/src/types/index.ts`

*(Pas de test — déclarations de types pures.)*

- [ ] **Step 1 : Ajouter les types à la fin de `app/src/types/index.ts`**

```typescript
export interface JournalFilters {
  text: string;
  accountId: number | null;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_FILTERS: JournalFilters = {
  text: '',
  accountId: null,
  dateFrom: '',
  dateTo: '',
};

export interface UpdateJournalEntryPayload {
  id: number;
  date: string;
  description: string;
  piece?: string;
  lines: Array<{ account_id: number; debit?: number; credit?: number }>;
}
```

- [ ] **Step 2 : Vérifier la compilation TypeScript**

```bash
cd app && npx tsc --noEmit
```
Expected : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add app/src/types/index.ts
git commit -m "feat: ajouter JournalFilters, DEFAULT_FILTERS et UpdateJournalEntryPayload"
```

---

### Task 2 — Fonctions DB : updateJournalEntry et deleteJournalEntry

**Files:**
- Modify: `app/src/db/index.ts`
- Test: `app/src/__tests__/db.test.ts`

**Interfaces:**
- Consumes: `UpdateJournalEntryPayload` (Task 1), `validateEntryBalance` (accounting.ts)
- Produces: `updateJournalEntry(payload)`, `deleteJournalEntry(id)`

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/db.test.ts`**

Ajouter à la fin du fichier existant (après le `describe('Soldes par compte', ...)`) :

```typescript
describe('updateJournalEntry', () => {
  let fiscalYearId: number;
  let caisseId: number;
  let cotisationsId: number;
  let entryId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    caisseId      = accounts.find(a => a.number === '100')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    const entry = createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Cotisation initiale',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    entryId = entry.id;
  });

  it('modifie le libellé, la date et la pièce', () => {
    const updated = updateJournalEntry({
      id: entryId,
      date: '2025-04-01',
      description: 'Cotisation corrigée',
      piece: 'P-001',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    expect(updated.description).toBe('Cotisation corrigée');
    expect(updated.date).toBe('2025-04-01');
    expect(updated.piece).toBe('P-001');
  });

  it('remplace les lignes avec un nombre différent de lignes', () => {
    const raiffeisenId = getAllAccounts().find(a => a.number === '101')!.id;
    const updated = updateJournalEntry({
      id: entryId,
      date: '2025-03-08',
      description: 'Écriture complexe',
      lines: [
        { account_id: caisseId,      debit:  1000 },
        { account_id: raiffeisenId,  debit:  2000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    expect(updated.lines).toHaveLength(3);
    expect(updated.lines.reduce((s, l) => s + (l.debit ?? 0), 0)).toBe(3000);
  });

  it('rejette la modification sur un exercice clôturé', () => {
    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fiscalYearId);
    expect(() => updateJournalEntry({
      id: entryId,
      date: '2025-03-08',
      description: 'Test',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    })).toThrow('clôturé');
  });

  it('rejette une écriture introuvable', () => {
    expect(() => updateJournalEntry({
      id: 9999,
      date: '2025-03-08',
      description: 'Test',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    })).toThrow('introuvable');
  });
});

describe('deleteJournalEntry', () => {
  let fiscalYearId: number;
  let caisseId: number;
  let cotisationsId: number;
  let entryId: number;

  beforeEach(() => {
    freshDb();
    const fy = createFiscalYear(2025);
    fiscalYearId = fy.id;
    const accounts = getAllAccounts();
    caisseId      = accounts.find(a => a.number === '100')!.id;
    cotisationsId = accounts.find(a => a.number === '300')!.id;
    const entry = createJournalEntry({
      fiscal_year_id: fiscalYearId,
      date: '2025-03-08',
      description: 'Écriture à supprimer',
      lines: [
        { account_id: caisseId,      debit:  3000 },
        { account_id: cotisationsId, credit: 3000 },
      ],
    });
    entryId = entry.id;
  });

  it('supprime l\'écriture et ses lignes en cascade', () => {
    deleteJournalEntry(entryId);
    expect(getJournalEntries(fiscalYearId)).toHaveLength(0);
  });

  it('rejette la suppression sur un exercice clôturé', () => {
    getDb().prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fiscalYearId);
    expect(() => deleteJournalEntry(entryId)).toThrow('clôturé');
  });

  it('rejette la suppression d\'une écriture introuvable', () => {
    expect(() => deleteJournalEntry(9999)).toThrow('introuvable');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npx vitest run src/__tests__/db.test.ts
```
Expected : FAIL — `updateJournalEntry is not a function`, `deleteJournalEntry is not a function`.

- [ ] **Step 3 : Implémenter dans `app/src/db/index.ts`**

Ajouter les imports nécessaires en tête du fichier :
```typescript
import type { Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance, CreateJournalEntryPayload, UpdateJournalEntryPayload } from '../types';
```

Ajouter à la fin de `app/src/db/index.ts` (après `getAccountBalances`) :

```typescript
export function updateJournalEntry(
  payload: UpdateJournalEntryPayload,
): JournalEntry & { lines: JournalEntryLine[] } {
  const { id, date, description, piece, lines } = payload;

  const existing = getDb()
    .prepare('SELECT fiscal_year_id FROM journal_entries WHERE id = ?')
    .get(id) as { fiscal_year_id: number } | undefined;
  if (!existing) throw new Error('Écriture introuvable');

  const fy = getDb()
    .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
    .get(existing.fiscal_year_id) as { is_closed: number };
  if (fy.is_closed) throw new Error('Cet exercice est clôturé — aucune modification possible');

  validateEntryBalance(lines);

  return getDb().transaction(() => {
    getDb()
      .prepare('DELETE FROM journal_entry_lines WHERE journal_entry_id = ?')
      .run(id);

    getDb().prepare(`
      UPDATE journal_entries
      SET date = @date, description = @description, piece = @piece, updated_at = datetime('now')
      WHERE id = @id
    `).run({ id, date, description, piece: piece ?? null });

    const lineStmt = getDb().prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
      VALUES (@journal_entry_id, @account_id, @debit, @credit)
    `);
    for (const l of lines) {
      lineStmt.run({
        journal_entry_id: id,
        account_id: l.account_id,
        debit:  l.debit  ?? null,
        credit: l.credit ?? null,
      });
    }

    const updated = getDb()
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(id) as JournalEntry;
    const updatedLines = getDb()
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(id) as JournalEntryLine[];
    return { ...updated, lines: updatedLines };
  })();
}

export function deleteJournalEntry(id: number): void {
  const existing = getDb()
    .prepare('SELECT fiscal_year_id FROM journal_entries WHERE id = ?')
    .get(id) as { fiscal_year_id: number } | undefined;
  if (!existing) throw new Error('Écriture introuvable');

  const fy = getDb()
    .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
    .get(existing.fiscal_year_id) as { is_closed: number };
  if (fy.is_closed) throw new Error('Cet exercice est clôturé — aucune modification possible');

  getDb().prepare('DELETE FROM journal_entries WHERE id = ?').run(id);
}
```

Ajouter également `getDb` aux exports utilisés dans les tests (il est déjà exporté depuis db/index.ts — vérifier l'import dans le test) :

Dans le fichier de test `db.test.ts`, ajouter `getDb` à la ligne d'import :
```typescript
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
} from '../db';
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd app && npx vitest run src/__tests__/db.test.ts
```
Expected : tous les tests passent (y compris les 19 existants + 7 nouveaux = 26).

- [ ] **Step 5 : Commit**

```bash
git add app/src/db/index.ts app/src/__tests__/db.test.ts
git commit -m "feat: implémenter updateJournalEntry et deleteJournalEntry avec tests"
```

---

### Task 3 — Couche IPC : exposer update et delete

**Files:**
- Modify: `app/src/main.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`

*(Pas de test dédié — les handlers sont de fines glues testées par les tests DB et renderer.)*

- [ ] **Step 1 : Ajouter les handlers dans `app/src/main.ts`**

Dans les imports :
```typescript
import {
  openDatabase,
  getAllAccounts,
  getActiveAccounts,
  getAllFiscalYears,
  createFiscalYear,
  getJournalEntries,
  createJournalEntry,
  getAccountBalances,
  updateJournalEntry,
  deleteJournalEntry,
} from './db';
import type { CreateJournalEntryPayload, UpdateJournalEntryPayload } from './types';
```

Dans `registerIpcHandlers()`, ajouter après `db:createJournalEntry` :
```typescript
ipcMain.handle('db:updateJournalEntry', (_e, payload: UpdateJournalEntryPayload) => updateJournalEntry(payload));
ipcMain.handle('db:deleteJournalEntry', (_e, id: number) => deleteJournalEntry(id));
```

- [ ] **Step 2 : Exposer dans `app/src/preload.ts`**

Dans les imports :
```typescript
import type { Account, FiscalYear, JournalEntry, JournalEntryLine, AccountBalance, CreateJournalEntryPayload, UpdateJournalEntryPayload } from './types';
```

Dans `contextBridge.exposeInMainWorld('api', {...})`, ajouter :
```typescript
updateJournalEntry: (payload: UpdateJournalEntryPayload) => ipcRenderer.invoke('db:updateJournalEntry', payload),
deleteJournalEntry: (id: number)                         => ipcRenderer.invoke('db:deleteJournalEntry', id),
```

Dans le type `ElectronAPI` exporté :
```typescript
updateJournalEntry: (payload: UpdateJournalEntryPayload) => Promise<JournalEntry & { lines: JournalEntryLine[] }>;
deleteJournalEntry: (id: number) => Promise<void>;
```

- [ ] **Step 3 : Mettre à jour `app/src/window.d.ts`**

```typescript
import type {
  Account,
  FiscalYear,
  JournalEntry,
  JournalEntryLine,
  AccountBalance,
  CreateJournalEntryPayload,
  UpdateJournalEntryPayload,
} from './types';

declare global {
  interface Window {
    api: {
      getAccounts:        () => Promise<Account[]>;
      getActiveAccounts:  () => Promise<Account[]>;
      getFiscalYears:     () => Promise<FiscalYear[]>;
      createFiscalYear:   (year: number) => Promise<FiscalYear>;
      getJournalEntries:  (fiscalYearId: number) => Promise<(JournalEntry & { lines: JournalEntryLine[] })[]>;
      createJournalEntry: (payload: CreateJournalEntryPayload) => Promise<JournalEntry>;
      updateJournalEntry: (payload: UpdateJournalEntryPayload) => Promise<JournalEntry & { lines: JournalEntryLine[] }>;
      deleteJournalEntry: (id: number) => Promise<void>;
      getAccountBalances: (fiscalYearId: number) => Promise<AccountBalance[]>;
    };
  }
}
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
cd app && npx tsc --noEmit
```
Expected : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add app/src/main.ts app/src/preload.ts app/src/window.d.ts
git commit -m "feat: exposer updateJournalEntry et deleteJournalEntry via IPC"
```

---

### Task 4 — Fonction pure applyFilters

**Files:**
- Create: `app/src/lib/journalFilters.ts`
- Test: `app/src/__tests__/journalFilters.test.ts`

**Interfaces:**
- Consumes: `JournalEntry`, `JournalEntryLine`, `JournalFilters`, `DEFAULT_FILTERS` (types/index.ts Task 1)
- Produces: `EntryWithLines` (type), `applyFilters(entries, filters)` (importés par JournalPage Task 9)

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/journalFilters.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import type { JournalEntry, JournalEntryLine } from '../types';
import { DEFAULT_FILTERS, applyFilters } from '../lib/journalFilters';
import type { EntryWithLines } from '../lib/journalFilters';

function makeEntry(
  id: number,
  date: string,
  description: string,
  piece: string | null,
  lines: Array<{ account_id: number; debit: number | null; credit: number | null }>,
): EntryWithLines {
  return {
    id, fiscal_year_id: 1, date, description, piece,
    is_opening_balance: false, is_closing_entry: false,
    created_at: '', updated_at: '',
    lines: lines.map((l, i) => ({
      id: i + 1, journal_entry_id: id,
      account_id: l.account_id, debit: l.debit, credit: l.credit,
      created_at: '',
    })),
  };
}

const e1 = makeEntry(1, '2025-03-01', 'Cotisation membre', 'P-001', [
  { account_id: 1, debit: 3000,  credit: null },
  { account_id: 2, debit: null,  credit: 3000 },
]);
const e2 = makeEntry(2, '2025-05-15', 'Assurance AXA', null, [
  { account_id: 3, debit: 18000, credit: null },
  { account_id: 1, debit: null,  credit: 18000 },
]);
const e3 = makeEntry(3, '2025-07-20', 'Vente boissons local', 'P-003', [
  { account_id: 1, debit: 5000,  credit: null },
  { account_id: 4, debit: null,  credit: 5000 },
]);

const all = [e1, e2, e3];

describe('applyFilters — filtre texte', () => {
  it('retourne tout sans filtre', () => {
    expect(applyFilters(all, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it('filtre par libellé (insensible à la casse)', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, text: 'cotisation' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('filtre par numéro de pièce', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, text: 'P-003' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it('retourne vide si aucune correspondance', () => {
    expect(applyFilters(all, { ...DEFAULT_FILTERS, text: 'zzz' })).toHaveLength(0);
  });
});

describe('applyFilters — filtre dates', () => {
  it('filtre par dateFrom', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateFrom: '2025-05-01' });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toEqual([2, 3]);
  });

  it('filtre par dateTo', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateTo: '2025-05-15' });
    expect(result).toHaveLength(2);
    expect(result.map(e => e.id)).toEqual([1, 2]);
  });

  it('filtre par plage de dates', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateFrom: '2025-05-01', dateTo: '2025-06-30' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});

describe('applyFilters — filtre compte (vue grand-livre)', () => {
  it('ne garde que les lignes du compte filtré', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, accountId: 1 });
    expect(result).toHaveLength(3);
    result.forEach(e => {
      expect(e.lines).toHaveLength(1);
      expect(e.lines[0].account_id).toBe(1);
    });
  });

  it('exclut les écritures sans ligne pour le compte', () => {
    // Compte 4 n'apparaît que dans e3
    const result = applyFilters(all, { ...DEFAULT_FILTERS, accountId: 4 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});

describe('applyFilters — filtres combinés', () => {
  it('texte + compte', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, text: 'cotisation', accountId: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].lines).toHaveLength(1);
    expect(result[0].lines[0].account_id).toBe(1);
  });

  it('dateFrom + compte', () => {
    const result = applyFilters(all, { ...DEFAULT_FILTERS, dateFrom: '2025-05-01', accountId: 1 });
    expect(result).toHaveLength(2); // e2 et e3 ont account_id=1
    result.forEach(e => {
      expect(e.lines.every(l => l.account_id === 1)).toBe(true);
    });
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npx vitest run src/__tests__/journalFilters.test.ts
```
Expected : FAIL — `Cannot find module '../lib/journalFilters'`.

- [ ] **Step 3 : Créer `app/src/lib/journalFilters.ts`**

```typescript
import type { JournalEntry, JournalEntryLine, JournalFilters } from '../types';

export type EntryWithLines = JournalEntry & { lines: JournalEntryLine[] };

export function applyFilters(entries: EntryWithLines[], filters: JournalFilters): EntryWithLines[] {
  let result = entries;

  if (filters.dateFrom) {
    result = result.filter(e => e.date >= filters.dateFrom);
  }
  if (filters.dateTo) {
    result = result.filter(e => e.date <= filters.dateTo);
  }
  if (filters.text) {
    const q = filters.text.toLowerCase();
    result = result.filter(e =>
      e.description.toLowerCase().includes(q) ||
      (e.piece?.toLowerCase().includes(q) ?? false),
    );
  }
  if (filters.accountId !== null) {
    result = result
      .map(e => ({ ...e, lines: e.lines.filter(l => l.account_id === filters.accountId) }))
      .filter(e => e.lines.length > 0);
  }

  return result;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd app && npx vitest run src/__tests__/journalFilters.test.ts
```
Expected : 13 tests passent.

- [ ] **Step 5 : Commit**

```bash
git add app/src/lib/journalFilters.ts app/src/__tests__/journalFilters.test.ts
git commit -m "feat: implémenter applyFilters (filtres journal en mémoire) avec tests"
```

---

### Task 5 — Composant ConfirmDialog

**Files:**
- Create: `app/src/components/ConfirmDialog.tsx`
- Test: `app/src/__tests__/renderer/ConfirmDialog.test.tsx`

**Interfaces:**
- Produces: `ConfirmDialog({ message, onConfirm, onCancel })` (utilisé par JournalPage Task 9)

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/renderer/ConfirmDialog.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../../components/ConfirmDialog';

const defaultProps = {
  message: 'Supprimer cette écriture ?',
  onConfirm: vi.fn(),
  onCancel:  vi.fn(),
};

describe('ConfirmDialog', () => {
  it('affiche le message', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Supprimer cette écriture ?')).toBeInTheDocument();
  });

  it('affiche les boutons Confirmer et Annuler', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
  });

  it('clic Confirmer appelle onConfirm', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clic Annuler appelle onCancel', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clic sur le fond extérieur ne ferme pas la boîte', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-overlay'));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npx vitest run src/__tests__/renderer/ConfirmDialog.test.tsx
```
Expected : FAIL — `Cannot find module '../../components/ConfirmDialog'`.

- [ ] **Step 3 : Créer `app/src/components/ConfirmDialog.tsx`**

```typescript
interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div style={s.overlay} data-testid="confirm-overlay">
      <div style={s.card} role="alertdialog" aria-modal="true">
        <p style={s.message}>{message}</p>
        <div style={s.actions}>
          <button onClick={onCancel}  style={s.cancelBtn}>Annuler</button>
          <button onClick={onConfirm} style={s.confirmBtn}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay:    { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  card:       { background: '#fff', borderRadius: '10px', padding: '1.5rem', minWidth: '320px', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,.18)' },
  message:    { margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#334155', lineHeight: 1.5 },
  actions:    { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn:  { padding: '0.45rem 1rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' },
  confirmBtn: { padding: '0.45rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 as const },
} as const;
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd app && npx vitest run src/__tests__/renderer/ConfirmDialog.test.tsx
```
Expected : 5 tests passent.

- [ ] **Step 5 : Commit**

```bash
git add app/src/components/ConfirmDialog.tsx app/src/__tests__/renderer/ConfirmDialog.test.tsx
git commit -m "feat: composant ConfirmDialog réutilisable avec tests"
```

---

### Task 6 — EntryForm : mode édition

**Files:**
- Modify: `app/src/components/EntryForm.tsx`
- Test: `app/src/__tests__/renderer/EntryForm.test.tsx` (ajout)

**Interfaces:**
- Consumes: `UpdateJournalEntryPayload` (Task 1), `formatAmount` (accounting.ts)
- Produces: `EntryForm({ ..., editEntry?, hideTitle? })` (utilisé par EntryFormModal Task 7)

- [ ] **Step 1 : Écrire les nouveaux tests dans `app/src/__tests__/renderer/EntryForm.test.tsx`**

Ajouter à la fin du fichier existant (après le dernier `describe`) :

```typescript
const editEntry = {
  id: 42,
  fiscal_year_id: 1,
  date: '2025-04-10',
  description: 'Cotisation à corriger',
  piece: 'P-099',
  is_opening_balance: false,
  is_closing_entry: false,
  created_at: '',
  updated_at: '',
  lines: [
    { id: 1, journal_entry_id: 42, account_id: 1, debit: 3000, credit: null, created_at: '' },
    { id: 2, journal_entry_id: 42, account_id: 2, debit: null, credit: 3000, created_at: '' },
  ],
};

describe('EntryForm — mode édition', () => {
  beforeEach(() => {
    vi.stubGlobal('api', {
      createJournalEntry: vi.fn().mockResolvedValue({ id: 1 }),
      updateJournalEntry: vi.fn().mockResolvedValue({ id: 42 }),
    });
  });

  it('pré-remplit la date depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-04-10');
  });

  it('pré-remplit le libellé depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    expect(screen.getByLabelText('Libellé *')).toHaveValue('Cotisation à corriger');
  });

  it('pré-remplit la pièce depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    expect(screen.getByLabelText('Pièce')).toHaveValue('P-099');
  });

  it('pré-remplit les lignes depuis editEntry', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    // 2 lignes pré-remplies
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByRole('spinbutton', { name: 'Débit ligne 1' })).toHaveValue(30);
    expect(screen.getByRole('spinbutton', { name: 'Crédit ligne 2' })).toHaveValue(30);
  });

  it('appelle updateJournalEntry (et non createJournalEntry) à la soumission', async () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer/ }));
    expect(window.api.updateJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42 }),
    );
    expect(window.api.createJournalEntry).not.toHaveBeenCalled();
  });

  it('masque le titre quand hideTitle est true', () => {
    render(<EntryForm {...defaultProps} hideTitle />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npx vitest run src/__tests__/renderer/EntryForm.test.tsx
```
Expected : FAIL sur les 6 nouveaux tests (props inexistantes).

- [ ] **Step 3 : Modifier `app/src/components/EntryForm.tsx`**

**a) Mettre à jour les imports :**
```typescript
import { useState } from 'react';
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import { parseAmount, formatAmount, validateEntryBalance } from '../lib/accounting';
```

**b) Mettre à jour l'interface des props :**
```typescript
interface EntryFormProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  editEntry?: JournalEntry & { lines: JournalEntryLine[] };
  hideTitle?: boolean;
  onCreated:  () => void;
  onCancel:   () => void;
}
```

**c) Ajouter la fonction de conversion lignes → form (avant le composant) :**
```typescript
function entryLinesToFormLines(lines: JournalEntryLine[]): Line[] {
  return lines.map(l => ({
    account_id: String(l.account_id),
    debit:  l.debit  != null ? formatAmount(l.debit)  : '',
    credit: l.credit != null ? formatAmount(l.credit) : '',
  }));
}
```

**d) Mettre à jour la signature et l'initialisation des états :**
```typescript
export default function EntryForm({ fiscalYear, accounts, editEntry, hideTitle, onCreated, onCancel }: EntryFormProps) {
  const [date,        setDate]        = useState(editEntry?.date ?? today());
  const [description, setDescription] = useState(editEntry?.description ?? '');
  const [piece,       setPiece]       = useState(editEntry?.piece ?? '');
  const [lines,       setLines]       = useState<Line[]>(
    editEntry ? entryLinesToFormLines(editEntry.lines) : [emptyLine(), emptyLine()],
  );
  const [submitting,  setSubmitting]  = useState(false);
  const [apiError,    setApiError]    = useState<string | null>(null);
```

**e) Mettre à jour `handleSubmit` pour brancher sur update ou create :**

Remplacer le bloc `try { await window.api.createJournalEntry(...) }` par :
```typescript
setSubmitting(true);
try {
  if (editEntry) {
    await window.api.updateJournalEntry({
      id:          editEntry.id,
      date,
      description: description.trim(),
      piece:       piece.trim() || undefined,
      lines:       payload,
    });
  } else {
    await window.api.createJournalEntry({
      fiscal_year_id: fiscalYear.id,
      date,
      description:    description.trim(),
      piece:          piece.trim() || undefined,
      lines:          payload,
    });
  }
  onCreated();
} catch (e: unknown) {
  setApiError((e as Error).message);
} finally {
  setSubmitting(false);
}
```

**f) Mettre à jour le JSX — titre conditionnel :**

Remplacer :
```typescript
<h2 style={s.h2}>Nouvelle écriture — exercice {fiscalYear.year}</h2>
```
Par :
```typescript
{!hideTitle && (
  <h2 style={s.h2}>
    {editEntry ? 'Modifier l\'écriture' : 'Nouvelle écriture'} — exercice {fiscalYear.year}
  </h2>
)}
```

- [ ] **Step 4 : Vérifier que tous les tests EntryForm passent**

```bash
cd app && npx vitest run src/__tests__/renderer/EntryForm.test.tsx
```
Expected : 20 tests passent (14 existants + 6 nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add app/src/components/EntryForm.tsx app/src/__tests__/renderer/EntryForm.test.tsx
git commit -m "feat: mode édition dans EntryForm (editEntry, hideTitle)"
```

---

### Task 7 — Composant EntryFormModal

**Files:**
- Create: `app/src/components/EntryFormModal.tsx`
- Test: `app/src/__tests__/renderer/EntryFormModal.test.tsx`

**Interfaces:**
- Consumes: `EntryForm` (Task 6)
- Produces: `EntryFormModal({ fiscalYear, accounts, editEntry?, onSaved, onClose })` (utilisé par JournalPage Task 9)

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/renderer/EntryFormModal.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../../types';
import EntryFormModal from '../../components/EntryFormModal';

const fy: FiscalYear = {
  id: 1, year: 2025,
  start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '',
};

const accounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse', class: 1, type: 'ACTIF', normal_balance: 'DEBIT', description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
];

const editEntry: JournalEntry & { lines: JournalEntryLine[] } = {
  id: 42, fiscal_year_id: 1, date: '2025-04-10', description: 'Test', piece: null,
  is_opening_balance: false, is_closing_entry: false, created_at: '', updated_at: '',
  lines: [
    { id: 1, journal_entry_id: 42, account_id: 1, debit: 3000, credit: null, created_at: '' },
    { id: 2, journal_entry_id: 42, account_id: 1, debit: null, credit: 3000, created_at: '' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('api', {
    createJournalEntry: vi.fn().mockResolvedValue({ id: 1 }),
    updateJournalEntry: vi.fn().mockResolvedValue({ id: 42 }),
  });
});

describe('EntryFormModal', () => {
  it('affiche le titre "Nouvelle écriture" en mode création', () => {
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Nouvelle écriture/);
  });

  it('affiche le titre "Modifier l\'écriture" en mode édition', () => {
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} editEntry={editEntry} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Modifier l'écriture/);
  });

  it('le bouton ✕ appelle onClose', async () => {
    const onClose = vi.fn();
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clic sur le fond extérieur ne ferme pas la modale', () => {
    const onClose = vi.fn();
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a role="dialog" et aria-modal="true"', () => {
    render(<EntryFormModal fiscalYear={fy} accounts={accounts} onSaved={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npx vitest run src/__tests__/renderer/EntryFormModal.test.tsx
```
Expected : FAIL — `Cannot find module '../../components/EntryFormModal'`.

- [ ] **Step 3 : Créer `app/src/components/EntryFormModal.tsx`**

```typescript
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import EntryForm from './EntryForm';

interface EntryFormModalProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  editEntry?: JournalEntry & { lines: JournalEntryLine[] };
  onSaved:    () => void;
  onClose:    () => void;
}

export default function EntryFormModal({ fiscalYear, accounts, editEntry, onSaved, onClose }: EntryFormModalProps) {
  const title = editEntry
    ? `Modifier l'écriture — exercice ${fiscalYear.year}`
    : `Nouvelle écriture — exercice ${fiscalYear.year}`;

  return (
    <div style={s.overlay} data-testid="modal-overlay">
      <div style={s.card} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div style={s.header}>
          <h2 id="modal-title" style={s.h2}>{title}</h2>
          <button onClick={onClose} style={s.closeBtn} aria-label="Fermer">✕</button>
        </div>
        <EntryForm
          fiscalYear={fiscalYear}
          accounts={accounts}
          editEntry={editEntry}
          hideTitle
          onCreated={onSaved}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

const s = {
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  card:    { background: '#fff', borderRadius: '12px', width: '720px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' as const, boxShadow: '0 8px 32px rgba(0,0,0,.2)', position: 'relative' as const },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem 0' },
  h2:      { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' },
  closeBtn:{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b', lineHeight: 1, padding: '0.25rem 0.5rem' },
} as const;
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd app && npx vitest run src/__tests__/renderer/EntryFormModal.test.tsx
```
Expected : 5 tests passent.

- [ ] **Step 5 : Commit**

```bash
git add app/src/components/EntryFormModal.tsx app/src/__tests__/renderer/EntryFormModal.test.tsx
git commit -m "feat: composant EntryFormModal (overlay sans fermeture au clic extérieur)"
```

---

### Task 8 — Composant JournalFilters

**Files:**
- Create: `app/src/components/JournalFilters.tsx`
- Test: `app/src/__tests__/renderer/JournalFilters.test.tsx`

**Interfaces:**
- Consumes: `JournalFilters`, `DEFAULT_FILTERS`, `Account` (types/index.ts)
- Produces: `JournalFilters({ filters, accounts, onChange })` (utilisé par JournalPage Task 9)

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/renderer/JournalFilters.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from '../../types';
import { DEFAULT_FILTERS } from '../../types';
import JournalFilters from '../../components/JournalFilters';

const accounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse',             class: 1, type: 'ACTIF',   normal_balance: 'DEBIT',  description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
  { id: 2, number: '300', name: 'Cotisations membres', class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
];

describe('JournalFilters', () => {
  it('affiche le champ de recherche texte', () => {
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: /libellé/i })).toBeInTheDocument();
  });

  it('affiche le sélecteur de compte avec "Tous les comptes"', () => {
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /compte/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tous les comptes' })).toBeInTheDocument();
  });

  it('affiche les champs date de début et date de fin', () => {
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Date de début')).toBeInTheDocument();
    expect(screen.getByLabelText('Date de fin')).toBeInTheDocument();
  });

  it('appelle onChange avec le texte mis à jour', async () => {
    const onChange = vi.fn();
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: /libellé/i }), 'AXA');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'AXA' }));
  });

  it('appelle onChange avec accountId mis à jour', async () => {
    const onChange = vi.fn();
    render(<JournalFilters filters={DEFAULT_FILTERS} accounts={accounts} onChange={onChange} />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /compte/i }),
      screen.getByRole('option', { name: /Caisse/ }),
    );
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ accountId: 1 }));
  });

  it('le bouton Réinitialiser rappelle onChange avec DEFAULT_FILTERS', async () => {
    const onChange = vi.fn();
    render(<JournalFilters filters={{ ...DEFAULT_FILTERS, text: 'test' }} accounts={accounts} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /Réinitialiser/i }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npx vitest run src/__tests__/renderer/JournalFilters.test.tsx
```
Expected : FAIL — `Cannot find module '../../components/JournalFilters'`.

- [ ] **Step 3 : Créer `app/src/components/JournalFilters.tsx`**

```typescript
import type { Account, JournalFilters as Filters } from '../types';
import { DEFAULT_FILTERS } from '../types';

interface JournalFiltersProps {
  filters:   Filters;
  accounts:  Account[];
  onChange:  (filters: Filters) => void;
}

export default function JournalFilters({ filters, accounts, onChange }: JournalFiltersProps) {
  return (
    <div style={s.bar}>
      <input
        type="text"
        value={filters.text}
        onChange={e => onChange({ ...filters, text: e.target.value })}
        placeholder="Rechercher dans le libellé ou la pièce…"
        aria-label="Recherche dans le libellé ou la pièce"
        style={s.input}
      />
      <select
        value={filters.accountId ?? ''}
        onChange={e => onChange({ ...filters, accountId: e.target.value ? Number(e.target.value) : null })}
        aria-label="Filtrer par compte"
        style={s.input}
      >
        <option value="">Tous les comptes</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.number} — {a.name}</option>
        ))}
      </select>
      <label style={s.label}>
        Date de début
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
          style={s.dateInput}
          aria-label="Date de début"
        />
      </label>
      <label style={s.label}>
        Date de fin
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })}
          style={s.dateInput}
          aria-label="Date de fin"
        />
      </label>
      <button onClick={() => onChange(DEFAULT_FILTERS)} style={s.resetBtn}>
        Réinitialiser
      </button>
    </div>
  );
}

const s = {
  bar:      { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' as const, marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' },
  input:    { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.8rem', color: '#0f172a', background: '#fff', minWidth: '180px' },
  label:    { display: 'flex', flexDirection: 'column' as const, gap: '0.2rem', fontSize: '0.75rem', color: '#64748b' },
  dateInput:{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: '#0f172a', background: '#fff' },
  resetBtn: { padding: '0.35rem 0.75rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' as const },
} as const;
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
cd app && npx vitest run src/__tests__/renderer/JournalFilters.test.tsx
```
Expected : 6 tests passent.

- [ ] **Step 5 : Commit**

```bash
git add app/src/components/JournalFilters.tsx app/src/__tests__/renderer/JournalFilters.test.tsx
git commit -m "feat: composant JournalFilters (libellé, compte, dates, réinitialiser)"
```

---

### Task 9 — JournalPage : intégration complète

**Files:**
- Modify: `app/src/pages/JournalPage.tsx`
- Create: `app/src/__tests__/renderer/JournalPage.test.tsx`

**Interfaces:**
- Consumes: `applyFilters`, `EntryWithLines` (lib/journalFilters.ts), `JournalFilters` (components), `EntryFormModal` (components), `ConfirmDialog` (components), `DEFAULT_FILTERS` (types)

- [ ] **Step 1 : Écrire les tests dans `app/src/__tests__/renderer/JournalPage.test.tsx`**

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../../types';
import JournalPage from '../../pages/JournalPage';

const fy: FiscalYear = {
  id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '',
};
const fyClosed: FiscalYear = {
  id: 2, year: 2024, start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '',
};

const accounts: Account[] = [
  { id: 1, number: '100', name: 'Caisse',             class: 1, type: 'ACTIF',   normal_balance: 'DEBIT',  description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
  { id: 2, number: '300', name: 'Cotisations membres', class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: null, must_be_zero_at_closing: false, is_closing_account: false, is_active: true, created_at: '' },
];

type Entry = JournalEntry & { lines: JournalEntryLine[] };

const entry1: Entry = {
  id: 1, fiscal_year_id: 1, date: '2025-03-01', description: 'Cotisation membre', piece: 'P-001',
  is_opening_balance: false, is_closing_entry: false, created_at: '', updated_at: '',
  lines: [
    { id: 1, journal_entry_id: 1, account_id: 1, debit: 3000,  credit: null, created_at: '' },
    { id: 2, journal_entry_id: 1, account_id: 2, debit: null,  credit: 3000, created_at: '' },
  ],
};
const entry2: Entry = {
  id: 2, fiscal_year_id: 1, date: '2025-05-15', description: 'Assurance AXA', piece: null,
  is_opening_balance: false, is_closing_entry: false, created_at: '', updated_at: '',
  lines: [
    { id: 3, journal_entry_id: 2, account_id: 2, debit: 18000, credit: null, created_at: '' },
    { id: 4, journal_entry_id: 2, account_id: 1, debit: null,  credit: 18000, created_at: '' },
  ],
};

function mockApi(entries: Entry[] = [entry1, entry2]) {
  vi.stubGlobal('api', {
    getFiscalYears:     vi.fn().mockResolvedValue([fy]),
    getActiveAccounts:  vi.fn().mockResolvedValue(accounts),
    getJournalEntries:  vi.fn().mockResolvedValue(entries),
    updateJournalEntry: vi.fn().mockResolvedValue({ id: 1 }),
    deleteJournalEntry: vi.fn().mockResolvedValue(undefined),
  });
}

beforeEach(() => mockApi());

describe('JournalPage — filtres', () => {
  it('affiche les filtres quand des écritures existent', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    expect(screen.getByRole('textbox', { name: /libellé/i })).toBeInTheDocument();
  });

  it('filtre par texte (libellé)', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.type(screen.getByRole('textbox', { name: /libellé/i }), 'Assurance');
    expect(screen.queryByText('Cotisation membre')).not.toBeInTheDocument();
    expect(screen.getByText('Assurance AXA')).toBeInTheDocument();
  });

  it('filtre par compte (vue grand-livre)', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /compte/i }),
      screen.getByRole('option', { name: /Caisse/ }),
    );
    // entry1 : seule la ligne débit (compte 1) reste
    // entry2 : seule la ligne crédit (compte 1) reste
    // Les deux écritures restent visibles
    expect(screen.getByText('Cotisation membre')).toBeInTheDocument();
    expect(screen.getByText('Assurance AXA')).toBeInTheDocument();
    // La ligne "Cotisations membres" (compte 2) ne doit plus apparaître
    expect(screen.queryByText('300')).not.toBeInTheDocument();
  });
});

describe('JournalPage — boutons Modifier et Supprimer', () => {
  it('affiche les boutons Modifier et Supprimer sur un exercice ouvert', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Supprimer' })).toHaveLength(2);
  });

  it('n\'affiche pas les boutons Modifier/Supprimer sur un exercice clôturé', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:    vi.fn().mockResolvedValue([fyClosed]),
      getActiveAccounts: vi.fn().mockResolvedValue(accounts),
      getJournalEntries: vi.fn().mockResolvedValue([entry1]),
      deleteJournalEntry: vi.fn(),
      updateJournalEntry: vi.fn(),
    });
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('clic Modifier ouvre la modale avec l\'écriture pré-remplie', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé *')).toHaveValue('Cotisation membre');
  });

  it('clic Supprimer ouvre la boîte de confirmation', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('confirmer la suppression appelle deleteJournalEntry', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => {
      expect(window.api.deleteJournalEntry).toHaveBeenCalledWith(1);
    });
  });
});

describe('JournalPage — bouton + Nouvelle écriture', () => {
  it('ouvre la modale vide au clic sur + Nouvelle écriture', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    await userEvent.click(screen.getByRole('button', { name: /Nouvelle écriture/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Nouvelle écriture/);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npx vitest run src/__tests__/renderer/JournalPage.test.tsx
```
Expected : FAIL — composants manquants ou comportements absents.

- [ ] **Step 3 : Réécrire `app/src/pages/JournalPage.tsx`**

```typescript
import { useEffect, useState } from 'react';
import type { FiscalYear, Account, JournalFilters } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { applyFilters } from '../lib/journalFilters';
import type { EntryWithLines } from '../lib/journalFilters';
import JournalFiltersBar from '../components/JournalFilters';
import EntryFormModal from '../components/EntryFormModal';
import ConfirmDialog from '../components/ConfirmDialog';

type ModalState =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; entry: EntryWithLines };

export default function JournalPage() {
  const [years,        setYears]        = useState<FiscalYear[]>([]);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [entries,      setEntries]      = useState<EntryWithLines[]>([]);
  const [filters,      setFilters]      = useState<JournalFilters>(DEFAULT_FILTERS);
  const [modal,        setModal]        = useState<ModalState>(null);
  const [confirmEntry, setConfirmEntry] = useState<EntryWithLines | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getFiscalYears(),
      window.api.getActiveAccounts(),
    ]).then(([ys, accs]) => {
      setYears(ys);
      setAccounts(accs);
      const open = ys.find(y => !y.is_closed);
      if (open) setSelectedYear(open.year);
    }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const fy = years.find(y => y.year === selectedYear);
    if (!fy) return;
    window.api.getJournalEntries(fy.id)
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, [selectedYear, years]);

  async function reloadEntries() {
    const fy = years.find(y => y.year === selectedYear);
    if (!fy) return;
    setEntries(await window.api.getJournalEntries(fy.id));
  }

  async function handleDeleteConfirmed() {
    if (!confirmEntry) return;
    try {
      await window.api.deleteJournalEntry(confirmEntry.id);
      setConfirmEntry(null);
      await reloadEntries();
    } catch (e: unknown) {
      setError((e as Error).message);
      setConfirmEntry(null);
    }
  }

  const currentFiscalYear = years.find(y => y.year === selectedYear);
  const filtered = applyFilters(entries, filters);

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.h1}>Journal</h1>
        {years.length > 0 && (
          <div style={s.yearSelector}>
            <label htmlFor="year-select" style={s.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYear ?? ''}
              onChange={e => setSelectedYear(Number(e.target.value))}
              style={s.select}
            >
              {years.map(y => (
                <option key={y.id} value={y.year}>
                  {y.year}{y.is_closed ? ' (clôturé)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div role="alert" style={s.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p style={s.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : (
        <>
          {!currentFiscalYear?.is_closed && (
            <div style={{ marginBottom: '1rem' }}>
              <button onClick={() => setModal({ mode: 'create' })} style={s.btn}>
                + Nouvelle écriture
              </button>
            </div>
          )}

          {entries.length > 0 && (
            <JournalFiltersBar filters={filters} accounts={accounts} onChange={setFilters} />
          )}

          {filtered.length === 0 ? (
            <p style={s.empty}>{entries.length === 0 ? 'Aucune écriture pour cet exercice.' : 'Aucune écriture ne correspond aux filtres.'}</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr style={s.theadRow}>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Libellé</th>
                  <th style={s.th}>Pièce</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Débit</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Crédit</th>
                  {!currentFiscalYear?.is_closed && <th style={s.th} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry =>
                  entry.lines.map((line, i) => {
                    const acc = accounts.find(a => a.id === line.account_id);
                    return (
                      <tr key={`${entry.id}-${line.id}`} style={s.row}>
                        <td style={s.td}>{i === 0 ? formatDate(entry.date) : ''}</td>
                        <td style={s.td}>{i === 0 ? entry.description : ''}</td>
                        <td style={s.td}>{i === 0 ? (entry.piece ?? '') : ''}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                          {line.debit != null ? formatCHF(line.debit) : ''}
                          {line.debit != null && acc ? <span style={s.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>
                          {line.credit != null ? formatCHF(line.credit) : ''}
                          {line.credit != null && acc ? <span style={s.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        {!currentFiscalYear?.is_closed && (
                          <td style={s.td}>
                            {i === 0 && (
                              <div style={s.actions}>
                                <button
                                  onClick={() => setModal({ mode: 'edit', entry })}
                                  style={s.actionBtn}
                                  aria-label="Modifier"
                                >
                                  Modifier
                                </button>
                                <button
                                  onClick={() => setConfirmEntry(entry)}
                                  style={{ ...s.actionBtn, color: '#dc2626' }}
                                  aria-label="Supprimer"
                                >
                                  Supprimer
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </>
      )}

      {modal !== null && currentFiscalYear && (
        <EntryFormModal
          fiscalYear={currentFiscalYear}
          accounts={accounts}
          editEntry={modal.mode === 'edit' ? modal.entry : undefined}
          onSaved={async () => { setModal(null); await reloadEntries(); }}
          onClose={() => setModal(null)}
        />
      )}

      {confirmEntry && (
        <ConfirmDialog
          message={`Supprimer l'écriture "${confirmEntry.description}" ? Cette action est irréversible.`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmEntry(null)}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function formatCHF(centimes: number): string {
  return (centimes / 100).toFixed(2);
}

const s = {
  header:      { display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' as const },
  h1:          { margin: 0, fontSize: '1.5rem', color: '#0f172a' },
  yearSelector:{ display: 'flex', alignItems: 'center', gap: '0.5rem' },
  label:       { fontWeight: 500, fontSize: '0.875rem', color: '#475569' },
  select:      { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff' },
  error:       { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' },
  empty:       { color: '#64748b', fontSize: '0.875rem' },
  btn:         { padding: '0.45rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 as const },
  table:       { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow:    { background: '#f1f5f9' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  row:         { borderBottom: '1px solid #f1f5f9' },
  td:          { padding: '0.4rem 1rem', color: '#334155' },
  acctLabel:   { color: '#94a3b8', fontSize: '0.75rem' },
  actions:     { display: 'flex', gap: '0.5rem' },
  actionBtn:   { padding: '0.2rem 0.5rem', background: 'none', border: '1px solid #e2e8f0', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem', color: '#475569' },
} as const;
```

- [ ] **Step 4 : Vérifier que les tests JournalPage passent**

```bash
cd app && npx vitest run src/__tests__/renderer/JournalPage.test.tsx
```
Expected : 8 tests passent.

- [ ] **Step 5 : Lancer tous les tests pour vérifier qu'aucune régression**

```bash
cd app && npm test
```
Expected : tous les tests passent (94 existants + environ 45 nouveaux ≈ 139 tests).

- [ ] **Step 6 : Commit**

```bash
git add app/src/pages/JournalPage.tsx app/src/__tests__/renderer/JournalPage.test.tsx
git commit -m "feat: vue journal avec filtres, modification et suppression via modale"
```
