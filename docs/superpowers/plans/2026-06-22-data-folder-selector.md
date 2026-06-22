# Sélecteur du dossier de données — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the user to choose the data folder on first launch via a welcome screen, and change it from the settings page with automatic DB+backup migration, restarting the app on change.

**Architecture:** A pure `settings.ts` module reads/writes `%APPDATA%\MCYCompta\settings.json`. A pure `migrate.ts` module copies DB + backups to the new folder (verify sizes, delete originals only after all copies verified). `main.ts` is updated with a 3-way startup: no settings → WelcomePage; missing folder → blocking dialog; normal → open DB. Three new IPC channels relay settings operations to the renderer. `WelcomePage.tsx` renders outside `<Layout>` (no sidebar). `SettingsPage.tsx` gains a change-folder button.

**Tech Stack:** Electron + React + TypeScript + better-sqlite3 + node:fs + Vitest + React Testing Library

## Global Constraints

- All amounts stored in centimes (INTEGER) — not relevant here but noted for context
- TypeScript strict mode; no `any` casts
- Inline styles pattern: `const s = { ... } as const` in React components
- Vitest for all unit/integration/component tests; `@testing-library/user-event` for interaction tests
- No comments except for non-obvious WHY
- `vi.mock` is hoisted — mocks referencing dynamic values must use `vi.fn().mockImplementation()` set in `beforeEach`, not `mockReturnValue(variable)` at module scope
- Tests use `os.tmpdir()` + `fs.mkdtempSync` for isolation; cleaned up in `afterEach` with `fs.rmSync(..., { recursive: true, force: true })`
- `openDatabase(dir)` uses `CREATE TABLE IF NOT EXISTS` + `seedAccountsIfEmpty()` (no-op if tables/data exist) — if a DB already exists in the chosen folder it is opened as-is without re-seed
- `getDb()` and `getDbDir()` throw `'Base de données non initialisée'` if DB not opened — guard with `isDbOpen()` before calling them from `before-quit`
- Electron IPC handlers: `ipcMain.handle` in `ipc-handlers.ts`, bridged via `contextBridge` in `preload.ts`, typed in `window.d.ts`
- `app.relaunch()` + `app.exit(0)` for clean Electron restart; never returns after `app.exit()`
- `dialog.showMessageBoxSync` (blocking) for the missing-folder startup error

---

## Task 1: `settings.ts` + tests

**Files:**
- Create: `app/src/settings.ts`
- Create: `app/src/__tests__/settings.test.ts`

**Interfaces:**
- Produces:
  - `readSettings(): Settings | null` — returns `null` if file absent; throws on invalid JSON
  - `writeSettings(settings: Settings): void` — creates parent dir if needed
  - `getSettingsPath(): string` — `path.join(app.getPath('appData'), 'MCYCompta', 'settings.json')`
  - `interface Settings { dataDir: string; }`
- Consumed by: Task 3 (IPC handlers), Task 4 (main.ts)

- [ ] **Step 1: Write the failing tests**

Create `app/src/__tests__/settings.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// vi.mock is hoisted; factory runs lazily when 'electron' is first imported.
// mockAppDataDir is set in beforeEach before any test calls getSettingsPath().
let mockAppDataDir: string;

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockImplementation(() => mockAppDataDir) },
}));

import { readSettings, writeSettings, getSettingsPath } from '../settings';

beforeEach(() => {
  mockAppDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-settings-test-'));
});

afterEach(() => {
  fs.rmSync(mockAppDataDir, { recursive: true, force: true });
});

describe('getSettingsPath', () => {
  it('retourne appData/MCYCompta/settings.json', () => {
    expect(getSettingsPath()).toBe(
      path.join(mockAppDataDir, 'MCYCompta', 'settings.json'),
    );
  });
});

describe('readSettings', () => {
  it("retourne null si le fichier n'existe pas", () => {
    expect(readSettings()).toBeNull();
  });

  it('retourne l\'objet si le fichier est valide', () => {
    writeSettings({ dataDir: '/some/path' });
    expect(readSettings()).toEqual({ dataDir: '/some/path' });
  });

  it('throw si le JSON est invalide', () => {
    const settingsPath = getSettingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, 'not valid json', 'utf-8');
    expect(() => readSettings()).toThrow();
  });
});

describe('writeSettings', () => {
  it('crée le dossier parent si nécessaire', () => {
    const settingsPath = getSettingsPath();
    expect(fs.existsSync(path.dirname(settingsPath))).toBe(false);
    writeSettings({ dataDir: '/test/path' });
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it('roundtrip: readSettings retourne ce que writeSettings a écrit', () => {
    writeSettings({ dataDir: '/roundtrip/path' });
    expect(readSettings()).toEqual({ dataDir: '/roundtrip/path' });
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```
cd app && npx vitest run src/__tests__/settings.test.ts
```

Expected: fails with "Cannot find module '../settings'".

- [ ] **Step 3: Implement `settings.ts`**

Create `app/src/settings.ts`:

```ts
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
  dataDir: string;
}

export function getSettingsPath(): string {
  return path.join(app.getPath('appData'), 'MCYCompta', 'settings.json');
}

export function readSettings(): Settings | null {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Settings;
}

export function writeSettings(settings: Settings): void {
  const filePath = getSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
cd app && npx vitest run src/__tests__/settings.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```
git add app/src/settings.ts app/src/__tests__/settings.test.ts
git commit -m "feat: settings.ts — readSettings/writeSettings avec tests"
```

---

## Task 2: `migrate.ts` + tests

**Files:**
- Create: `app/src/migrate.ts`
- Create: `app/src/__tests__/migrate.test.ts`

**Interfaces:**
- Produces: `migrateDataDir(oldDir: string, newDir: string): Promise<void>`
  - Throws if `oldDir === newDir` (resolved paths)
  - Throws with details if size verification fails after copy
  - Originals are deleted only after ALL copies verified
- Consumed by: Task 3 (IPC `settings:changeDataDir` handler)

- [ ] **Step 1: Write the failing tests**

Create `app/src/__tests__/migrate.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { migrateDataDir } from '../migrate';

let srcDir: string;
let dstDir: string;

function createFakeDb(dir: string): void {
  const db = new Database(path.join(dir, 'mcy-compta.db'));
  db.close();
}

function createFakeBackup(dir: string, name: string): void {
  const backupsDir = path.join(dir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.writeFileSync(path.join(backupsDir, name), 'fake-backup-content');
}

beforeEach(() => {
  srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-migrate-src-'));
  dstDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-migrate-dst-'));
});

afterEach(() => {
  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(dstDir, { recursive: true, force: true });
});

describe('migrateDataDir', () => {
  it('copie mcy-compta.db dans le nouveau dossier', async () => {
    createFakeDb(srcDir);
    await migrateDataDir(srcDir, dstDir);
    expect(fs.existsSync(path.join(dstDir, 'mcy-compta.db'))).toBe(true);
  });

  it('supprime mcy-compta.db du dossier source après copie', async () => {
    createFakeDb(srcDir);
    await migrateDataDir(srcDir, dstDir);
    expect(fs.existsSync(path.join(srcDir, 'mcy-compta.db'))).toBe(false);
  });

  it('copie les backups et supprime les originaux', async () => {
    createFakeDb(srcDir);
    createFakeBackup(srcDir, 'mcy-compta-2025-03-08_14-30.db');
    createFakeBackup(srcDir, 'mcy-compta-2025-03-07_09-15.db');
    await migrateDataDir(srcDir, dstDir);
    expect(fs.existsSync(path.join(dstDir, 'backups', 'mcy-compta-2025-03-08_14-30.db'))).toBe(true);
    expect(fs.existsSync(path.join(dstDir, 'backups', 'mcy-compta-2025-03-07_09-15.db'))).toBe(true);
    expect(fs.existsSync(path.join(srcDir, 'backups', 'mcy-compta-2025-03-08_14-30.db'))).toBe(false);
    expect(fs.existsSync(path.join(srcDir, 'backups', 'mcy-compta-2025-03-07_09-15.db'))).toBe(false);
  });

  it('réussit sans erreur si aucun dossier backups', async () => {
    createFakeDb(srcDir);
    await expect(migrateDataDir(srcDir, dstDir)).resolves.toBeUndefined();
  });

  it('throw immédiatement si oldDir === newDir', async () => {
    createFakeDb(srcDir);
    await expect(migrateDataDir(srcDir, srcDir)).rejects.toThrow('identique');
  });

  it("crée newDir s'il n'existe pas", async () => {
    createFakeDb(srcDir);
    const nested = path.join(dstDir, 'new', 'sub');
    await migrateDataDir(srcDir, nested);
    expect(fs.existsSync(path.join(nested, 'mcy-compta.db'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```
cd app && npx vitest run src/__tests__/migrate.test.ts
```

Expected: fails with "Cannot find module '../migrate'".

- [ ] **Step 3: Implement `migrate.ts`**

Create `app/src/migrate.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

const BACKUP_PATTERN = /^mcy-compta-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db$/;

export async function migrateDataDir(oldDir: string, newDir: string): Promise<void> {
  if (path.resolve(oldDir) === path.resolve(newDir)) {
    throw new Error('Le dossier cible est identique au dossier actuel');
  }

  fs.mkdirSync(newDir, { recursive: true });

  // Step 1: copy and verify mcy-compta.db
  const oldDb = path.join(oldDir, 'mcy-compta.db');
  const newDb = path.join(newDir, 'mcy-compta.db');
  fs.copyFileSync(oldDb, newDb);
  if (fs.statSync(oldDb).size !== fs.statSync(newDb).size) {
    fs.unlinkSync(newDb);
    throw new Error('Vérification de mcy-compta.db échouée (tailles différentes)');
  }

  // Step 2: copy and verify each backup
  const oldBackups = path.join(oldDir, 'backups');
  const newBackups = path.join(newDir, 'backups');
  const copiedBackups: string[] = [];

  if (fs.existsSync(oldBackups)) {
    fs.mkdirSync(newBackups, { recursive: true });
    const files = fs.readdirSync(oldBackups).filter(f => BACKUP_PATTERN.test(f));
    for (const file of files) {
      const src = path.join(oldBackups, file);
      const dst = path.join(newBackups, file);
      fs.copyFileSync(src, dst);
      if (fs.statSync(src).size !== fs.statSync(dst).size) {
        fs.unlinkSync(dst);
        for (const b of copiedBackups) fs.unlinkSync(path.join(newBackups, b));
        fs.unlinkSync(newDb);
        throw new Error(`Vérification du backup ${file} échouée (tailles différentes)`);
      }
      copiedBackups.push(file);
    }
  }

  // Step 3: delete originals only after all copies verified
  fs.unlinkSync(oldDb);
  for (const file of copiedBackups) {
    fs.unlinkSync(path.join(oldBackups, file));
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
cd app && npx vitest run src/__tests__/migrate.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```
git add app/src/migrate.ts app/src/__tests__/migrate.test.ts
git commit -m "feat: migrate.ts — migrateDataDir avec copie, vérification et suppression"
```

---

## Task 3: IPC settings channels + preload + window.d.ts + tests

**Files:**
- Modify: `app/src/ipc-handlers.ts` — add 3 `settings:*` handlers at the end of `registerIpcHandlers()`
- Modify: `app/src/preload.ts` — add 3 entries to `contextBridge.exposeInMainWorld` and to `ElectronAPI` type
- Modify: `app/src/window.d.ts` — add 3 methods to `Window['api']`
- Create: `app/src/__tests__/ipc-settings-handlers.test.ts`

**Interfaces:**
- `settings:get` → `() => readSettings()` — returns `Settings | null`
- `settings:choose` → opens `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })` → if accepted: `writeSettings({ dataDir })` + `app.relaunch()` + `app.exit(0)`; if cancelled: returns `null`
- `settings:changeDataDir` → opens dialog → `migrateDataDir(getDbDir(), newDir)` + `writeSettings` + relaunch; if cancelled: `null`; if migration fails: throws (renderer shows error)
- Consumes: `readSettings`, `writeSettings` from `./settings`; `migrateDataDir` from `./migrate`; `getDbDir` from `./db`

- [ ] **Step 1: Write the failing tests**

Create `app/src/__tests__/ipc-settings-handlers.test.ts`:

```ts
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
  app: {
    relaunch: vi.fn(),
    exit:     vi.fn(),
  },
}));

vi.mock('../db', () => ({
  getAllAccounts:      vi.fn(),
  getActiveAccounts:  vi.fn(),
  getAllFiscalYears:   vi.fn(),
  createFiscalYear:   vi.fn(),
  getJournalEntries:  vi.fn(),
  createJournalEntry: vi.fn(),
  updateJournalEntry: vi.fn(),
  deleteJournalEntry: vi.fn(),
  getAccountBalances: vi.fn(),
  getDb:    vi.fn(),
  getDbDir: vi.fn(),
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

import { dialog, app } from 'electron';
import { getDbDir } from '../db';
import { readSettings, writeSettings } from '../settings';
import { migrateDataDir } from '../migrate';
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

describe('registration des canaux settings', () => {
  it('enregistre les 3 canaux settings', () => {
    expect(handlers.has('settings:get')).toBe(true);
    expect(handlers.has('settings:choose')).toBe(true);
    expect(handlers.has('settings:changeDataDir')).toBe(true);
  });
});

describe('settings:get', () => {
  it('retourne le résultat de readSettings()', async () => {
    vi.mocked(readSettings).mockReturnValue({ dataDir: '/data/path' });
    expect(await call('settings:get')).toEqual({ dataDir: '/data/path' });
  });

  it('retourne null si readSettings() retourne null', async () => {
    vi.mocked(readSettings).mockReturnValue(null);
    expect(await call('settings:get')).toBeNull();
  });
});

describe('settings:choose', () => {
  it('retourne null si le dialog est annulé', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await call('settings:choose');
    expect(result).toBeNull();
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('écrit les settings et relance si le dialog est accepté', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/chosen/folder'] });
    await call('settings:choose');
    expect(writeSettings).toHaveBeenCalledWith({ dataDir: '/chosen/folder' });
    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });
});

describe('settings:changeDataDir', () => {
  it('retourne null si le dialog est annulé', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: true, filePaths: [] });
    const result = await call('settings:changeDataDir');
    expect(result).toBeNull();
    expect(migrateDataDir).not.toHaveBeenCalled();
  });

  it('migre, écrit les settings et relance si accepté', async () => {
    vi.mocked(getDbDir).mockReturnValue('/old/folder');
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/new/folder'] });
    vi.mocked(migrateDataDir).mockResolvedValue(undefined);
    await call('settings:changeDataDir');
    expect(migrateDataDir).toHaveBeenCalledWith('/old/folder', '/new/folder');
    expect(writeSettings).toHaveBeenCalledWith({ dataDir: '/new/folder' });
    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });

  it('propage une erreur si la migration échoue', async () => {
    vi.mocked(getDbDir).mockReturnValue('/old/folder');
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['/new/folder'] });
    vi.mocked(migrateDataDir).mockRejectedValue(new Error('Disk full'));
    await expect(call('settings:changeDataDir')).rejects.toThrow('Disk full');
    expect(writeSettings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```
cd app && npx vitest run src/__tests__/ipc-settings-handlers.test.ts
```

Expected: fails — canaux non enregistrés.

- [ ] **Step 3: Add 3 IPC handlers to `ipc-handlers.ts`**

Add the following imports at the top of `app/src/ipc-handlers.ts` (after existing imports):

```ts
import { ipcMain, dialog, app } from 'electron';
// existing: import { ipcMain, dialog } from 'electron';  ← replace with above
```

Then add after the existing imports:

```ts
import { readSettings, writeSettings } from './settings';
import { migrateDataDir } from './migrate';
```

At the end of `registerIpcHandlers()`, add:

```ts
  // ─── Paramètres ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => readSettings());

  ipcMain.handle('settings:choose', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir le dossier de données',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    writeSettings({ dataDir: result.filePaths[0] });
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('settings:changeDataDir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choisir le nouveau dossier de données',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const newDir = result.filePaths[0];
    await migrateDataDir(getDbDir(), newDir);
    writeSettings({ dataDir: newDir });
    app.relaunch();
    app.exit(0);
  });
```

Note: the existing `import { ipcMain, dialog } from 'electron'` at line 1 must be updated to also import `app`:

```ts
import { ipcMain, dialog, app } from 'electron';
```

- [ ] **Step 4: Update `preload.ts`**

Add 3 entries to `contextBridge.exposeInMainWorld` (after `getDbPath`):

```ts
  // Paramètres
  getSettings:    () => ipcRenderer.invoke('settings:get'),
  chooseDataDir:  () => ipcRenderer.invoke('settings:choose'),
  changeDataDir:  () => ipcRenderer.invoke('settings:changeDataDir'),
```

Add 3 entries to the `ElectronAPI` type:

```ts
  getSettings:    () => Promise<{ dataDir: string } | null>;
  chooseDataDir:  () => Promise<null>;
  changeDataDir:  () => Promise<null>;
```

- [ ] **Step 5: Update `window.d.ts`**

Add 3 methods to `Window['api']` (after `getDbPath`):

```ts
      getSettings:    () => Promise<{ dataDir: string } | null>;
      chooseDataDir:  () => Promise<null>;
      changeDataDir:  () => Promise<null>;
```

- [ ] **Step 6: Run the new tests**

```
cd app && npx vitest run src/__tests__/ipc-settings-handlers.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 7: Run the full suite to check for regressions**

```
cd app && npx vitest run
```

Expected: all previous tests still pass.

- [ ] **Step 8: Commit**

```
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts \
        app/src/__tests__/ipc-settings-handlers.test.ts
git commit -m "feat: canaux IPC settings:get/choose/changeDataDir avec tests"
```

---

## Task 4: `main.ts` startup logic + `db/index.ts` guard

**Files:**
- Modify: `app/src/db/index.ts` — export `isDbOpen(): boolean`
- Modify: `app/src/main.ts` — 3-way startup; `before-quit` guarded with `isDbOpen()`

No new test files — `main.ts` is excluded from Vitest (it imports Electron directly and runs the app process). The `before-quit` guard change is behavioural correctness.

**Consumes:** `readSettings` from `./settings` (Task 1), `isDbOpen` from `./db` (this task)

- [ ] **Step 1: Add `isDbOpen()` to `db/index.ts`**

After the existing `getDbDir()` function (around line 18), add:

```ts
export function isDbOpen(): boolean {
  return !!db;
}
```

- [ ] **Step 2: Update `main.ts`**

Replace the entire file with:

```ts
import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { openDatabase, getDb, getDbDir, isDbOpen } from './db';
import { registerIpcHandlers } from './ipc-handlers';
import { performBackup, pruneBackups } from './backup';
import { readSettings } from './settings';

if (started) app.quit();

let isQuitting = false;

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
  const settings = readSettings();

  registerIpcHandlers();

  if (!settings) {
    // Premier lancement : WelcomePage demandera à l'utilisateur de choisir le dossier
    createWindow();
    return;
  }

  if (!fs.existsSync(settings.dataDir)) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Dossier de données introuvable',
      message: `Le dossier de données configuré n'existe plus :\n${settings.dataDir}`,
      detail: "Choisissez un nouveau dossier ou quittez l'application.",
      buttons: ['Choisir un nouveau dossier', 'Quitter'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 1) {
      app.exit(0);
      return;
    }
    // choice === 0 : WelcomePage permettra de choisir sans migration
    createWindow();
    return;
  }

  openDatabase(settings.dataDir);
  createWindow();
});

app.on('before-quit', async (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();

  if (!isDbOpen()) {
    // Premier lancement ou dossier manquant — aucune DB à sauvegarder
    app.exit(0);
    return;
  }

  try {
    const backupDir = path.join(getDbDir(), 'backups');
    await performBackup(getDb(), backupDir);
    pruneBackups(backupDir);
  } catch (err) {
    dialog.showErrorBox(
      'Erreur de sauvegarde',
      `La sauvegarde automatique a échoué :\n${String(err)}\n\nL'application va quand même se fermer.`,
    );
  } finally {
    app.exit(0);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 3: Run full test suite (no regressions expected)**

```
cd app && npx vitest run
```

Expected: all existing tests still pass (main.ts is not in the test suite).

- [ ] **Step 4: Commit**

```
git add app/src/db/index.ts app/src/main.ts
git commit -m "feat: démarrage 3 cas (premier lancement / dossier manquant / normal) + guard before-quit"
```

---

## Task 5: `WelcomePage.tsx` + `App.tsx` first-run detection + tests

**Files:**
- Create: `app/src/pages/WelcomePage.tsx`
- Modify: `app/src/App.tsx`
- Create: `app/src/__tests__/renderer/WelcomePage.test.tsx`
- Modify: `app/src/__tests__/renderer/App.test.tsx`

**Key detail:** `Layout.tsx` imports `Page` from `App.tsx`. Do NOT add `'welcome'` to the `NAV_ITEMS` array inside `Layout.tsx` — only `App.tsx` and its tests need to know about it.

**Interfaces:**
- `WelcomePage.tsx` calls `window.api.chooseDataDir()` on button click; shows an error message if it rejects; otherwise the app restarts (the Promise never resolves on success)
- `App.tsx`: `Page` type gains `'welcome'`; `useState<Page | null>(null)` — renders nothing during async init; after `getSettings()` resolves: `null` → `'welcome'` page, non-null → `'accounts'` page

- [ ] **Step 1: Write the failing tests**

Create `app/src/__tests__/renderer/WelcomePage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomePage from '../../pages/WelcomePage';

beforeEach(() => {
  vi.stubGlobal('api', {
    chooseDataDir: vi.fn().mockResolvedValue(null),
  });
});

describe('WelcomePage', () => {
  it('affiche le titre "Bienvenue dans MCY Compta"', () => {
    render(<WelcomePage />);
    expect(screen.getByRole('heading', { name: 'Bienvenue dans MCY Compta' })).toBeInTheDocument();
  });

  it('affiche le bouton "Choisir le dossier de données"', () => {
    render(<WelcomePage />);
    expect(screen.getByRole('button', { name: 'Choisir le dossier de données' })).toBeInTheDocument();
  });

  it('appelle window.api.chooseDataDir() au clic', async () => {
    render(<WelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(window.api.chooseDataDir).toHaveBeenCalledOnce();
  });

  it('affiche un message d\'erreur si chooseDataDir() rejette', async () => {
    vi.stubGlobal('api', {
      chooseDataDir: vi.fn().mockRejectedValue(new Error('Permission denied')),
    });
    render(<WelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Choisir le dossier de données' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

Update `app/src/__tests__/renderer/App.test.tsx`:

1. Add `getSettings: vi.fn().mockResolvedValue({ dataDir: '/data' })` to the `beforeEach` mock.
2. Convert the 3 synchronous tests in `describe('App — layout')` to async (`findBy` instead of `getBy`).
3. Convert the 3 tests in `describe('App — navigation')` to await `findByRole` before clicking.
4. Add 2 new tests for the first-run detection.

The complete updated `app/src/__tests__/renderer/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from '../../types';
import App from '../../App';

const mockAccounts: Account[] = [
  {
    id: 1, number: '100', name: 'Caisse', class: 1,
    type: 'ACTIF', normal_balance: 'DEBIT',
    description: null, must_be_zero_at_closing: false,
    is_closing_account: false, is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2, number: '300', name: 'Cotisations membres', class: 3,
    type: 'PRODUIT', normal_balance: 'CREDIT',
    description: null, must_be_zero_at_closing: false,
    is_closing_account: false, is_active: true,
    created_at: '2025-01-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.stubGlobal('api', {
    getSettings:        vi.fn().mockResolvedValue({ dataDir: '/data' }),
    getAccounts:        vi.fn().mockResolvedValue(mockAccounts),
    getActiveAccounts:  vi.fn().mockResolvedValue(mockAccounts),
    getFiscalYears:     vi.fn().mockResolvedValue([]),
    createFiscalYear:   vi.fn(),
    getJournalEntries:  vi.fn().mockResolvedValue([]),
    createJournalEntry: vi.fn(),
    getAccountBalances: vi.fn().mockResolvedValue([]),
    listBackups:        vi.fn().mockResolvedValue([]),
    exportBackup:       vi.fn().mockResolvedValue(null),
    getDbPath:          vi.fn().mockResolvedValue(''),
    chooseDataDir:      vi.fn().mockResolvedValue(null),
    changeDataDir:      vi.fn().mockResolvedValue(null),
  });
});

describe('App — layout', () => {
  it('affiche la sidebar avec le nom de l\'application', async () => {
    render(<App />);
    expect(await screen.findByText('MCY Compta')).toBeInTheDocument();
  });

  it('affiche les 5 items de navigation', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Plan comptable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Journal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exercices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Soldes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Paramètres' })).toBeInTheDocument();
  });

  it('démarre sur la page Plan comptable', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Plan comptable' }))
      .toHaveAttribute('aria-current', 'page');
  });
});

describe('App — navigation', () => {
  it('affiche le plan comptable par défaut', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Plan comptable' })).toBeInTheDocument();
  });

  it('navigue vers Journal au clic', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: 'Journal' });
    await userEvent.click(btn);
    expect(screen.getByRole('heading', { name: 'Journal' })).toBeInTheDocument();
  });

  it('navigue vers Exercices au clic', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: 'Exercices' });
    await userEvent.click(btn);
    expect(screen.getByRole('heading', { name: 'Exercices' })).toBeInTheDocument();
  });

  it('navigue vers Soldes au clic', async () => {
    render(<App />);
    const btn = await screen.findByRole('button', { name: 'Soldes' });
    await userEvent.click(btn);
    expect(screen.getByRole('heading', { name: 'Soldes' })).toBeInTheDocument();
  });
});

describe('App — AccountsPage', () => {
  it('affiche les comptes après chargement', async () => {
    render(<App />);
    expect(await screen.findByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
  });

  it('affiche le nombre de comptes', async () => {
    render(<App />);
    expect(await screen.findByText('2 comptes')).toBeInTheDocument();
  });

  it('affiche un message d\'erreur si l\'API échoue', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      getAccounts: vi.fn().mockRejectedValue(new Error('DB non disponible')),
    });
    render(<App />);
    expect(await screen.findByText(/DB non disponible/)).toBeInTheDocument();
  });
});

describe('App — premier lancement', () => {
  it('affiche WelcomePage si getSettings() retourne null', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      getSettings: vi.fn().mockResolvedValue(null),
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Bienvenue dans MCY Compta' })).toBeInTheDocument();
  });

  it("n'affiche pas la sidebar sur WelcomePage", async () => {
    vi.stubGlobal('api', {
      ...window.api,
      getSettings: vi.fn().mockResolvedValue(null),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Bienvenue dans MCY Compta' });
    expect(screen.queryByRole('button', { name: 'Plan comptable' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```
cd app && npx vitest run src/__tests__/renderer/WelcomePage.test.tsx \
                         src/__tests__/renderer/App.test.tsx
```

Expected: WelcomePage tests fail (module not found), App tests fail (getSettings not in API mock / async timing).

- [ ] **Step 3: Create `WelcomePage.tsx`**

Create `app/src/pages/WelcomePage.tsx`:

```tsx
import { useState } from 'react';

export default function WelcomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleChoose() {
    setLoading(true);
    setError(null);
    try {
      await window.api.chooseDataDir();
      // Si accepté : app.relaunch() est appelé — cette Promise ne résout jamais
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.container}>
      <div style={s.card}>
        <h1 style={s.h1}>Bienvenue dans MCY Compta</h1>
        <p style={s.desc}>
          Choisissez l&apos;emplacement où sera stockée votre base de données.
        </p>
        <p style={s.hint}>
          Conseil : placez ce dossier dans OneDrive ou un dossier synchronisé
          pour une protection cloud automatique.
        </p>
        {error && <div role="alert" style={s.alert}>Erreur : {error}</div>}
        <button onClick={handleChoose} disabled={loading} style={s.btn}>
          {loading ? 'Ouverture…' : 'Choisir le dossier de données'}
        </button>
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f8fafc' },
  card:      { background: '#fff', borderRadius: '12px', padding: '2.5rem', maxWidth: '500px', width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,.1)', textAlign: 'center' as const },
  h1:        { margin: '0 0 1rem', fontSize: '1.5rem', color: '#0f172a', fontWeight: 700 },
  desc:      { margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#334155' },
  hint:      { margin: '0 0 1.5rem', fontSize: '0.825rem', color: '#64748b', fontStyle: 'italic' as const },
  alert:     { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', color: '#dc2626', fontSize: '0.875rem' },
  btn:       { padding: '0.6rem 1.5rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 },
} as const;
```

- [ ] **Step 4: Update `App.tsx`**

Replace the entire file with:

```tsx
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import AccountsPage    from './pages/AccountsPage';
import JournalPage     from './pages/JournalPage';
import FiscalYearsPage from './pages/FiscalYearsPage';
import BalancesPage    from './pages/BalancesPage';
import SettingsPage    from './pages/SettingsPage';
import WelcomePage     from './pages/WelcomePage';

export type Page = 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'settings' | 'welcome';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page | null>(null);

  useEffect(() => {
    window.api.getSettings()
      .then(s  => setCurrentPage(s ? 'accounts' : 'welcome'))
      .catch(() => setCurrentPage('welcome'));
  }, []);

  if (currentPage === null) return null;
  if (currentPage === 'welcome') return <WelcomePage />;

  const renderPage = () => {
    switch (currentPage) {
      case 'accounts':     return <AccountsPage />;
      case 'journal':      return <JournalPage />;
      case 'fiscal-years': return <FiscalYearsPage />;
      case 'balances':     return <BalancesPage />;
      case 'settings':     return <SettingsPage />;
      default:             return <AccountsPage />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={(p) => setCurrentPage(p)}>
      {renderPage()}
    </Layout>
  );
}
```

- [ ] **Step 5: Run the tests**

```
cd app && npx vitest run src/__tests__/renderer/WelcomePage.test.tsx \
                         src/__tests__/renderer/App.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Run the full suite**

```
cd app && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```
git add app/src/pages/WelcomePage.tsx app/src/App.tsx \
        app/src/__tests__/renderer/WelcomePage.test.tsx \
        app/src/__tests__/renderer/App.test.tsx
git commit -m "feat: WelcomePage + détection premier lancement dans App avec tests"
```

---

## Task 6: `SettingsPage.tsx` change-folder button + tests

**Files:**
- Modify: `app/src/pages/SettingsPage.tsx`
- Modify: `app/src/__tests__/renderer/SettingsPage.test.tsx`

**What changes:**
- Remove the `<p style={s.hint}>Configurable dans une prochaine version.</p>` line (line 65)
- Add a `changeStatus` state and a `handleChangePath` function
- Add a button `[Changer le dossier de données…]` below the input
- On click: calls `window.api.changeDataDir()`; if null (cancelled): sets status to `'cancelled'`; if error: shows in the existing `error` state banner (same as export errors); if app relaunches: never returns

- [ ] **Step 1: Write the failing tests**

Add to `app/src/__tests__/renderer/SettingsPage.test.tsx` (after the existing `describe('SettingsPage — export')` block), and add `changeDataDir` to the default mock in `beforeEach`:

The `mockApi` helper needs `changeDataDir` added. Find the existing `mockApi` function and update it:

```ts
function mockApi(overrides: Partial<Window['api']> = {}) {
  vi.stubGlobal('api', {
    getDbPath:     vi.fn().mockResolvedValue('C:/Users/tm/AppData/data/mcy-compta.db'),
    listBackups:   vi.fn().mockResolvedValue(mockBackups),
    exportBackup:  vi.fn().mockResolvedValue(null),
    changeDataDir: vi.fn().mockResolvedValue(null),
    ...overrides,
  });
}
```

Then add a new describe block at the end of the file:

```ts
describe('SettingsPage — changer le dossier', () => {
  it('affiche le bouton "Changer le dossier de données…"', async () => {
    render(<SettingsPage />);
    expect(await screen.findByRole('button', { name: /Changer le dossier de données/ })).toBeInTheDocument();
  });

  it('appelle window.api.changeDataDir() au clic', async () => {
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Changer le dossier de données/ }));
    expect(window.api.changeDataDir).toHaveBeenCalledOnce();
  });

  it('affiche le bandeau d\'erreur si changeDataDir() rejette', async () => {
    mockApi({ changeDataDir: vi.fn().mockRejectedValue(new Error('Migration failed')) });
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Changer le dossier de données/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failures**

```
cd app && npx vitest run src/__tests__/renderer/SettingsPage.test.tsx
```

Expected: 3 new tests fail (button not found, `changeDataDir` not in mock type).

- [ ] **Step 3: Update `SettingsPage.tsx`**

Add `changeStatus` state after the existing state declarations:

```ts
type ChangeStatus = 'idle' | 'loading' | 'cancelled';
const [changeStatus, setChangeStatus] = useState<ChangeStatus>('idle');
```

Add the handler after `handleExport`:

```ts
async function handleChangePath() {
  setChangeStatus('loading');
  try {
    const result = await window.api.changeDataDir();
    if (result === null) setChangeStatus('cancelled');
    // Si non annulé : app.relaunch() a été appelé, on n'arrive jamais ici
  } catch (e) {
    setChangeStatus('idle');
    setError(e instanceof Error ? e.message : String(e));
  }
}
```

Replace the `<p style={s.hint}>Configurable dans une prochaine version.</p>` line with:

```tsx
        <button
          onClick={handleChangePath}
          disabled={changeStatus === 'loading'}
          style={s.btnSecondary}
        >
          {changeStatus === 'loading' ? 'Migration en cours…' : 'Changer le dossier de données…'}
        </button>
        {changeStatus === 'cancelled' && (
          <p style={s.hint} role="status">Opération annulée.</p>
        )}
```

Add `btnSecondary` to the `s` object at the bottom of the file:

```ts
  btnSecondary: { marginTop: '0.5rem', padding: '0.4rem 0.9rem', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer' },
```

- [ ] **Step 4: Run the tests**

```
cd app && npx vitest run src/__tests__/renderer/SettingsPage.test.tsx
```

Expected: all SettingsPage tests pass.

- [ ] **Step 5: Run the full test suite**

```
cd app && npx vitest run
```

Expected: all tests pass. Count should be approximately 218.

- [ ] **Step 6: Commit**

```
git add app/src/pages/SettingsPage.tsx \
        app/src/__tests__/renderer/SettingsPage.test.tsx
git commit -m "feat: bouton changer le dossier de données dans SettingsPage avec tests"
```

---

## Self-review against spec

### Spec coverage

| Spec section | Task |
|---|---|
| `settings.ts` — `readSettings`/`writeSettings`/`getSettingsPath` | Task 1 ✅ |
| `migrate.ts` — copy+verify+delete, oldDir=newDir guard, create newDir | Task 2 ✅ |
| `settings:get` IPC channel | Task 3 ✅ |
| `settings:choose` IPC channel (no migration) | Task 3 ✅ |
| `settings:changeDataDir` IPC channel (with migration) | Task 3 ✅ |
| preload.ts + window.d.ts updates | Task 3 ✅ |
| Startup 3-way: no settings → WelcomePage | Task 4 + Task 5 ✅ |
| Startup: missing folder → `showMessageBoxSync` + Choisir/Quitter | Task 4 ✅ |
| Startup: normal → `openDatabase(settings.dataDir)` | Task 4 ✅ |
| before-quit guard when DB not open | Task 4 ✅ |
| DB exists in chosen folder → open as-is (no re-seed) | `openDatabase` unchanged (CREATE IF NOT EXISTS + seedIfEmpty) ✅ |
| WelcomePage renders outside `<Layout>` | Task 5 ✅ |
| App async init + 'welcome' page type | Task 5 ✅ |
| SettingsPage: remove hint, add change-folder button | Task 6 ✅ |

### Placeholder scan

No TBDs, no "add appropriate error handling" — all error paths have explicit code.

### Type consistency

- `Settings` interface defined in Task 1 (`settings.ts`), referenced in Tasks 3 and 4 — consistent.
- `isDbOpen()` defined in Task 4 (`db/index.ts`), used in Task 4 (`main.ts`) — consistent.
- `migrateDataDir` signature `(oldDir, newDir): Promise<void>` defined in Task 2, called in Task 3 — consistent.
- `Page` type gains `'welcome'` in Task 5 (`App.tsx`) — `Layout.tsx` imports `Page` but `'welcome'` is never added to `NAV_ITEMS`, so no extra nav item appears.
- `window.api.chooseDataDir()` declared in Tasks 3 and 5; `window.api.changeDataDir()` declared in Tasks 3 and 6 — consistent.
