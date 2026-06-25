# Page Grand-livre (AccountLedgerPage) — Design

## Objectif

Afficher le détail de toutes les écritures d'un compte pour un exercice donné (grand-livre par compte), avec solde courant progressif pour les comptes de bilan, et contreparties par ligne.

---

## Accès

- Accessible uniquement depuis la page **Soldes** : chaque ligne de compte devient cliquable.
- Pas d'entrée dédiée dans la sidebar.
- Un bouton "← Retour aux soldes" en haut de page permet de revenir.

---

## Interface utilisateur

### En-tête

```
← Retour aux soldes

100 Caisse — Exercice 2025
```

### Tableau des mouvements

Colonnes pour les **comptes de bilan (classe 1 et 2)** :

| Date | Pièce | Libellé | Contrepartie | Débit CHF | Crédit CHF | Solde CHF |
|---|---|---|---|---|---|---|

Colonnes pour les **comptes de résultat (classe 3, 4, 9)** :

| Date | Pièce | Libellé | Contrepartie | Débit CHF | Crédit CHF |
|---|---|---|---|---|---|

La colonne **Solde courant** est masquée (absente du DOM) pour les comptes de résultat.

### Contrepartie

- **Écriture simple (2 lignes)** : affiche directement `"101 Raiffeisen"`.
- **Écriture multi-lignes** : affiche `"Divers"` avec un tooltip au survol listant tous les comptes contreparties (`Tooltip.tsx` existant, CSS pur `:hover`).

### Style des lignes spéciales

- Écritures d'ouverture (`is_opening_balance = 1`) : style italique.
- Écritures de clôture (`is_closing_entry = 1`) : fond légèrement coloré (gris clair).

### Pied de tableau

Ligne de total (Débit total / Crédit total / Solde net), identique au pattern de `BalancesPage`.

---

## Types

Nouveaux types dans `app/src/types/index.ts` :

```typescript
export interface LedgerLine {
  entryId: number;
  date: string;
  piece: string | null;
  description: string;
  isOpeningBalance: boolean;
  isClosingEntry: boolean;
  debit: number | null;   // centimes CHF, null si ligne au crédit
  credit: number | null;  // centimes CHF, null si ligne au débit
  counterparts: Array<{ number: string; name: string }>;
}

export interface AccountLedgerData {
  account: {
    id: number;
    number: string;
    name: string;
    type: AccountType;
    normal_balance: NormalBalance;
    class: number;
  };
  lines: LedgerLine[];
}
```

---

## Handler IPC

Nouveau handler `account:getLedger` dans `app/src/ipc-handlers.ts`.

**Signature exposée** dans `window.d.ts` :
```typescript
getAccountLedger: (fiscalYearId: number, accountId: number) => Promise<AccountLedgerData>;
```

**Implémentation (SQLite synchrone via `better-sqlite3`)** :

Deux requêtes :
1. Récupérer toutes les lignes du compte pour l'exercice, jointurées avec `journal_entries` et `accounts` :
   ```sql
   SELECT
     e.id AS entry_id, e.date, e.piece, e.description,
     e.is_opening_balance, e.is_closing_entry,
     l.debit, l.credit
   FROM journal_entry_lines l
   JOIN journal_entries e ON e.id = l.journal_entry_id
   WHERE l.account_id = ? AND e.fiscal_year_id = ?
   ORDER BY e.date, e.id
   ```

2. Pour chaque `entry_id` distinct, récupérer les comptes contreparties (lignes de la même écriture, compte différent) :
   ```sql
   SELECT a.number, a.name
   FROM journal_entry_lines l
   JOIN accounts a ON a.id = l.account_id
   WHERE l.journal_entry_id = ? AND l.account_id != ?
   ```

Le handler assemble le résultat en mémoire : pour chaque ligne principale, il attache le tableau `counterparts`. L'info du compte (numéro, nom, type, etc.) est récupérée via une troisième requête simple sur `accounts`.

---

## Navigation

### `App.tsx`

- `Page` union : ajouter `'ledger'`
- Nouvel état : `ledgerParams: { accountId: number; fiscalYearId: number } | null`
- Fonction `onOpenLedger(accountId: number, fiscalYearId: number)` → `setLedgerParams(...)` + `setCurrentPage('ledger')`
- `case 'ledger'` dans le switch :
  ```tsx
  case 'ledger':
    return ledgerParams
      ? <AccountLedgerPage
          accountId={ledgerParams.accountId}
          fiscalYearId={ledgerParams.fiscalYearId}
          onBack={() => setCurrentPage('balances')}
        />
      : <BalancesPage onOpenLedger={onOpenLedger} />;
  ```

### `BalancesPage.tsx`

- Nouvelle prop optionnelle : `onOpenLedger?: (accountId: number, fiscalYearId: number) => void`
- Les lignes de compte deviennent des `<button>` ou `<tr>` cliquables (si `onOpenLedger` fourni).
- On a besoin de l'`account_id` dans `AccountBalance` → voir section Migration ci-dessous.

### `AccountBalance` — extension

`AccountBalance` n'expose pas encore `id`. Deux options :
- **A. Ajouter `id: number` à `AccountBalance`** dans `types/index.ts` et dans la query SQL `getAccountBalances`.
- **B. Nouveau handler `getAccountId(number: string)`** pour résoudre l'id à la volée.

Retenu : **option A** — plus simple, cohérent, sans aller-retour supplémentaire.

---

## Fichiers créés / modifiés

| Fichier | Action |
|---|---|
| `app/src/types/index.ts` | Ajouter `LedgerLine`, `AccountLedgerData`, `id` dans `AccountBalance` |
| `app/src/ipc-handlers.ts` | Ajouter handler `account:getLedger` |
| `app/src/preload.ts` | Exposer `getAccountLedger` |
| `app/src/window.d.ts` | Déclarer `getAccountLedger` |
| `app/src/App.tsx` | Ajouter `'ledger'` au type `Page`, état `ledgerParams`, `onOpenLedger` |
| `app/src/pages/BalancesPage.tsx` | Lignes cliquables, prop `onOpenLedger` |
| `app/src/pages/AccountLedgerPage.tsx` | Nouveau composant |
| `app/src/pages/AccountLedgerPage.module.css` | Styles CSS Modules |
| `app/src/__tests__/renderer/BalancesPage.test.tsx` | Tester clic sur une ligne |
| `app/src/__tests__/renderer/AccountLedgerPage.test.tsx` | Nouveau fichier de tests |
| `app/src/__tests__/ipc-handlers.test.ts` | Tests du handler `getAccountLedger` |

---

## Tests

### `ipc-handlers.test.ts`

- Handler retourne les lignes dans l'ordre chronologique
- Calcul correct des contreparties (unique vs. multiples)
- Résultat vide si aucun mouvement pour ce compte/exercice
- `isOpeningBalance` et `isClosingEntry` correctement renseignés

### `AccountLedgerPage.test.tsx`

- Affiche le titre avec numéro et nom du compte
- Affiche les colonnes correctes selon le type (bilan vs. résultat)
- Colonne Solde courant présente pour classe 1/2, absente pour classe 3/4
- Affiche `"Divers"` si contreparties multiples
- Affiche le nom de compte si contrepartie unique
- Affiche le total en pied de tableau
- Le bouton "← Retour" appelle `onBack`
- Lignes d'ouverture en italique, lignes de clôture avec style distinct

### `BalancesPage.test.tsx`

- Un clic sur une ligne appelle `onOpenLedger` avec le bon `accountId` et `fiscalYearId`
