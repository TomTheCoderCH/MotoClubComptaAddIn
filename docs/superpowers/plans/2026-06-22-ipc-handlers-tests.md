# Tests handlers IPC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraire `registerIpcHandlers` de `main.ts` dans un module testable, puis écrire ~19 tests Vitest qui vérifient le câblage IPC (noms de canaux, passage des paramètres, propagation des erreurs).

**Architecture:** On crée `src/ipc-handlers.ts` qui exporte `registerIpcHandlers()`. `main.ts` l'importe et l'appelle comme avant. Les tests mockent `ipcMain` (pour capturer les handlers enregistrés) et les fonctions DB (pour contrôler les retours et les erreurs), sans aucun SQLite.

**Tech Stack:** Vitest, TypeScript, better-sqlite3 (mocké), Electron (mocké via `vi.mock`)

## Global Constraints

- Montants en centimes (INTEGER) — jamais de float
- Environnement Vitest : `node` (pas jsdom) — le fichier de test ne nécessite pas de directive `@vitest-environment`
- `vi.mock` doit précéder tout import qui charge le module mocké
- Les tests existants (`db.test.ts`, `accounting.test.ts`, etc.) ne doivent pas régresser
- Commande de test : `cd app && npm test` (dans le dossier `app/`)

---

## Fichiers

| Action | Fichier | Responsabilité |
|---|---|---|
| Créer | `app/src/ipc-handlers.ts` | `registerIpcHandlers()` — câblage ipcMain ↔ fonctions DB |
| Modifier | `app/src/main.ts` | Importer depuis `./ipc-handlers` au lieu de définir localement |
| Créer | `app/src/__tests__/ipc-handlers.test.ts` | ~19 tests de contrat IPC |

---

## Task 1 : Extraire `registerIpcHandlers` dans `src/ipc-handlers.ts`

**Files:**
- Create: `app/src/ipc-handlers.ts`
- Modify: `app/src/main.ts`

**Interfaces:**
- Produces: `registerIpcHandlers(): void` — exportée depuis `app/src/ipc-handlers.ts`

- [ ] **Step 1: Créer `app/src/ipc-handlers.ts`**

```ts
import { ipcMain } from 'electron';
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
} from './db';
import type { CreateJournalEntryPayload, UpdateJournalEntryPayload } from './types';

export function registerIpcHandlers(): void {
  ipcMain.handle('db:getAccounts',        () => getAllAccounts());
  ipcMain.handle('db:getActiveAccounts',  () => getActiveAccounts());

  ipcMain.handle('db:getFiscalYears',    () => getAllFiscalYears());
  ipcMain.handle('db:createFiscalYear',  (_e, year: number) => createFiscalYear(year));

  ipcMain.handle('db:getJournalEntries',  (_e, fiscalYearId: number) => getJournalEntries(fiscalYearId));
  ipcMain.handle('db:createJournalEntry', (_e, payload: CreateJournalEntryPayload) => createJournalEntry(payload));
  ipcMain.handle('db:updateJournalEntry', (_e, payload: UpdateJournalEntryPayload) => updateJournalEntry(payload));
  ipcMain.handle('db:deleteJournalEntry', (_e, id: number) => deleteJournalEntry(id));

  ipcMain.handle('db:getAccountBalances', (_e, fiscalYearId: number) => getAccountBalances(fiscalYearId));
}
```

- [ ] **Step 2: Mettre à jour `app/src/main.ts`**

Remplacer le contenu actuel de `main.ts` par :

```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { openDatabase } from './db';
import { registerIpcHandlers } from './ipc-handlers';

if (started) app.quit();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'MCY Compta',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on('ready', () => {
  openDatabase();
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 3: Vérifier que les tests existants passent toujours**

```bash
cd app && npm test
```

Résultat attendu : tous les tests verts (143 au total), aucune régression.

- [ ] **Step 4: Commit**

```bash
git add app/src/ipc-handlers.ts app/src/main.ts
git commit -m "refactor: extraire registerIpcHandlers dans ipc-handlers.ts"
```

---

## Task 2 : Écrire les tests `ipc-handlers.test.ts`

**Files:**
- Create: `app/src/__tests__/ipc-handlers.test.ts`

**Interfaces:**
- Consumes: `registerIpcHandlers(): void` depuis `../../ipc-handlers`
- Consumes: mocks des 9 fonctions DB depuis `../../db`

- [ ] **Step 1: Écrire le fichier de test complet**

Créer `app/src/__tests__/ipc-handlers.test.ts` :

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Les mocks doivent précéder tout import qui charge electron ou ./db
const handlers = new Map<string, (event: null, ...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
}));

vi.mock('../../db', () => ({
  getAllAccounts:       vi.fn(),
  getActiveAccounts:   vi.fn(),
  getAllFiscalYears:    vi.fn(),
  createFiscalYear:    vi.fn(),
  getJournalEntries:   vi.fn(),
  createJournalEntry:  vi.fn(),
  updateJournalEntry:  vi.fn(),
  deleteJournalEntry:  vi.fn(),
  getAccountBalances:  vi.fn(),
}));

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
} from '../../db';
import { registerIpcHandlers } from '../../ipc-handlers';

beforeEach(() => {
  handlers.clear();
  vi.resetAllMocks();
  registerIpcHandlers();
});

// Helper pour invoquer un handler comme Electron le ferait.
// Async : les throws synchrones des mocks deviennent des Promise rejetées,
// ce qui permet d'utiliser .rejects.toThrow() dans tous les cas d'erreur.
async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`Canal non enregistré : ${channel}`);
  return fn(null, ...args);
}

// ─── Contrat de registration ────────────────────────────────────────────────

describe('registration des canaux', () => {
  it('enregistre les 9 canaux attendus', () => {
    const expected = [
      'db:getAccounts',
      'db:getActiveAccounts',
      'db:getFiscalYears',
      'db:createFiscalYear',
      'db:getJournalEntries',
      'db:createJournalEntry',
      'db:updateJournalEntry',
      'db:deleteJournalEntry',
      'db:getAccountBalances',
    ];
    for (const channel of expected) {
      expect(handlers.has(channel), `canal manquant : ${channel}`).toBe(true);
    }
  });
});

// ─── db:getAccounts ─────────────────────────────────────────────────────────

describe('db:getAccounts', () => {
  it('délègue à getAllAccounts et retourne le résultat', async () => {
    const mockAccounts = [{ id: 1, number: '100', name: 'Caisse' }];
    vi.mocked(getAllAccounts).mockReturnValue(mockAccounts as any);
    const result = await call('db:getAccounts');
    expect(getAllAccounts).toHaveBeenCalledOnce();
    expect(result).toBe(mockAccounts);
  });

  it('propage une erreur de getAllAccounts', async () => {
    vi.mocked(getAllAccounts).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getAccounts')).rejects.toThrow('DB indisponible');
  });
});

// ─── db:getActiveAccounts ───────────────────────────────────────────────────

describe('db:getActiveAccounts', () => {
  it('délègue à getActiveAccounts et retourne le résultat', async () => {
    const mockAccounts = [{ id: 2, number: '101', name: 'Raiffeisen' }];
    vi.mocked(getActiveAccounts).mockReturnValue(mockAccounts as any);
    const result = await call('db:getActiveAccounts');
    expect(getActiveAccounts).toHaveBeenCalledOnce();
    expect(result).toBe(mockAccounts);
  });

  it('propage une erreur de getActiveAccounts', async () => {
    vi.mocked(getActiveAccounts).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getActiveAccounts')).rejects.toThrow('DB indisponible');
  });
});

// ─── db:getFiscalYears ──────────────────────────────────────────────────────

describe('db:getFiscalYears', () => {
  it('délègue à getAllFiscalYears et retourne le résultat', async () => {
    const mockYears = [{ id: 1, year: 2025 }];
    vi.mocked(getAllFiscalYears).mockReturnValue(mockYears as any);
    const result = await call('db:getFiscalYears');
    expect(getAllFiscalYears).toHaveBeenCalledOnce();
    expect(result).toBe(mockYears);
  });

  it('propage une erreur de getAllFiscalYears', async () => {
    vi.mocked(getAllFiscalYears).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getFiscalYears')).rejects.toThrow('DB indisponible');
  });
});

// ─── db:createFiscalYear ────────────────────────────────────────────────────

describe('db:createFiscalYear', () => {
  it('passe year à createFiscalYear et retourne le résultat', async () => {
    const mockYear = { id: 1, year: 2025, start_date: '2025-01-01', end_date: '2025-12-31' };
    vi.mocked(createFiscalYear).mockReturnValue(mockYear as any);
    const result = await call('db:createFiscalYear', 2025);
    expect(createFiscalYear).toHaveBeenCalledWith(2025);
    expect(result).toBe(mockYear);
  });

  it('propage une erreur de createFiscalYear', async () => {
    vi.mocked(createFiscalYear).mockImplementation(() => { throw new Error('Exercice déjà existant'); });
    await expect(call('db:createFiscalYear', 2025)).rejects.toThrow('Exercice déjà existant');
  });
});

// ─── db:getJournalEntries ───────────────────────────────────────────────────

describe('db:getJournalEntries', () => {
  it('passe fiscalYearId à getJournalEntries et retourne le résultat', async () => {
    const mockEntries = [{ id: 1, fiscal_year_id: 42, description: 'Test' }];
    vi.mocked(getJournalEntries).mockReturnValue(mockEntries as any);
    const result = await call('db:getJournalEntries', 42);
    expect(getJournalEntries).toHaveBeenCalledWith(42);
    expect(result).toBe(mockEntries);
  });

  it('propage une erreur de getJournalEntries', async () => {
    vi.mocked(getJournalEntries).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getJournalEntries', 42)).rejects.toThrow('DB indisponible');
  });
});

// ─── db:createJournalEntry ──────────────────────────────────────────────────

describe('db:createJournalEntry', () => {
  const payload = {
    fiscal_year_id: 1,
    date: '2025-03-08',
    description: 'Cotisation',
    lines: [
      { account_id: 1, debit: 3000 },
      { account_id: 2, credit: 3000 },
    ],
  };

  it('passe le payload à createJournalEntry et retourne le résultat', async () => {
    const mockEntry = { id: 1, ...payload };
    vi.mocked(createJournalEntry).mockReturnValue(mockEntry as any);
    const result = await call('db:createJournalEntry', payload);
    expect(createJournalEntry).toHaveBeenCalledWith(payload);
    expect(result).toBe(mockEntry);
  });

  it('propage une erreur d\'écriture déséquilibrée', async () => {
    vi.mocked(createJournalEntry).mockImplementation(() => { throw new Error('Écriture déséquilibrée'); });
    await expect(call('db:createJournalEntry', payload)).rejects.toThrow('Écriture déséquilibrée');
  });
});

// ─── db:updateJournalEntry ──────────────────────────────────────────────────

describe('db:updateJournalEntry', () => {
  const payload = {
    id: 5,
    date: '2025-04-01',
    description: 'Cotisation corrigée',
    lines: [
      { account_id: 1, debit: 3000 },
      { account_id: 2, credit: 3000 },
    ],
  };

  it('passe le payload à updateJournalEntry et retourne le résultat', async () => {
    const mockUpdated = { ...payload, lines: payload.lines };
    vi.mocked(updateJournalEntry).mockReturnValue(mockUpdated as any);
    const result = await call('db:updateJournalEntry', payload);
    expect(updateJournalEntry).toHaveBeenCalledWith(payload);
    expect(result).toBe(mockUpdated);
  });

  it('propage une erreur sur exercice clôturé', async () => {
    vi.mocked(updateJournalEntry).mockImplementation(() => { throw new Error('Cet exercice est clôturé'); });
    await expect(call('db:updateJournalEntry', payload)).rejects.toThrow('clôturé');
  });
});

// ─── db:deleteJournalEntry ──────────────────────────────────────────────────

describe('db:deleteJournalEntry', () => {
  it('passe id à deleteJournalEntry et retourne undefined', async () => {
    vi.mocked(deleteJournalEntry).mockReturnValue(undefined as any);
    const result = await call('db:deleteJournalEntry', 7);
    expect(deleteJournalEntry).toHaveBeenCalledWith(7);
    expect(result).toBeUndefined();
  });

  it('propage une erreur sur écriture introuvable', async () => {
    vi.mocked(deleteJournalEntry).mockImplementation(() => { throw new Error('Écriture introuvable'); });
    await expect(call('db:deleteJournalEntry', 9999)).rejects.toThrow('introuvable');
  });
});

// ─── db:getAccountBalances ──────────────────────────────────────────────────

describe('db:getAccountBalances', () => {
  it('passe fiscalYearId à getAccountBalances et retourne le résultat', async () => {
    const mockBalances = [{ number: '100', name: 'Caisse', solde: 9000 }];
    vi.mocked(getAccountBalances).mockReturnValue(mockBalances as any);
    const result = await call('db:getAccountBalances', 1);
    expect(getAccountBalances).toHaveBeenCalledWith(1);
    expect(result).toBe(mockBalances);
  });

  it('propage une erreur de getAccountBalances', async () => {
    vi.mocked(getAccountBalances).mockImplementation(() => { throw new Error('DB indisponible'); });
    await expect(call('db:getAccountBalances', 1)).rejects.toThrow('DB indisponible');
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils passent**

```bash
cd app && npm test
```

Résultat attendu : 162 tests verts (143 existants + 19 nouveaux).

- [ ] **Step 3: Commit**

```bash
git add app/src/__tests__/ipc-handlers.test.ts
git commit -m "test: tests handlers IPC (contrat canaux, paramètres, propagation erreurs)"
```
