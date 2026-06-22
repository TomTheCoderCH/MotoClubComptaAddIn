# Saisie des soldes à nouveau — Design

**Date :** 2026-06-22  
**Contexte :** MotoClubComptaAddIn — Electron + React + TypeScript + SQLite

---

## Objectif

Permettre la saisie des soldes d'ouverture d'un nouvel exercice comptable (report des comptes de bilan de l'exercice précédent). Une écriture marquée `is_opening_balance = 1` est insérée dans le journal. Le compte Capital (290) est calculé automatiquement comme différence Actifs − Passifs.

---

## Déclenchement

| Situation | Comportement |
|---|---|
| Création d'exercice N quand N-1 **existe** | Modal s'ouvre automatiquement après création, pré-rempli depuis les soldes de N-1 |
| Création d'exercice N quand N-1 **n'existe pas** | Pas de modal auto ; bouton "Saisir les soldes à nouveau" sur la carte de l'exercice |
| Exercice ouvert sans `hasOpeningBalance` | Bouton "Saisir les soldes à nouveau" visible sur la carte |
| Exercice avec `hasOpeningBalance = true` | Bouton absent ; modification via journal directement |

---

## Fichiers

| Action | Fichier | Responsabilité |
|---|---|---|
| Modifié | `app/src/types/index.ts` | Ajouter `hasOpeningBalance` à `FiscalYear` ; nouveaux types `OpeningBalanceSuggestion`, `OpeningBalanceLine` |
| Modifié | `app/src/db/index.ts` | Modifier `getAllFiscalYears()` ; ajouter `getOpeningBalanceSuggestions()`, `createOpeningBalanceEntry()` |
| Modifié | `app/src/ipc-handlers.ts` | Enregistrer `openingBalance:getSuggested`, `openingBalance:create` |
| Modifié | `app/src/preload.ts` | Exposer `getOpeningBalanceSuggestions`, `createOpeningBalance` |
| Modifié | `app/src/window.d.ts` | Types `window.api` pour les 2 nouvelles méthodes |
| Nouveau | `app/src/components/OpeningBalanceModal.tsx` | Modal de saisie des soldes à nouveau |
| Modifié | `app/src/pages/FiscalYearsPage.tsx` | Déclencheur auto + bouton par carte + intégration modal |
| Nouveau | `app/src/__tests__/ipc-opening-balance-handlers.test.ts` | Tests handlers IPC |
| Nouveau | `app/src/__tests__/renderer/OpeningBalanceModal.test.tsx` | Tests composant modal |
| Modifié | `app/src/__tests__/renderer/FiscalYearsPage.test.tsx` | Tests bouton + déclencheur auto |

---

## Types

```ts
// Ajout à FiscalYear
hasOpeningBalance: boolean   // 0/1 depuis SQLite, utilisé en condition JS

// Nouveaux types
export interface OpeningBalanceSuggestion {
  accountId: number;
  accountNumber: string;
  accountName: string;
  type: AccountType;            // 'ACTIF' | 'PASSIF' | 'FONDS_PROPRES'
  normalBalance: NormalBalance; // 'DEBIT' | 'CREDIT'
  suggestedAmountCents: number; // 0 si premier exercice
}

export interface OpeningBalanceLine {
  accountId: number;
  amountCents: number;
}
```

---

## Couche données (`db/index.ts`)

### `getAllFiscalYears()` — modification

Ajoute un champ calculé `hasOpeningBalance` par LEFT JOIN :

```sql
SELECT
  fy.*,
  CASE WHEN COUNT(je.id) > 0 THEN 1 ELSE 0 END AS hasOpeningBalance
FROM fiscal_years fy
LEFT JOIN journal_entries je
  ON je.fiscal_year_id = fy.id
  AND je.is_opening_balance = 1
GROUP BY fy.id
ORDER BY fy.year DESC
```

### `getOpeningBalanceSuggestions(fiscalYearId: number): OpeningBalanceSuggestion[]`

1. Récupère `year` de l'exercice courant
2. Cherche l'exercice `year - 1` (peut être absent)
3. Retourne tous les comptes de bilan actifs (class IN (1, 2)) avec le solde de l'exercice précédent

```sql
SELECT
  a.id            AS accountId,
  a.number        AS accountNumber,
  a.name          AS accountName,
  a.type,
  a.normal_balance AS normalBalance,
  COALESCE(
    CASE a.normal_balance
      WHEN 'DEBIT'  THEN SUM(COALESCE(l.debit, 0))  - SUM(COALESCE(l.credit, 0))
      WHEN 'CREDIT' THEN SUM(COALESCE(l.credit, 0)) - SUM(COALESCE(l.debit, 0))
    END,
    0
  ) AS suggestedAmountCents
FROM accounts a
LEFT JOIN journal_entry_lines l ON l.account_id = a.id
LEFT JOIN journal_entries e
  ON e.id = l.journal_entry_id
  AND e.fiscal_year_id = @prevFyId
WHERE a.class IN (1, 2) AND a.is_active = 1
GROUP BY a.id
ORDER BY a.number
```

Si `prevFyId` est `null` (premier exercice) : le LEFT JOIN ne matche jamais → tous les montants valent 0.  
Les montants négatifs sont ramenés à 0 avec `Math.max(0, suggestedAmountCents)`.

### `createOpeningBalanceEntry(fiscalYearId: number, lines: OpeningBalanceLine[]): void`

1. Vérifie que l'exercice existe et n'est pas clôturé
2. Filtre les lignes à montant nul (`amountCents > 0`)
3. Pour chaque ligne : lookup `normal_balance` → débit si DEBIT, crédit si CREDIT
4. Appelle `validateEntryBalance(entryLines)` (réutilise `lib/accounting.ts`)
5. Insère dans `journal_entries` avec `is_opening_balance = 1`, date = `YYYY-01-01`
6. Insère les lignes

---

## Canaux IPC

| Canal | Paramètre | Retour |
|---|---|---|
| `openingBalance:getSuggested` | `fiscalYearId: number` | `OpeningBalanceSuggestion[]` |
| `openingBalance:create` | `fiscalYearId: number, lines: OpeningBalanceLine[]` | `void` |

Méthodes `window.api` correspondantes : `getOpeningBalanceSuggestions(fiscalYearId)`, `createOpeningBalance(fiscalYearId, lines)`.

---

## Composant `OpeningBalanceModal`

```ts
interface OpeningBalanceModalProps {
  fiscalYearId: number;
  year: number;
  suggestions: OpeningBalanceSuggestion[];
  onClose: () => void;    // "Passer cette étape"
  onSuccess: () => void;  // après enregistrement réussi
}
```

**État interne :**
- `amounts: Record<number, string>` — keyed par `accountId`, initialisé depuis `suggestions` (hors FONDS_PROPRES), en CHF avec 2 décimales
- `saving: boolean`
- `error: string | null`

**Capital (FONDS_PROPRES) :**  
Champ lecture seule, recalculé live :  
`capitalCents = Σ(ACTIF amountCents) − Σ(PASSIF amountCents)`

**Helpers locaux :**
```ts
function parseCHF(str: string): number   // "1234.56" → 123456, 0 sur entrée invalide
function formatCHF(cents: number): string // 123456 → "1234.56"
```

**Maquette :**
```
┌─ Soldes à nouveau — Exercice 2025 ──────────────────────┐
│                                                          │
│  Classe 1 — Actifs                                       │
│  100  Caisse              [    1 234.56 ]                │
│  101  Raiffeisen          [   10 500.00 ]                │
│  102  Twint               [        0.00 ]                │
│  103  Avances caissier    [        0.00 ]                │
│                                                          │
│  Classe 2 — Passifs et fonds propres                     │
│  200  Passifs transitoires [        0.00 ]               │
│  290  Capital              [   11 734.56 ] (calculé)     │
│                                                          │
│  [Passer cette étape]      [Enregistrer les soldes]      │
└──────────────────────────────────────────────────────────┘
```

**Bouton "Enregistrer les soldes" :** toujours actif (l'équilibre est garanti par Capital calculé). Désactivé seulement pendant `saving`.

**Erreur :** bandeau rouge en haut du modal si l'IPC échoue.

---

## `FiscalYearsPage` — modifications

**Nouvel état :**
```ts
const [modalFiscalYear, setModalFiscalYear] = useState<{ id: number; year: number } | null>(null);
const [suggestions, setSuggestions] = useState<OpeningBalanceSuggestion[]>([]);
```

**`load()` modifié :** retourne `Promise<FiscalYear[]>` pour permettre l'inspection après création.

**`handleCreate()` modifié :** après succès, vérifie dans la liste fraîche si l'exercice N-1 existe ; si oui, appelle `getOpeningBalanceSuggestions` et ouvre le modal.

**Bouton par carte :** visible si `!y.is_closed && !y.hasOpeningBalance`. Appelle `getOpeningBalanceSuggestions(y.id)` puis ouvre le modal.

**Colonne "Soldes à nouveau" :** ajoutée à la table, affiche "Saisis" (badge vert) ou le bouton selon `hasOpeningBalance`.

---

## Tests

### `ipc-opening-balance-handlers.test.ts` (~10 tests)

- `getFiscalYears` retourne `hasOpeningBalance: 0` si aucune écriture d'ouverture
- `getFiscalYears` retourne `hasOpeningBalance: 1` après `createOpeningBalanceEntry`
- `getSuggested` retourne des zéros si premier exercice (pas de N-1)
- `getSuggested` retourne les soldes calculés de l'exercice précédent
- `getSuggested` calcule Capital dans les suggestions (FONDS_PROPRES)
- `create` insère l'écriture avec `is_opening_balance = 1` et date `YYYY-01-01`
- `create` valide l'équilibre D/C via `validateEntryBalance`
- `create` ignore les lignes à montant nul
- `create` rejette si exercice clôturé
- `create` rejette si exercice introuvable

### `OpeningBalanceModal.test.tsx` (~8 tests)

- Affiche le titre avec l'année
- Affiche les comptes ACTIF et PASSIF avec champs éditables
- Affiche Capital (FONDS_PROPRES) en lecture seule
- Capital se recalcule quand un actif change
- Pré-remplit les montants suggérés
- "Enregistrer les soldes" appelle `createOpeningBalance` avec les bons montants (en centimes, Capital inclus)
- "Passer cette étape" appelle `onClose` sans appel API
- Affiche une erreur si `createOpeningBalance` rejette

### `FiscalYearsPage.test.tsx` (ajouts ~5 tests)

- Affiche la colonne "Soldes à nouveau"
- Affiche le bouton "Saisir les soldes à nouveau" si `!hasOpeningBalance`
- N'affiche pas le bouton si `hasOpeningBalance`
- Ouvre le modal automatiquement après création si exercice N-1 détecté
- N'ouvre pas le modal après création si premier exercice

**Total estimé : ~23 nouveaux tests → ~242 au total**
