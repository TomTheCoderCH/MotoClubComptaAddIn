# Help System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter des tooltips contextuels par ligne dans EntryForm et un panneau d'aide global (drawer latéral) accessible via sidebar `?` et touche `F1`.

**Architecture:** `HelpContext.tsx` centralise l'état open/close; `Layout.tsx` fournit le Provider, rend `HelpDrawer` et écoute `F1`/`Escape`; `Sidebar.tsx` consomme `useHelp()` pour le bouton `?`; `Tooltip.tsx` est un composant CSS-pur réutilisable sans état.

**Tech Stack:** React 19, CSS Modules, Vitest 4, React Testing Library 16, TypeScript 4.5

## Global Constraints

- CSS Modules uniquement — zéro `style={{}}` dans les composants
- Tests TDD : écrire le test en premier, vérifier qu'il échoue, implémenter, vérifier qu'il passe
- Montants en centimes (INTEGER) dans la DB — sans rapport direct ici mais convention générale
- Commande de test : `cd app && npm test` (le `pretest` rebuild better-sqlite3 pour Node automatiquement)
- Résultat attendu en fin de plan : 333 tests passent (318 + 15 nouveaux)
- **Maintenance** : après chaque tâche touchant des fonctionnalités ou l'UI, vérifier si `HelpDrawer.tsx` doit être mis à jour (onglets Démarrage rapide / Comptabilité / Application)

---

### Task 1 : Composant `Tooltip`

**Files:**
- Create: `app/src/components/Tooltip.tsx`
- Create: `app/src/components/Tooltip.module.css`
- Create: `app/src/__tests__/renderer/Tooltip.test.tsx`

**Interfaces:**
- Produces: `export default function Tooltip({ content }: { content: React.ReactNode }): JSX.Element`

- [ ] **Step 1 : Écrire le test**

```tsx
// app/src/__tests__/renderer/Tooltip.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tooltip from '../../components/Tooltip';

describe('Tooltip', () => {
  it('affiche l\'icône ? avec aria-label="Aide"', () => {
    render(<Tooltip content="aide" />);
    expect(screen.getByRole('img', { name: 'Aide' })).toBeInTheDocument();
  });

  it('rend le contenu accessible via role="tooltip"', () => {
    render(<Tooltip content="Actif — Débit ↑ augmente" />);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Actif — Débit ↑ augmente');
  });

  it('accepte du JSX comme contenu', () => {
    render(<Tooltip content={<strong>Important</strong>} />);
    expect(screen.getByText('Important')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Vérifier que le test échoue**

```
cd app && npm test -- --reporter=verbose 2>&1 | grep -A3 "Tooltip"
```
Attendu : FAIL — `Cannot find module '../../components/Tooltip'`

- [ ] **Step 3 : Implémenter `Tooltip.tsx`**

```tsx
// app/src/components/Tooltip.tsx
import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: ReactNode;
}

export default function Tooltip({ content }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      <span className={styles.icon} role="img" aria-label="Aide">?</span>
      <span className={styles.bubble} role="tooltip">{content}</span>
    </span>
  );
}
```

- [ ] **Step 4 : Créer `Tooltip.module.css`**

```css
/* app/src/components/Tooltip.module.css */
.wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: help;
  flex-shrink: 0;
}

.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #94a3b8;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
  user-select: none;
}

.wrapper:hover .icon {
  background: #475569;
}

.bubble {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: normal;
  z-index: 200;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  right: 6px;
  border: 5px solid transparent;
  border-top-color: #1e293b;
}

.wrapper:hover .bubble {
  display: block;
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  321 passed (321)`

- [ ] **Step 6 : Commit**

```
git add app/src/components/Tooltip.tsx app/src/components/Tooltip.module.css app/src/__tests__/renderer/Tooltip.test.tsx
git commit -m "feat(ui): composant Tooltip réutilisable CSS pur"
```

---

### Task 2 : `HelpContext` + `HelpDrawer`

**Files:**
- Create: `app/src/components/HelpContext.tsx`
- Create: `app/src/components/HelpDrawer.tsx`
- Create: `app/src/components/HelpDrawer.module.css`
- Create: `app/src/__tests__/renderer/HelpDrawer.test.tsx`

**Interfaces:**
- Consumes: rien
- Produces:
  - `export const HelpContext: React.Context<HelpContextValue>`
  - `export const useHelp: () => HelpContextValue`
  - `export default function HelpDrawer(): JSX.Element | null`

- [ ] **Step 1 : Écrire le test**

```tsx
// app/src/__tests__/renderer/HelpDrawer.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpContext } from '../../components/HelpContext';
import HelpDrawer from '../../components/HelpDrawer';

function renderDrawer(isOpen: boolean, close = vi.fn(), toggle = vi.fn()) {
  return render(
    <HelpContext.Provider value={{ isOpen, close, toggle }}>
      <HelpDrawer />
    </HelpContext.Provider>
  );
}

describe('HelpDrawer', () => {
  it('ne rend rien quand isOpen=false', () => {
    renderDrawer(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('affiche le drawer quand isOpen=true', () => {
    renderDrawer(true);
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
  });

  it('appelle close() au clic sur le bouton Fermer', async () => {
    const close = vi.fn();
    renderDrawer(true, close);
    await userEvent.click(screen.getByRole('button', { name: "Fermer l'aide" }));
    expect(close).toHaveBeenCalled();
  });

  it('affiche l\'onglet Démarrage rapide par défaut', () => {
    renderDrawer(true);
    expect(screen.getByRole('tab', { name: 'Démarrage rapide' }))
      .toHaveAttribute('aria-selected', 'true');
  });

  it('change d\'onglet au clic sur Comptabilité', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Comptabilité' }));
    expect(screen.getByRole('tab', { name: 'Comptabilité' }))
      .toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Démarrage rapide' }))
      .toHaveAttribute('aria-selected', 'false');
  });
});
```

- [ ] **Step 2 : Vérifier que le test échoue**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : FAIL — `Cannot find module '../../components/HelpContext'`

- [ ] **Step 3 : Créer `HelpContext.tsx`**

```tsx
// app/src/components/HelpContext.tsx
import { createContext, useContext } from 'react';

interface HelpContextValue {
  isOpen: boolean;
  toggle: () => void;
  close:  () => void;
}

export const HelpContext = createContext<HelpContextValue>({
  isOpen: false,
  toggle: () => {},
  close:  () => {},
});

export const useHelp = () => useContext(HelpContext);
```

- [ ] **Step 4 : Créer `HelpDrawer.tsx`**

```tsx
// app/src/components/HelpDrawer.tsx
import { useState } from 'react';
import { useHelp } from './HelpContext';
import styles from './HelpDrawer.module.css';

type Tab = 'quickstart' | 'accounting' | 'app';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quickstart', label: 'Démarrage rapide' },
  { id: 'accounting', label: 'Comptabilité'     },
  { id: 'app',        label: 'Application'      },
];

export default function HelpDrawer() {
  const { isOpen, close } = useHelp();
  const [tab, setTab] = useState<Tab>('quickstart');

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={close} aria-hidden="true" />
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Aide">
        <div className={styles.header}>
          <h2 className={styles.title}>Aide MCY Compta</h2>
          <button onClick={close} className={styles.closeBtn} aria-label="Fermer l'aide">×</button>
        </div>

        <div className={styles.tabs} role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={styles.tab}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {tab === 'quickstart' && <QuickStartTab />}
          {tab === 'accounting' && <AccountingTab />}
          {tab === 'app'        && <AppTab />}
        </div>
      </div>
    </>
  );
}

function QuickStartTab() {
  return (
    <div>
      <h3 className={styles.sectionTitle}>Workflow annuel</h3>
      <ol className={styles.steps}>
        <li>
          <strong>Créer un exercice</strong><br />
          Page <em>Exercices</em> → formulaire "Créer l'exercice AAAA".
        </li>
        <li>
          <strong>Saisir les soldes à nouveau</strong><br />
          Si un exercice précédent existe : <em>Exercices</em> → "Saisir les soldes à nouveau".
          Saisir les soldes finaux de l'exercice précédent (Caisse, Raiffeisen, etc.).
        </li>
        <li>
          <strong>Saisir les écritures</strong><br />
          Page <em>Journal</em> → "Nouvelle écriture". Chaque écriture doit être équilibrée
          (total Débit = total Crédit).
        </li>
        <li>
          <strong>Consulter les soldes</strong><br />
          Page <em>Soldes</em> — affichage en temps réel par classe de compte.
        </li>
        <li>
          <strong>Clôturer l'exercice</strong><br />
          En fin d'année : <em>Exercices</em> → "Clôturer l'exercice". Les comptes de
          résultat (3xx, 4xx) sont soldés automatiquement vers le Capital.
        </li>
        <li>
          <strong>Exporter en Excel</strong><br />
          <em>Exercices</em> → "Exporter Excel" ou <em>Paramètres</em> → Export Excel.
          À faire après la clôture pour transmission ou archivage.
        </li>
      </ol>
    </div>
  );
}

function AccountingTab() {
  return (
    <div>
      <h3 className={styles.sectionTitle}>La partie double</h3>
      <p className={styles.para}>
        Chaque écriture comporte au minimum 2 lignes. La somme des débits doit
        toujours être égale à la somme des crédits. L'application valide cet
        équilibre en temps réel.
      </p>

      <h3 className={styles.sectionTitle}>Débit / Crédit par type de compte</h3>
      <table className={styles.helpTable}>
        <thead>
          <tr>
            <th>Type de compte</th>
            <th>Débit</th>
            <th>Crédit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Actif (1xx) — Caisse, Banque, Twint…</td>
            <td>↑ augmente</td>
            <td>↓ diminue</td>
          </tr>
          <tr>
            <td>Passif / Capital (2xx)</td>
            <td>↓ diminue</td>
            <td>↑ augmente</td>
          </tr>
          <tr>
            <td>Produit (3xx) — Cotisations, Ventes…</td>
            <td>↓ (rare)</td>
            <td>↑ recette</td>
          </tr>
          <tr>
            <td>Charge (4xx) — Assurance, Électricité…</td>
            <td>↑ dépense</td>
            <td>↓ (rare)</td>
          </tr>
        </tbody>
      </table>

      <h3 className={styles.sectionTitle}>Glossaire</h3>
      <dl className={styles.glossary}>
        <dt>Exercice fiscal</dt>
        <dd>Période comptable d'un an (généralement 1er janvier – 31 décembre).</dd>
        <dt>Solde à nouveau</dt>
        <dd>Solde final d'un exercice reporté comme solde initial de l'exercice suivant.</dd>
        <dt>Clôture</dt>
        <dd>Opération en fin d'exercice qui solde les comptes de résultat (3xx, 4xx)
            vers Profits &amp; Pertes (900) puis vers le Capital (290).</dd>
        <dt>Passifs transitoires (200)</dt>
        <dd>Charges engagées sur l'exercice en cours mais payées sur l'exercice suivant
            (ex. facture reçue en décembre, payée en janvier).</dd>
        <dt>Compte de résultat</dt>
        <dd>Comptes 3xx (produits) et 4xx (charges) — soldés à chaque clôture, contrairement
            aux comptes de bilan (1xx, 2xx) qui survivent d'un exercice à l'autre.</dd>
      </dl>
    </div>
  );
}

function AppTab() {
  return (
    <div>
      <h3 className={styles.sectionTitle}>Pages de l'application</h3>
      <dl className={styles.glossary}>
        <dt>Plan comptable</dt>
        <dd>Liste des 29 comptes MCY. Lecture seule — le plan est défini à l'installation.</dd>
        <dt>Journal</dt>
        <dd>Saisie et consultation des écritures comptables. Filtres par libellé, compte et
            période. Modification et suppression possibles tant que l'exercice est ouvert.</dd>
        <dt>Exercices</dt>
        <dd>Création et gestion des exercices fiscaux. Clôture, réouverture, soldes à
            nouveau, export Excel par exercice.</dd>
        <dt>Soldes</dt>
        <dd>Vue synthétique des soldes par compte pour l'exercice sélectionné, groupés
            par classe (Actifs, Passifs, Produits, Charges).</dd>
        <dt>Paramètres</dt>
        <dd>Chemin de la base de données, export de sauvegarde manuelle, historique des
            sauvegardes automatiques, export Excel global.</dd>
      </dl>

      <h3 className={styles.sectionTitle}>Raccourcis clavier</h3>
      <table className={styles.helpTable}>
        <tbody>
          <tr><td><kbd>F1</kbd></td><td>Ouvrir / fermer l'aide</td></tr>
          <tr><td><kbd>Escape</kbd></td><td>Fermer l'aide ou les modales</td></tr>
        </tbody>
      </table>

      <h3 className={styles.sectionTitle}>Sauvegarde automatique</h3>
      <p className={styles.para}>
        La base de données est sauvegardée automatiquement à chaque fermeture de
        l'application. Les 30 dernières sauvegardes sont conservées dans le sous-dossier
        <code> backups/</code> du dossier de données. Placer ce dossier dans OneDrive
        (ou équivalent) suffit pour une protection cloud.
      </p>

      <h3 className={styles.sectionTitle}>Export Excel</h3>
      <p className={styles.para}>
        L'export génère un classeur Excel reproduisant la structure comptable du club
        (Journal, Bilan, Résultat, un onglet par compte). À utiliser après la clôture
        annuelle pour archivage ou transmission à un successeur non-informaticien.
      </p>
    </div>
  );
}
```

- [ ] **Step 5 : Créer `HelpDrawer.module.css`**

```css
/* app/src/components/HelpDrawer.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 300;
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  background: #fff;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  z-index: 301;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
}

.closeBtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  color: #64748b;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  line-height: 1;
}

.closeBtn:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 0.65rem 0.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 500;
}

.tab:hover {
  color: #334155;
  background: #f8fafc;
}

.tab[aria-selected="true"] {
  color: #1d4ed8;
  border-bottom-color: #3b82f6;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  font-size: 0.85rem;
  color: #334155;
  line-height: 1.6;
}

.sectionTitle {
  margin: 1rem 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #0f172a;
}

.sectionTitle:first-child {
  margin-top: 0;
}

.para {
  margin: 0 0 0.75rem;
}

.steps {
  margin: 0 0 0.75rem;
  padding-left: 1.25rem;
}

.steps li {
  margin-bottom: 0.6rem;
}

.helpTable {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 1rem;
  font-size: 0.8rem;
}

.helpTable th,
.helpTable td {
  padding: 0.35rem 0.5rem;
  border: 1px solid #e2e8f0;
  text-align: left;
}

.helpTable th {
  background: #f1f5f9;
  font-weight: 600;
  color: #475569;
}

.helpTable td:nth-child(2),
.helpTable td:nth-child(3) {
  white-space: nowrap;
  color: #1d4ed8;
  font-weight: 500;
}

.glossary {
  margin: 0 0 0.75rem;
}

.glossary dt {
  font-weight: 600;
  color: #1e293b;
  margin-top: 0.5rem;
}

.glossary dd {
  margin: 0.1rem 0 0 0.75rem;
  color: #475569;
}
```

- [ ] **Step 6 : Vérifier que les tests passent**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  326 passed (326)`

- [ ] **Step 7 : Commit**

```
git add app/src/components/HelpContext.tsx app/src/components/HelpDrawer.tsx app/src/components/HelpDrawer.module.css app/src/__tests__/renderer/HelpDrawer.test.tsx
git commit -m "feat(ui): HelpContext + HelpDrawer avec 3 onglets d'aide"
```

---

### Task 3 : Intégration dans `Layout`

**Files:**
- Modify: `app/src/components/Layout.tsx`
- Modify: `app/src/__tests__/renderer/Layout.test.tsx`

**Interfaces:**
- Consumes: `HelpContext` from `./HelpContext`, `HelpDrawer` from `./HelpDrawer`

- [ ] **Step 1 : Ajouter les tests**

Ajouter à la fin de `app/src/__tests__/renderer/Layout.test.tsx` :

```tsx
import { act } from 'react';

describe('Layout — aide (F1 / Escape)', () => {
  it('le drawer d\'aide est fermé par défaut', () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div />
      </Layout>
    );
    expect(screen.queryByRole('dialog', { name: 'Aide' })).not.toBeInTheDocument();
  });

  it('F1 ouvre le drawer d\'aide', async () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div />
      </Layout>
    );
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
  });

  it('Escape ferme le drawer d\'aide', async () => {
    render(
      <Layout currentPage="accounts" onNavigate={vi.fn()}>
        <div />
      </Layout>
    );
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    });
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(screen.queryByRole('dialog', { name: 'Aide' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

```
cd app && npm test 2>&1 | tail -8
```
Attendu : 3 tests FAIL sur Layout

- [ ] **Step 3 : Mettre à jour `Layout.tsx`**

```tsx
// app/src/components/Layout.tsx
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Page } from '../App';
import Sidebar from './Sidebar';
import HelpDrawer from './HelpDrawer';
import { HelpContext } from './HelpContext';
import styles from './Layout.module.css';

interface LayoutProps {
  currentPage: Page;
  onNavigate:  (page: Page) => void;
  children:    ReactNode;
}

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen(v => !v), []);
  const close  = useCallback(() => setIsOpen(false),   []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1')     { e.preventDefault(); toggle(); }
      if (e.key === 'Escape') { close(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggle, close]);

  return (
    <HelpContext.Provider value={{ isOpen, toggle, close }}>
      <div className={styles.shell}>
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
        <main className={styles.main}>
          {children}
        </main>
      </div>
      <HelpDrawer />
    </HelpContext.Provider>
  );
}
```

- [ ] **Step 4 : Vérifier que tous les tests passent**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  329 passed (329)`

- [ ] **Step 5 : Commit**

```
git add app/src/components/Layout.tsx app/src/__tests__/renderer/Layout.test.tsx
git commit -m "feat(ui): Layout fournit HelpContext, écoute F1 et Escape"
```

---

### Task 4 : Bouton `? Aide` dans `Sidebar`

**Files:**
- Modify: `app/src/components/Sidebar.tsx`
- Modify: `app/src/components/Sidebar.module.css`
- Modify: `app/src/__tests__/renderer/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `useHelp` from `./HelpContext`

- [ ] **Step 1 : Ajouter les tests**

Ajouter à la fin de `app/src/__tests__/renderer/Sidebar.test.tsx` :

```tsx
import { HelpContext } from '../../components/HelpContext';

describe('Sidebar — bouton Aide', () => {
  it('affiche le bouton Aide', () => {
    render(<Sidebar currentPage="accounts" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Aide' })).toBeInTheDocument();
  });

  it('appelle toggle() du contexte au clic sur Aide', async () => {
    const toggle = vi.fn();
    render(
      <HelpContext.Provider value={{ isOpen: false, toggle, close: vi.fn() }}>
        <Sidebar currentPage="accounts" onNavigate={vi.fn()} />
      </HelpContext.Provider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aide' }));
    expect(toggle).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

```
cd app && npm test 2>&1 | tail -8
```
Attendu : 2 tests FAIL sur Sidebar

- [ ] **Step 3 : Mettre à jour `Sidebar.tsx`**

```tsx
// app/src/components/Sidebar.tsx
import type { Page } from '../App';
import { useHelp } from './HelpContext';
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
  const { toggle, isOpen } = useHelp();

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
      <div className={styles.helpSection}>
        <button
          onClick={toggle}
          aria-label="Aide"
          aria-expanded={isOpen}
          className={styles.helpBtn}
        >
          ? Aide
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 4 : Ajouter les styles dans `Sidebar.module.css`**

Ajouter à la fin du fichier existant :

```css
.helpSection {
  margin-top: auto;
  padding: 0.5rem 0;
  border-top: 1px solid #334155;
}

.helpBtn {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.65rem 1rem;
  background: transparent;
  color: #64748b;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
}

.helpBtn:hover {
  background: #253347;
  color: #94a3b8;
}

.helpBtn[aria-expanded="true"] {
  color: #93c5fd;
}
```

- [ ] **Step 5 : Vérifier que tous les tests passent**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  331 passed (331)`

- [ ] **Step 6 : Commit**

```
git add app/src/components/Sidebar.tsx app/src/components/Sidebar.module.css app/src/__tests__/renderer/Sidebar.test.tsx
git commit -m "feat(ui): bouton Aide dans la sidebar (F1 / clic)"
```

---

### Task 5 : Tooltip dynamique dans `EntryForm`

**Files:**
- Modify: `app/src/components/EntryForm.tsx`
- Modify: `app/src/components/EntryForm.module.css`
- Modify: `app/src/__tests__/renderer/EntryForm.test.tsx`

**Interfaces:**
- Consumes: `Tooltip` from `./Tooltip`

- [ ] **Step 1 : Ajouter les tests**

Ajouter à la fin de `app/src/__tests__/renderer/EntryForm.test.tsx` :

```tsx
describe('EntryForm — tooltips d\'aide par ligne', () => {
  it('chaque ligne initiale a un tooltip', () => {
    render(<EntryForm {...defaultProps} />);
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips).toHaveLength(2);
  });

  it('sans compte sélectionné : invite à choisir un compte', () => {
    render(<EntryForm {...defaultProps} />);
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips[0]).toHaveTextContent("Sélectionnez un compte pour voir l'aide");
  });

  it('avec compte ACTIF sélectionné : affiche la règle débit/crédit', async () => {
    render(<EntryForm {...defaultProps} />);
    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], '1'); // id=1, type=ACTIF
    const tooltips = screen.getAllByRole('tooltip');
    expect(tooltips[0]).toHaveTextContent('Actif — Débit ↑ augmente · Crédit ↓ diminue');
  });
});
```

- [ ] **Step 2 : Vérifier que les nouveaux tests échouent**

```
cd app && npm test 2>&1 | tail -8
```
Attendu : 3 tests FAIL sur EntryForm

- [ ] **Step 3 : Mettre à jour `EntryForm.tsx`**

Ajouter l'import de `Tooltip` et la fonction `helpForType`, puis modifier le JSX.

**Imports à ajouter en haut du fichier :**
```tsx
import Tooltip from './Tooltip';
```

**Fonction à ajouter avant le composant `EntryForm` :**
```tsx
function helpForType(type: string | undefined): string {
  switch (type) {
    case 'ACTIF':         return 'Actif — Débit ↑ augmente · Crédit ↓ diminue';
    case 'PASSIF':        return 'Passif — Crédit ↑ augmente · Débit ↓ diminue';
    case 'FONDS_PROPRES': return 'Capital — Crédit ↑ augmente · Débit ↓ diminue';
    case 'PRODUIT':       return 'Produit — Crédit ↑ recette · Débit ↓ contre-passation';
    case 'CHARGE':        return 'Charge — Débit ↑ dépense · Crédit ↓ contre-passation';
    default:              return "Sélectionnez un compte pour voir l'aide";
  }
}
```

**Remplacer le bloc `linesContainer` (depuis `<div className={styles.linesContainer}>`) :**
```tsx
<div className={styles.linesContainer}>
  <div className={styles.linesHeader}>
    <span className={styles.colAccount}>Compte</span>
    <span className={styles.colAmount}>Débit CHF</span>
    <span className={styles.colAmount}>Crédit CHF</span>
    <span className={styles.colTooltipSpacer} />
    <span className={styles.colSpacer} />
  </div>

  {lines.map((line, i) => {
    const acc = accounts.find(a => String(a.id) === line.account_id);
    return (
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

        <Tooltip content={helpForType(acc?.type)} />

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
    );
  })}

  <button type="button" onClick={addLine} className={styles.addLineBtn}>
    + Ajouter une ligne
  </button>
</div>
```

- [ ] **Step 4 : Ajouter `.colTooltipSpacer` dans `EntryForm.module.css`**

Ajouter à la fin du fichier :

```css
.colTooltipSpacer {
  width: 15px;
  flex-shrink: 0;
}
```

- [ ] **Step 5 : Vérifier que tous les tests passent**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  334 passed (334)`

- [ ] **Step 6 : Commit**

```
git add app/src/components/EntryForm.tsx app/src/components/EntryForm.module.css app/src/__tests__/renderer/EntryForm.test.tsx
git commit -m "feat(ui): tooltip d'aide contextuel par ligne dans EntryForm"
```

---

### Task 6 : Mise à jour `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1 : Ajouter la règle de maintenance dans CLAUDE.md**

Dans la section "Décisions d'architecture → Décidé", ajouter après la ligne sur les CSS Modules :

```markdown
- **Système d'aide** : `HelpDrawer.tsx` contient l'aide intégrée (3 onglets : Démarrage rapide, Comptabilité, Application). **À chaque correction ou nouvelle fonctionnalité, vérifier si le contenu du drawer doit être mis à jour** — en particulier si des noms de boutons, pages ou raccourcis changent.
```

Dans la section "État d'avancement → Fait", ajouter :
```markdown
- [x] Système d'aide : Tooltip dynamique par ligne (EntryForm) + drawer latéral global (F1 / bouton sidebar)
```

- [ ] **Step 2 : Vérifier que les tests passent toujours**

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  334 passed (334)`

- [ ] **Step 3 : Commit**

```
git add CLAUDE.md
git commit -m "docs: documenter le système d'aide et règle de maintenance HelpDrawer"
```

---

## Vérification finale

```
cd app && npm test 2>&1 | tail -6
```
Attendu : `Tests  334 passed (334)` — 16 nouveaux tests (3 Tooltip + 5 HelpDrawer + 3 Layout + 2 Sidebar + 3 EntryForm).
