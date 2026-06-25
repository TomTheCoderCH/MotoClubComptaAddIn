# MotoClubComptaAddIn — Notes de projet

## Contexte général

Application de gestion comptable pour un moto-club local suisse (MCY).
Le développeur actuel est informaticien de métier, mais ses **successeurs à la gestion des comptes ne le seront pas**.

Contrainte centrale : l'application doit être utilisable par un non-technicien, ET capable d'exporter une feuille Excel exploitable pour assurer la continuité en cas de passage à un gestionnaire sans compétences informatiques.

---

## Fichier de référence

`Documents/MCY comptes 25.xlsx` — comptabilité de l'exercice 2025 tenue manuellement dans Excel.
Sert de base de référence pour comprendre les besoins métier.

---

## Structure comptable actuelle (Excel)

Le classeur contient 11 feuilles correspondant aux comptes suivants :

| Feuille | Type comptable | Classe |
|---|---|---|
| Journal | Livre journal (registre chronologique) | — |
| Cotisations | Compte de produits (recettes membres) | Résultat |
| Caisse | Compte d'actif circulant — espèces | Bilan |
| Raiffeisen | Compte d'actif circulant — banque | Bilan |
| Produits et Frais | Compte de résultat mixte (charges + produits divers) | Résultat |
| Twint | Compte de transit / liquidités intermédiaires | Bilan |
| Caissier | Compte de transit interne / avances caissier | Bilan |
| Marché Villageois | Compte analytique événementiel (centre de profit) | Résultat |
| Passifs Transitoires | Compte de régularisation passif | Bilan |
| Profits et Pertes | Compte de résultat global (clôture) | Résultat |
| Capital | Compte de fonds propres | Bilan |

### Chiffres clés exercice 2025

- Capital d'entrée : CHF 12'443.80
- Cotisations encaissées : CHF 1'410 (44 membres à CHF 30)
- Bénéfice net : CHF 337.04
- Événement principal : Marché Villageois (bénéfice CHF 1'618)

---

## Évaluation de la structure actuelle

### Points forts
- Comptabilité en partie double appliquée correctement
- Séparation claire Caisse / Banque / Twint (transit)
- Compte analytique dédié au Marché Villageois
- Passifs transitoires pour le rattachement inter-exercices
- Clôture P&L → Capital bien structurée

### Faiblesses identifiées
- `Produits et Frais` trop fourre-tout : pas de ventilation par nature de charge
- `Caissier` comme compte peu orthodoxe (représente une personne, pas un compte)
- Aucune validation d'équilibre : une écriture déséquilibrée passe inaperçue
- Journal et comptes synchronisés manuellement (risque d'incohérence)
- Soldes à nouveau saisis manuellement chaque année
- Quelques erreurs de dates (2026 au lieu de 2025 dans certaines écritures)
- Aucune gestion des immobilisations (équipements passés directement en charges — acceptable pour cette taille)

---

## Exigences fonctionnelles

### Application principale (pour le gestionnaire développeur)
- Saisie des écritures comptables (partie double)
- Validation automatique de l'équilibre débit/crédit
- Génération automatique des comptes depuis le Journal
- Gestion multi-exercices avec report des soldes
- Vue analytique par événement (Marché, Broche, Sortie 3 jours, etc.)
- Contrôle de cohérence des dates

### Export Excel (pour les successeurs non-techniciens)
- Génération sur demande d'un classeur Excel reproduisant la structure actuelle
- Objectif : assurer la continuité si le successeur n'utilise pas l'application
- L'export n'est pas un outil de contrôle mais un filet de sécurité de transmission

---

## Comptes typiques du club (flux récurrents)

**Charges régulières :**
- Assurance RC (AXA)
- Électricité local (Romande Energie, acomptes + solde)
- Taxes compte bancaire Raiffeisen (trimestrielles)
- Taxe carte VISA annuelle
- Frais Twint (environ 1.3% des transactions)

**Produits réguliers :**
- Cotisations membres (CHF 30/an/membre)
- Vente boissons au local (mensuel)
- Location tente

**Événements annuels :**
- Assemblée Générale (mars) — vin, fromage, envoi invitations
- Sortie comité (mars/avril)
- Marché Villageois (mai/juin) — événement principal, centre de profit distinct
- Tour du lac / sorties diverses (mai-août)
- Broche (août)
- Sortie multi-jours (septembre, parfois à l'étranger en EUR)
- Souper de fin d'année (décembre)

---

## Décisions d'architecture

### Décidé

- **Framework :** Electron (desktop natif Windows)
- **Langage :** TypeScript — frontend et logique métier (process principal + renderer)
- **Base de données :** SQLite via `better-sqlite3` (synchrone, mature, fichier local unique)
- **Communication :** IPC Electron entre main process (SQLite) et renderer (UI)
- **Excel :** uniquement pour le bouclement annuel et la présentation des comptes
  - Fichier généré avec formules et mise en forme soignée
  - Sert de document de transmission aux successeurs non-techniciens
  - N'est PAS l'outil de travail quotidien — c'est un export de clôture
- **Export Excel :** bibliothèque `exceljs` (supporte styles, formules, tableaux formatés)

- **Styles React :** **CSS Modules** (`.module.css` par composant, colocalisé) — séparation code/design, accès à toutes les features CSS (`:hover`, `:disabled`, media queries, variables CSS). Vite supporte nativement, zéro configuration. Les couleurs conditionnelles (valeurs négatives) utilisent `data-negative={val < 0 || undefined}` + sélecteur CSS `[data-negative]` — zéro `style={{}}` dans les composants.

- **Système d'aide :** `HelpDrawer.tsx` contient l'aide intégrée (3 onglets : Démarrage rapide, Comptabilité, Application). **À chaque correction de bug ou ajout de fonctionnalité, vérifier si le contenu du drawer doit être mis à jour** — en particulier si des noms de boutons, pages ou raccourcis changent. `HelpContext.tsx` gère l'état ouvert/fermé (accessible via bouton `? Aide` en bas de sidebar et touche `F1`). `Tooltip.tsx` est le composant d'info-bulle réutilisable (CSS pur, `:hover`).

- **Modales :** **toujours utiliser `Modal.tsx`** (`app/src/components/Modal.tsx`) comme racine de toute nouvelle boîte de dialogue modale. Ce composant centralise l'overlay, le backdrop, le centrage, le `z-index` et la fermeture sur `Escape`. Ne jamais recréer de règle `.overlay` dans un module CSS propre à une modale. Passer la classe de contenu via la prop `className`. Voir `ConfirmDialog.tsx`, `EntryFormModal.tsx` ou `AddCardModal.tsx` comme exemples. `window.confirm` est également banni — utiliser `ConfirmDialog` à la place.

- **Framework UI :** React (renderer Electron) — premier projet React, occasion de se former
- **Plan comptable :** libre, adapté au club, plus détaillé que l'Excel actuel (voir section dédiée)
- **Devises :** CHF uniquement — paiements EUR convertis automatiquement par la banque (carte VISA), montant CHF saisi directement

- **Sauvegarde :** backup automatique à la fermeture **uniquement si des modifications ont eu lieu** (`total_changes()`) + bouton export manuel (voir section dédiée)

---

## Notes techniques

- Environnement : Windows 11, Python (venv disponible), Excel
- `openpyxl` installé dans le venv pour lire/écrire des fichiers Excel
- Dépôt git : branche `main`

### Dossiers historiques (à ignorer)

Les dossiers suivants sont des essais abandonnés d'une approche Add-in Excel (vérification de la partie double et des écritures croisées). Ils sont conservés temporairement comme historique mais seront supprimés :

- `__ComptaMotoClub/`
- `ComptaMotoClub/`
- `first-app_01-hello-world/`

**Ne pas se baser sur ces dossiers** pour comprendre l'architecture cible du projet.

---

## Plan comptable du club MCY

Plan libre, adapté à une petite association. Trois chiffres suffisent.
Tous les montants en CHF.

### Classe 1 — Actifs (comptes de bilan)

| N° | Intitulé | Nature |
|---|---|---|
| 100 | Caisse | Espèces physiques |
| 101 | Raiffeisen | Compte bancaire |
| 102 | Twint | Compte de transit (se solde après chaque décompte) |
| 103 | Avances caissier | Avances remboursables au caissier (ex-"Caissier") |

### Classe 2 — Passifs et fonds propres (comptes de bilan)

| N° | Intitulé | Nature |
|---|---|---|
| 200 | Passifs transitoires | Charges à payer sur exercice suivant |
| 290 | Capital | Fortune nette du club |

### Classe 3 — Produits (comptes de résultat)

| N° | Intitulé | Nature |
|---|---|---|
| 300 | Cotisations membres | CHF 30/an/membre |
| 310 | Vente boissons — local | Ventes mensuelles au local |
| 320 | Événement — Assemblée générale | Ventes vin et divers à l'AG |
| 330 | Événement — Marché Villageois | Recettes du marché |
| 340 | Événement — Broche | Recettes de la broche |
| 350 | Événement — Sorties | Remboursements participants, tournées |
| 360 | Événement — Souper fin d'année | Recettes du souper |
| 370 | Location matériel | Location tente et autre matériel |
| 390 | Produits divers | Crédits, remboursements assureurs, etc. |

### Classe 4 — Charges (comptes de résultat)

| N° | Intitulé | Nature |
|---|---|---|
| 400 | Assurances | RC AXA et autres |
| 401 | Frais bancaires | Taxes compte Raiffeisen, taxe VISA |
| 402 | Frais Twint | Commission ~1.3% sur transactions |
| 410 | Électricité — local | Romande Energie (acomptes + solde) |
| 411 | Achats boissons — local | Réapprovisionnement du local |
| 420 | Événement — Assemblée générale | Vin, nourriture, envois |
| 430 | Événement — Marché Villageois | Achats denrées, patente, matériel |
| 440 | Événement — Broche | Viande, boissons, divers |
| 450 | Événement — Sorties | Repas, transports, cafés |
| 460 | Événement — Souper fin d'année | Vin, nourriture, divers |
| 470 | Cadeaux et dons membres | Ex. départ d'un membre (Hôtel Cailler) |
| 480 | Achats matériel | Petit équipement (verres, plastifieuse…) |
| 490 | Charges diverses | Tout ce qui ne rentre pas ailleurs |

### Classe 9 — Clôture

| N° | Intitulé | Nature |
|---|---|---|
| 900 | Profits et Pertes | Reçoit les soldes de classe 3 et 4 en fin d'exercice |

### Principes de clôture

1. Les comptes 3xx et 4xx sont soldés vers 900 en fin d'exercice
2. Le solde de 900 (bénéfice ou perte) est transféré vers 290 (Capital)
3. Les comptes 1xx et 2xx passent à l'exercice suivant via les soldes à nouveau
4. Les comptes 102 (Twint) et 103 (Avances caissier) doivent être à zéro en fin d'exercice

---

## Schéma SQLite

### Principes

- Le plan comptable est une **donnée** stockée dans `accounts`, pas une structure du schéma
- Les montants sont stockés en **centimes (INTEGER)** pour éviter les erreurs d'arrondi flottant
  - Ex : CHF 30.45 → 3045 en base, l'application affiche "30.45"
- L'équilibre débit/crédit est validé à l'application avant insertion
- Les écritures de clôture et les soldes à nouveau sont des écritures ordinaires marquées par des flags

### Tables

```sql
-- Exercices comptables
CREATE TABLE fiscal_years (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL UNIQUE,
  start_date  TEXT    NOT NULL,  -- ISO 8601 : '2025-01-01'
  end_date    TEXT    NOT NULL,  -- ISO 8601 : '2025-12-31'
  is_closed   INTEGER NOT NULL DEFAULT 0,  -- 0=ouvert, 1=clôturé (lecture seule)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Plan comptable (données modifiables sans toucher au schéma)
CREATE TABLE accounts (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  number                  TEXT    NOT NULL UNIQUE,  -- '100', '290', '330'
  name                    TEXT    NOT NULL,
  class                   INTEGER NOT NULL,          -- 1, 2, 3, 4, 9
  type                    TEXT    NOT NULL,
    -- ACTIF         → solde à nouveau, balance normale DEBIT
    -- PASSIF        → solde à nouveau, balance normale CREDIT
    -- FONDS_PROPRES → solde à nouveau, balance normale CREDIT
    -- PRODUIT       → soldé vers 900 en clôture, balance normale CREDIT
    -- CHARGE        → soldé vers 900 en clôture, balance normale DEBIT
    -- RESULTAT      → soldé vers FONDS_PROPRES en clôture (compte 900 uniquement)
  normal_balance          TEXT    NOT NULL,          -- 'DEBIT' ou 'CREDIT'
  description             TEXT,
  account_group           TEXT,                        -- tag analytique libre (migration v2)
  must_be_zero_at_closing INTEGER NOT NULL DEFAULT 0, -- 1 pour Twint, Avances caissier
  is_closing_account      INTEGER NOT NULL DEFAULT 0, -- 1 uniquement pour compte 900
  is_active               INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (type IN ('ACTIF','PASSIF','FONDS_PROPRES','PRODUIT','CHARGE','RESULTAT')),
  CHECK (normal_balance IN ('DEBIT','CREDIT'))
);

-- En-têtes des écritures comptables
CREATE TABLE journal_entries (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id      INTEGER NOT NULL REFERENCES fiscal_years(id),
  date                TEXT    NOT NULL,  -- ISO 8601 : '2025-03-08'
  description         TEXT    NOT NULL,  -- Libellé
  piece               TEXT,              -- N° pièce justificative (optionnel)
  is_opening_balance  INTEGER NOT NULL DEFAULT 0,  -- 1 = solde à nouveau
  is_closing_entry    INTEGER NOT NULL DEFAULT 0,  -- 1 = écriture de clôture
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Lignes d'écriture — partie double
CREATE TABLE journal_entry_lines (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       INTEGER NOT NULL REFERENCES accounts(id),
  debit            INTEGER,  -- montant en centimes CHF (NULL si ligne au crédit)
  credit           INTEGER,  -- montant en centimes CHF (NULL si ligne au débit)
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK ((debit IS NOT NULL AND credit IS NULL) OR (debit IS NULL AND credit IS NOT NULL)),
  CHECK (COALESCE(debit, credit) > 0)
);

-- Index
CREATE INDEX idx_journal_entries_fiscal_year ON journal_entries(fiscal_year_id);
CREATE INDEX idx_journal_entries_date        ON journal_entries(date);
CREATE INDEX idx_journal_entry_lines_entry   ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_journal_entry_lines_account ON journal_entry_lines(account_id);
```

### Invariants garantis par l'application (pas le schéma)

- Chaque `journal_entry` doit avoir **au minimum 2 lignes**
- `SUM(debit) = SUM(credit)` pour chaque écriture avant insertion
- Aucune écriture ne peut être modifiée sur un exercice `is_closed = 1`
- Les comptes avec `must_be_zero_at_closing = 1` sont vérifiés avant clôture

### Règles de gestion du plan comptable

Le plan comptable est **global** (partagé sur tous les exercices). L'intégrité historique repose sur les écritures elles-mêmes, pas sur les noms des comptes.

| Action sur un compte | Autorisée | Condition |
|---|---|---|
| Renommer | Oui | Toujours (cosmétique) |
| Modifier la description | Oui | Toujours |
| Ajouter un nouveau compte | Oui | Toujours |
| Désactiver (`is_active = 0`) | Oui | Le compte reste visible dans l'historique |
| Changer le `type` | **Non** | Si des écritures existent sur ce compte |
| Changer le `number` | **Jamais** | C'est l'identifiant permanent |
| Supprimer | **Jamais** | Si des écritures existent sur ce compte |

**Note :** Un renommage sera répercuté sur l'affichage des années précédentes — acceptable pour ce contexte. Une table `account_history` pourrait être ajoutée ultérieurement si on veut conserver les noms historiques par exercice.

---

## Stratégie de sauvegarde

### Dossier de données — choix utilisateur

L'utilisateur choisit librement le dossier de données au premier lancement (modifiable dans les paramètres). Ce dossier contient :

```
[dossier choisi par l'utilisateur]/   ← ex: OneDrive\MCYCompta\
├── mcy-compta.db                      ← base de données active
└── backups/
    ├── mcy-compta-2025-03-08_14-30.db
    ├── mcy-compta-2025-03-09_09-15.db
    └── ...
```

Placer ce dossier dans OneDrive (ou tout autre dossier synchronisé) suffit à obtenir une protection cloud sans aucune intégration supplémentaire dans l'app.

La configuration du chemin est stockée séparément dans `%APPDATA%\MCY Compta\settings.json` (= `app.getPath('userData')`, géré par Electron, indépendant des données).

### Backup automatique

- Déclenché à la fermeture **uniquement si la session a modifié la DB**
- Détection via `total_changes()` (SQLite) : valeur capturée après `openDatabase()` (post-seed/migrations), comparée au moment du `before-quit` — si égale, aucun backup créé
- Utilise l'API `backup()` de `better-sqlite3` (cohérent même base ouverte)
- Fichiers nommés `mcy-compta-YYYY-MM-DD_HH-mm.db`
- **30 dernières sauvegardes** conservées, les plus anciennes supprimées automatiquement

### Backup manuel

- Bouton "Exporter une sauvegarde" dans les paramètres
- L'utilisateur choisit l'emplacement (USB, partage réseau, email, etc.)
- Utile pour la transmission à un successeur ou avant une clôture annuelle

### Restauration

- Bouton "Restaurer depuis une sauvegarde…" dans les paramètres (dialog libre — tout fichier `.db`)
- Bouton "Restaurer" par ligne dans le tableau des sauvegardes automatiques (passe le `filename` directement, saute le dialog de sélection)
- Backup de sécurité créé avant remplacement
- Après `copyFileSync` : `getDb().close()` → copie → `openDatabase(getDbDir())` → `BrowserWindow.getAllWindows()[0].webContents.reload()`
- Pas de redémarrage du process (évite le problème Vite dev server / electron-forge)

### Vue utile — solde d'un compte sur un exercice

```sql
SELECT
  a.number,
  a.name,
  SUM(COALESCE(l.debit, 0))  AS total_debit,
  SUM(COALESCE(l.credit, 0)) AS total_credit,
  CASE a.normal_balance
    WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit,0)) - SUM(COALESCE(l.credit,0))
    WHEN 'CREDIT' THEN SUM(COALESCE(l.credit,0)) - SUM(COALESCE(l.debit,0))
  END AS solde
FROM accounts a
JOIN journal_entry_lines l ON l.account_id = a.id
JOIN journal_entries e     ON e.id = l.journal_entry_id
WHERE e.fiscal_year_id = ?
GROUP BY a.id;
```

---

## Stratégie de tests

### Objectif double

1. **Fiabilité** — garantir les invariants comptables (équilibre D/C, soldes, clôture)
2. **Apprentissage** — couvrir tous les niveaux de test pour se former aux frameworks de test de l'écosystème Electron/React/TypeScript

### Outils retenus

| Niveau | Outil | Rôle |
|---|---|---|
| Unitaire & intégration | **Vitest** | Naturel avec Vite, très rapide, compatible TypeScript |
| Composants React | **React Testing Library** + `@testing-library/user-event` | Tester le comportement utilisateur, pas l'implémentation |
| IPC Electron | **Vitest** + mocks manuels du `contextBridge` | Tester les contrats main ↔ renderer sans lancer Electron |
| E2E (flux complets) | **Playwright** avec support Electron (`@playwright/test`) | Lancer l'app réelle et simuler des scénarios complets |

### Structure des tests

```
app/
├── src/
│   ├── main/
│   │   └── __tests__/
│   │       ├── db.test.ts           ← SQLite en mémoire, CRUD, contraintes
│   │       ├── ipc-handlers.test.ts ← handlers IPC (validation, réponses)
│   │       └── accounting.test.ts   ← logique métier pure (soldes, clôture)
│   └── renderer/
│       └── __tests__/
│           ├── AccountList.test.tsx ← rendu composant plan comptable
│           ├── EntryForm.test.tsx   ← formulaire saisie, validation D/C live
│           └── LedgerView.test.tsx  ← vue journal et soldes
└── e2e/
    ├── fiscal-year.spec.ts          ← créer un exercice, le clôturer
    ├── journal-entry.spec.ts        ← saisir une écriture complète
    └── balance.spec.ts              ← vérifier les soldes après écritures
```

### Conventions

- Base de données de test : SQLite **en mémoire** (`:memory:`) — isolation totale, pas de fichier résiduel
- Les mocks IPC simulent `window.api` via `vi.mock()` dans les tests renderer
- Tests unitaires : **sans side-effects** (pas de DB, pas d'Electron)
- Tests E2E : lancent l'application réelle avec une DB temporaire dans `%TEMP%`
- Seuil de couverture visé : **80%** sur la logique métier (main/accounting), pas de seuil imposé sur le renderer

### Ordre d'implémentation recommandé

1. Setup Vitest (`vitest.config.ts` partagé main + renderer)
2. Tests unitaires de la logique comptable (`accounting.test.ts`)
3. Tests d'intégration SQLite (`db.test.ts`)
4. Tests IPC handlers (`ipc-handlers.test.ts`)
5. Tests composants React (`*.test.tsx` avec React Testing Library)
6. Setup Playwright + tests E2E (`e2e/`)

---

## État d'avancement

> Mis à jour au fil des sessions. Toujours refléter la réalité du code committé.

### Fait

- [x] Analyse de la comptabilité de référence (`MCY comptes 25.xlsx`)
- [x] Définition du plan comptable MCY (29 comptes, classes 1/2/3/4/9)
- [x] Choix et documentation de l'architecture (CLAUDE.md complet)
- [x] Bootstrap Electron Forge + React + TypeScript + Vite (`app/`) — commit `52cbf4a`
- [x] Schéma SQLite complet (`fiscal_years`, `accounts`, `journal_entries`, `journal_entry_lines`)
- [x] Seed automatique du plan comptable au premier lancement
- [x] Pont IPC sécurisé (`contextBridge` → `window.api`) pour toutes les opérations DB
- [x] Validation débit/crédit et contrôle exercice ouvert côté main process
- [x] Affichage du plan comptable dans le renderer (React)

### À faire — prochaines étapes

#### Infrastructure de tests
- [x] Setup Vitest (config main + renderer, jsdom pour le renderer)
- [x] Tests unitaires logique comptable (`accounting.test.ts`) — 16 tests
- [x] Tests d'intégration SQLite en mémoire (`db.test.ts`) — 19 tests
- [x] Tests composants React (`renderer/App.test.tsx`) — 10 tests
- [x] Setup Playwright E2E pour Electron (`e2e/electron-fixture.ts` + `app.spec.ts`)
- [x] Tests handlers IPC (`ipc-handlers.test.ts` + `ipc-backup-handlers.test.ts`) — 26 tests

#### Fonctionnalités
- [x] Layout principal avec navigation sidebar : Plan comptable / Journal / Exercices / Soldes — 60 tests passent
- [x] Gestion des exercices : créer l'exercice 2025 via l'UI (FiscalYearsPage)
- [x] Formulaire de saisie d'écritures (EntryForm : ≥ 2 lignes, validation D/C en temps réel, noValidate)
- [x] Tests composants React (FiscalYearsPage 11 tests, EntryForm 20 tests) — 94 tests au total
- [x] Vue des soldes par compte sur un exercice donné (BalancesPage, groupés par classe)
- [x] Vue journal avec filtres (libellé, compte/grand-livre, plage de dates) + modification et suppression d'écritures via modale — 143 tests au total
- [x] Sauvegarde automatique à la fermeture (`backup()` de better-sqlite3) + bouton export manuel + page Paramètres — 190 tests au total
- [x] Sélecteur du dossier de données au premier lancement (`%APPDATA%\MCY Compta\settings.json` via `app.getPath('userData')`) + migration + WelcomePage — 219 tests au total
- [x] Saisie des soldes à nouveau (report d'exercice) — 249 tests au total
- [x] Écritures de clôture automatiques (soldage 3xx/4xx → 900 → 290) — 283 tests unitaires
- [x] Tests E2E Playwright — 12 tests (app, fiscal-year, journal-entry, balance)
- [x] Export Excel de clôture (`exceljs`) — Journal, Bilan & Résultat, une feuille par compte (SUBTOTAL, Courant), déclencheurs FiscalYearsPage + SettingsPage — 318 tests au total
- [x] Refactoring settings : `app.getPath('userData')` à la place du chemin `APPDATA` manuel ; `app.setPath('userData')` dans `main.ts` pour l'isolation E2E — 318 tests

- [x] Migration styles inline → CSS Modules — 14 composants/pages migrés, 318 tests — plan : `docs/superpowers/plans/2026-06-23-css-modules-migration.md`

- [x] Système d'aide : Tooltip dynamique par ligne (EntryForm) + drawer latéral global (F1 / bouton sidebar) — 334 tests — spec : `docs/superpowers/specs/2026-06-24-help-system-design.md`
- [x] Flèches ▲▼ colorées sur les inputs débit/crédit de l'EntryForm selon le type de compte — wrapper `.amountWrapper` avec `data-effect="increase|decrease"` + CSS `::after` (▲ vert / ▼ rouge) — 362 tests

- [x] Migrations de schéma SQLite : `db/schema-migrations.ts` — `PRAGMA user_version` + tableau `MIGRATIONS[]`, appelé dans `openDatabase()` après `initSchema()`. Version actuelle : 2 (v1 schéma initial, v2 account_group). Pour ajouter une migration : ajouter `{ version: N, description: '...', sql: '...' }` au tableau — 339 tests
- [x] Restauration depuis une sauvegarde — bouton dialog libre + bouton par ligne de sauvegarde automatique dans SettingsPage ; handler `backup:restore(filename?)` (backup de sécurité, `close()` + `copyFileSync` + `openDatabase()` + `webContents.reload()`) — 360 tests
- [x] Version du schéma SQLite — `schemaVersion` dans `BackupInfo` (lecture header SQLite offset 60, sans connexion DB), handler `db:getSchemaVersion`, colonne "Ver." dans la liste des sauvegardes, version DB courante dans la section Base de données — 360 tests
- [x] Backup automatique conditionnel — `hasDbChanges()` via `total_changes()` SQLite (snapshot post-`openDatabase()`, comparé dans `before-quit`) ; aucun backup si session en lecture seule — 362 tests

- [x] Vue analytique par groupe + gestion du plan comptable — migration schéma v2 (`account_group TEXT` sur `accounts`), `updateAccount` / `createAccount` / `getAnalyticsData`, page **Plan comptable** éditable (modale create/edit, groupe analytique avec autocomplétion), page **Analytique** (P&L par groupe + section Non groupés), navigation sidebar — 409 tests — plan : `docs/superpowers/plans/2026-06-24-analytics-accounts.md`

- [x] Suppression et édition structurelle d'un compte (numéro/type) sans écritures — `deleteAccount`, `has_entries` via subquery EXISTS, garde côté DB + IPC ; `ConfirmDialog` obligatoire (jamais `window.confirm`)
- [x] UX AccountsPage : hover sur lignes + séparateurs de classe (Classe 1 — Actifs, etc.)
- [x] Tableau de bord (`DashboardPage`) — 4 cartes soldes 100/101/102 + résultat P&L hors clôture, sélecteur exercice, page d'accueil par défaut — 450 tests

- [x] Mise à jour dépendances : TypeScript 4 → 6, ESLint 8 → 9 (flat config `eslint.config.mjs`), `typescript-eslint` v8, `@electron/fuses` v1 → v2, electron 42.4 → 42.5, Playwright 1.61.0 → 1.61.1 — 477 tests
- [x] Navigation clavier EntryForm — `Enter` sur le dernier champ montant ajoute une ligne et y place le focus (`useRef` + `useEffect`) — 477 tests
- [x] Validation inline date hors exercice — message rouge sous le champ Date si date < `start_date` ou > `end_date` de l'exercice ; bouton Enregistrer désactivé — 477 tests
- [x] HelpDrawer mis à jour — Tableau de bord, Analytique, Plan comptable éditable, groupes analytiques, raccourci `Entrée`, avertissement date — 477 tests
- [x] Toast de confirmation (`Toast.tsx`) — "Écriture enregistrée" après création / "Écriture modifiée" après édition ; auto-dismiss 2,5 s — 482 tests
- [x] Icônes Lucide React (`lucide-react`) — tous les boutons d'action (créer, modifier, supprimer, exporter, restaurer…) : icône + texte via `display: inline-flex; align-items: center; gap` sur chaque classe bouton CSS — pages : JournalPage, AccountsPage, AccountFormModal, FiscalYearsPage, DashboardPage, SettingsPage — 482 tests
- [x] Corrections qualité tests — React key warning (AccountsPage : `<>` → `<React.Fragment key={cls}>`) ; 4 warnings `act(...)` éliminés (SettingsPage, FiscalYearsPage ×2, BalancesPage : `getBy*` → `await findBy*`) — 482 tests

#### Idées futures (non planifiées)

- [ ] **Vite 5→8 + `@vitejs/plugin-react` 5→6** — bloqué : `@electron-forge/plugin-vite` v8 encore en alpha. À revisiter quand une version stable est publiée.
- [ ] Filtres / recherche sur la page Soldes (par classe, par compte)
- [ ] Page **Bilan complet** — vue instantanée de l'état des comptes à tout moment de l'exercice : soldes réels des comptes de bilan (1xx, 2xx) + résultat P&L simulé (3xx − 4xx agrégé) sans persister d'écritures de clôture ; utile pour communiquer l'état des finances au comité en cours d'année. Génération des écritures de clôture fictives en mémoire uniquement (côté main process, pas d'INSERT).
- [ ] Tests E2E supplémentaires — clôture complète, analytics
- [ ] Page **Compte** (grand-livre par compte) — détail de toutes les écritures d'un compte pour un exercice donné, colonnes Débit / Crédit / Solde courant (total running), total en pied de page ; total courant pertinent uniquement pour les comptes de bilan (1xx, 2xx)

### Notes techniques actives

- `@vitejs/plugin-react` est en **v5.x** — ESM-only, compatible grâce au renommage de `vite.renderer.config.ts` → **`vite.renderer.config.mts`** (force le mode ESM dans esbuild). Sans le `.mts`, Vite 5 échoue avec `"ESM file cannot be loaded by require"`. Le `vitest.config.ts` n'est pas affecté car Vitest 4.x utilise son propre Vite 8.x en interne.
- `better-sqlite3` est externalisé du bundle Vite (main) et reconstruit via `rebuildConfig` dans `forge.config.ts`
- Les montants sont stockés en **centimes** (INTEGER) — jamais de float pour les montants CHF
- `better-sqlite3` compilé pour Electron (NODE_MODULE_VERSION 146) ne tourne pas dans le Node système. Le script `pretest` exécute `npm rebuild better-sqlite3` pour le recompiler pour Node avant les tests. Le script `prestart` exécute `npm run rebuild` (= `electron-rebuild -f -w better-sqlite3`) pour le recompiler pour Electron avant `npm start` — nécessaire car `electron-forge start` ne déclenche pas le `rebuildConfig` de manière fiable.
- Les tests Vitest n'incluent que `src/**` (`include: ['src/**/*.{test,spec}.{ts,tsx}']`) pour éviter de ramasser les specs Playwright du dossier `e2e/`.
- **Tests E2E** : `npm run test:e2e` → `pretest:e2e` rebuild better-sqlite3 pour Electron → `build:e2e` via `scripts/build-for-e2e.mjs` (produit `.vite/build/main.js` + `.vite/renderer/main_window/` avec `base: './'` pour les chemins relatifs en `file://`) → Playwright lance l'app avec un APPDATA temporaire isolé. `main.ts` appelle `app.setPath('userData', path.join(APPDATA, app.getName()))` avant `app.ready` quand `NODE_ENV=test` — ce qui redirige `app.getPath('userData')` vers le répertoire temporaire. `electron-fixture.ts` place `settings.json` dans `MCY Compta/` (= `app.getName()`). Playwright workers = 1 (séquentiel, les instances Electron concurrentes interfèrent). Après `test:e2e`, relancer `npm test` recompile automatiquement pour Node via `pretest`.
