# Gestion des membres et cotisations — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter une page "Membres" permettant de gérer le référentiel des membres du MCY et de suivre le paiement de leurs cotisations annuelles (CHF 30/an), avec génération automatique des écritures comptables pour les exercices présents en DB.

**Architecture:** Nouvelle page `MembresPage` dans le renderer React, deux nouvelles tables SQLite (`members`, `member_dues`), 7 handlers IPC dans le main process. La logique de paiement vit côté main (création atomique de l'écriture + des lignes dues). Le suivi historique (années sans exercice en DB) est indépendant de la comptabilité.

**Tech Stack:** Electron + React + TypeScript + SQLite (`better-sqlite3`) + CSS Modules + Lucide React — même stack que le reste de l'application.

---

## Global Constraints

- Montants toujours en **centimes** (INTEGER) — cotisation = 3000, surplus → 391 Dons
- CSS Modules uniquement — zéro `style={{}}` inline dans les composants
- Modales : toujours via `Modal.tsx` — jamais recréer un `.overlay` dans un CSS propre
- Confirmations destructives : `ConfirmDialog` — jamais `window.confirm`
- Compte de cotisation : **300** (PRODUIT, CREDIT normal)
- Compte de dons : **391** (`name='Dons'`, `description='Dons divers'`, PRODUIT, CREDIT normal, `account_group=NULL`)
- Comptes de débit acceptés pour un paiement : **100** Caisse, **101** Raiffeisen, **102** Twint, **103** Avances caissier
- Écriture toujours imputée à l'exercice dont l'année correspond à la **date de paiement**
- Libellé auto de l'écriture : `Cotisation {Prénom} {Nom} — {années}` (ex. `Cotisation Thomas Merli — 2024+2025`)
- Schéma SQLite : migration **v4** (après v3 cash)
- Compte 391 ajouté au seed s'il n'existe pas déjà
- Import Excel : `Documents/Cotisations - 2020-2026.xlsx`, noms uniquement, dédup silencieux
- Tests Vitest uniquement (pas de nouveaux tests E2E pour cette feature)
- Nouvelle entrée sidebar : `Users` icon, label "Membres", entre "Caisse" et "Exercices"

---

## Schéma SQLite — migration v4

```sql
CREATE TABLE members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name     TEXT    NOT NULL,
  first_name    TEXT    NOT NULL,
  entry_date    TEXT,                              -- ISO 8601, nullable
  is_active     INTEGER NOT NULL DEFAULT 1,        -- 0 = inactif
  inactive_note TEXT,                              -- ex. "Démission 2026", nullable
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE member_dues (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id        INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,               -- ex. 2025
  paid             INTEGER NOT NULL DEFAULT 0,     -- 0 ou 1
  payment_note     TEXT,   -- années historiques : "Raiff", "Caisse", "Twint Thomas"…
  payment_date     TEXT,   -- années en DB : date du paiement (ISO 8601)
  amount_cents     INTEGER,                        -- montant alloué à cette année (normalement 3000)
  journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, year)
);

CREATE INDEX idx_member_dues_member ON member_dues(member_id);
CREATE INDEX idx_member_dues_year   ON member_dues(year);
```

### Règles de gestion

- `UNIQUE (member_id, year)` : une seule ligne par membre par année
- Suppression membre : uniquement si aucune ligne dans `member_dues` (garde côté application)
- `ON DELETE CASCADE` sur `member_dues` si le membre est supprimé (malgré la garde ci-dessus — sécurité)
- `ON DELETE SET NULL` sur `journal_entry_id` si l'écriture comptable est supprimée
- Années **historiques** (pas d'exercice en DB) : `journal_entry_id = NULL`, `payment_date = NULL`, `payment_note` = texte libre
- Années **en DB ou futures** lors d'un paiement : `journal_entry_id` pointe vers l'écriture créée par ce paiement ; plusieurs lignes `member_dues` peuvent partager le même `journal_entry_id` (paiement multi-années)

---

## Seed — compte 391

À ajouter dans `app/src/db/seed.ts` **après** les comptes existants, uniquement si absent :

```typescript
{
  number: '391', name: 'Dons', class: 3, type: 'PRODUIT',
  normal_balance: 'CREDIT', description: 'Dons divers',
  must_be_zero_at_closing: 0, is_closing_account: 0, account_group: null,
}
```

---

## IPC Handlers

Tous définis dans un nouveau fichier `app/src/main/ipc-members-handlers.ts`, enregistrés dans `app/src/main/index.ts`.

| Handler | Payload | Retour | Description |
|---|---|---|---|
| `members:getAll` | — | `MemberWithDues[]` | Tous les membres + statut payé par exercice fiscal présent en DB |
| `members:create` | `MemberPayload` | `Member` | Créer un membre |
| `members:update` | `{ id, payload: MemberPayload }` | `Member` | Modifier un membre |
| `members:delete` | `id: number` | `void` | Supprimer si aucune dues (sinon erreur) |
| `members:setHistoricalDues` | `{ memberId, year, paid, note }` | `MemberDues` | Cocher/décocher + note pour une année historique (upsert) |
| `members:recordPayment` | `MemberPaymentPayload` | `{ dues: MemberDues[], journalEntryId: number }` | Créer écriture comptable + lignes dues (transaction atomique) |
| `members:importFromExcel` | — | `{ imported: number, skipped: number }` | Import noms depuis l'Excel, dédup silencieux |

### Types TypeScript

```typescript
interface Member {
  id: number;
  last_name: string;
  first_name: string;
  entry_date: string | null;
  is_active: number;         // 0 ou 1
  inactive_note: string | null;
  created_at: string;
}

interface MemberDues {
  id: number;
  member_id: number;
  year: number;
  paid: number;              // 0 ou 1
  payment_note: string | null;
  payment_date: string | null;
  amount_cents: number | null;
  journal_entry_id: number | null;
  created_at: string;
}

interface MemberWithDues extends Member {
  dues: MemberDues[];        // toutes les lignes member_dues de ce membre
}

interface MemberPayload {
  last_name: string;
  first_name: string;
  entry_date?: string | null;
  is_active: number;
  inactive_note?: string | null;
}

interface MemberPaymentPayload {
  member_id: number;
  payment_date: string;           // ISO 8601 — détermine l'exercice comptable
  total_amount_cents: number;     // montant total versé
  debit_account_id: number;       // 100 / 101 / 102 / 103
  years: number[];                // années à couvrir (ex. [2025, 2026])
}
```

### Logique de `members:recordPayment`

```
1. Résoudre l'exercice comptable depuis payment_date (fiscal_year WHERE year = YEAR(payment_date))
   → erreur si l'exercice n'existe pas en DB
2. Résoudre les comptes 300 et 391 par leur numéro
3. Calculer :
   - cotisations_cents = years.length × 3000
   - surplus_cents = total_amount_cents - cotisations_cents
   → erreur si surplus < 0 (montant insuffisant pour couvrir les années sélectionnées)
4. Construire l'écriture :
   - Débit  debit_account_id : total_amount_cents
   - Crédit 300             : cotisations_cents
   - Crédit 391             : surplus_cents   (uniquement si surplus > 0)
   - Libellé : "Cotisation {first_name} {last_name} — {years.join('+')}"
5. Créer l'écriture via createJournalEntry() (transaction interne)
6. Upsert member_dues pour chaque année :
   { member_id, year, paid: 1, payment_date, amount_cents: 3000, journal_entry_id }
   → erreur si une année est déjà marquée paid=1 (guard)
Toute l'opération est dans une transaction SQLite.
```

---

## Composants et pages

### `MembresPage.tsx` + `MembresPage.module.css`

Page principale. Montée dans `App.tsx` sur la route `membres`.

**État :**
- `members: MemberWithDues[]`
- `showInactive: boolean` (toggle actifs/inactifs, défaut : actifs seulement)
- `selectedMember: MemberWithDues | null` → ouvre `MembreDetailModal`
- `showCreateModal: boolean` → ouvre `MembreFormModal` en mode création
- `deleteId: number | null` → ouvre `ConfirmDialog`
- `toast: { message, variant } | null`
- `importing: boolean`

**Layout :**
- En-tête : "Membres" + toggle "Afficher les inactifs" + bouton "Nouveau membre" + bouton "Importer depuis Excel"
- Tableau : Nom | Prénom | Entrée | Statut | [3 derniers exercices fiscaux connus] | Actions
  - Indicateur par exercice : badge vert "✓ YYYY" si payé, tiret gris si impayé
  - Membres inactifs : ligne grisée avec badge "Inactif"
  - Boutons par ligne : `Pencil` (Modifier) · `UserX`/`UserCheck` (Désactiver/Réactiver)
  - Click sur la ligne → `selectedMember` → ouvre `MembreDetailModal`
- Message si liste vide

### `MembreFormModal.tsx` + `MembreFormModal.module.css`

Modal de création / modification d'un membre. Racine : `Modal.tsx`.

**Props :** `member?: MemberWithDues` (absent = création), `onClose`, `onSaved`

**Champs :**
- Nom (requis, autoFocus en création)
- Prénom (requis)
- Date d'entrée (input type date, optionnel)
- Statut : radio Actif / Inactif
- Note (textarea, visible uniquement si Inactif sélectionné)

**Actions :** `members:create` ou `members:update` selon le mode → `onSaved()`.

### `MembreDetailModal.tsx` + `MembreDetailModal.module.css`

Modal de consultation de l'historique d'un membre. Racine : `Modal.tsx`.

**Props :** `member: MemberWithDues`, `fiscalYears: FiscalYear[]`, `onClose`, `onUpdated`

**Layout :**
- Info membre : nom complet, date d'entrée, statut (badge)
- Tableau historique : une ligne par année couverte
  - Années déduites : union de toutes les `member_dues.year` + toutes les années des `fiscalYears`
  - Tri : décroissant
  - **Année historique** (pas dans `fiscalYears`) :
    - Checkbox Payé (appelle `members:setHistoricalDues`)
    - Champ texte note (ex. "Raiff") — éditable, blur → sauvegarde
  - **Année en DB** :
    - Badge statut "✓ Payé" (vert) ou "✗ Non payé" (gris)
    - Si payé : date + mode de paiement déduit (via `journal_entry_id` → non résolu ici, affiché via `payment_note` si rempli, sinon "—")
    - Montant si disponible
- Bouton "Enregistrer un paiement" en bas (désactivé si aucun exercice ouvert)
  → ouvre `MembrePaiementModal`

### `MembrePaiementModal.tsx` + `MembrePaiementModal.module.css`

Modal de saisie d'un paiement. Racine : `Modal.tsx`.

**Props :** `member: MemberWithDues`, `fiscalYears: FiscalYear[]`, `accounts: Account[]`, `onClose`, `onSaved`

**Champs :**
- Membre : affiché en lecture (`{first_name} {last_name}`)
- Date de paiement (input date, défaut : aujourd'hui)
- Montant CHF (input numérique, défaut : 30.00, converti en centimes)
- Mode de paiement : select parmi les comptes 100/101/102/103 (filtrés depuis `accounts`)
- Années à couvrir : cases à cocher
  - Nombre de cases affichées = `floor(montant / 30)` — recalculé à chaque changement de montant
  - Seules les années **non encore payées** pour ce membre sont proposées
  - Années proposées par défaut : années courante + passées non payées en premier, puis futures
  - L'utilisateur peut cocher/décocher librement dans la limite du quota calculé
- Surplus : si `montant % 30 > 0`, afficher `"{surplus} CHF → Dons (391)"`
- Aperçu écriture (lecture seule) :
  ```
  Débit  [compte débit]     xx.xx
  Crédit 300 Cotisations    xx.xx
  Crédit 391 Dons           xx.xx  ← seulement si surplus > 0
  ```
- Bouton [Enregistrer] : désactivé si `years.length !== floor(montant/30)` ou si montant = 0
- Appelle `members:recordPayment` → `onSaved()` + toast "Paiement enregistré"

---

## Workflow d'import Excel

Handler `members:importFromExcel` (main process) :

1. Construire le chemin absolu vers `Documents/Cotisations - 2020-2026.xlsx` (relatif à `app.getAppPath()` ou chemin absolu découvert au runtime via `__dirname`)
2. Lire le fichier via `openpyxl` — **non** : utiliser une lib Node.js. Utiliser `exceljs` (déjà installé) pour lire le fichier
3. Lire la première feuille, colonnes A (Nom) + B (Prénom), à partir de la ligne 2 (ligne 1 = en-têtes)
4. Pour chaque ligne avec Nom + Prénom non vides :
   - Vérifier si un membre avec ce (last_name, first_name) existe déjà (insensible à la casse)
   - Si oui : skip (compté dans `skipped`)
   - Si non : créer avec `is_active=1`, sans date d'entrée
5. Retourner `{ imported, skipped }`

Le chemin vers l'Excel est fixe : `C:/GIT/MotoClubComptaAddIn/Documents/Cotisations - 2020-2026.xlsx`.

---

## Navigation — sidebar

Dans `Sidebar.tsx` / `App.tsx` : ajouter l'entrée "Membres" (icône `Users` de lucide-react) entre "Caisse" et "Exercices".

---

## Exemples d'écritures générées

**Cas 1 — Normal : CHF 30 via Raiffeisen pour 2025**
```
Libellé : Cotisation Thomas Merli — 2025
Débit  101 Raiffeisen    30.00
Crédit 300 Cotisations   30.00
```
member_dues : year=2025, paid=1, amount_cents=3000

**Cas 2 — Multi-années : CHF 60 via Caisse pour 2024+2025**
```
Libellé : Cotisation Thomas Merli — 2024+2025
Débit  100 Caisse        60.00
Crédit 300 Cotisations   60.00
```
member_dues : year=2024 paid=1 + year=2025 paid=1 (même journal_entry_id)

**Cas 3 — Surplus : CHF 40 via Twint pour 2025**
```
Libellé : Cotisation Thomas Merli — 2025
Débit  102 Twint         40.00
Crédit 300 Cotisations   30.00
Crédit 391 Dons          10.00
```
member_dues : year=2025, paid=1, amount_cents=3000

**Cas 4 — Avance : CHF 60 via Raiffeisen pour 2025+2026 (paiement en mars 2025)**
```
Libellé : Cotisation Thomas Merli — 2025+2026
Débit  101 Raiffeisen    60.00    → exercice 2025
Crédit 300 Cotisations   60.00
```
member_dues : year=2025 paid=1 + year=2026 paid=1 (même journal_entry_id)

---

## Tests

### `app/src/main/__tests__/members.test.ts`

Tests d'intégration SQLite en mémoire :
- Migration v4 crée les tables `members` et `member_dues`
- `createMember` / `updateMember` / `getMember`
- `deleteMember` échoue si member_dues présentes
- `setHistoricalDues` : upsert, toggle paid, update note
- `recordPayment` cas normal (30 CHF)
- `recordPayment` multi-années (60 CHF → 2 lignes member_dues, même journal_entry_id)
- `recordPayment` surplus (40 CHF → écriture avec ligne 391)
- `recordPayment` avance (60 CHF pour année future)
- `recordPayment` échoue si année déjà payée
- `recordPayment` échoue si exercice absent de la DB pour la date de paiement
- `recordPayment` échoue si montant insuffisant pour les années sélectionnées
- `importFromExcel` : importe les membres, dédup

### `app/src/main/__tests__/ipc-members-handlers.test.ts`

Mocks des fonctions DB, vérifie la délégation de chaque handler IPC.

### `app/src/__tests__/renderer/MembresPage.test.tsx`

- Affiche la liste des membres
- Filtre actifs/inactifs
- Bouton "Nouveau membre" ouvre `MembreFormModal`
- Click sur ligne ouvre `MembreDetailModal`
- Toast après import

### `app/src/__tests__/renderer/MembreFormModal.test.tsx`

- Affiche les champs en mode création
- Prérempli en mode modification
- Note masquée si actif, visible si inactif
- Validation : Nom et Prénom requis
- Appelle `members:create` / `members:update`

### `app/src/__tests__/renderer/MembreDetailModal.test.tsx`

- Affiche l'historique par année
- Checkbox historique appelle `setHistoricalDues`
- Bouton "Enregistrer un paiement" ouvre `MembrePaiementModal`

### `app/src/__tests__/renderer/MembrePaiementModal.test.tsx`

- Affiche les champs avec valeurs par défaut
- Nombre de cases à cocher = `floor(montant / 30)`
- Surplus affiché si `montant % 30 > 0`
- Aperçu écriture mis à jour dynamiquement
- Bouton désactivé si cases insuffisantes cochées
- Appelle `members:recordPayment` avec le bon payload

---

## Ce qui n'est PAS dans ce scope

- Lien depuis le journal vers un membre (navigation inverse)
- Export de la liste des membres en Excel/PDF
- Envoi d'e-mail de rappel aux membres non payés
- Numéro de membre automatique
- Photo de profil ou informations de contact
