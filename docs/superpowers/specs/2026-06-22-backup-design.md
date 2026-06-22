# Sauvegarde automatique + page Paramètres — Design

**Date :** 2026-06-22  
**Contexte :** MotoClubComptaAddIn — Electron + React + TypeScript + SQLite

---

## Objectif

1. **Sauvegarde automatique** à chaque fermeture de l'application (silencieuse, erreur signalée)
2. **Export manuel** via dialog de fichier (l'utilisateur choisit la destination)
3. **Page Paramètres** avec chemin DB (lecture seule), bouton export, liste des 30 dernières sauvegardes automatiques

---

## Fichiers

| Action | Fichier | Responsabilité |
|---|---|---|
| Nouveau | `app/src/backup.ts` | `performBackup()`, `pruneBackups()`, `listBackups()` |
| Nouveau | `app/src/pages/SettingsPage.tsx` | UI Paramètres |
| Nouveau | `app/src/__tests__/backup.test.ts` | Tests unitaires logique backup |
| Nouveau | `app/src/__tests__/renderer/SettingsPage.test.tsx` | Tests composant |
| Modifié | `app/src/db/index.ts` | Ajouter `getDbDir(): string` |
| Modifié | `app/src/types/index.ts` | Ajouter `BackupInfo` |
| Modifié | `app/src/ipc-handlers.ts` | 3 nouveaux canaux `backup:*` |
| Modifié | `app/src/preload.ts` | Exposer les nouvelles API backup |
| Modifié | `app/src/window.d.ts` | Types `window.api` pour les nouvelles API |
| Modifié | `app/src/main.ts` | Auto-backup sur `before-quit` |
| Modifié | `app/src/App.tsx` | Ajouter `'settings'` au type `Page` + case dans `renderPage` |
| Modifié | `app/src/components/Sidebar.tsx` | Ajouter entrée "Paramètres" dans `NAV_ITEMS` |

---

## `src/backup.ts` — logique pure (main process)

### Type

```ts
export interface BackupInfo {
  filename: string;   // ex: "mcy-compta-2025-03-08_14-30.db"
  date: string;       // ISO 8601 extrait du nom de fichier: "2025-03-08T14:30:00.000Z"
  sizeBytes: number;
}
```

### Fonctions

```ts
// Sauvegarde la DB vers backupDir/mcy-compta-YYYY-MM-DD_HH-mm.db
// Crée backupDir si nécessaire. Retourne le chemin du fichier créé.
export async function performBackup(db: Database.Database, backupDir: string): Promise<string>

// Supprime les fichiers mcy-compta-*.db les plus anciens si count > maxCount (défaut: 30)
// Tri lexicographique sur le nom = tri chronologique (format date garantit cela)
export function pruneBackups(backupDir: string, maxCount?: number): void

// Retourne la liste des backups triés du plus récent au plus ancien
export function listBackups(backupDir: string): BackupInfo[]
```

### Nommage des fichiers

Format : `mcy-compta-YYYY-MM-DD_HH-mm.db`  
Exemple : `mcy-compta-2025-03-08_14-30.db`

Le format date-heure garantit que le tri lexicographique = tri chronologique — pas besoin de métadonnées séparées.

---

## `src/db/index.ts` — ajout de `getDbDir()`

```ts
let dbDir: string;

export function getDbDir(): string {
  if (!dbDir) throw new Error('Base de données non initialisée');
  return dbDir;
}
```

`dbDir` est assigné dans `openDatabase()` lors de l'initialisation (ignoré en mode `:memory:`).

---

## IPC — 3 nouveaux canaux

Ajoutés dans `src/ipc-handlers.ts` :

| Canal | Paramètre | Retour | Description |
|---|---|---|---|
| `backup:list` | — | `BackupInfo[]` | Liste les sauvegardes automatiques |
| `backup:export` | — | `{ path: string } \| null` | Dialog save + backup vers destination choisie (null = annulé) |
| `backup:getDbPath` | — | `string` | Chemin complet de la DB active |

**`backup:export`** : ouvre `dialog.showSaveDialog()` pré-rempli avec le nom `mcy-compta-YYYY-MM-DD_HH-mm.db`. Le dialog retourne un chemin complet (ex: `D:\usb\mcy-compta-2025-03-08_14-30.db`). Le handler appelle directement `getDb().backup(destPath)` — pas `performBackup()` qui génère son propre nom. Retourne `{ path: destPath }` ou `null` si l'utilisateur annule.

---

## Auto-backup dans `src/main.ts`

```ts
app.on('before-quit', async (e) => {
  e.preventDefault();
  try {
    const backupDir = path.join(getDbDir(), 'backups');
    await performBackup(getDb(), backupDir);
    pruneBackups(backupDir);
  } catch (err) {
    dialog.showErrorBox(
      'Erreur de sauvegarde',
      `La sauvegarde automatique a échoué :\n${String(err)}\n\nL'application va quand même se fermer.`
    );
  } finally {
    app.exit(0);  // exit() ne re-déclenche pas before-quit
  }
});
```

---

## `src/pages/SettingsPage.tsx` — UI

```
┌─ Paramètres ──────────────────────────────────┐
│                                               │
│  Base de données                              │
│  ┌─────────────────────────────────────────┐  │
│  │ /Users/tm/AppData/.../mcy-compta.db     │  │
│  └─────────────────────────────────────────┘  │
│  (chemin lecture seule — configurable bientôt)│
│                                               │
│  Sauvegardes                                  │
│  [Exporter une sauvegarde maintenant]         │
│                                               │
│  Sauvegardes automatiques (N)                 │
│  ┌──────────────────────────────┬──────────┐  │
│  │ 08.03.2025 14:30             │ 1.2 Mo   │  │
│  │ 07.03.2025 09:15             │ 1.1 Mo   │  │
│  └──────────────────────────────┴──────────┘  │
└───────────────────────────────────────────────┘
```

- Chemin DB : `<input type="text" readOnly>` — modifiable lors de la tâche "sélecteur de dossier"
- Bouton export : feedback visuel (loading → succès/erreur) pendant l'opération
- Liste sauvegardes : date formatée (DD.MM.YYYY HH:mm), taille en Ko/Mo
- Colonne "Restaurer" : **non implémentée dans cette tâche** (YAGNI)

---

## Navigation

`App.tsx` — type `Page` étendu :
```ts
export type Page = 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'settings';
```

`Sidebar.tsx` — entrée ajoutée en fin de `NAV_ITEMS` :
```ts
{ id: 'settings', label: 'Paramètres' }
```

---

## Tests

### `src/__tests__/backup.test.ts`
- `performBackup` : crée un fichier `.db` dans un dossier temporaire (`os.tmpdir()`)
- `performBackup` : crée `backupDir` s'il n'existe pas
- `pruneBackups` : conserve les N plus récents, supprime les plus anciens
- `pruneBackups` : ne fait rien si count ≤ maxCount
- `listBackups` : retourne les fichiers triés du plus récent au plus ancien
- `listBackups` : retourne tableau vide si dossier inexistant

### `src/__tests__/renderer/SettingsPage.test.tsx`
- Affiche le chemin de la DB
- Affiche la liste des sauvegardes avec date et taille formatée
- Affiche "(0 sauvegarde)" si la liste est vide
- Le bouton export appelle `window.api.exportBackup()`
- Affiche un message de succès après export réussi
- Affiche un message d'erreur si l'export échoue
- Affiche un message si l'export est annulé (retour null)
