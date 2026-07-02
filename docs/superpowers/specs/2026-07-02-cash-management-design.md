# Spec — Gestion de la caisse

**Date :** 2026-07-02  
**Version cible :** v1.2.0 (MINOR — nouvelle fonctionnalité)  
**Branche :** `feature/cash-management`  
**Statut :** Approuvé

---

## Contexte

Le caissier du MCY effectue régulièrement des arrêtés de caisse physiques : il compte pièce par pièce le contenu du tiroir et documente le résultat dans un fichier Excel (`Documents/caisse.xlsx`). Ces arrêtés sont faits à dates clés (début d'année, avant/après chaque manifestation).

Pour les manifestations (Marché Villageois, Broche, Souper…), il prépare en plus un **fonds de caisse** (composition spécifique de coupures pour rendre la monnaie), puis effectue un arrêté après l'événement pour calculer le chiffre d'affaires caisse.

Cette fonctionnalité intègre ces deux activités dans l'application, en deux niveaux :
- **Level 1** (implémenté maintenant) : arrêtés de caisse autonomes
- **Level 2** (conçu maintenant, implémenté plus tard) : sessions de manifestation

---

## Décisions d'architecture

### Lien avec la comptabilité
**Informatif (Level 1) :** l'arrêté documente l'état physique et affiche l'écart avec le solde SQLite du compte 100. Aucune écriture n'est créée automatiquement. L'architecture prévoit la validation active (Level 2+) sans réécriture : le solde théorique est stocké dans le type `CashCount`, la proposition d'écriture d'ajustement pourra être ajoutée ultérieurement.

### Navigation
Nouvelle entrée sidebar **"Caisse"**, positionnée entre Journal et Exercices. Type `Page` étendu avec `'cash'`.

### Versioning
- Branche `feature/cash-management` créée depuis `main`
- Merge sur `main` → tag `v1.2.0`
- CHANGELOG mis à jour avant le merge

---

## Modèle de données — Migration schéma v3

Trois nouvelles tables. Aucune modification aux tables existantes.

```sql
-- Session de manifestation (Level 2)
CREATE TABLE cash_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  label          TEXT    NOT NULL,  -- ex: "Marché Villageois 2026"
  account_group  TEXT,              -- lien analytique optionnel
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Arrêté de caisse
CREATE TABLE cash_counts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  session_id     INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
  date           TEXT    NOT NULL,  -- ISO 8601
  label          TEXT    NOT NULL,  -- ex: "Avant Marché 2026"
  context        TEXT    NOT NULL DEFAULT 'LIBRE',
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (context IN ('AVANT','FONDS','APRES','LIBRE'))
);

-- Lignes : une par coupure CHF
CREATE TABLE cash_count_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cash_count_id INTEGER NOT NULL REFERENCES cash_counts(id) ON DELETE CASCADE,
  denomination  INTEGER NOT NULL,  -- en centimes : 5,10,20,50,100,200,500,1000,2000,5000,10000,20000
  quantity      INTEGER NOT NULL DEFAULT 0,
  CHECK (denomination > 0),
  CHECK (quantity >= 0)
);

-- Index
CREATE INDEX idx_cash_counts_fiscal_year ON cash_counts(fiscal_year_id);
CREATE INDEX idx_cash_counts_session     ON cash_counts(session_id);
CREATE INDEX idx_cash_count_lines_count  ON cash_count_lines(cash_count_id);
```

### Coupures CHF (en centimes)
| Coupure | Centimes | Type |
|---------|----------|------|
| 0.05 | 5 | Pièce |
| 0.10 | 10 | Pièce |
| 0.20 | 20 | Pièce |
| 0.50 | 50 | Pièce |
| 1.00 | 100 | Pièce |
| 2.00 | 200 | Pièce |
| 5.00 | 500 | Pièce |
| 10.00 | 1000 | Billet |
| 20.00 | 2000 | Billet |
| 50.00 | 5000 | Billet |
| 100.00 | 10000 | Billet |
| 200.00 | 20000 | Billet |

Total d'un arrêté = `SUM(denomination * quantity)` — calculé en renderer, jamais stocké.

---

## Types partagés

```typescript
type CashContext = 'AVANT' | 'FONDS' | 'APRES' | 'LIBRE';

interface CashCountLine {
  denomination: number;  // centimes
  quantity: number;
}

interface CashCount {
  id: number;
  fiscalYearId: number;
  sessionId: number | null;
  sessionLabel: string | null;
  date: string;
  label: string;
  context: CashContext;
  notes: string | null;
  total: number;               // centimes, SUM(denomination * quantity)
  theoreticalBalance: number;  // centimes, solde compte 100 à cette date
  lines?: CashCountLine[];     // présent uniquement sur getById
}

interface CashSession {
  id: number;
  fiscalYearId: number;
  label: string;
  accountGroup: string | null;
  notes: string | null;
  counts: CashCount[];         // arrêtés liés, triés par context (AVANT→FONDS→APRES)
  caCA: number;                // CA caisse = total APRES − (total AVANT + total FONDS)
}

interface CashCountPayload {
  fiscalYearId: number;
  sessionId?: number;
  date: string;
  label: string;
  context: CashContext;
  notes?: string;
  lines: CashCountLine[];      // 12 lignes, quantity peut être 0
}
```

---

## Handlers IPC

Ajoutés dans `ipc-handlers.ts`, déclarés dans `preload.ts` et `window.api`.

```typescript
// Arrêtés (Level 1)
'cash:getAll'        (fiscalYearId: number)          → CashCount[]
'cash:getById'       (id: number)                    → CashCount  // avec lines
'cash:create'        (payload: CashCountPayload)      → CashCount
'cash:delete'        (id: number)                    → void

// Sessions (Level 2 — handlers créés maintenant, UI implémentée plus tard)
'cash:getSessions'   (fiscalYearId: number)           → CashSession[]
'cash:createSession' (payload: CashSessionPayload)    → CashSession
'cash:deleteSession' (id: number)                    → void
```

### Logique DB

**`createCashCount`** : INSERT `cash_counts` + INSERT des 12 lignes dans `cash_count_lines`, en transaction SQLite. Les lignes à `quantity = 0` sont incluses (structure complète garantie).

**`getCashCounts(fiscalYearId)`** : requête avec :
- JOIN `cash_sessions` pour `sessionLabel`
- Sous-requête `SUM(denomination * quantity)` pour `total`
- Sous-requête sur `journal_entry_lines` + `journal_entries` + `accounts` (compte 100) filtrée `date ≤ cash_counts.date` pour `theoreticalBalance`

**`deleteCashCount(id)`** : DELETE CASCADE sur `cash_count_lines` géré par la contrainte FK.

---

## UI — Page Caisse (`CaissePage.tsx`)

### Structure générale

```
[Sélecteur exercice]                    [+ Nouvel arrêté]

[Onglet: Arrêtés] [Onglet: Manifestations]

─── Onglet Arrêtés ──────────────────────────────────────
Date       | Libellé            | Contexte | Compté    | Théorique | Écart     | Session
03.08.2025 | Avant Marché 2026  | AVANT    | 1'378.30  | 1'378.30  | 0.00 ✓   | Marché 2026
...

─── Onglet Manifestations ────────────────────────────────
[Contenu Level 2 — à implémenter]
```

### Modale de saisie (`CashCountModal.tsx`)

Utilise `Modal.tsx` comme racine (convention projet).

Champs :
- **Date** : input date, défaut = aujourd'hui
- **Libellé** : input texte, requis
- **Contexte** : select (Libre / Avant / Fonds de caisse / Après)
- **Notes** : textarea optionnel

Grille des coupures — deux colonnes (Pièces | Billets) :

```
Pièces          Qté     Total   │  Billets         Qté     Total
0.05 CHF        [   ]   [0.00]  │  10.00 CHF       [   ]   [0.00]
0.10 CHF        [   ]   [0.00]  │  20.00 CHF       [   ]   [0.00]
0.20 CHF        [   ]   [0.00]  │  50.00 CHF       [   ]   [0.00]
0.50 CHF        [   ]   [0.00]  │ 100.00 CHF       [   ]   [0.00]
1.00 CHF        [   ]   [0.00]  │ 200.00 CHF       [   ]   [0.00]
2.00 CHF        [   ]   [0.00]  │
5.00 CHF        [   ]   [0.00]  │
─────────────────────────────────────────────────────────────────
TOTAL COMPTÉ        : CHF 1'378.30
SOLDE THÉORIQUE     : CHF 1'378.30
ÉCART               : CHF 0.00  ✓
```

**Saisie bidirectionnelle** : Qté et Total sont tous deux éditables. Le dernier champ modifié pilote l'autre :
- Modifier **Qté** → `Total = Qté × coupure` (recalculé immédiatement)
- Modifier **Total** → `Qté = floor(Total / coupure)` puis `Total = Qté × coupure` (recalibrage si non divisible exactement)

Exemple : saisir 15.00 CHF sur la ligne 2.00 CHF → Qté affiche 7, Total se recale à 14.00. Un arrondi silencieux — pas d'alerte, la cohérence est garantie côté quantité entière.

- L'écart est coloré : vert si = 0, rouge sinon (via `data-negative` + CSS).
- Navigation clavier : `Tab` avance de champ en champ (Qté → Total → Qté suivante…).
- Bouton "Enregistrer" désactivé si toutes les quantités sont à 0.

### Vue détail d'un arrêté

Modale en lecture seule, mêmes données que la saisie + timestamp de création.

---

## Level 2 — Sessions de manifestation (conçu, implémenté plus tard)

**Onglet Manifestations** affiche :
- Liste des sessions avec label, date de création, nombre d'arrêtés liés
- CA caisse calculé = `total(APRES) − total(AVANT) − total(FONDS)`
- Bouton "Nouvelle session" → modale (label + groupe analytique optionnel)
- Clic sur une session → vue détail avec les arrêtés AVANT / FONDS / APRES enchaînés

L'association arrêté ↔ session se fait à la création de l'arrêté (sélecteur session optionnel dans `CashCountModal`).

---

## Tests

### Vitest (unitaires + intégration)

- `db/cash.test.ts` : CRUD `cash_counts`, CRUD `cash_sessions`, calcul `theoreticalBalance`, cascade DELETE, migration v3
- `ipc-handlers.test.ts` : handlers `cash:*` (mocks DB)
- `renderer/CaissePage.test.tsx` : rendu liste, ouverture modale, calcul total temps réel, écart coloré
- `renderer/CashCountModal.test.tsx` : saisie coupures, validation, soumission

### E2E Playwright (à planifier)

- `cash.spec.ts` : créer un arrêté, vérifier l'affichage dans la liste, écart = 0

---

## Fichiers à créer / modifier

| Fichier | Action |
|---------|--------|
| `app/src/db/schema-migrations.ts` | Ajout migration v3 (3 tables + index) |
| `app/src/db/index.ts` | Fonctions `getCashCounts`, `getCashCountById`, `createCashCount`, `deleteCashCount`, `getCashSessions`, `createCashSession`, `deleteCashSession` |
| `app/src/ipc-handlers.ts` | Handlers `cash:*` |
| `app/src/preload.ts` | Déclaration des 7 handlers dans `contextBridge` |
| `app/src/types.ts` | Types `CashCount`, `CashCountLine`, `CashSession`, `CashCountPayload`, `CashContext` |
| `app/src/pages/CaissePage.tsx` | Nouvelle page (onglets Arrêtés + Manifestations placeholder) |
| `app/src/pages/CaissePage.module.css` | Styles |
| `app/src/components/CashCountModal.tsx` | Modale saisie/détail arrêté |
| `app/src/components/CashCountModal.module.css` | Styles |
| `app/src/App.tsx` | Ajout type `'cash'` dans `Page`, case dans `renderPage()` |
| `app/src/components/Sidebar.tsx` | Ajout entrée "Caisse" |
| `app/src/components/HelpDrawer.tsx` | Section aide Caisse |
| `app/package.json` | Version `1.2.0` (après merge sur main) |
| `CHANGELOG.md` | Entrée `[1.2.0]` (avant merge) |

---

## Workflow de livraison

1. Créer branche `feature/cash-management` depuis `main`
2. Implémenter Level 1 (arrêtés) + handlers Level 2 (sans UI)
3. Tests verts
4. Merge PR → `main`
5. Mettre à jour `app/package.json` → `1.2.0` + `CHANGELOG.md`
6. Tag `v1.2.0` → déclenche CI/CD → GitHub Release automatique
