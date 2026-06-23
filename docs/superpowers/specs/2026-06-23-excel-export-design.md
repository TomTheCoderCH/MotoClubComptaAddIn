# Excel Export de Clôture Annuelle — Design Spec

**Date :** 2026-06-23  
**Projet :** MCY Compta (Electron + React + TypeScript + SQLite)  
**Statut :** Approuvé

---

## Objectif

Générer un classeur Excel `.xlsx` reproduisant la structure du fichier de référence (`Documents/MCY comptes 25.xlsx`) à partir des données de la base SQLite, pour un exercice comptable donné. Le fichier doit être utilisable manuellement par un futur caissier non-technicien, et servir de filet de sécurité de transmission.

---

## Structure du classeur

**Nom du fichier :** `mcy-compta-{year}.xlsx`  
**Déclencheur :** bouton "Exporter Excel" dans FiscalYearsPage (par ligne d'exercice) ET dans SettingsPage (sélecteur d'exercice + bouton).

### Ordre des feuilles

1. `Bilan & Résultat` — synthèse des soldes finaux par classe (nouveau)
2. `Journal` — toutes les lignes d'écritures, ordre chronologique
3. Une feuille par compte actif ayant au moins une écriture sur l'exercice, triée par numéro de compte (ex: `Caisse`, `Raiffeisen`, `Cotisations membres`…)

---

## Feuilles de compte

### Layout (identique au fichier de référence)

```
Ligne 1 : vide
Ligne 2 : [Nom du compte]  |  vide  |  "Total"  |  =SUBTOTAL(109,D6:Dn)-SUBTOTAL(109,C6:Cn)
Ligne 3 : vide             |  vide  |  =SUBTOTAL(109,C6:Cn)  |  =SUBTOTAL(109,D6:Dn)
Ligne 4 : vide
Ligne 5 : "Date" | "Libellé" | "Doit" | "Avoir" [| "Courant"]
Lignes 6..n : données (Date ISO, description, débit en CHF, crédit en CHF)
Ligne n+1 : "Total" | vide | =SUBTOTAL(109,C6:Cn) | =SUBTOTAL(109,D6:Dn)
```

- Les montants sont convertis de centimes (DB) en CHF (deux décimales)
- Les colonnes Doit et Crédit sont formatées `#,##0.00` (format comptable suisse)

### Colonne Courant (solde courant cumulé)

Présente uniquement pour les comptes avec `type = 'ACTIF'` et `must_be_zero_at_closing = 0` (comptes 100 Caisse et 101 Raiffeisen — les seuls dans la référence).

Formule par ligne de données (ligne i, données démarrant en ligne 6, C=Doit, D=Avoir) :
```
=SUM($D$6:D{i})-SUM($C$6:C{i})
```

Cette formule cumule l'Avoir moins le Doit depuis la première ligne jusqu'à la ligne courante.

---

## Feuille Journal

Colonnes : `Date` | `Libellé` | `Montant` | `Pièce`

- Une ligne par mouvement (journal_entry_line), pas par écriture
- `Libellé` = `"{nom du compte} — {description de l'écriture}"`
- `Montant` = valeur absolue du débit ou crédit (en CHF, pas en centimes)
- `Pièce` = champ `piece` de l'en-tête d'écriture (peut être null)
- Ordre : `e.date ASC, e.id ASC, l.id ASC`
- Pas de ligne Total (identique à la référence)

---

## Feuille Bilan & Résultat

Valeurs pré-calculées (pas de formules — les données viennent de la DB).

Sections :
1. **Actifs** (comptes 1xx) — numéro, nom, solde final
2. **Passifs & Fonds propres** (comptes 2xx) — numéro, nom, solde final
3. **Produits** (comptes 3xx) — numéro, nom, total crédits
4. **Charges** (comptes 4xx) — numéro, nom, total débits
5. **Résultat net** — ligne calculée : Total Produits − Total Charges

Les soldes sont calculés selon `normal_balance` du compte :
- `DEBIT` : solde = Σ débit − Σ crédit
- `CREDIT` : solde = Σ crédit − Σ débit

N'affiche que les comptes ayant au moins un mouvement sur l'exercice.

---

## Architecture

### Nouveaux fichiers

**`src/excel/export.ts`**  
Logique exceljs pure, sans dépendance Electron. Exportée comme fonction testable :
```typescript
export async function exportFiscalYearToExcel(
  db: Database,
  fiscalYearId: number,
  outputPath: string,
): Promise<void>
```
Appelle une seule requête SQL (voir ci-dessous), regroupe les données côté JS, construit le workbook exceljs, sauvegarde le fichier.

**`src/main/__tests__/excel-export.test.ts`**  
Tests Vitest avec SQLite en mémoire (`:memory:`).

### Fichiers modifiés

- **`src/ipc-handlers.ts`** — nouveau handler `excel:export`  
  Appelle `dialog.showSaveDialog`, puis `exportFiscalYearToExcel`, retourne `{ path } | { error } | null`
- **`src/preload.ts`** — exposition `exportExcel: (fiscalYearId: number) => Promise<...>`
- **`src/renderer/types/window.d.ts`** — déclaration du type
- **`src/renderer/pages/FiscalYearsPage.tsx`** — bouton "Exporter Excel" par ligne d'exercice
- **`src/renderer/pages/SettingsPage.tsx`** — nouvelle section avec sélecteur d'exercice + bouton

---

## Requête DB

```sql
SELECT
  a.id, a.number, a.name, a.type, a.normal_balance, a.must_be_zero_at_closing,
  e.date, e.description, e.piece,
  l.debit, l.credit
FROM accounts a
JOIN journal_entry_lines l ON l.account_id = a.id
JOIN journal_entries e ON e.id = l.journal_entry_id
WHERE e.fiscal_year_id = ?
ORDER BY a.number, e.date, e.id
```

Le regroupement par compte se fait en JS. Pour la feuille Journal, une deuxième requête ordonnée par `e.date, e.id, l.id` récupère les mêmes données dans l'ordre chronologique.

---

## Gestion des erreurs

| Situation | Comportement |
|---|---|
| Utilisateur annule le `showSaveDialog` | Retourne `null`, aucun message d'erreur |
| Écriture impossible (droits, disque plein) | Retourne `{ error: string }` → renderer affiche message d'erreur |
| Exercice sans aucune écriture | Exporte un fichier valide avec feuilles vides (pas une erreur) |
| Exercice inexistant | Handler rejette avec erreur avant d'ouvrir le dialog |

---

## Tests

### `excel-export.test.ts` (Vitest + SQLite `:memory:`)

- Génère un fichier dans un temp dir, vérifie existence et taille > 0
- Vérifie le nombre de feuilles (Bilan + Journal + N comptes actifs)
- Vérifie les noms de feuilles (correspondance avec comptes ayant des écritures)
- Vérifie une valeur de cellule clé (montant d'une ligne saisie)
- Vérifie la présence des formules SUBTOTAL dans la ligne Total d'une feuille de compte
- Vérifie la formule Courant sur la feuille Caisse

### Tests renderer

- `FiscalYearsPage.test.tsx` — vérifie la présence du bouton "Exporter Excel" par ligne d'exercice
- `SettingsPage.test.tsx` — vérifie la section export (sélecteur + bouton)

---

## Dépendance à installer

```
exceljs
```
Version à utiliser : dernière stable (^4.x). Pas de rebuild natif nécessaire.
