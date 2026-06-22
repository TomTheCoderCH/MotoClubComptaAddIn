# Tests handlers IPC — Design

**Date :** 2026-06-22  
**Contexte :** MotoClubComptaAddIn — Electron + React + TypeScript + SQLite

---

## Problème

Les handlers IPC dans `main.ts` sont des wrappers qui délèguent aux fonctions `db/index.ts`.
`db.test.ts` couvre déjà la couche DB. Il manque une couche de tests qui vérifie :

- Les **noms de canaux** (contrat main ↔ renderer) — une typo passe inaperçue
- Le **passage des paramètres** (ex. `year`, `fiscalYearId`, `payload`)
- La **propagation des erreurs** — qu'une exception DB remonte bien au renderer

## Approche retenue : Option A — Extraire + tester `registerIpcHandlers`

Déplacer la logique des handlers de `main.ts` vers un fichier `src/ipc-handlers.ts` exporté.
`main.ts` reste le bootstrap Electron pur ; `ipc-handlers.ts` est testable sans lancer Electron.

## Fichiers

| Action | Fichier |
|---|---|
| Nouveau | `src/ipc-handlers.ts` — logique des handlers extraite |
| Modifié | `src/main.ts` — importe `registerIpcHandlers` depuis `ipc-handlers.ts` |
| Nouveau | `src/__tests__/ipc-handlers.test.ts` — ~19 tests |

## Architecture de `src/ipc-handlers.ts`

```ts
import { ipcMain } from 'electron';
import {
  getAllAccounts, getActiveAccounts,
  getAllFiscalYears, createFiscalYear,
  getJournalEntries, createJournalEntry, updateJournalEntry, deleteJournalEntry,
  getAccountBalances,
} from './db';

export function registerIpcHandlers(): void {
  ipcMain.handle('db:getAccounts',       () => getAllAccounts());
  ipcMain.handle('db:getActiveAccounts', () => getActiveAccounts());
  ipcMain.handle('db:getFiscalYears',    () => getAllFiscalYears());
  ipcMain.handle('db:createFiscalYear',  (_e, year: number) => createFiscalYear(year));
  ipcMain.handle('db:getJournalEntries', (_e, fiscalYearId: number) => getJournalEntries(fiscalYearId));
  ipcMain.handle('db:createJournalEntry', (_e, payload) => createJournalEntry(payload));
  ipcMain.handle('db:updateJournalEntry', (_e, payload) => updateJournalEntry(payload));
  ipcMain.handle('db:deleteJournalEntry', (_e, id: number) => deleteJournalEntry(id));
  ipcMain.handle('db:getAccountBalances', (_e, fiscalYearId: number) => getAccountBalances(fiscalYearId));
}
```

## Mécanique des tests

Le mock de `ipcMain` capture les handlers enregistrés dans une Map :

```ts
const handlers = new Map<string, Function>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Function) => handlers.set(channel, fn),
  },
}));
```

Les fonctions DB sont mockées via `vi.mock('./db', ...)` — aucun SQLite dans ces tests.

Appel d'un handler depuis un test (le premier argument est l'event IPC, on passe `null`) :
```ts
// Sans paramètre métier
const result = await handlers.get('db:getAccounts')!(null);
// Avec paramètre métier (ex. year)
const result = await handlers.get('db:createFiscalYear')!(null, 2025);
```

## Cas de test (~19 tests)

### Contrat de registration (1 test)
- Tous les 9 canaux attendus sont enregistrés après appel de `registerIpcHandlers()`

### Par canal — 2 tests chacun

| Canal | Happy path | Erreur |
|---|---|---|
| `db:getAccounts` | retourne la liste mockée | DB lance → erreur propagée |
| `db:getActiveAccounts` | retourne les comptes actifs mockés | DB lance → erreur propagée |
| `db:getFiscalYears` | retourne les exercices mockés | DB lance → erreur propagée |
| `db:createFiscalYear` | passe `year`, retourne l'exercice mocké | DB lance → erreur propagée |
| `db:getJournalEntries` | passe `fiscalYearId`, retourne les entrées mockées | DB lance → erreur propagée |
| `db:createJournalEntry` | passe le payload complet | Écriture déséquilibrée → erreur propagée |
| `db:updateJournalEntry` | passe le payload, retourne l'entrée mise à jour | Exercice clôturé → erreur propagée |
| `db:deleteJournalEntry` | passe `id`, retourne `undefined` | Écriture introuvable → erreur propagée |
| `db:getAccountBalances` | passe `fiscalYearId`, retourne les soldes | DB lance → erreur propagée |

### Cas-clé : propagation d'erreur
Chaque handler doit laisser remonter les exceptions DB sans les avaler.
Electron sérialise les erreurs de `ipcMain.handle` vers le renderer — le test vérifie que le `await` rejette bien.

## Conventions

- Environnement Vitest : `node` (pas de jsdom — pas de DOM ici)
- Pas de `better-sqlite3` dans ces tests (la DB est entièrement mockée)
- `handlers` est vidée avant chaque test (`beforeEach(() => handlers.clear())`)
- `registerIpcHandlers()` est appelée dans chaque `beforeEach` pour ré-enregistrer proprement
