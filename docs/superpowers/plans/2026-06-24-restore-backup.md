# Restauration depuis une sauvegarde — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'utilisateur de restaurer une base de données depuis un fichier `.db` (sauvegarde automatique ou manuelle), avec backup de sécurité préalable et redémarrage automatique de l'application.

**Architecture:** Un handler IPC `backup:restore` dans le main process ouvre un dialog natif pour choisir le fichier, demande confirmation via un dialog natif, effectue un backup de sécurité de la base courante via `performBackup`, puis remplace le fichier DB actif par `fs.copyFileSync` et redémarre via `app.relaunch() + app.exit(0)`. Le renderer expose un bouton "Restaurer depuis une sauvegarde…" dans la section Sauvegardes de SettingsPage.

**Tech Stack:** Electron `ipcMain` + `dialog` + `app`, `node:fs`, `better-sqlite3` (via `performBackup`), React, Vitest, React Testing Library

## Global Constraints

- Montants en centimes (INTEGER) — sans rapport mais convention générale du projet
- CSS Modules uniquement — zéro `style={{}}` dans les composants
- TDD : test écrit en premier, vérifié qu'il échoue, puis implémentation
- Commande de test : `cd app && npm test` (le `pretest` rebuild better-sqlite3 pour Node)
- Résultat attendu en fin de plan : 347 tests (339 + 8 nouveaux)
- **Maintenance aide** : vérifier si `HelpDrawer.tsx` doit être mis à jour après toute fonctionnalité

---

### Task 1 : Handler IPC `backup:restore`

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/__tests__/ipc-backup-handlers.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `getDbDir()` from `./db` ; `performBackup` from `./backup` ; `dialog`, `app`, `ipcMain` from `electron` ; `fs` from `node:fs`
- Produces: canal IPC `'backup:restore'` → retourne `null` si annulé, ne retourne pas si succès (app redémarre)

- [ ] **Step 1 : Écrire les tests**

Ajouter à la fin de `app/src/__tests__/ipc-backup-handlers.test.ts` :

```ts
// ── 1. Modifier le bloc vi.mock('electron', ...) en haut du fichier ──────────
// Remplacer le bloc existant par :
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: null, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
  dialog: {
    showSaveDialog:   vi.fn(),
    showOpenDialog:   vi.fn(),
    showMessageBox:   vi.fn(),
  },
  app: {
    relaunch: vi.fn(),
    exit:     vi.fn(),
  },
}));

// ── 2. Modifier vi.mock('../backup', ...) pour ajouter performBackup ──────────
// Remplacer le bloc existant par :
vi.mock('../backup', () => ({
  listBackups:          vi.fn(),
  formatBackupFilename: vi.fn(),
  performBackup:        vi.fn().mockResolvedValue('/data/backups/mcy-compta-2025-01-01_00-00.db'),
}));

// ── 3. Ajouter en haut des imports (après les imports existants) ──────────────
// import { dialog, app } from 'electron';
// import { listBackups, formatBackupFilename, performBackup } from '../backup';
// (remplacer les imports existants de ces deux modules)

// ── 4. Ajouter le mock node:fs au niveau module ───────────────────────────────
vi.mock('node:fs', () => ({
  default: { copyFileSync: vi.fn() },
  copyFileSync: vi.fn(),
}));

// ── 5. Ajouter l'import de app et fs après les imports existants ──────────────
// import { app } from 'electron';     (ajouté à la déstructuration existante)
// import * as nodeFs from 'node:fs';
```

Voici les tests à ajouter au fichier (après le dernier `describe`) :

```ts
describe('registration des canaux backup — restore', () => {
  it('enregistre le canal backup:restore', () => {
    expect(handlers.has('backup:restore')).toBe(true);
  });
});

describe('backup:restore', () => {
  it('retourne null si le dialog de sélection est annulé', async () => {
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: true, filePaths: [],
    });
    const result = await call('backup:restore');
    expect(result).toBeNull();
  });

  it('retourne null si l\'utilisateur annule la confirmation', async () => {
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false, filePaths: ['/backups/mcy.db'],
    });
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: 1, // Annuler
    });
    const result = await call('backup:restore');
    expect(result).toBeNull();
  });

  it('effectue un backup de sécurité avant la restauration', async () => {
    vi.mocked(getDbDir).mockReturnValue('/data');
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false, filePaths: ['/backups/mcy.db'],
    });
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: 0, // Restaurer
    });
    await call('backup:restore');
    expect(performBackup).toHaveBeenCalledWith({}, path.join('/data', 'backups'));
  });

  it('copie le fichier sélectionné sur la DB active', async () => {
    vi.mocked(getDbDir).mockReturnValue('/data');
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false, filePaths: ['/backups/mcy.db'],
    });
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: 0,
    });
    await call('backup:restore');
    const { copyFileSync } = await import('node:fs');
    expect(copyFileSync).toHaveBeenCalledWith(
      '/backups/mcy.db',
      path.join('/data', 'mcy-compta.db'),
    );
  });

  it('appelle app.relaunch() et app.exit(0) après restauration réussie', async () => {
    vi.mocked(getDbDir).mockReturnValue('/data');
    vi.mocked(getDb).mockReturnValue({} as any);
    vi.mocked(dialog.showOpenDialog as ReturnType<typeof vi.fn>).mockResolvedValue({
      canceled: false, filePaths: ['/backups/mcy.db'],
    });
    vi.mocked(dialog.showMessageBox as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: 0,
    });
    await call('backup:restore');
    expect(app.relaunch).toHaveBeenCalled();
    expect(app.exit).toHaveBeenCalledWith(0);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "backup:restore|FAIL" | Select-Object -First 10
```
Attendu : FAIL — canal `backup:restore` non enregistré

- [ ] **Step 3 : Implémenter le handler dans `ipc-handlers.ts`**

Modifier les imports en haut du fichier — remplacer :
```ts
import { ipcMain, dialog } from 'electron';
```
par :
```ts
import { ipcMain, dialog, app } from 'electron';
import fs from 'node:fs';
```

Modifier l'import backup — remplacer :
```ts
import { listBackups, formatBackupFilename } from './backup';
```
par :
```ts
import { listBackups, formatBackupFilename, performBackup } from './backup';
```

Ajouter le handler dans `registerIpcHandlers()`, après le bloc `// ─── Sauvegarde` existant (après `backup:getDbPath`) :

```ts
  ipcMain.handle('backup:restore', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Restaurer une sauvegarde',
      filters: [{ name: 'Base de données SQLite', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || !picked.filePaths[0]) return null;

    const srcPath = picked.filePaths[0];

    const confirmed = await dialog.showMessageBox({
      type: 'warning',
      title: 'Restaurer une sauvegarde',
      message: 'Remplacer la base de données actuelle et redémarrer ?',
      detail:
        `Fichier sélectionné : ${srcPath}\n\n` +
        'Une sauvegarde de sécurité sera créée automatiquement avant la restauration.',
      buttons: ['Restaurer et redémarrer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
    });
    if (confirmed.response !== 0) return null;

    const backupDir = path.join(getDbDir(), 'backups');
    await performBackup(getDb(), backupDir);

    const destPath = path.join(getDbDir(), 'mcy-compta.db');
    fs.copyFileSync(srcPath, destPath);

    app.relaunch();
    app.exit(0);
  });
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  345 passed (345)`

- [ ] **Step 5 : Commit**

```
git add app/src/ipc-handlers.ts app/src/__tests__/ipc-backup-handlers.test.ts
git commit -m "feat(ipc): handler backup:restore — selection, confirmation, copie, relaunch"
```

---

### Task 2 : Preload + SettingsPage + tests renderer + CLAUDE.md

**Files:**
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Modify: `app/src/pages/SettingsPage.tsx`
- Modify: `app/src/__tests__/renderer/SettingsPage.test.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: canal IPC `'backup:restore'` (produit par Task 1)
- Produces: `window.api.restoreBackup(): Promise<null>`

- [ ] **Step 1 : Écrire les tests SettingsPage**

Ajouter à la fin de `app/src/__tests__/renderer/SettingsPage.test.tsx` :

```tsx
describe('SettingsPage — restauration', () => {
  it('affiche le bouton "Restaurer depuis une sauvegarde…"', async () => {
    render(<SettingsPage />);
    expect(
      await screen.findByRole('button', { name: /Restaurer depuis une sauvegarde/ })
    ).toBeInTheDocument();
  });

  it('appelle window.api.restoreBackup() au clic', async () => {
    mockApi({ restoreBackup: vi.fn().mockResolvedValue(null) });
    render(<SettingsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Restaurer depuis une sauvegarde/ })
    );
    expect(window.api.restoreBackup).toHaveBeenCalledOnce();
  });

  it('affiche un message d\'erreur si restoreBackup() rejette', async () => {
    mockApi({ restoreBackup: vi.fn().mockRejectedValue(new Error('Copie impossible')) });
    render(<SettingsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Restaurer depuis une sauvegarde/ })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Copie impossible');
  });
});
```

Modifier également le `mockApi` en haut du fichier pour inclure `restoreBackup` dans les valeurs par défaut :

```tsx
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
    restoreBackup:  vi.fn().mockResolvedValue(null),
    ...overrides,
  });
}
```

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

```
cd app && npm test -- --reporter=verbose 2>&1 | Select-String -Pattern "restauration|FAIL" | Select-Object -First 10
```
Attendu : FAIL — `window.api.restoreBackup is not a function`

- [ ] **Step 3 : Ajouter `restoreBackup` dans le preload**

Dans `app/src/preload.ts`, ajouter dans l'objet `contextBridge.exposeInMainWorld('api', { ... })`, après la ligne `exportExcel` :

```ts
  // Restauration
  restoreBackup: (): Promise<null> => ipcRenderer.invoke('backup:restore'),
```

Ajouter dans le type `ElectronAPI` (après `exportExcel`) :

```ts
  restoreBackup: () => Promise<null>;
```

- [ ] **Step 4 : Ajouter `restoreBackup` dans `window.d.ts`**

Ajouter dans l'interface `Window.api` (après `exportExcel`) :

```ts
      restoreBackup:      () => Promise<null>;
```

- [ ] **Step 5 : Ajouter le bouton dans `SettingsPage.tsx`**

Ajouter l'état et le handler dans le composant. Après la ligne :
```tsx
const [changeStatus, setChangeStatus] = useState<ChangeStatus>('idle');
```
Ajouter :
```tsx
const [restoring, setRestoring] = useState(false);
```

Ajouter la fonction `handleRestore` après `handleChangePath` :

```tsx
  async function handleRestore() {
    setRestoring(true);
    setError(null);
    try {
      await window.api.restoreBackup();
      // Si null : l'utilisateur a annulé — l'app ne redémarre pas
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  }
```

Dans le JSX, dans `<section className={styles.section}>` (section Sauvegardes), ajouter le bouton de restauration **après** le bouton export existant et son bloc de statut, avant la balise `<h3>` :

```tsx
        <button
          onClick={handleRestore}
          disabled={restoring}
          className={styles.btnSecondary}
        >
          {restoring ? 'Restauration en cours…' : 'Restaurer depuis une sauvegarde…'}
        </button>
```

- [ ] **Step 6 : Vérifier que tous les tests passent**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  347 passed (347)`

- [ ] **Step 7 : Mettre à jour `CLAUDE.md`**

Dans la section "État d'avancement → Fait", ajouter après la ligne de migration DB :

```markdown
- [x] Restauration depuis une sauvegarde — bouton dans SettingsPage, handler `backup:restore` (dialog natif, backup de sécurité préalable, `fs.copyFileSync`, `app.relaunch()`) — 347 tests
```

- [ ] **Step 8 : Commit**

```
git add app/src/preload.ts app/src/window.d.ts app/src/pages/SettingsPage.tsx app/src/__tests__/renderer/SettingsPage.test.tsx CLAUDE.md
git commit -m "feat(ui): restauration depuis une sauvegarde dans SettingsPage"
```

---

## Vérification finale

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  347 passed (347)` — 8 nouveaux tests (5 IPC + 3 renderer).
