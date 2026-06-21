# Spec — Vue des soldes par compte (BalancesPage)

**Date :** 2026-06-21  
**Statut :** Approuvé

---

## Contexte

L'application MCYCompta dispose d'un placeholder `BalancesPage` qui affiche "à venir". L'IPC `getAccountBalances(fiscalYearId)` et la requête SQL correspondante sont déjà implémentés dans `db/index.ts`. Il reste à construire l'interface React.

---

## Objectif

Afficher les soldes de tous les comptes **ayant des mouvements** sur un exercice sélectionné, regroupés par classe comptable (1/2/3/4/9), avec sous-totaux par classe.

---

## Décisions de design

| Question | Décision |
|---|---|
| Comptes affichés | Uniquement ceux ayant des mouvements sur l'exercice (JOIN, pas LEFT JOIN — déjà le cas) |
| Groupement | Par classe comptable, avec en-têtes et sous-totaux |
| Colonnes | N° · Nom · Total débit CHF · Total crédit CHF · Solde CHF |
| Mise en page | Table unique, lignes de groupe colorées intercalées |

---

## Modification de type requise

### `app/src/types/index.ts`

Ajouter `class: number` à `AccountBalance` :

```typescript
export interface AccountBalance {
  number: string;
  name: string;
  class: number;       // ← à ajouter
  total_debit: number;
  total_credit: number;
  solde: number;
}
```

### `app/src/db/index.ts`

Ajouter `a.class` au SELECT de `getAccountBalances` :

```sql
SELECT
  a.number,
  a.name,
  a.class,             -- ← à ajouter
  SUM(COALESCE(l.debit, 0))  AS total_debit,
  ...
```

---

## Composant `BalancesPage`

### État

```typescript
years:          FiscalYear[]       // liste des exercices
selectedYearId: number | null      // exercice sélectionné
balances:       AccountBalance[]   // liste plate retournée par l'IPC
loading:        boolean
error:          string | null
```

### Initialisation

- `useEffect` au montage : `window.api.getFiscalYears()` → auto-sélectionne le premier exercice ouvert (même logique que `JournalPage`)
- `useEffect` sur `selectedYearId` : `window.api.getAccountBalances(id)` → met à jour `balances`

### Groupement (renderer)

Regrouper `balances` par `class` avec un `reduce` :

```typescript
type BalanceGroup = {
  class: number;
  label: string;
  rows: AccountBalance[];
};
```

Labels des classes :

| Classe | Label |
|---|---|
| 1 | Classe 1 — Actifs |
| 2 | Classe 2 — Passifs et fonds propres |
| 3 | Classe 3 — Produits |
| 4 | Classe 4 — Charges |
| 9 | Classe 9 — Clôture |

### Structure visuelle de la table

```
┌──────────────────────────────────────────────────────────────┐
│ N°    Nom                       Débit CHF  Crédit CHF  Solde │
├──────────────────────────────────────────────────────────────┤
│ [fond gris clair] Classe 1 — Actifs                          │
│ 100   Caisse                   1 200.00      800.00   400.00 │
│ 101   Raiffeisen               8 000.00    5 000.00 3 000.00 │
│ [fond gris moyen, italique] Sous-total      9 200.00 3 400.00│
├──────────────────────────────────────────────────────────────┤
│ [fond gris clair] Classe 3 — Produits                        │
│ 300   Cotisations membres          0.00    1 410.00 1 410.00 │
│ [fond gris moyen, italique] Sous-total         0.00 1 410.00 │
└──────────────────────────────────────────────────────────────┘
```

- Lignes groupe : `background: #f1f5f9`, `fontWeight: 600`, `colSpan={5}`
- Lignes sous-total : `background: #e2e8f0`, `fontStyle: italic`
- Colonnes montants : `textAlign: right`, `fontFamily: monospace`
- Solde négatif : couleur rouge `#dc2626`
- Formatage montants : centimes → CHF avec `(n / 100).toFixed(2)`

### État vide

- Aucun exercice : message "Aucun exercice disponible. Créez-en un dans la section Exercices."
- Exercice sans mouvements : message "Aucun mouvement pour cet exercice."

---

## Tests — `BalancesPage.test.tsx`

Environnement : `jsdom` (annotation `// @vitest-environment jsdom`)

| Test | Description |
|---|---|
| Affiche le titre "Soldes" | Rendu initial |
| Affiche le sélecteur d'exercice | Après chargement des exercices |
| Message vide sans exercice | `getFiscalYears` retourne `[]` |
| Message vide sans mouvements | `getAccountBalances` retourne `[]` |
| Affiche les comptes groupés par classe | Données mixtes classes 1 et 3 |
| Affiche le sous-total de chaque classe | Vérification calcul débit/crédit/solde |
| Sélectionne automatiquement le premier exercice ouvert | Auto-sélection |
| Recharge les soldes au changement d'exercice | Interaction sélecteur |

---

## Fichiers modifiés / créés

| Fichier | Action |
|---|---|
| `app/src/types/index.ts` | Modifier — ajouter `class: number` à `AccountBalance` |
| `app/src/db/index.ts` | Modifier — ajouter `a.class` au SELECT |
| `app/src/pages/BalancesPage.tsx` | Remplacer le placeholder |
| `app/src/__tests__/renderer/BalancesPage.test.tsx` | Créer |

---

## Hors périmètre

- Filtres par type de compte (bilan vs résultat)
- Export CSV/PDF de la vue soldes
- Comparaison multi-exercices
- Graphiques
