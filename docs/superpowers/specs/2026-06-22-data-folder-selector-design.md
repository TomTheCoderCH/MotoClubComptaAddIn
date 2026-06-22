# Sélecteur du dossier de données — Design

**Date :** 2026-06-22  
**Contexte :** MotoClubComptaAddIn — Electron + React + TypeScript + SQLite

---

## Objectif

1. **Premier lancement** : afficher un écran de bienvenue permettant à l'utilisateur de choisir le dossier où sera stockée la base de données
2. **Changement de dossier** : depuis la page Paramètres, migrer la DB + les sauvegardes vers un nouveau dossier, puis relancer l'application
3. **Dossier manquant** : si le dossier configuré n'existe plus au démarrage, proposer d'en choisir un nouveau ou de quitter

---

## Fichiers

| Action | Fichier | Responsabilité |
|---|---|---|
| Nouveau | `app/src/settings.ts` | `readSettings()` / `writeSettings()` — JSON dans `%APPDATA%\MCYCompta\settings.json` |
| Nouveau | `app/src/migrate.ts` | `migrateDataDir(oldDir, newDir)` — copie, vérifie, supprime |
| Nouveau | `app/src/pages/WelcomePage.tsx` | Écran de bienvenue (premier lancement) |
| Nouveau | `app/src/__tests__/settings.test.ts` | Tests unitaires settings |
| Nouveau | `app/src/__tests__/migrate.test.ts` | Tests intégration migration |
| Nouveau | `app/src/__tests__/renderer/WelcomePage.test.tsx` | Tests composant WelcomePage |
| Modifié | `app/src/main.ts` | Startup logic avec settings + dialog dossier manquant |
| Modifié | `app/src/ipc-handlers.ts` | 3 nouveaux canaux `settings:*` |
| Modifié | `app/src/preload.ts` | Exposer les 3 canaux |
| Modifié | `app/src/window.d.ts` | Types `window.api` pour les 3 canaux |
| Modifié | `app/src/App.tsx` | Ajouter `'welcome'` au type Page ; détecter premier lancement ; rendre WelcomePage hors Layout |
| Modifié | `app/src/pages/SettingsPage.tsx` | Remplacer input read-only par bouton "Changer le dossier" |
| Modifié | `app/src/__tests__/renderer/SettingsPage.test.tsx` | Ajouter tests bouton changement |
| Modifié | `app/src/__tests__/renderer/App.test.tsx` | Ajouter tests détection premier lancement |

---

## `settings.ts`

**Chemin du fichier settings :** `path.join(app.getPath('appData'), 'MCYCompta', 'settings.json')`

```ts
interface Settings {
  dataDir: string;
}

export function readSettings(): Settings | null
export function writeSettings(settings: Settings): void
export function getSettingsPath(): string   // utile pour les tests
```

- `readSettings()` retourne `null` si le fichier n'existe pas. Throw si le JSON est invalide (corruption).
- `writeSettings()` crée le dossier parent si nécessaire.

---

## `migrate.ts`

```ts
export async function migrateDataDir(oldDir: string, newDir: string): Promise<void>
```

**Étapes :**

1. Si `oldDir === newDir` → throw `'Le dossier cible est identique au dossier actuel'`
2. Créer `newDir` si inexistant
3. Copier `mcy-compta.db` de `oldDir` vers `newDir`
4. Vérifier que la taille du fichier copié correspond à l'original — throw si différente
5. Si `oldDir/backups/` existe : copier tous les `mcy-compta-*.db` vers `newDir/backups/` (créer si nécessaire) + vérifier chaque copie
6. Supprimer `mcy-compta.db` de `oldDir`
7. Supprimer les fichiers `mcy-compta-*.db` copiés de `oldDir/backups/` (ne pas supprimer le dossier `backups/` lui-même)

Les suppressions (étapes 6-7) ne se font qu'après que toutes les copies et vérifications (étapes 3-5) ont réussi. En cas d'erreur intermédiaire, les originaux restent intacts.

---

## Flux de démarrage (`main.ts`)

```
Au lancement (app.on('ready')):

1. Lire settings.json
   ├── Absent (premier lancement)
   │     → registerIpcHandlers()
   │     → createWindow()   [renderer affichera WelcomePage]
   │
   ├── Présent, mais settings.dataDir n'existe pas (dossier manquant)
   │     → dialog.showMessageBoxSync:
   │         "Dossier de données introuvable"
   │         [Choisir un nouveau dossier]  [Quitter]
   │       ├── Quitter → app.exit(0)
   │       └── Choisir → registerIpcHandlers() + createWindow()
   │                      [renderer affichera WelcomePage sans migration]
   │
   └── Présent et valide
         → openDatabase(settings.dataDir)    ← si mcy-compta.db existe : ouvert tel quel
         → registerIpcHandlers()             ← sinon : nouvelle DB créée (schéma + seed)
         → createWindow()
```

**Note sur `openDatabase(dir)`** : utilise `CREATE TABLE IF NOT EXISTS` et `seedAccountsIfEmpty()` (insert uniquement si la table `accounts` est vide). Si une `mcy-compta.db` existe déjà dans le dossier choisi (ex. reprise sur nouvelle machine), elle est ouverte sans modification et sans re-seed.

---

## Canaux IPC

| Canal | Paramètres | Retour | Description |
|---|---|---|---|
| `settings:get` | — | `{ dataDir: string } \| null` | Lit `settings.json` |
| `settings:choose` | — | `null` | Ouvre `dialog.showOpenDialog`, si accepté : `writeSettings` + `app.relaunch()` + `app.exit(0)` ; si annulé : retourne `null` |
| `settings:changeDataDir` | — | `null` | Ouvre dialog, puis `migrateDataDir`, puis `writeSettings` + `app.relaunch()` + `app.exit(0)` ; si annulé : `null` ; si migration échoue : throw |

**`settings:choose`** ne lance pas de migration (le dossier d'origine peut ne pas exister — premier lancement ou dossier manquant).

---

## `App.tsx`

Au montage, `App` appelle `window.api.getSettings()` :
- Si `null` → `setCurrentPage('welcome')`
- Sinon → `setCurrentPage('accounts')`

```ts
export type Page = 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'settings' | 'welcome';
```

La page `'welcome'` est rendue **hors du composant `<Layout>`** — pas de sidebar, pas de header. Si `currentPage === 'welcome'`, `App` retourne `<WelcomePage />` directement. Sinon, il retourne `<Layout>...</Layout>` comme avant.

---

## `WelcomePage.tsx`

```
┌─ MCY Compta ────────────────────────────────────────────┐
│                                                          │
│            Bienvenue dans MCY Compta                     │
│                                                          │
│  Choisissez l'emplacement où sera stockée votre          │
│  base de données.                                        │
│                                                          │
│  Conseil : placez ce dossier dans OneDrive ou un         │
│  dossier synchronisé pour une protection cloud           │
│  automatique.                                            │
│                                                          │
│          [Choisir le dossier de données]                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- Un seul bouton : `window.api.chooseDataDir()`
- Message d'erreur si l'IPC échoue (cas rare)
- Styles inline `const s = {...} as const` (pattern existant)

---

## `SettingsPage.tsx` — modifications

La section "Base de données" devient :

```
Chemin de la base de données
┌─────────────────────────────────────────────────────┐
│ C:/Users/tm/OneDrive/MCYCompta/mcy-compta.db        │
└─────────────────────────────────────────────────────┘
[Changer le dossier de données…]
```

- Le champ `<input readOnly>` reste (lecture seule)
- Le hint "Configurable dans une prochaine version." est **remplacé** par le bouton
- Clic sur le bouton → `window.api.changeDataDir()` → si erreur : affichée dans le bandeau existant ; si annulé : rien ; si succès : l'app se relance (jamais de retour)
- Le bouton est désactivé pendant l'opération

---

## Tests

### `settings.test.ts` (~5 tests, env node)
- `readSettings()` retourne `null` si fichier absent
- `readSettings()` retourne l'objet si fichier valide
- `readSettings()` throw si JSON invalide
- `writeSettings()` crée le dossier parent si nécessaire
- `writeSettings()` écrit un fichier lisible par `readSettings()`

### `migrate.test.ts` (~6 tests, env node)
- Migration réussie : DB copiée dans nouveau dossier + originaux supprimés
- Migration réussie : backups copiés si présents
- Migration sans backups : pas d'erreur
- `oldDir === newDir` : throw immédiat, rien copié
- Vérification de taille échoue (copie corrompue simulée) : throw, originaux intacts
- Nouveau dossier créé s'il n'existe pas

### `WelcomePage.test.tsx` (~4 tests, env jsdom)
- Affiche le titre "Bienvenue dans MCY Compta"
- Affiche le bouton "Choisir le dossier de données"
- Clic sur le bouton appelle `window.api.chooseDataDir()`
- Affiche un message d'erreur si `chooseDataDir()` rejette

### `SettingsPage.test.tsx` (3 ajouts)
- Affiche le bouton "Changer le dossier de données…"
- Clic appelle `window.api.changeDataDir()`
- Affiche le bandeau d'erreur si `changeDataDir()` rejette

### `App.test.tsx` (2 ajouts)
- `getSettings()` retourne `null` → affiche WelcomePage (pas de navigation)
- `getSettings()` retourne config → affiche navigation normale

**Total nouveaux tests : ~20 | Total visé : ~210**
