# CSS Modules Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer tous les objets de styles inline (`const s = { ... }` / `const styles = { ... }`) par des fichiers CSS Modules (`.module.css`) dans chaque composant et page React.

**Architecture:** Un fichier `.module.css` par composant/page, colocalisé dans le même dossier. Vite gère les CSS Modules nativement sans configuration supplémentaire. Les styles dynamiques qui dépendent de valeurs runtime (ex. couleur rouge si solde négatif) restent en inline style. Les classes conditionnelles utilisent des template literals.

**Tech Stack:** Vite (CSS Modules natif), React, TypeScript. Pas de nouvelle dépendance.

## Global Constraints

- Vite v5 — CSS Modules natifs : `import styles from './Foo.module.css'` → `styles.nomDeClasse`
- Les classes CSS Modules s'utilisent comme `className={styles.btn}`, jamais `style={}`
- Les styles conditionnels : `className={`${styles.btn}${disabled ? ` ${styles.btnOff}` : ''}`}`
- Les styles vraiment dynamiques (valeur calculée à runtime) restent en `style={{}}`
- Pas de bibliothèque `clsx` — template literals suffisent pour ce projet
- Les `as const` TypeScript sur `flexDirection`, `textAlign` etc. disparaissent en CSS (propriétés natives)
- La suite de tests (318 tests) doit rester verte après chaque tâche — les tests ne vérifient pas les classes CSS
- Un commit par tâche
- Ne pas créer de fichier de styles partagés — un `.module.css` par composant (YAGNI)

---

### Task 1 : ConfirmDialog + EntryFormModal + JournalFilters

Trois petits composants sans styles conditionnels complexes. Bonne introduction au pattern.

**Files:**
- Create: `app/src/components/ConfirmDialog.module.css`
- Modify: `app/src/components/ConfirmDialog.tsx`
- Create: `app/src/components/EntryFormModal.module.css`
- Modify: `app/src/components/EntryFormModal.tsx`
- Create: `app/src/components/JournalFilters.module.css`
- Modify: `app/src/components/JournalFilters.tsx`

- [ ] **Step 1 : Créer `ConfirmDialog.module.css`**

```css
/* app/src/components/ConfirmDialog.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.card {
  background: #fff;
  border-radius: 10px;
  padding: 1.5rem;
  min-width: 320px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.message {
  margin: 0 0 1.25rem;
  font-size: 0.95rem;
  color: #334155;
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.cancelBtn {
  padding: 0.45rem 1rem;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #475569;
}

.confirmBtn {
  padding: 0.45rem 1rem;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}
```

- [ ] **Step 2 : Mettre à jour `ConfirmDialog.tsx`**

```tsx
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className={styles.overlay} data-testid="confirm-overlay">
      <div className={styles.card} role="alertdialog" aria-modal="true" aria-describedby="confirm-message">
        <p id="confirm-message" className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button onClick={onCancel}  className={styles.cancelBtn}>Annuler</button>
          <button onClick={onConfirm} className={styles.confirmBtn}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Créer `EntryFormModal.module.css`**

```css
/* app/src/components/EntryFormModal.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.card {
  background: #fff;
  border-radius: 12px;
  width: 720px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  position: relative;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0;
}

.h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: #0f172a;
}

.closeBtn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #64748b;
  line-height: 1;
  padding: 0.25rem 0.5rem;
}
```

- [ ] **Step 4 : Mettre à jour `EntryFormModal.tsx`**

```tsx
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import EntryForm from './EntryForm';
import styles from './EntryFormModal.module.css';

interface EntryFormModalProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  editEntry?: JournalEntry & { lines: JournalEntryLine[] };
  onSaved:    () => void;
  onClose:    () => void;
}

export default function EntryFormModal({ fiscalYear, accounts, editEntry, onSaved, onClose }: EntryFormModalProps) {
  const title = editEntry
    ? `Modifier l'écriture — exercice ${fiscalYear.year}`
    : `Nouvelle écriture — exercice ${fiscalYear.year}`;

  return (
    <div className={styles.overlay} data-testid="modal-overlay">
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className={styles.header}>
          <h2 id="modal-title" className={styles.h2}>{title}</h2>
          <button onClick={onClose} className={styles.closeBtn} aria-label="Fermer">✕</button>
        </div>
        <EntryForm
          fiscalYear={fiscalYear}
          accounts={accounts}
          editEntry={editEntry}
          hideTitle
          onCreated={onSaved}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5 : Créer `JournalFilters.module.css`**

```css
/* app/src/components/JournalFilters.module.css */
.bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  color: #0f172a;
  background: #fff;
  min-width: 180px;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: #64748b;
}

.dateInput {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.8rem;
  color: #0f172a;
  background: #fff;
}

.resetBtn {
  padding: 0.35rem 0.75rem;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  color: #64748b;
  white-space: nowrap;
}
```

- [ ] **Step 6 : Mettre à jour `JournalFilters.tsx`**

```tsx
import type { Account, JournalFilters as Filters } from '../types';
import { DEFAULT_FILTERS } from '../types';
import styles from './JournalFilters.module.css';

interface JournalFiltersProps {
  filters:   Filters;
  accounts:  Account[];
  onChange:  (filters: Filters) => void;
}

export default function JournalFilters({ filters, accounts, onChange }: JournalFiltersProps) {
  return (
    <div className={styles.bar}>
      <input
        type="text"
        value={filters.text}
        onChange={e => onChange({ ...filters, text: e.target.value })}
        placeholder="Rechercher dans le libellé ou la pièce…"
        aria-label="Recherche dans le libellé ou la pièce"
        className={styles.input}
      />
      <select
        value={filters.accountId ?? ''}
        onChange={e => onChange({ ...filters, accountId: e.target.value ? Number(e.target.value) : null })}
        aria-label="Filtrer par compte"
        className={styles.input}
      >
        <option value="">Tous les comptes</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.number} — {a.name}</option>
        ))}
      </select>
      <label className={styles.label}>
        Date de début
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange({ ...filters, dateFrom: e.target.value })}
          className={styles.dateInput}
        />
      </label>
      <label className={styles.label}>
        Date de fin
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange({ ...filters, dateTo: e.target.value })}
          className={styles.dateInput}
        />
      </label>
      <button onClick={() => onChange(DEFAULT_FILTERS)} className={styles.resetBtn}>
        Réinitialiser
      </button>
    </div>
  );
}
```

- [ ] **Step 7 : Vérifier que les 318 tests passent**

```
cd app && npm test
```
Attendu : `Tests  318 passed (318)`

- [ ] **Step 8 : Commit**

```bash
git add app/src/components/ConfirmDialog.tsx app/src/components/ConfirmDialog.module.css \
        app/src/components/EntryFormModal.tsx app/src/components/EntryFormModal.module.css \
        app/src/components/JournalFilters.tsx app/src/components/JournalFilters.module.css
git commit -m "refactor(styles): ConfirmDialog + EntryFormModal + JournalFilters → CSS Modules"
```

---

### Task 2 : Layout + Sidebar

La coquille de navigation. Sidebar a un cas de classe conditionnelle (lien actif).

**Files:**
- Create: `app/src/components/Layout.module.css`
- Modify: `app/src/components/Layout.tsx`
- Create: `app/src/components/Sidebar.module.css`
- Modify: `app/src/components/Sidebar.tsx`

- [ ] **Step 1 : Créer `Layout.module.css`**

```css
/* app/src/components/Layout.module.css */
.shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main {
  flex: 1;
  overflow: auto;
  padding: 2rem;
  background: #f8fafc;
}
```

- [ ] **Step 2 : Mettre à jour `Layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import type { Page } from '../App';
import Sidebar from './Sidebar';
import styles from './Layout.module.css';

interface LayoutProps {
  currentPage: Page;
  onNavigate:  (page: Page) => void;
  children:    ReactNode;
}

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  return (
    <div className={styles.shell}>
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 3 : Créer `Sidebar.module.css`**

Le sélecteur `:hover` et `[aria-current="page"]` remplacent avantageusement les styles JS conditionnels.

```css
/* app/src/components/Sidebar.module.css */
.nav {
  width: 210px;
  flex-shrink: 0;
  background: #1e293b;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.brand {
  padding: 1.25rem 1rem;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
  border-bottom: 1px solid #334155;
  color: #f1f5f9;
}

.list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
}

.btn {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.65rem 1rem;
  background: transparent;
  color: #94a3b8;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn:hover {
  background: #253347;
  color: #cbd5e1;
}

.btn[aria-current="page"] {
  background: #334155;
  color: #93c5fd;
  border-left-color: #3b82f6;
}
```

- [ ] **Step 4 : Mettre à jour `Sidebar.tsx`**

Les classes conditionnelles disparaissent : `aria-current` suffit, le CSS fait le reste.

```tsx
import type { Page } from '../App';
import styles from './Sidebar.module.css';

const NAV_ITEMS: Array<{ id: Page; label: string }> = [
  { id: 'accounts',     label: 'Plan comptable' },
  { id: 'journal',      label: 'Journal'        },
  { id: 'fiscal-years', label: 'Exercices'      },
  { id: 'balances',     label: 'Soldes'         },
  { id: 'settings',     label: 'Paramètres'     },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <nav aria-label="Navigation principale" className={styles.nav}>
      <div className={styles.brand}>MCY Compta</div>
      <ul className={styles.list}>
        {NAV_ITEMS.map(item => (
          <li key={item.id}>
            <button
              onClick={() => onNavigate(item.id)}
              aria-current={currentPage === item.id ? 'page' : undefined}
              className={styles.btn}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 5 : Vérifier les 318 tests**

```
cd app && npm test
```
Attendu : `Tests  318 passed (318)`

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/Layout.tsx app/src/components/Layout.module.css \
        app/src/components/Sidebar.tsx app/src/components/Sidebar.module.css
git commit -m "refactor(styles): Layout + Sidebar → CSS Modules (bonus: :hover natif sur les boutons nav)"
```

---

### Task 3 : WelcomePage + AccountsPage

Deux pages sans styles conditionnels complexes.

**Files:**
- Create: `app/src/pages/WelcomePage.module.css`
- Modify: `app/src/pages/WelcomePage.tsx`
- Create: `app/src/pages/AccountsPage.module.css`
- Modify: `app/src/pages/AccountsPage.tsx`

- [ ] **Step 1 : Créer `WelcomePage.module.css`**

```css
/* app/src/pages/WelcomePage.module.css */
.container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f8fafc;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 2.5rem;
  max-width: 500px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.h1 {
  margin: 0 0 1rem;
  font-size: 1.5rem;
  color: #0f172a;
  font-weight: 700;
}

.desc {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  color: #334155;
}

.hint {
  margin: 0 0 1.5rem;
  font-size: 0.825rem;
  color: #64748b;
  font-style: italic;
}

.alert {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.btn {
  padding: 0.6rem 1.5rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  font-weight: 600;
}

.btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}
```

- [ ] **Step 2 : Mettre à jour `WelcomePage.tsx`**

```tsx
import { useState } from 'react';
import styles from './WelcomePage.module.css';

interface WelcomePageProps {
  onReady: () => void;
}

export default function WelcomePage({ onReady }: WelcomePageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleChoose() {
    setLoading(true);
    setError(null);
    try {
      const chosen = await window.api.chooseDataDir();
      if (chosen) onReady();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.h1}>Bienvenue dans MCY Compta</h1>
        <p className={styles.desc}>
          Choisissez l&apos;emplacement où sera stockée votre base de données.
        </p>
        <p className={styles.hint}>
          Conseil : placez ce dossier dans OneDrive ou un dossier synchronisé
          pour une protection cloud automatique.
        </p>
        {error && <div role="alert" className={styles.alert}>Erreur : {error}</div>}
        <button onClick={handleChoose} disabled={loading} className={styles.btn}>
          {loading ? 'Ouverture…' : 'Choisir le dossier de données'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Créer `AccountsPage.module.css`**

```css
/* app/src/pages/AccountsPage.module.css */
.heading {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  color: #0f172a;
}

.subtitle {
  margin: 0 0 1.25rem;
  color: #64748b;
  font-size: 0.875rem;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  color: #dc2626;
}

.table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.theadRow {
  background: #f1f5f9;
}

.th {
  text-align: left;
  padding: 0.65rem 1rem;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.row {
  border-bottom: 1px solid #f1f5f9;
}

.td {
  padding: 0.5rem 1rem;
  color: #334155;
}

.badge {
  font-size: 0.75rem;
  color: #64748b;
}
```

- [ ] **Step 4 : Mettre à jour `AccountsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { Account } from '../types';
import styles from './AccountsPage.module.css';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    window.api.getAccounts()
      .then(setAccounts)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className={styles.heading}>Plan comptable</h1>

      {error && <div className={styles.error}>Erreur : {error}</div>}

      <p className={styles.subtitle}>{accounts.length} comptes</p>

      <table className={styles.table}>
        <thead>
          <tr className={styles.theadRow}>
            <th className={styles.th}>N°</th>
            <th className={styles.th}>Intitulé</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id} className={styles.row}>
              <td className={styles.td}><code>{a.number}</code></td>
              <td className={styles.td}>{a.name}</td>
              <td className={styles.td}><span className={styles.badge}>{a.type}</span></td>
              <td className={styles.td}><span className={styles.badge}>{a.normal_balance}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5 : Vérifier les 318 tests**

```
cd app && npm test
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/pages/WelcomePage.tsx app/src/pages/WelcomePage.module.css \
        app/src/pages/AccountsPage.tsx app/src/pages/AccountsPage.module.css
git commit -m "refactor(styles): WelcomePage + AccountsPage → CSS Modules"
```

---

### Task 4 : BalancesPage + JournalPage

Ces deux pages ont des styles conditionnels dynamiques (couleur selon valeur) qui restent en `style={{}}`.

**Files:**
- Create: `app/src/pages/BalancesPage.module.css`
- Modify: `app/src/pages/BalancesPage.tsx`
- Create: `app/src/pages/JournalPage.module.css`
- Modify: `app/src/pages/JournalPage.tsx`

- [ ] **Step 1 : Créer `BalancesPage.module.css`**

```css
/* app/src/pages/BalancesPage.module.css */
.header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #0f172a;
}

.yearSelector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.label {
  font-weight: 500;
  font-size: 0.875rem;
  color: #475569;
}

.select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.875rem;
  color: #0f172a;
  background: #fff;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.empty {
  color: #64748b;
  font-size: 0.875rem;
}

.table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.theadRow {
  background: #f1f5f9;
}

.th {
  text-align: left;
  padding: 0.6rem 1rem;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.thRight {
  text-align: right;
}

.groupRow {
  /* intentionally empty — group header row uses .groupCell */
}

.groupCell {
  padding: 0.5rem 1rem;
  font-weight: 600;
  color: #334155;
  background: #f1f5f9;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}

.dataRow {
  border-bottom: 1px solid #f1f5f9;
}

.td {
  padding: 0.4rem 1rem;
  color: #334155;
}

.tdMono {
  font-family: monospace;
}

.tdRight {
  text-align: right;
  font-family: monospace;
}

.subtotalRow {
  /* intentionally empty */
}

.subtotalCell {
  padding: 0.45rem 1rem;
  color: #334155;
  background: #e2e8f0;
  border-top: 1px solid #cbd5e1;
}

.subtotalCellRight {
  text-align: right;
  font-family: monospace;
}

.subtotalCellItalic {
  font-style: italic;
}
```

- [ ] **Step 2 : Mettre à jour `BalancesPage.tsx`**

Note : `color: row.solde < 0 ? '#dc2626' : 'inherit'` reste en `style={{}}` car c'est une valeur dynamique.

```tsx
import { useEffect, useState } from 'react';
import type { FiscalYear, AccountBalance } from '../types';
import styles from './BalancesPage.module.css';

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
        if (open)           setSelectedYearId(open.id);
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
      <div className={styles.header}>
        <h1 className={styles.h1}>Soldes</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="year-select" className={styles.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYearId ?? ''}
              onChange={e => setSelectedYearId(Number(e.target.value))}
              className={styles.select}
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

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p className={styles.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : loading ? (
        <p className={styles.empty}>Chargement…</p>
      ) : balances.length === 0 ? (
        <p className={styles.empty}>Aucun mouvement pour cet exercice.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr className={styles.theadRow}>
              <th className={styles.th}>N°</th>
              <th className={styles.th}>Compte</th>
              <th className={`${styles.th} ${styles.thRight}`}>Débit CHF</th>
              <th className={`${styles.th} ${styles.thRight}`}>Crédit CHF</th>
              <th className={`${styles.th} ${styles.thRight}`}>Solde CHF</th>
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
      <tr className={styles.groupRow}>
        <td colSpan={5} className={styles.groupCell}>{group.label}</td>
      </tr>
      {group.rows.map(row => (
        <tr key={row.number} className={styles.dataRow}>
          <td className={`${styles.td} ${styles.tdMono}`}>{row.number}</td>
          <td className={styles.td}>{row.name}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.total_debit)}</td>
          <td className={`${styles.td} ${styles.tdRight}`}>{fmt(row.total_credit)}</td>
          <td className={`${styles.td} ${styles.tdRight}`} style={{ color: row.solde < 0 ? '#dc2626' : 'inherit' }}>
            {fmt(row.solde)}
          </td>
        </tr>
      ))}
      <tr className={styles.subtotalRow}>
        <td colSpan={2} className={`${styles.subtotalCell} ${styles.subtotalCellItalic}`}>
          Sous-total {group.label}
        </td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`}>{fmt(group.totalDebit)}</td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`}>{fmt(group.totalCredit)}</td>
        <td className={`${styles.subtotalCell} ${styles.subtotalCellRight}`} style={{ color: group.totalSolde < 0 ? '#dc2626' : 'inherit' }}>
          {fmt(group.totalSolde)}
        </td>
      </tr>
    </>
  );
}
```

- [ ] **Step 3 : Créer `JournalPage.module.css`**

```css
/* app/src/pages/JournalPage.module.css */
.header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #0f172a;
}

.yearSelector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.label {
  font-weight: 500;
  font-size: 0.875rem;
  color: #475569;
}

.select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.875rem;
  color: #0f172a;
  background: #fff;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.empty {
  color: #64748b;
  font-size: 0.875rem;
}

.btn {
  padding: 0.45rem 1rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.theadRow {
  background: #f1f5f9;
}

.th {
  text-align: left;
  padding: 0.6rem 1rem;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.thRight {
  text-align: right;
}

.row {
  border-bottom: 1px solid #f1f5f9;
}

.td {
  padding: 0.4rem 1rem;
  color: #334155;
}

.tdRight {
  text-align: right;
  font-family: monospace;
}

.acctLabel {
  color: #94a3b8;
  font-size: 0.75rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.actionBtn {
  padding: 0.2rem 0.5rem;
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.75rem;
  color: #475569;
}

.actionBtnDelete {
  color: #dc2626;
}
```

- [ ] **Step 4 : Mettre à jour `JournalPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { FiscalYear, Account, JournalFilters } from '../types';
import { DEFAULT_FILTERS } from '../types';
import { applyFilters } from '../lib/journalFilters';
import type { EntryWithLines } from '../lib/journalFilters';
import JournalFiltersBar from '../components/JournalFilters';
import EntryFormModal from '../components/EntryFormModal';
import ConfirmDialog from '../components/ConfirmDialog';
import styles from './JournalPage.module.css';

type ModalState =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; entry: EntryWithLines };

export default function JournalPage() {
  const [years,        setYears]        = useState<FiscalYear[]>([]);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [entries,      setEntries]      = useState<EntryWithLines[]>([]);
  const [filters,      setFilters]      = useState<JournalFilters>(DEFAULT_FILTERS);
  const [modal,        setModal]        = useState<ModalState>(null);
  const [confirmEntry, setConfirmEntry] = useState<EntryWithLines | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      window.api.getFiscalYears(),
      window.api.getActiveAccounts(),
    ]).then(([ys, accs]) => {
      setYears(ys);
      setAccounts(accs);
      const open = ys.find(y => !y.is_closed) ?? ys[0];
      if (open) setSelectedYear(open.year);
    }).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    const fy = years.find(y => y.year === selectedYear);
    if (!fy) return;
    window.api.getJournalEntries(fy.id)
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, [selectedYear, years]);

  async function reloadEntries() {
    const fy = years.find(y => y.year === selectedYear);
    if (!fy) return;
    try {
      setEntries(await window.api.getJournalEntries(fy.id));
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmEntry) return;
    try {
      await window.api.deleteJournalEntry(confirmEntry.id);
      setConfirmEntry(null);
      await reloadEntries();
    } catch (e: unknown) {
      setError((e as Error).message);
      setConfirmEntry(null);
    }
  }

  const currentFiscalYear = years.find(y => y.year === selectedYear);
  const filtered = applyFilters(entries, filters);

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.h1}>Journal</h1>
        {years.length > 0 && (
          <div className={styles.yearSelector}>
            <label htmlFor="year-select" className={styles.label}>Exercice</label>
            <select
              id="year-select"
              value={selectedYear ?? ''}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className={styles.select}
            >
              {years.map(y => (
                <option key={y.id} value={y.year}>
                  {y.year}{y.is_closed ? ' (clôturé)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      {years.length === 0 ? (
        <p className={styles.empty}>Aucun exercice disponible. Créez-en un dans la section <strong>Exercices</strong>.</p>
      ) : (
        <>
          {!currentFiscalYear?.is_closed && (
            <div style={{ marginBottom: '1rem' }}>
              <button onClick={() => setModal({ mode: 'create' })} className={styles.btn}>
                + Nouvelle écriture
              </button>
            </div>
          )}

          {entries.length > 0 && (
            <JournalFiltersBar filters={filters} accounts={accounts} onChange={setFilters} />
          )}

          {filtered.length === 0 ? (
            <p className={styles.empty}>{entries.length === 0 ? 'Aucune écriture pour cet exercice.' : 'Aucune écriture ne correspond aux filtres.'}</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr className={styles.theadRow}>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Libellé</th>
                  <th className={styles.th}>Pièce</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Débit</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Crédit</th>
                  {!currentFiscalYear?.is_closed && <th className={styles.th} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry =>
                  entry.lines.map((line, i) => {
                    const acc = accounts.find(a => a.id === line.account_id);
                    return (
                      <tr key={`${entry.id}-${line.id}`} className={styles.row}>
                        <td className={styles.td}>{i === 0 ? formatDate(entry.date) : ''}</td>
                        <td className={styles.td}>{i === 0 ? entry.description : ''}</td>
                        <td className={styles.td}>{i === 0 ? (entry.piece ?? '') : ''}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.debit != null ? formatCHF(line.debit) : ''}
                          {line.debit != null && acc ? <span className={styles.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {line.credit != null ? formatCHF(line.credit) : ''}
                          {line.credit != null && acc ? <span className={styles.acctLabel}> {acc.number}</span> : ''}
                        </td>
                        {!currentFiscalYear?.is_closed && (
                          <td className={styles.td}>
                            {i === 0 && (
                              <div className={styles.actions}>
                                <button
                                  onClick={() => setModal({ mode: 'edit', entry })}
                                  className={styles.actionBtn}
                                  aria-label="Modifier"
                                >
                                  Modifier
                                </button>
                                <button
                                  onClick={() => setConfirmEntry(entry)}
                                  className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                                  aria-label="Supprimer"
                                >
                                  Supprimer
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </>
      )}

      {modal !== null && currentFiscalYear && (
        <EntryFormModal
          fiscalYear={currentFiscalYear}
          accounts={accounts}
          editEntry={modal.mode === 'edit' ? modal.entry : undefined}
          onSaved={async () => { setModal(null); await reloadEntries(); }}
          onClose={() => setModal(null)}
        />
      )}

      {confirmEntry && (
        <ConfirmDialog
          message={`Supprimer l'écriture "${confirmEntry.description}" ? Cette action est irréversible.`}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmEntry(null)}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function formatCHF(centimes: number): string {
  return (centimes / 100).toFixed(2);
}
```

- [ ] **Step 5 : Vérifier les 318 tests**

```
cd app && npm test
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/pages/BalancesPage.tsx app/src/pages/BalancesPage.module.css \
        app/src/pages/JournalPage.tsx app/src/pages/JournalPage.module.css
git commit -m "refactor(styles): BalancesPage + JournalPage → CSS Modules"
```

---

### Task 5 : FiscalYearsPage + SettingsPage

Les deux pages les plus chargées. FiscalYearsPage a des badges conditionnels, SettingsPage a des états de statut.

**Files:**
- Create: `app/src/pages/FiscalYearsPage.module.css`
- Modify: `app/src/pages/FiscalYearsPage.tsx`
- Create: `app/src/pages/SettingsPage.module.css`
- Modify: `app/src/pages/SettingsPage.tsx`

- [ ] **Step 1 : Créer `FiscalYearsPage.module.css`**

```css
/* app/src/pages/FiscalYearsPage.module.css */
.h1 {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  color: #0f172a;
}

.h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
}

.section {
  margin-bottom: 2rem;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.form {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.label {
  font-weight: 500;
  font-size: 0.875rem;
  color: #475569;
}

.input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  font-size: 0.875rem;
  width: 90px;
  color: #0f172a;
}

.warn {
  font-size: 0.8rem;
  color: #d97706;
}

.btn {
  padding: 0.45rem 1rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.btnSmall {
  padding: 0.25rem 0.6rem;
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 5px;
  font-size: 0.78rem;
  cursor: pointer;
}

.btnReopen {
  padding: 0.25rem 0.6rem;
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
  border-radius: 5px;
  font-size: 0.78rem;
  cursor: pointer;
}

.btnExport {
  padding: 0.25rem 0.6rem;
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
  border-radius: 5px;
  font-size: 0.78rem;
  cursor: pointer;
}

.exportSuccess {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #15803d;
}

.empty {
  color: #64748b;
  font-size: 0.875rem;
}

.table {
  border-collapse: collapse;
  width: 100%;
  max-width: 760px;
  font-size: 0.875rem;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.theadRow {
  background: #f1f5f9;
}

.th {
  text-align: left;
  padding: 0.6rem 1rem;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.row {
  border-bottom: 1px solid #f1f5f9;
}

.td {
  padding: 0.5rem 1rem;
  color: #334155;
}

.tdBold {
  font-weight: 600;
}

.badgeOpen {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: #dcfce7;
  color: #15803d;
  font-size: 0.75rem;
  font-weight: 500;
}

.badgeClosed {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 500;
}

.badgeOb {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background: #dcfce7;
  color: #15803d;
  font-size: 0.75rem;
  font-weight: 500;
}
```

- [ ] **Step 2 : Mettre à jour `FiscalYearsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { FiscalYear, OpeningBalanceSuggestion, ClosingPreview } from '../types';
import OpeningBalanceModal from '../components/OpeningBalanceModal';
import ClosingModal from '../components/ClosingModal';
import ConfirmDialog from '../components/ConfirmDialog';
import styles from './FiscalYearsPage.module.css';

export default function FiscalYearsPage() {
  const [years,    setYears]    = useState<FiscalYear[]>([]);
  const [newYear,  setNewYear]  = useState<number>(new Date().getFullYear());
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const [modalFiscalYear, setModalFiscalYear] = useState<{ id: number; year: number } | null>(null);
  const [suggestions,     setSuggestions]     = useState<OpeningBalanceSuggestion[]>([]);
  const [closingModal,  setClosingModal]  = useState<{ id: number; year: number; preview: ClosingPreview } | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<{ id: number; year: number } | null>(null);
  const [exportStatus,  setExportStatus]  = useState<{ id: number; msg: string } | null>(null);

  useEffect(() => { load(); }, []);

  async function load(): Promise<FiscalYear[]> {
    try {
      const data = await window.api.getFiscalYears();
      setYears(data);
      return data;
    } catch (e: unknown) {
      setError((e as Error).message);
      return [];
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await window.api.createFiscalYear(newYear);
      const updatedYears = await load();
      setNewYear(n => n + 1);

      const prevYear = updatedYears.find(y => y.year === newYear - 1);
      if (prevYear) {
        const sugg = await window.api.getOpeningBalanceSuggestions(created.id);
        setSuggestions(sugg);
        setModalFiscalYear({ id: created.id, year: newYear });
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenModal(y: FiscalYear) {
    try {
      const sugg = await window.api.getOpeningBalanceSuggestions(y.id);
      setSuggestions(sugg);
      setModalFiscalYear({ id: y.id, year: y.year });
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  function handleModalClose() {
    setModalFiscalYear(null);
    setSuggestions([]);
  }

  function handleModalSuccess() {
    setModalFiscalYear(null);
    setSuggestions([]);
    load();
  }

  async function handleCloseExercise(y: FiscalYear) {
    try {
      const preview = await window.api.getClosingPreview(y.id);
      setClosingModal({ id: y.id, year: y.year, preview });
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  function handleReopenClick(y: FiscalYear) {
    setConfirmReopen({ id: y.id, year: y.year });
  }

  async function handleReopenConfirm() {
    if (!confirmReopen) return;
    try {
      await window.api.reopenFiscalYear(confirmReopen.id);
      setConfirmReopen(null);
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
      setConfirmReopen(null);
    }
  }

  function handleClosingSuccess() {
    setClosingModal(null);
    load();
  }

  async function handleExportExcel(y: FiscalYear) {
    setExportStatus(null);
    try {
      const result = await window.api.exportExcel(y.id);
      if (result && 'path' in result) {
        setExportStatus({ id: y.id, msg: `Fichier exporté : ${result.path}` });
      } else if (result && 'error' in result) {
        setError(result.error);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  const yearAlreadyExists = years.some(y => y.year === newYear);

  return (
    <div>
      <h1 className={styles.h1}>Exercices</h1>

      {error && <div role="alert" className={styles.error}>Erreur : {error}</div>}

      <section className={styles.section}>
        <h2 className={styles.h2}>Créer un exercice</h2>
        <form onSubmit={handleCreate} className={styles.form}>
          <label htmlFor="year-input" className={styles.label}>Année</label>
          <input
            id="year-input"
            type="number"
            value={newYear}
            onChange={e => setNewYear(Number(e.target.value))}
            min={2000}
            max={2100}
            className={styles.input}
          />
          {yearAlreadyExists && (
            <span className={styles.warn}>L'exercice {newYear} existe déjà</span>
          )}
          <button
            type="submit"
            disabled={creating || yearAlreadyExists}
            className={styles.btn}
          >
            {creating ? 'Création…' : `Créer l'exercice ${newYear}`}
          </button>
        </form>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Exercices enregistrés</h2>
        {years.length === 0 ? (
          <p className={styles.empty}>Aucun exercice créé pour l'instant.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={styles.th}>Année</th>
                <th className={styles.th}>Début</th>
                <th className={styles.th}>Fin</th>
                <th className={styles.th}>Statut</th>
                <th className={styles.th}>Soldes à nouveau</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => (
                <tr key={y.id} className={styles.row}>
                  <td className={`${styles.td} ${styles.tdBold}`}>{y.year}</td>
                  <td className={styles.td}>{formatDate(y.start_date)}</td>
                  <td className={styles.td}>{formatDate(y.end_date)}</td>
                  <td className={styles.td}>
                    <span className={y.is_closed ? styles.badgeClosed : styles.badgeOpen}>
                      {y.is_closed ? 'Clôturé' : 'Ouvert'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    {y.hasOpeningBalance ? (
                      <span className={styles.badgeOb}>Saisis</span>
                    ) : !y.is_closed ? (
                      <button onClick={() => handleOpenModal(y)} className={styles.btnSmall}>
                        Saisir les soldes à nouveau
                      </button>
                    ) : null}
                  </td>
                  <td className={styles.td}>
                    {!y.is_closed ? (
                      <button onClick={() => handleCloseExercise(y)} className={styles.btnSmall}>
                        Clôturer l&apos;exercice
                      </button>
                    ) : (
                      <button onClick={() => handleReopenClick(y)} className={styles.btnReopen}>
                        Rouvrir
                      </button>
                    )}
                    {' '}
                    <button onClick={() => handleExportExcel(y)} className={styles.btnExport}>
                      Exporter Excel
                    </button>
                    {exportStatus?.id === y.id && (
                      <p role="status" className={styles.exportSuccess}>{exportStatus.msg}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modalFiscalYear && (
        <OpeningBalanceModal
          fiscalYearId={modalFiscalYear.id}
          year={modalFiscalYear.year}
          suggestions={suggestions}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
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
    </div>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
```

- [ ] **Step 3 : Créer `SettingsPage.module.css`**

```css
/* app/src/pages/SettingsPage.module.css */
.h1 {
  margin: 0 0 1.5rem;
  font-size: 1.5rem;
  color: #0f172a;
}

.h2 {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
}

.h3 {
  margin: 1.25rem 0 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
}

.section {
  margin-bottom: 2rem;
  max-width: 640px;
}

.alertError {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.75rem;
  border-radius: 6px;
  margin-bottom: 1.25rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.dbPathInput {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #475569;
  background: #f8fafc;
  box-sizing: border-box;
}

.hint {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

.btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}

.btn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.btnSecondary {
  margin-top: 0.5rem;
  padding: 0.4rem 0.9rem;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
}

.success {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: #16a34a;
}

.errorText {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: #dc2626;
}

.empty {
  color: #64748b;
  font-size: 0.875rem;
}

.table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.theadRow {
  background: #f1f5f9;
}

.th {
  text-align: left;
  padding: 0.6rem 1rem;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.thRight {
  text-align: right;
}

.dataRow {
  border-bottom: 1px solid #f1f5f9;
}

.td {
  padding: 0.4rem 1rem;
  color: #334155;
}

.tdRight {
  text-align: right;
  font-family: monospace;
}

.excelRow {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.excelLabel {
  font-weight: 500;
  font-size: 0.875rem;
  color: #475569;
}

.excelSelect {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  font-size: 0.875rem;
}
```

- [ ] **Step 4 : Mettre à jour `SettingsPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { BackupInfo, FiscalYear } from '../types';
import styles from './SettingsPage.module.css';

type ExportStatus = 'idle' | 'loading' | 'success' | 'error' | 'cancelled';
type ChangeStatus = 'idle' | 'loading' | 'success' | 'cancelled';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SettingsPage() {
  const [dbPath,       setDbPath]       = useState<string>('');
  const [backups,      setBackups]      = useState<BackupInfo[]>([]);
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle');
  const [exportPath,   setExportPath]   = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [changeStatus, setChangeStatus] = useState<ChangeStatus>('idle');
  const [fiscalYears,  setFiscalYears]  = useState<FiscalYear[]>([]);
  const [selectedFyId, setSelectedFyId] = useState<number | null>(null);
  const [excelStatus,  setExcelStatus]  = useState<'idle' | 'loading' | 'success' | 'error' | 'cancelled'>('idle');
  const [excelPath,    setExcelPath]    = useState<string | null>(null);

  useEffect(() => {
    window.api.getDbPath()
      .then(setDbPath)
      .catch((e: Error) => setError(e.message));
    window.api.listBackups()
      .then(setBackups)
      .catch((e: Error) => setError(e.message));
    window.api.getFiscalYears()
      .then(years => {
        setFiscalYears(years);
        if (years.length > 0) setSelectedFyId(years[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function handleExport() {
    setExportStatus('loading');
    setExportPath(null);
    try {
      const result = await window.api.exportBackup();
      if (result === null) {
        setExportStatus('cancelled');
      } else {
        setExportStatus('success');
        setExportPath(result.path);
      }
    } catch (e) {
      setExportStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleChangePath() {
    setChangeStatus('loading');
    try {
      const result = await window.api.changeDataDir();
      if (result === null) {
        setChangeStatus('cancelled');
      } else {
        setChangeStatus('success');
        const newPath = await window.api.getDbPath();
        setDbPath(newPath);
      }
    } catch (e) {
      setChangeStatus('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleExcelExport() {
    if (selectedFyId === null) return;
    setExcelStatus('loading');
    setExcelPath(null);
    try {
      const result = await window.api.exportExcel(selectedFyId);
      if (result === null) {
        setExcelStatus('cancelled');
      } else if ('error' in result) {
        setExcelStatus('error');
        setError(result.error);
      } else {
        setExcelStatus('success');
        setExcelPath(result.path);
      }
    } catch (e) {
      setExcelStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <h1 className={styles.h1}>Paramètres</h1>

      {error && <div role="alert" className={styles.alertError}>Erreur : {error}</div>}

      <section className={styles.section}>
        <h2 className={styles.h2}>Base de données</h2>
        <input
          type="text"
          readOnly
          value={dbPath}
          aria-label="Chemin de la base de données"
          className={styles.dbPathInput}
        />
        <button
          onClick={handleChangePath}
          disabled={changeStatus === 'loading'}
          className={styles.btnSecondary}
        >
          {changeStatus === 'loading' ? 'Migration en cours…' : 'Changer le dossier de données…'}
        </button>
        {changeStatus === 'cancelled' && (
          <p className={styles.hint} role="status">Opération annulée.</p>
        )}
        {changeStatus === 'success' && (
          <p className={styles.success} role="status">Dossier de données mis à jour.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Sauvegardes</h2>

        <button
          onClick={handleExport}
          disabled={exportStatus === 'loading'}
          className={styles.btn}
        >
          {exportStatus === 'loading' ? 'Export en cours…' : 'Exporter une sauvegarde maintenant'}
        </button>

        {exportStatus === 'success' && exportPath && (
          <p className={styles.success} role="status">
            Sauvegarde exportée vers : {exportPath}
          </p>
        )}
        {exportStatus === 'cancelled' && (
          <p className={styles.hint} role="status">Export annulé.</p>
        )}
        {exportStatus === 'error' && (
          <p className={styles.errorText}>Erreur lors de l&apos;export.</p>
        )}

        <h3 className={styles.h3}>
          Sauvegardes automatiques
          {backups.length > 0 && ` (${backups.length})`}
        </h3>

        {backups.length === 0 ? (
          <p className={styles.empty}>Aucune sauvegarde automatique pour l&apos;instant.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr className={styles.theadRow}>
                <th className={styles.th}>Date</th>
                <th className={`${styles.th} ${styles.thRight}`}>Taille</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.filename} className={styles.dataRow}>
                  <td className={styles.td}>{formatDate(b.date)}</td>
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    {formatSize(b.sizeBytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Export Excel</h2>
        <div className={styles.excelRow}>
          <label htmlFor="excel-fy-select" className={styles.excelLabel}>
            Exercice
          </label>
          <select
            id="excel-fy-select"
            aria-label="Exercice"
            value={selectedFyId ?? ''}
            onChange={e => setSelectedFyId(Number(e.target.value))}
            className={styles.excelSelect}
          >
            {fiscalYears.map(fy => (
              <option key={fy.id} value={fy.id}>{fy.year}</option>
            ))}
          </select>
          <button
            onClick={handleExcelExport}
            disabled={excelStatus === 'loading' || selectedFyId === null}
            className={styles.btn}
          >
            {excelStatus === 'loading' ? 'Export en cours…' : 'Exporter en Excel'}
          </button>
        </div>
        {excelStatus === 'success' && excelPath && (
          <p className={styles.success} role="status">
            Fichier exporté : {excelPath}
          </p>
        )}
        {excelStatus === 'cancelled' && (
          <p className={styles.hint} role="status">Export annulé.</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5 : Vérifier les 318 tests**

```
cd app && npm test
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/pages/FiscalYearsPage.tsx app/src/pages/FiscalYearsPage.module.css \
        app/src/pages/SettingsPage.tsx app/src/pages/SettingsPage.module.css
git commit -m "refactor(styles): FiscalYearsPage + SettingsPage → CSS Modules"
```

---

### Task 6 : EntryForm + OpeningBalanceModal + ClosingModal

Les composants les plus complexes. EntryForm a des styles conditionnels d'équilibre (OK/KO) et de bouton désactivé.

**Files:**
- Create: `app/src/components/EntryForm.module.css`
- Modify: `app/src/components/EntryForm.tsx`
- Create: `app/src/components/OpeningBalanceModal.module.css`
- Modify: `app/src/components/OpeningBalanceModal.tsx`
- Create: `app/src/components/ClosingModal.module.css`
- Modify: `app/src/components/ClosingModal.tsx`

- [ ] **Step 1 : Créer `EntryForm.module.css`**

```css
/* app/src/components/EntryForm.module.css */
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
}

.h2 {
  margin: 0 0 1.25rem;
  font-size: 1rem;
  font-weight: 600;
  color: #334155;
}

.row {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
  min-width: 140px;
}

.fieldWide {
  flex: 2;
}

.label {
  font-size: 0.8rem;
  font-weight: 500;
  color: #475569;
}

.input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  font-size: 0.875rem;
  color: #0f172a;
  background: #fff;
}

.linesHeader {
  display: flex;
  gap: 0.5rem;
  padding: 0 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
}

.lineRow {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  align-items: center;
}

.colAccount {
  flex: 2;
  min-width: 200px;
}

.colAmount {
  width: 110px;
  text-align: right;
}

.removeBtn {
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f8fafc;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
}

.addLineBtn {
  margin-top: 0.25rem;
  background: none;
  border: 1px dashed #94a3b8;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  color: #64748b;
  cursor: pointer;
  font-size: 0.8rem;
}

.balance {
  display: flex;
  gap: 1.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  margin-bottom: 0.75rem;
}

.balanceOk {
  background: #dcfce7;
  color: #15803d;
}

.balanceKo {
  background: #fef9c3;
  color: #92400e;
}

.error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.65rem 0.75rem;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.cancelBtn {
  padding: 0.45rem 1rem;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #475569;
}

.submitBtn {
  padding: 0.45rem 1rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.submitBtn:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}
```

- [ ] **Step 2 : Mettre à jour `EntryForm.tsx`**

```tsx
import { useState } from 'react';
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import { parseAmount, formatAmount, validateEntryBalance } from '../lib/accounting';
import styles from './EntryForm.module.css';

interface Line {
  account_id: string;
  debit:  string;
  credit: string;
}

interface EntryFormProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  editEntry?: JournalEntry & { lines: JournalEntryLine[] };
  hideTitle?: boolean;
  onCreated:  () => void;
  onCancel:   () => void;
}

function entryLinesToFormLines(lines: JournalEntryLine[]): Line[] {
  return lines.map(l => ({
    account_id: String(l.account_id),
    debit:  l.debit  != null ? formatAmount(l.debit)  : '',
    credit: l.credit != null ? formatAmount(l.credit) : '',
  }));
}

const emptyLine = (): Line => ({ account_id: '', debit: '', credit: '' });

export default function EntryForm({ fiscalYear, accounts, editEntry, hideTitle, onCreated, onCancel }: EntryFormProps) {
  const [date,        setDate]        = useState(editEntry?.date ?? today());
  const [description, setDescription] = useState(editEntry?.description ?? '');
  const [piece,       setPiece]       = useState(editEntry?.piece ?? '');
  const [lines,       setLines]       = useState<Line[]>(
    editEntry ? entryLinesToFormLines(editEntry.lines) : [emptyLine(), emptyLine()],
  );
  const [submitting,  setSubmitting]  = useState(false);
  const [apiError,    setApiError]    = useState<string | null>(null);

  const totals = lines.reduce(
    (acc, l) => ({
      debit:  acc.debit  + (parseFloat(l.debit)  || 0),
      credit: acc.credit + (parseFloat(l.credit) || 0),
    }),
    { debit: 0, credit: 0 },
  );

  const balanced  = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.001;
  const canSubmit = description.trim() !== '' && date !== '' && balanced && !submitting;

  function updateLine(i: number, field: keyof Line, value: string) {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'debit'  && value !== '') next[i].credit = '';
      if (field === 'credit' && value !== '') next[i].debit  = '';
      return next;
    });
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine()]);
  }

  function removeLine(i: number) {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    const payload = lines
      .filter(l => l.account_id !== '')
      .map(l => ({
        account_id: Number(l.account_id),
        debit:  l.debit  !== '' ? parseAmount(l.debit)  : undefined,
        credit: l.credit !== '' ? parseAmount(l.credit) : undefined,
      }));

    try {
      validateEntryBalance(payload);
    } catch (e: unknown) {
      setApiError((e as Error).message);
      return;
    }

    setSubmitting(true);
    try {
      if (editEntry) {
        await window.api.updateJournalEntry({
          id:          editEntry.id,
          date,
          description: description.trim(),
          piece:       piece.trim() || undefined,
          lines:       payload,
        });
      } else {
        await window.api.createJournalEntry({
          fiscal_year_id: fiscalYear.id,
          date,
          description:    description.trim(),
          piece:          piece.trim() || undefined,
          lines:          payload,
        });
      }
      onCreated();
    } catch (e: unknown) {
      setApiError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Formulaire de saisie d'écriture" noValidate className={styles.card}>
      {!hideTitle && (
        <h2 className={styles.h2}>
          {editEntry ? 'Modifier l\'écriture' : 'Nouvelle écriture'} — exercice {fiscalYear.year}
        </h2>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="entry-date" className={styles.label}>Date *</label>
          <input
            id="entry-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            min={fiscalYear.start_date}
            max={fiscalYear.end_date}
            required
            className={styles.input}
          />
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label htmlFor="entry-desc" className={styles.label}>Libellé *</label>
          <input
            id="entry-desc"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ex. : Cotisation membre — Dupont"
            required
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="entry-piece" className={styles.label}>Pièce</label>
          <input
            id="entry-piece"
            type="text"
            value={piece}
            onChange={e => setPiece(e.target.value)}
            placeholder="P-2025-001"
            className={styles.input}
          />
        </div>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <div className={styles.linesHeader}>
          <span className={styles.colAccount}>Compte</span>
          <span className={styles.colAmount}>Débit CHF</span>
          <span className={styles.colAmount}>Crédit CHF</span>
          <span style={{ width: '32px' }} />
        </div>

        {lines.map((line, i) => (
          <div key={i} className={styles.lineRow}>
            <select
              value={line.account_id}
              onChange={e => updateLine(i, 'account_id', e.target.value)}
              aria-label={`Compte ligne ${i + 1}`}
              className={`${styles.input} ${styles.colAccount}`}
            >
              <option value="">— choisir un compte —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.number} — {a.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={line.debit}
              onChange={e => updateLine(i, 'debit', e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              aria-label={`Débit ligne ${i + 1}`}
              className={`${styles.input} ${styles.colAmount}`}
            />

            <input
              type="number"
              value={line.credit}
              onChange={e => updateLine(i, 'credit', e.target.value)}
              min="0.01"
              step="0.01"
              placeholder="0.00"
              aria-label={`Crédit ligne ${i + 1}`}
              className={`${styles.input} ${styles.colAmount}`}
            />

            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lines.length <= 2}
              aria-label={`Supprimer ligne ${i + 1}`}
              className={styles.removeBtn}
            >
              ×
            </button>
          </div>
        ))}

        <button type="button" onClick={addLine} className={styles.addLineBtn}>
          + Ajouter une ligne
        </button>
      </div>

      <div className={`${styles.balance} ${balanced ? styles.balanceOk : styles.balanceKo}`}>
        <span>Total débit : <strong>{totals.debit.toFixed(2)}</strong></span>
        <span>Total crédit : <strong>{totals.credit.toFixed(2)}</strong></span>
        <span>{balanced ? 'Ecriture équilibrée' : 'Déséquilibre : ' + Math.abs(totals.debit - totals.credit).toFixed(2)}</span>
      </div>

      {apiError && <div role="alert" className={styles.error}>Erreur : {apiError}</div>}

      <div className={styles.actions}>
        <button type="button" onClick={onCancel} className={styles.cancelBtn}>Annuler</button>
        <button type="submit" disabled={!canSubmit} className={styles.submitBtn}>
          {submitting ? 'Enregistrement…' : 'Enregistrer l\'écriture'}
        </button>
      </div>
    </form>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 3 : Créer `OpeningBalanceModal.module.css`**

```css
/* app/src/components/OpeningBalanceModal.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 10px;
  padding: 2rem;
  min-width: 480px;
  max-width: 640px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.h2 {
  margin: 0 0 1.25rem;
  font-size: 1.1rem;
  color: #0f172a;
}

.alert {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
}

.sectionHeader {
  padding: 0.5rem 0 0.25rem;
  font-weight: 600;
  color: #475569;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.accountCell {
  padding: 0.3rem 0;
  color: #334155;
  width: 60%;
}

.amountCell {
  padding: 0.3rem 0;
  text-align: right;
}

.input {
  width: 120px;
  padding: 0.3rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  font-size: 0.875rem;
  text-align: right;
  font-family: monospace;
}

.inputReadOnly {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.btn {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-weight: 500;
}

.btnSecondary {
  padding: 0.5rem 1rem;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
}
```

- [ ] **Step 4 : Mettre à jour `OpeningBalanceModal.tsx`**

```tsx
import { useState } from 'react';
import type { OpeningBalanceSuggestion, OpeningBalanceLine } from '../types';
import styles from './OpeningBalanceModal.module.css';

export interface OpeningBalanceModalProps {
  fiscalYearId: number;
  year: number;
  suggestions: OpeningBalanceSuggestion[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function OpeningBalanceModal({
  fiscalYearId, year, suggestions, onClose, onSuccess,
}: OpeningBalanceModalProps) {
  const editable = suggestions.filter(s => s.type !== 'FONDS_PROPRES');
  const capital  = suggestions.filter(s => s.type === 'FONDS_PROPRES');

  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(editable.map(s => [s.accountId, formatCHF(s.suggestedAmountCents)]))
  );
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const actifCents = suggestions
    .filter(s => s.type === 'ACTIF')
    .reduce((sum, s) => sum + parseCHF(amounts[s.accountId] ?? '0'), 0);

  const passifCents = suggestions
    .filter(s => s.type === 'PASSIF')
    .reduce((sum, s) => sum + parseCHF(amounts[s.accountId] ?? '0'), 0);

  const capitalCents = actifCents - passifCents;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const lines: OpeningBalanceLine[] = [
        ...editable.map(s => ({
          accountId: s.accountId,
          amountCents: parseCHF(amounts[s.accountId] ?? '0'),
        })),
        ...capital.map(s => ({ accountId: s.accountId, amountCents: capitalCents })),
      ];
      await window.api.createOpeningBalance(fiscalYearId, lines);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const actifAccounts  = suggestions.filter(s => s.type === 'ACTIF');
  const passifAccounts = suggestions.filter(s => s.type === 'PASSIF');

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className={styles.modal}>
        <h2 id="ob-title" className={styles.h2}>Soldes à nouveau — Exercice {year}</h2>

        {error && <div role="alert" className={styles.alert}>{error}</div>}

        <table className={styles.table}>
          <tbody>
            <tr><td colSpan={2} className={styles.sectionHeader}>Classe 1 — Actifs</td></tr>
            {actifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td className={styles.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td className={styles.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    className={styles.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            <tr><td colSpan={2} className={styles.sectionHeader}>Classe 2 — Passifs et fonds propres</td></tr>
            {passifAccounts.map(sg => (
              <tr key={sg.accountId}>
                <td className={styles.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td className={styles.amountCell}>
                  <input
                    type="text"
                    value={amounts[sg.accountId] ?? ''}
                    onChange={e => setAmounts(prev => ({ ...prev, [sg.accountId]: e.target.value }))}
                    className={styles.input}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
            {capital.map(sg => (
              <tr key={sg.accountId}>
                <td className={styles.accountCell}>{sg.accountNumber}  {sg.accountName}</td>
                <td className={styles.amountCell}>
                  <input
                    type="text"
                    readOnly
                    value={formatCHF(capitalCents)}
                    className={`${styles.input} ${styles.inputReadOnly}`}
                    aria-label={`Solde ${sg.accountName}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.actions}>
          <button onClick={onClose} disabled={saving} className={styles.btnSecondary}>
            Passer cette étape
          </button>
          <button onClick={handleSave} disabled={saving} className={styles.btn}>
            {saving ? 'Enregistrement…' : 'Enregistrer les soldes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseCHF(str: string): number {
  const n = parseFloat(str.replace(',', '.'));
  return isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

function formatCHF(cents: number): string {
  return (cents / 100).toFixed(2);
}
```

- [ ] **Step 5 : Créer `ClosingModal.module.css`**

```css
/* app/src/components/ClosingModal.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.card {
  background: #fff;
  border-radius: 10px;
  padding: 1.75rem;
  width: 560px;
  max-width: 95vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: #0f172a;
}

.alertError {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  margin-bottom: 0.75rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.warning {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
}

.blockerBox {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
}

.blockerLine {
  margin: 0 0 0.25rem;
  color: #dc2626;
  font-size: 0.875rem;
}

.blockerHint {
  margin: 0.5rem 0 0;
  color: #7f1d1d;
  font-size: 0.8rem;
  font-style: italic;
}

.sectionLabel {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #334155;
}

.table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
  margin-bottom: 1rem;
  background: #f8fafc;
  border-radius: 6px;
  overflow: hidden;
}

.row {
  border-bottom: 1px solid #e2e8f0;
}

.tdNum {
  padding: 0.35rem 0.75rem;
  color: #64748b;
  font-family: monospace;
}

.tdName {
  padding: 0.35rem 0.5rem;
  color: #334155;
  width: 100%;
}

.tdType {
  padding: 0.35rem 0.5rem;
  color: #64748b;
  white-space: nowrap;
}

.tdAmount {
  padding: 0.35rem 0.75rem;
  text-align: right;
  font-family: monospace;
  color: #334155;
}

.result {
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  color: #334155;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btnCancel {
  padding: 0.45rem 1rem;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  color: #475569;
}

.btnConfirm {
  padding: 0.45rem 1.1rem;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.btnConfirm:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}
```

- [ ] **Step 6 : Mettre à jour `ClosingModal.tsx`**

```tsx
import { useState } from 'react';
import type { ClosingPreview } from '../types';
import styles from './ClosingModal.module.css';

interface ClosingModalProps {
  fiscalYearId: number;
  year: number;
  preview: ClosingPreview;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ClosingModal({ fiscalYearId, year, preview, onClose, onSuccess }: ClosingModalProps) {
  const [closing, setClosing] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const hasBlockers = preview.blockers.length > 0;

  async function handleConfirm() {
    setClosing(true);
    setError(null);
    try {
      await window.api.closeFiscalYear(fiscalYearId);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClosing(false);
    }
  }

  const netCHF   = (Math.abs(preview.netResultCents) / 100).toFixed(2);
  const isProfit = preview.netResultCents >= 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby="closing-title">
        <h2 id="closing-title" className={styles.title}>Clôture de l&apos;exercice {year}</h2>

        {error && <div role="alert" className={styles.alertError}>{error}</div>}

        <p className={styles.warning}>
          ⚠ Cette opération peut être annulée via &quot;Rouvrir l&apos;exercice&quot;.
        </p>

        {hasBlockers ? (
          <div className={styles.blockerBox}>
            {preview.blockers.map((b, i) => (
              <p key={i} className={styles.blockerLine}>✗ {b}</p>
            ))}
            <p className={styles.blockerHint}>La clôture ne peut pas être effectuée.</p>
          </div>
        ) : (
          <>
            {preview.accounts.length > 0 && (
              <>
                <p className={styles.sectionLabel}>Comptes soldés vers 900 — Profits et Pertes</p>
                <table className={styles.table}>
                  <tbody>
                    {preview.accounts.map(a => (
                      <tr key={a.accountId} className={styles.row}>
                        <td className={styles.tdNum}>{a.accountNumber}</td>
                        <td className={styles.tdName}>{a.accountName}</td>
                        <td className={styles.tdType}>{a.type === 'PRODUIT' ? 'Produit' : 'Charge'}</td>
                        <td className={styles.tdAmount}>{(Math.abs(a.soldeCents) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <p className={styles.result}>
              Résultat net : <strong>{isProfit ? 'Bénéfice' : 'Perte'} CHF {netCHF}</strong>
              {preview.netResultCents !== 0 && ' → 900 Profits et Pertes → 290 Capital'}
            </p>
          </>
        )}

        <div className={styles.actions}>
          <button onClick={onClose} disabled={closing} className={styles.btnCancel}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={hasBlockers || closing}
            className={styles.btnConfirm}
          >
            {closing ? 'Clôture en cours…' : 'Confirmer la clôture'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7 : Vérifier les 318 tests**

```
cd app && npm test
```
Attendu : `Tests  318 passed (318)`

- [ ] **Step 8 : Commit final**

```bash
git add app/src/components/EntryForm.tsx app/src/components/EntryForm.module.css \
        app/src/components/OpeningBalanceModal.tsx app/src/components/OpeningBalanceModal.module.css \
        app/src/components/ClosingModal.tsx app/src/components/ClosingModal.module.css
git commit -m "refactor(styles): EntryForm + OpeningBalanceModal + ClosingModal → CSS Modules"
```

---

## Récapitulatif

| Tâche | Fichiers | Particularités |
|---|---|---|
| 1 | ConfirmDialog, EntryFormModal, JournalFilters | Introduction au pattern, pas de conditionnel |
| 2 | Layout, Sidebar | `:hover` natif en CSS remplace le state JS |
| 3 | WelcomePage, AccountsPage | Pages simples, `:disabled` en CSS |
| 4 | BalancesPage, JournalPage | Couleur dynamique → inline style conservé |
| 5 | FiscalYearsPage, SettingsPage | Pages chargées, badges conditionnels |
| 6 | EntryForm, OpeningBalanceModal, ClosingModal | Composants complexes, équilibre OK/KO |

Après les 6 tâches : 14 fichiers `.module.css` créés, 14 fichiers `.tsx` mis à jour, 0 nouveau objet `const s/styles = {}`, 318 tests verts.
