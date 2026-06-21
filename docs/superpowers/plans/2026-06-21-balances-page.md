# BalancesPage — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le placeholder `BalancesPage` par une vue complète des soldes par compte, groupés par classe, avec sous-totaux.

**Architecture:** L'IPC `getAccountBalances` et la requête SQL existent déjà. On ajoute `a.class` au SELECT SQL et au type TypeScript, puis on implémente le composant React avec groupement par classe dans le renderer.

**Tech Stack:** React + TypeScript, Vitest + React Testing Library (jsdom), better-sqlite3 (tests DB en mémoire)

## Global Constraints

- Montants stockés en **centimes (INTEGER)** — affichage via `(n / 100).toFixed(2)`
- Environnement jsdom pour les tests renderer : annotation `// @vitest-environment jsdom` en tête de fichier
- `vi.mock('electron', ...)` doit précéder tous les imports dans les tests DB
- Styles inline uniquement (pas de CSS externe), cohérents avec les pages existantes
- Tests lancés avec `npm test` depuis `app/`

---

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `app/src/types/index.ts` | Modifier | Ajouter `class: number` à `AccountBalance` |
| `app/src/db/index.ts` | Modifier | Ajouter `a.class` au SELECT de `getAccountBalances` |
| `app/src/__tests__/db.test.ts` | Modifier | Ajouter test vérifiant que `class` est retourné |
| `app/src/pages/BalancesPage.tsx` | Remplacer | Composant complet avec groupement et sous-totaux |
| `app/src/__tests__/renderer/BalancesPage.test.tsx` | Créer | 8 tests React Testing Library |

---

## Task 1 : Ajouter `class` au type et à la requête SQL

**Files:**
- Modify: `app/src/types/index.ts`
- Modify: `app/src/db/index.ts`
- Modify: `app/src/__tests__/db.test.ts`

**Interfaces:**
- Produces: `AccountBalance` avec champ `class: number` utilisé par Task 2

- [ ] **Step 1 : Écrire le test DB qui échoue**

Dans `app/src/__tests__/db.test.ts`, dans le `describe('Soldes par compte', ...)` existant, ajouter après le test `'n\'inclut pas les comptes sans mouvement'` :

```typescript
it('retourne le champ class pour chaque compte', () => {
  const balances = getAccountBalances(fiscalYearId);
  const caisse = balances.find(b => b.number === '100');
  expect(caisse).toBeDefined();
  expect(caisse!.class).toBe(1); // Caisse est en classe 1 (Actifs)
  const cotis = balances.find(b => b.number === '300');
  expect(cotis!.class).toBe(3); // Cotisations membres est en classe 3 (Produits)
});
```

- [ ] **Step 2 : Vérifier que le test échoue**

```bash
cd app && npm test -- --reporter=verbose 2>&1 | grep -A 3 "champ class"
```

Attendu : FAIL — `expect(received).toBe(expected)` car `class` est `undefined`.

- [ ] **Step 3 : Ajouter `class` au type `AccountBalance`**

Dans `app/src/types/index.ts`, modifier l'interface `AccountBalance` :

```typescript
export interface AccountBalance {
  number: string;
  name: string;
  class: number;        // ← ligne ajoutée
  total_debit: number;
  total_credit: number;
  solde: number;
}
```

- [ ] **Step 4 : Ajouter `a.class` au SELECT SQL**

Dans `app/src/db/index.ts`, modifier la fonction `getAccountBalances` :

```typescript
export function getAccountBalances(fiscalYearId: number): AccountBalance[] {
  return getDb().prepare(`
    SELECT
      a.number,
      a.name,
      a.class,
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
    GROUP BY a.id
    ORDER BY a.number
  `).all(fiscalYearId) as AccountBalance[];
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
cd app && npm test
```

Attendu : tous les tests passent (y compris le nouveau test `champ class`).

- [ ] **Step 6 : Commit**

```bash
git add app/src/types/index.ts app/src/db/index.ts app/src/__tests__/db.test.ts
git commit -m "feat: ajouter class au type AccountBalance et à la requête SQL getAccountBalances"
```

---

## Task 2 : Implémenter `BalancesPage` avec tests

**Files:**
- Create: `app/src/__tests__/renderer/BalancesPage.test.tsx`
- Modify: `app/src/pages/BalancesPage.tsx` (remplacement total du placeholder)

**Interfaces:**
- Consumes: `AccountBalance` avec `class: number` (Task 1), `FiscalYear` (types existants), `window.api.getFiscalYears()`, `window.api.getAccountBalances(id)`

- [ ] **Step 1 : Créer le fichier de tests**

Créer `app/src/__tests__/renderer/BalancesPage.test.tsx` :

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FiscalYear, AccountBalance } from '../../types';
import BalancesPage from '../../pages/BalancesPage';

const fy2025: FiscalYear = {
  id: 1, year: 2025,
  start_date: '2025-01-01', end_date: '2025-12-31',
  is_closed: false, created_at: '',
};
const fy2024: FiscalYear = {
  id: 2, year: 2024,
  start_date: '2024-01-01', end_date: '2024-12-31',
  is_closed: true, created_at: '',
};

const balancesFixture: AccountBalance[] = [
  { number: '100', name: 'Caisse',              class: 1, total_debit: 120000, total_credit: 80000, solde: 40000 },
  { number: '300', name: 'Cotisations membres', class: 3, total_debit: 0,      total_credit: 141000, solde: 141000 },
];

function mockApi(years: FiscalYear[] = [], balances: AccountBalance[] = []) {
  vi.stubGlobal('api', {
    getFiscalYears:     vi.fn().mockResolvedValue(years),
    getAccountBalances: vi.fn().mockResolvedValue(balances),
  });
}

beforeEach(() => mockApi());

describe('BalancesPage — affichage', () => {
  it('affiche le titre Soldes', () => {
    render(<BalancesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Soldes' })).toBeInTheDocument();
  });

  it('affiche le message vide sans exercice', async () => {
    render(<BalancesPage />);
    expect(await screen.findByText(/Aucun exercice disponible/)).toBeInTheDocument();
  });

  it('affiche le message vide sans mouvement', async () => {
    mockApi([fy2025], []);
    render(<BalancesPage />);
    expect(await screen.findByText(/Aucun mouvement pour cet exercice/)).toBeInTheDocument();
  });

  it('affiche le sélecteur d\'exercice quand des exercices existent', async () => {
    mockApi([fy2025], []);
    render(<BalancesPage />);
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('affiche les comptes groupés par classe', async () => {
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    expect(await screen.findByText('Classe 1 — Actifs')).toBeInTheDocument();
    expect(screen.getByText('Classe 3 — Produits')).toBeInTheDocument();
    expect(screen.getByText('Caisse')).toBeInTheDocument();
    expect(screen.getByText('Cotisations membres')).toBeInTheDocument();
  });

  it('affiche les sous-totaux par classe', async () => {
    mockApi([fy2025], balancesFixture);
    render(<BalancesPage />);
    await screen.findByText('Classe 1 — Actifs');
    // Sous-total classe 1 : débit 1200.00, solde 400.00
    // Ces valeurs apparaissent aussi sur la ligne Caisse → getAllByText
    expect(screen.getAllByText('1200.00')).toHaveLength(2); // ligne + sous-total
    expect(screen.getAllByText('400.00')).toHaveLength(2);
  });

  it('sélectionne automatiquement le premier exercice ouvert', async () => {
    mockApi([fy2024, fy2025], balancesFixture);
    render(<BalancesPage />);
    await waitFor(() => {
      // fy2025 (id=1) est ouvert → doit être sélectionné en priorité
      expect(window.api.getAccountBalances).toHaveBeenCalledWith(1);
    });
  });

  it('recharge les soldes au changement d\'exercice', async () => {
    const user = userEvent.setup();
    mockApi([fy2025, fy2024], balancesFixture);
    render(<BalancesPage />);
    await screen.findByText('Caisse');

    await user.selectOptions(screen.getByRole('combobox'), '2'); // value = id de fy2024
    await waitFor(() => {
      expect(window.api.getAccountBalances).toHaveBeenCalledWith(2);
    });
  });
});
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

```bash
cd app && npm test -- --reporter=verbose 2>&1 | grep -E "(FAIL|BalancesPage)"
```

Attendu : 8 tests FAIL car `BalancesPage` est un placeholder.

- [ ] **Step 3 : Implémenter `BalancesPage`**

Remplacer entièrement `app/src/pages/BalancesPage.tsx` :

```typescript
import { useEffect, useState } from 'react';
import type { FiscalYear, AccountBalance } from '../types';

const CLASS_LABELS: Record<number, string> = {
  1: 'Classe 1 — Actifs',
  2: 'Classe 2 — Passifs et fonds propres',
  3: 'Classe 3 — Produits',
  4: 'Classe 4 — Charges',
  9: 'Classe 9 — Clôture',
};

type BalanceGroup = {
  class: number;
  label: string;
  rows: AccountBalance[];
  totalDebit:  number;
  totalCredit: number;
  totalSolde:  number;
};

function groupBalances(balances: AccountBalance[]): BalanceGroup[] {
  const map = new Map<number, AccountBalance[]>();
  for (const b of balances) {
    const list = map.get(b.class) ?? [];
    list.push(b);
    map.set(b.class, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([cls, rows]) => ({
      class:       cls,
      label:       CLASS_LABELS[cls] ?? `Classe ${cls}`,
      rows,
      totalDebit:  rows.reduce((sum, r) => sum + r.total_debit,  0),
      totalCredit: rows.reduce((sum, r) => sum + r.total_credit, 0),
      totalSolde:  rows.reduce((sum, r) => sum + r.solde,        0),
    }));
}

function fmt(centimes: number): string {
  return (centimes / 100).toFixed(2);
}

export default function BalancesPage() {
  const [years,          setYears]          = useState<FiscalYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null);
  const [balances,       setBalances]       = useState<AccountBalance[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  useEffect(() => {
    window.api.getFiscalYears()
      .then(ys => {
        setYears(ys);
        const open = ys.find(y => !y.is_closed);
        if (open)          setSelectedYearId(open.id);
        else if (ys.length) setSelectedYearId(ys[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedYearId === null) return;
    setLoading(true);
    window.api.getAccountBalances(selectedYearId)
      .then(setBalances)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYearId]);

  const groups = groupBalances(balances);

  return (
    <div>
      <div style={s.header}>
        <h1 style={s.h1}>Soldes</h1>
        {years.length > 0 && (
          <div style={s.yearSelector}>
            <label htmlFor="year-select" style={s.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYearId ?? ''}
              onChange={e => setSelectedYearId(Number(e.target.value))}
              style={s.select}
            >
              {years.map(y => (
                <option key={y.id} value={y.id}>
                  {y.year}{y.is_closed ? ' (clôturé)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div role="alert" style={s.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p style={s.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : loading ? (
        <p style={s.empty}>Chargement…</p>
      ) : balances.length === 0 ? (
        <p style={s.empty}>Aucun mouvement pour cet exercice.</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr style={s.theadRow}>
              <th style={s.th}>N°</th>
              <th style={s.th}>Compte</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Débit CHF</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Crédit CHF</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Solde CHF</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <GroupRows key={group.class} group={group} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function GroupRows({ group }: { group: BalanceGroup }) {
  return (
    <>
      <tr style={s.groupRow}>
        <td colSpan={5} style={s.groupCell}>{group.label}</td>
      </tr>
      {group.rows.map(row => (
        <tr key={row.number} style={s.dataRow}>
          <td style={{ ...s.td, fontFamily: 'monospace' }}>{row.number}</td>
          <td style={s.td}>{row.name}</td>
          <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(row.total_debit)}</td>
          <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(row.total_credit)}</td>
          <td style={{ ...s.td, textAlign: 'right', fontFamily: 'monospace', color: row.solde < 0 ? '#dc2626' : 'inherit' }}>
            {fmt(row.solde)}
          </td>
        </tr>
      ))}
      <tr style={s.subtotalRow}>
        <td colSpan={2} style={{ ...s.subtotalCell, fontStyle: 'italic' }}>
          Sous-total {group.label}
        </td>
        <td style={{ ...s.subtotalCell, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(group.totalDebit)}</td>
        <td style={{ ...s.subtotalCell, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(group.totalCredit)}</td>
        <td style={{ ...s.subtotalCell, textAlign: 'right', fontFamily: 'monospace', color: group.totalSolde < 0 ? '#dc2626' : 'inherit' }}>
          {fmt(group.totalSolde)}
        </td>
      </tr>
    </>
  );
}

const s = {
  header:      { display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' as const },
  h1:          { margin: 0, fontSize: '1.5rem', color: '#0f172a' },
  yearSelector:{ display: 'flex', alignItems: 'center', gap: '0.5rem' },
  label:       { fontWeight: 500, fontSize: '0.875rem', color: '#475569' },
  select:      { border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.875rem', color: '#0f172a', background: '#fff' },
  error:       { background: '#fee2e2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' },
  empty:       { color: '#64748b', fontSize: '0.875rem' },
  table:       { borderCollapse: 'collapse' as const, width: '100%', fontSize: '0.875rem', background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.08)' },
  theadRow:    { background: '#f1f5f9' },
  th:          { textAlign: 'left' as const, padding: '0.6rem 1rem', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' },
  groupRow:    {},
  groupCell:   { padding: '0.5rem 1rem', fontWeight: 600, color: '#334155', background: '#f1f5f9', fontSize: '0.8rem', letterSpacing: '0.02em' },
  dataRow:     { borderBottom: '1px solid #f1f5f9' },
  td:          { padding: '0.4rem 1rem', color: '#334155' },
  subtotalRow: {},
  subtotalCell:{ padding: '0.45rem 1rem', color: '#334155', background: '#e2e8f0', borderTop: '1px solid #cbd5e1' },
} as const;
```

- [ ] **Step 4 : Lancer les tests**

```bash
cd app && npm test
```

Attendu : tous les tests passent. Compter le total — il devrait être **93 tests** (85 existants + 1 test DB + 8 tests BalancesPage, -1 le placeholder qui n'existe plus = net +8 = 93).

- [ ] **Step 5 : Commit**

```bash
git add app/src/pages/BalancesPage.tsx app/src/__tests__/renderer/BalancesPage.test.tsx
git commit -m "feat: implémenter la vue des soldes par compte groupés par classe (BalancesPage)"
```

---

## Self-Review

**Spec coverage :**
- ✅ Seulement comptes avec mouvements → JOIN dans SQL (déjà le cas)
- ✅ Groupés par classe → `groupBalances()` + `CLASS_LABELS`
- ✅ Colonnes : N° / Nom / Débit CHF / Crédit CHF / Solde CHF → table à 5 colonnes
- ✅ En-têtes de groupe + sous-totaux → `GroupRows` extrait en composant pour éviter le problème de `key` sur Fragment
- ✅ Sélecteur d'exercice avec auto-sélection du premier ouvert
- ✅ Solde négatif en rouge
- ✅ 8 tests couvrant les cas spécifiés dans le spec

**Placeholder scan :** Aucun TBD/TODO.

**Type consistency :** `AccountBalance.class` défini en Task 1, consommé en Task 2. `BalanceGroup` défini et utilisé dans le même fichier. `fmt()` cohérent avec `formatCHF()` des autres pages (même formule).
