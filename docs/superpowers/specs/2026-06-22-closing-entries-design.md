# Écritures de clôture automatiques — Design

**Date :** 2026-06-22  
**Contexte :** MotoClubComptaAddIn — Electron + React + TypeScript + SQLite

---

## Objectif

Permettre la clôture automatique d'un exercice comptable : soldage de tous les comptes de résultat (3xx/4xx) vers le compte 900 (Profits et Pertes), puis transfert du résultat net vers le compte 290 (Capital). L'opération est réversible via une action "Rouvrir l'exercice".

---

## Flux de clôture

| Étape | Action |
|---|---|
| 1 | L'utilisateur clique "Clôturer l'exercice" sur une ligne ouverte |
| 2 | Appel `closing:getPreview(fiscalYearId)` |
| 3 | `ClosingModal` s'ouvre avec l'aperçu (blockers ou preview) |
| 4 | L'utilisateur clique "Confirmer la clôture" |
| 5 | Appel `closing:close(fiscalYearId)` |
| 6 | DB génère 2 écritures `is_closing_entry = 1`, marque `is_closed = 1` |
| 7 | Modal se ferme, FiscalYearsPage se rafraîchit |

## Flux de réouverture

| Étape | Action |
|---|---|
| 1 | L'utilisateur clique "Rouvrir" sur une ligne clôturée |
| 2 | `ConfirmDialog` s'affiche |
| 3 | L'utilisateur confirme |
| 4 | Appel `closing:reopen(fiscalYearId)` |
| 5 | DB supprime les écritures `is_closing_entry = 1`, remet `is_closed = 0` |
| 6 | FiscalYearsPage se rafraîchit |

---

## Fichiers

| Action | Fichier | Responsabilité |
|---|---|---|
| Modifié | `app/src/types/index.ts` | Ajouter `ClosingAccountLine`, `ClosingPreview` |
| Modifié | `app/src/db/index.ts` | Ajouter `getClosingPreview()`, `closeFiscalYear()`, `reopenFiscalYear()` |
| Modifié | `app/src/ipc-handlers.ts` | Enregistrer `closing:getPreview`, `closing:close`, `closing:reopen` |
| Modifié | `app/src/preload.ts` | Exposer `getClosingPreview`, `closeFiscalYear`, `reopenFiscalYear` |
| Modifié | `app/src/window.d.ts` | Types `window.api` pour les 3 nouvelles méthodes |
| Nouveau | `app/src/components/ClosingModal.tsx` | Modal d'aperçu et confirmation de clôture |
| Modifié | `app/src/pages/FiscalYearsPage.tsx` | Colonne Actions, intégration ClosingModal + ConfirmDialog |
| Nouveau | `app/src/__tests__/ipc-closing-handlers.test.ts` | Tests handlers IPC |
| Nouveau | `app/src/__tests__/renderer/ClosingModal.test.tsx` | Tests composant modal |
| Modifié | `app/src/__tests__/renderer/FiscalYearsPage.test.tsx` | Tests boutons + modals |
| Modifié | `app/src/__tests__/db.test.ts` | Tests fonctions DB |

---

## Types (`types/index.ts`)

```ts
export interface ClosingAccountLine {
  accountId: number;
  accountNumber: string;
  accountName: string;
  type: 'PRODUIT' | 'CHARGE';
  soldeCents: number; // positif = solde normal, négatif = solde inversé (rare)
}

export interface ClosingPreview {
  blockers: string[];            // ex. ["Twint (102) : solde CHF 45.00 doit être à 0"]
  accounts: ClosingAccountLine[]; // comptes 3xx/4xx avec solde ≠ 0
  netResultCents: number;        // positif = bénéfice, négatif = perte
}
```

---

## Couche données (`db/index.ts`)

### `getClosingPreview(fiscalYearId: number): ClosingPreview`

1. Récupère l'exercice (lève une erreur si introuvable)
2. Vérifie les comptes `must_be_zero_at_closing = 1` :
   - Calcule leur solde sur l'exercice
   - Pour chaque solde ≠ 0 : ajoute un message dans `blockers`
3. Requête tous les comptes de classe 3 et 4 actifs avec leur solde sur l'exercice (LEFT JOIN)
4. Filtre les soldes nuls
5. Calcule `netResultCents = Σ soldeCents des PRODUIT − Σ soldeCents des CHARGE`
6. Retourne `{ blockers, accounts, netResultCents }`

**Solde d'un compte :**
```sql
CASE normal_balance
  WHEN 'DEBIT'  THEN SUM(COALESCE(debit,0)) - SUM(COALESCE(credit,0))
  WHEN 'CREDIT' THEN SUM(COALESCE(credit,0)) - SUM(COALESCE(debit,0))
END
```

### `closeFiscalYear(fiscalYearId: number): void`

Tout dans une transaction SQLite.

1. **Guard exercice :** récupère `year` et `is_closed` ; lève une erreur si clôturé
2. **Guard idempotence :** vérifie qu'il n'existe pas déjà d'écriture `is_closing_entry = 1` pour cet exercice
3. **Récupère le preview :** lève une erreur si `blockers.length > 0`
4. **Écriture 1** — `is_closing_entry = 1`, date `YYYY-12-31`, libellé `"Clôture — Soldage résultat YYYY"` :
   - Pour chaque compte avec `soldeCents > 0` :
     - PRODUIT (normal_balance CREDIT) : ligne DÉBIT sur le compte + ligne CRÉDIT sur 900
     - CHARGE (normal_balance DEBIT) : ligne CRÉDIT sur le compte + ligne DÉBIT sur 900
   - Pour chaque compte avec `soldeCents < 0` (solde inversé) :
     - PRODUIT : ligne CRÉDIT sur le compte + ligne DÉBIT sur 900 (montant = `-soldeCents`)
     - CHARGE : ligne DÉBIT sur le compte + ligne CRÉDIT sur 900 (montant = `-soldeCents`)
   - Appelle `validateEntryBalance` avant insertion
5. **Écriture 2** — uniquement si `netResultCents ≠ 0`, `is_closing_entry = 1`, date `YYYY-12-31`, libellé `"Clôture — Transfert vers Capital YYYY"` :
   - Bénéfice (`netResultCents > 0`) : DÉBIT 900 + CRÉDIT 290
   - Perte (`netResultCents < 0`) : CRÉDIT 900 + DÉBIT 290 (montant = `Math.abs(netResultCents)`)
6. `UPDATE fiscal_years SET is_closed = 1 WHERE id = ?`

### `reopenFiscalYear(fiscalYearId: number): void`

Tout dans une transaction SQLite.

1. **Guard :** récupère `is_closed` ; lève une erreur si l'exercice n'est pas clôturé
2. `DELETE FROM journal_entries WHERE fiscal_year_id = ? AND is_closing_entry = 1`
   (les lignes sont supprimées en cascade via `ON DELETE CASCADE`)
3. `UPDATE fiscal_years SET is_closed = 0 WHERE id = ?`

---

## Canaux IPC (`ipc-handlers.ts`)

| Canal | Paramètre | Retour |
|---|---|---|
| `closing:getPreview` | `fiscalYearId: number` | `ClosingPreview` |
| `closing:close` | `fiscalYearId: number` | `void` |
| `closing:reopen` | `fiscalYearId: number` | `void` |

## Méthodes `window.api` (`preload.ts` + `window.d.ts`)

```ts
getClosingPreview: (fiscalYearId: number) => Promise<ClosingPreview>;
closeFiscalYear:   (fiscalYearId: number) => Promise<void>;
reopenFiscalYear:  (fiscalYearId: number) => Promise<void>;
```

---

## Composant `ClosingModal`

```ts
interface ClosingModalProps {
  fiscalYearId: number;
  year: number;
  preview: ClosingPreview;
  onClose: () => void;    // "Annuler"
  onSuccess: () => void;  // après clôture réussie
}
```

**État interne :** `closing: boolean`, `error: string | null`

**Maquette :**
```
┌─ Clôture de l'exercice 2025 ────────────────────────────────┐
│                                                              │
│  ⚠ Attention : cette opération peut être annulée via        │
│    "Rouvrir l'exercice".                                     │
│                                                              │
│  [si blockers]                                               │
│  ✗ Twint (102) : solde CHF 45.00 doit être à 0              │
│    La clôture ne peut pas être effectuée.                    │
│                                                              │
│  [si pas de blockers]                                        │
│  Comptes soldés vers 900 — Profits et Pertes                 │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ 300  Cotisations membres      Produit    1 410.00    │    │
│  │ 400  Assurances               Charge       350.00    │    │
│  │ ...                                                  │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Résultat net : Bénéfice CHF 337.04                          │
│  → 900 Profits et Pertes → 290 Capital                       │
│                                                              │
│  [Annuler]              [Confirmer la clôture]               │
└──────────────────────────────────────────────────────────────┘
```

**Règles :**
- Bouton "Confirmer" désactivé si `preview.blockers.length > 0` ou `closing === true`
- Bandeau rouge `role="alert"` si erreur IPC
- Inline styles `const s = {...} as const`

---

## `FiscalYearsPage` — modifications

### Nouvel état

```ts
const [closingModal,   setClosingModal]   = useState<{ id: number; year: number; preview: ClosingPreview } | null>(null);
const [confirmReopen,  setConfirmReopen]  = useState<{ id: number; year: number } | null>(null);
```

### Nouvelle colonne "Actions"

| État de l'exercice | Contenu |
|---|---|
| Ouvert | Bouton `"Clôturer l'exercice"` (style `btnSmall`) |
| Clôturé | Bouton `"Rouvrir"` (style `btnReopen`, orange discret) |

### Handlers

**`handleCloseExercise(y: FiscalYear)`** : appelle `getClosingPreview(y.id)` → `setClosingModal({ id: y.id, year: y.year, preview })`

**`handleReopenClick(y: FiscalYear)`** : `setConfirmReopen({ id: y.id, year: y.year })`

**`handleReopenConfirm()`** : appelle `reopenFiscalYear(confirmReopen.id)` → `setConfirmReopen(null)` → `load()`

**`handleClosingSuccess()`** : `setClosingModal(null)` → `load()`

### Rendu conditionnel (en bas de page)

```tsx
{closingModal && (
  <ClosingModal
    fiscalYearId={closingModal.id}
    year={closingModal.year}
    preview={closingModal.preview}
    onClose={() => setClosingModal(null)}
    onSuccess={handleClosingSuccess}
  />
)}
{confirmReopen && (
  <ConfirmDialog
    message={`Rouvrir l'exercice ${confirmReopen.year} ? Les écritures de clôture seront supprimées et l'exercice repassera en statut ouvert.`}
    onConfirm={handleReopenConfirm}
    onCancel={() => setConfirmReopen(null)}
  />
)}
```

---

## Tests

### `db.test.ts` (~10 tests)

- `getClosingPreview` : retourne `blockers` si compte `must_be_zero_at_closing` non soldé
- `getClosingPreview` : retourne `accounts` et `netResultCents` corrects
- `getClosingPreview` : retourne listes vides et `netResultCents = 0` si aucun mouvement 3xx/4xx
- `closeFiscalYear` : génère exactement 2 écritures `is_closing_entry = 1` (cas bénéfice)
- `closeFiscalYear` : génère 1 écriture si `netResultCents = 0` (pas d'écriture 2)
- `closeFiscalYear` : marque `is_closed = 1`
- `closeFiscalYear` : lève une erreur si `blockers` non vides
- `closeFiscalYear` : lève une erreur si déjà clôturé (idempotence)
- `reopenFiscalYear` : supprime les écritures `is_closing_entry`, remet `is_closed = 0`
- `reopenFiscalYear` : lève une erreur si exercice non clôturé

### `ipc-closing-handlers.test.ts` (~6 tests)

- Les 3 canaux sont bien enregistrés
- `closing:getPreview` délègue à `getClosingPreview` + propage les erreurs
- `closing:close` délègue à `closeFiscalYear` + propage les erreurs
- `closing:reopen` délègue à `reopenFiscalYear` + propage les erreurs

### `ClosingModal.test.tsx` (~8 tests)

- Affiche le titre avec l'année
- Affiche les blockers + bouton "Confirmer" désactivé si `blockers` non vides
- Affiche la table des comptes si pas de blockers
- Affiche le résultat net (bénéfice / perte)
- "Confirmer" appelle `closeFiscalYear` puis `onSuccess`
- "Annuler" appelle `onClose` sans appel API
- Bandeau erreur si `closeFiscalYear` rejette

### `FiscalYearsPage.test.tsx` (~6 tests supplémentaires)

- Affiche la colonne "Actions"
- Bouton "Clôturer" visible sur exercice ouvert
- Bouton "Rouvrir" visible sur exercice clôturé
- `ClosingModal` s'ouvre après clic "Clôturer"
- `ConfirmDialog` s'affiche après clic "Rouvrir"
- Rafraîchissement de la liste après succès

**Total estimé : ~30 nouveaux tests → ~279 au total**
