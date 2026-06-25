# Journal UX — Raccourcis Clavier et Améliorations Saisie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accélérer la saisie des écritures : `Ctrl+N` pour ouvrir le formulaire depuis le journal, autofocus sur le champ Date, date par défaut adaptée à l'exercice, `Ctrl+S` pour enregistrer, `Ctrl+Enter` + bouton "Enregistrer + Nouveau" pour enchaîner les saisies.

**Architecture:** `defaultDate(fiscalYear)` remplace `today()` dans `EntryForm` pour produire une date initiale cohérente avec l'année de l'exercice. Les raccourcis clavier utilisent un `useEffect` stable (deps `[]`) avec des refs synchronisées chaque render pour éviter les stale closures. `handleSave(andNew: boolean)` remplace `handleSubmit` et centralise la logique de soumission. Le câblage `onSavedNew` traverse `EntryFormModal` → `EntryForm`.

**Tech Stack:** React hooks (`useRef`, `useEffect`), Vitest + React Testing Library (`fireEvent`, `waitFor`, fake timers), CSS Modules existants.

## Global Constraints

- CSS Modules — zéro `style={{}}` inline dans les composants
- `canSubmit` (booléen existant dans `EntryForm`) = unique garde pour Ctrl+S et Ctrl+Enter
- `Ctrl+N` : actif uniquement si `currentFiscalYear?.is_closed === false` et `modal === null`
- `Ctrl+S` : active uniquement si `canSubmit === true`
- `Ctrl+Enter` : actif uniquement si `canSubmit === true` **et** `onSavedNew` est défini
- "Enregistrer + Nouveau" : jamais visible en mode édition (`editEntry` défini)
- `defaultDate(fiscalYear)` : utilise la date locale (pas UTC), clampée à `[start_date, end_date]`
- Montants en centimes (INTEGER) — invariant respecté, pas de changement ici
- Tests : `cd app && npx vitest run` depuis la racine du projet

---

## Fichiers touchés

| Fichier | Rôle |
|---|---|
| `app/src/components/EntryForm.tsx` | `defaultDate`, `dateRef`, autofocus, `onSavedNew`, `handleSave`, keyboard handler, bouton |
| `app/src/components/EntryFormModal.tsx` | Prop `onSavedNew` transmise à `EntryForm` |
| `app/src/pages/JournalPage.tsx` | `Ctrl+N` handler, `onSavedNew` câblé vers `EntryFormModal` |
| `app/src/components/HelpDrawer.tsx` | 3 nouvelles lignes dans le tableau des raccourcis |
| `app/src/__tests__/renderer/EntryForm.test.tsx` | Tests `defaultDate`, autofocus, bouton, raccourcis |
| `app/src/__tests__/renderer/JournalPage.test.tsx` | Tests `Ctrl+N` |
| `CLAUDE.md` | Mise à jour du compteur de tests |

---

### Task 1 : `defaultDate(fiscalYear)` + autofocus champ Date

**Files:**
- Modify: `app/src/components/EntryForm.tsx`
- Modify: `app/src/__tests__/renderer/EntryForm.test.tsx`

**Interfaces:**
- Produces: `dateRef` (`useRef<HTMLInputElement>(null)`) disponible pour Task 2 (refocus post-reset)
- Produces: `defaultDate(fiscalYear: FiscalYear): string` disponible pour Task 2 (reset après save+new)

- [ ] **Step 1 : Ajouter les imports manquants dans le fichier de test**

Dans `app/src/__tests__/renderer/EntryForm.test.tsx`, ligne 1, remplacer :
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
```
par :
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

Et ligne 3, ajouter `waitFor` :
```typescript
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
```

- [ ] **Step 2 : Écrire les tests qui doivent échouer**

Ajouter à la fin de `app/src/__tests__/renderer/EntryForm.test.tsx` (après le dernier describe) :

```typescript
describe('EntryForm — date par défaut (defaultDate)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("utilise la date du jour si l'exercice est l'année courante", () => {
    vi.setSystemTime(new Date(2025, 5, 25, 12, 0, 0)); // 25 juin 2025 local
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-25');
  });

  it("utilise le même jour/mois dans l'année de l'exercice si différent", () => {
    vi.setSystemTime(new Date(2026, 5, 25, 12, 0, 0)); // 25 juin 2026 — fy.year = 2025
    render(<EntryForm {...defaultProps} />);
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-25');
  });

  it('clamp à start_date si le candidat est antérieur au début de l\'exercice', () => {
    vi.setSystemTime(new Date(2025, 4, 10, 12, 0, 0)); // 10 mai 2025
    const fyLate: FiscalYear = { ...fy, start_date: '2025-06-01', end_date: '2025-12-31' };
    render(<EntryForm {...defaultProps} fiscalYear={fyLate} />);
    // candidat 2025-05-10 < 2025-06-01 → clamped
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-01');
  });

  it('clamp à end_date si le candidat est postérieur à la fin de l\'exercice', () => {
    vi.setSystemTime(new Date(2025, 7, 15, 12, 0, 0)); // 15 août 2025
    const fyEarly: FiscalYear = { ...fy, start_date: '2025-01-01', end_date: '2025-06-30' };
    render(<EntryForm {...defaultProps} fiscalYear={fyEarly} />);
    // candidat 2025-08-15 > 2025-06-30 → clamped
    expect(screen.getByLabelText('Date *')).toHaveValue('2025-06-30');
  });
});

describe('EntryForm — autofocus champ Date', () => {
  it('le champ Date reçoit le focus au montage en mode création', async () => {
    render(<EntryForm {...defaultProps} />);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Date *'));
    });
  });

  it("le champ Date ne reçoit pas le focus au montage en mode édition", async () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} />);
    // Laisser passer un tick pour que l'effect ait pu s'exécuter
    await waitFor(() => {
      expect(document.activeElement).not.toBe(screen.getByLabelText('Date *'));
    });
  });
});
```

- [ ] **Step 3 : Vérifier que les tests échouent**

```
cd app && npx vitest run src/__tests__/renderer/EntryForm.test.tsx
```

Attendu : les 6 nouveaux tests échouent (`today()` ne connaît pas l'exercice, aucun autofocus).

- [ ] **Step 4 : Implémenter dans `EntryForm.tsx`**

**4a.** Remplacer la déclaration `useState` de `date` (ligne 45) :
```typescript
const [date, setDate] = useState(editEntry?.date ?? today());
```
par :
```typescript
const [date, setDate] = useState(editEntry?.date ?? defaultDate(fiscalYear));
```

**4b.** Ajouter `dateRef` après les refs existantes (ligne 55, après `focusLastLineRef`) :
```typescript
const dateRef = useRef<HTMLInputElement>(null);
```

**4c.** Ajouter le `useEffect` d'autofocus immédiatement après le `useEffect` existant (ligne 57-62) :
```typescript
const isCreating = !editEntry;
useEffect(() => {
  if (isCreating) dateRef.current?.focus();
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**4d.** Dans le JSX, ajouter `ref={dateRef}` sur le champ date (ligne 160) :
```tsx
<input
  id="entry-date"
  type="date"
  ref={dateRef}
  value={date}
  onChange={e => setDate(e.target.value)}
  min={fiscalYear.start_date}
  max={fiscalYear.end_date}
  required
  className={styles.input}
/>
```

**4e.** Remplacer la fonction `today()` en bas du fichier (lignes 301-303) par `defaultDate` :
```typescript
function defaultDate(fiscalYear: FiscalYear): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const candidate = yyyy === fiscalYear.year
    ? `${yyyy}-${mm}-${dd}`
    : `${fiscalYear.year}-${mm}-${dd}`;
  if (candidate < fiscalYear.start_date) return fiscalYear.start_date;
  if (candidate > fiscalYear.end_date)   return fiscalYear.end_date;
  return candidate;
}
```

Note : la fonction utilise exclusivement des méthodes locales (`getFullYear`, `getMonth`, `getDate`) — pas `toISOString()` — pour éviter les décalages UTC en fin/début de journée.

- [ ] **Step 5 : Vérifier que les tests passent**

```
cd app && npx vitest run src/__tests__/renderer/EntryForm.test.tsx
```

Attendu : tous les tests passent (les 6 nouveaux + les anciens).

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/EntryForm.tsx app/src/__tests__/renderer/EntryForm.test.tsx
git commit -m "feat(entry-form): defaultDate par exercice + autofocus champ Date"
```

---

### Task 2 : `handleSave` + Ctrl+S, Ctrl+Enter, bouton "Enregistrer + Nouveau"

**Files:**
- Modify: `app/src/components/EntryForm.tsx`
- Modify: `app/src/components/EntryFormModal.tsx`
- Modify: `app/src/__tests__/renderer/EntryForm.test.tsx`

**Interfaces:**
- Consumes: `dateRef` (Task 1), `defaultDate(fiscalYear)` (Task 1)
- Consumes: `EntryFormProps.onCreated` (existant), `EntryFormProps.onCancel` (existant)
- Produces: `EntryFormProps.onSavedNew?: () => void` — câblé dans `EntryFormModal` et `JournalPage` (Task 3)

- [ ] **Step 1 : Ajouter le helper de remplissage et les tests qui échouent**

Ajouter dans `app/src/__tests__/renderer/EntryForm.test.tsx`, juste avant le premier describe qui en aura besoin (après la définition de `editEntry`, en haut du fichier de test, vers la ligne 185) — **en dehors de tout describe** :

```typescript
/** Remplit le formulaire avec une écriture 30 CHF Caisse/Cotisations équilibrée. */
async function fillValidForm() {
  const user = userEvent.setup();
  fireEvent.change(screen.getByLabelText('Date *'), { target: { value: '2025-06-15' } });
  await user.type(screen.getByLabelText('Libellé *'), 'Test');
  const s1 = screen.getByRole('combobox', { name: 'Compte ligne 1' });
  await user.selectOptions(s1, within(s1).getByRole('option', { name: /Caisse/ }));
  await user.type(screen.getByRole('spinbutton', { name: 'Débit ligne 1' }), '30');
  const s2 = screen.getByRole('combobox', { name: 'Compte ligne 2' });
  await user.selectOptions(s2, within(s2).getByRole('option', { name: /Cotisations/ }));
  await user.type(screen.getByRole('spinbutton', { name: 'Crédit ligne 2' }), '30');
}
```

Puis ajouter à la fin du fichier :

```typescript
describe('EntryForm — bouton Enregistrer + Nouveau', () => {
  it('est visible en mode création quand onSavedNew est défini', () => {
    render(<EntryForm {...defaultProps} onSavedNew={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Enregistrer \+ Nouveau/ })).toBeInTheDocument();
  });

  it('est absent en mode édition même si onSavedNew est défini', () => {
    render(<EntryForm {...defaultProps} editEntry={editEntry} onSavedNew={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Enregistrer \+ Nouveau/ })).not.toBeInTheDocument();
  });

  it("est absent en mode création si onSavedNew n'est pas fourni", () => {
    render(<EntryForm {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /Enregistrer \+ Nouveau/ })).not.toBeInTheDocument();
  });

  it('appelle onSavedNew (pas onCreated) et réinitialise le formulaire', async () => {
    const onSavedNew = vi.fn();
    render(<EntryForm {...defaultProps} onSavedNew={onSavedNew} />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /Enregistrer \+ Nouveau/ }));
    await waitFor(() => expect(onSavedNew).toHaveBeenCalledOnce());
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
    // formulaire réinitialisé
    expect(screen.getByLabelText('Libellé *')).toHaveValue('');
    expect(screen.getByLabelText('Pièce')).toHaveValue('');
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });
});

describe('EntryForm — raccourcis Ctrl+S et Ctrl+Entrée', () => {
  it('Ctrl+S soumet le formulaire si canSubmit est vrai', async () => {
    render(<EntryForm {...defaultProps} />);
    await fillValidForm();
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => {
      expect(window.api.createJournalEntry).toHaveBeenCalledOnce();
    });
  });

  it('Ctrl+S ne soumet pas si le formulaire est incomplet', () => {
    render(<EntryForm {...defaultProps} />);
    // libellé vide, montants vides → canSubmit = false
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    expect(window.api.createJournalEntry).not.toHaveBeenCalled();
  });

  it('Ctrl+Entrée appelle onSavedNew et réinitialise si onSavedNew est défini', async () => {
    const onSavedNew = vi.fn();
    render(<EntryForm {...defaultProps} onSavedNew={onSavedNew} />);
    await fillValidForm();
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onSavedNew).toHaveBeenCalledOnce());
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Libellé *')).toHaveValue('');
  });

  it('Ctrl+Entrée ne soumet pas si onSavedNew est absent', async () => {
    render(<EntryForm {...defaultProps} />);
    await fillValidForm();
    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });
    // la garde onSavedNewRef.current est undefined → pas d'appel
    expect(window.api.createJournalEntry).not.toHaveBeenCalled();
    expect(defaultProps.onCreated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npx vitest run src/__tests__/renderer/EntryForm.test.tsx
```

Attendu : les 8 nouveaux tests échouent.

- [ ] **Step 3 : Implémenter les changements dans `EntryForm.tsx`**

**3a.** Ajouter `onSavedNew` à l'interface `EntryFormProps` (ligne 19, après `onCreated`) :
```typescript
interface EntryFormProps {
  fiscalYear: FiscalYear;
  accounts:   Account[];
  editEntry?: JournalEntry & { lines: JournalEntryLine[] };
  hideTitle?: boolean;
  onCreated:  () => void;
  onCancel:   () => void;
  onSavedNew?: () => void;
}
```

**3b.** Mettre à jour la signature de la fonction composant (ligne 44) :
```typescript
export default function EntryForm({ fiscalYear, accounts, editEntry, hideTitle, onCreated, onCancel, onSavedNew }: EntryFormProps) {
```

**3c.** Ajouter 3 refs après `dateRef` (ajouté en Task 1) :
```typescript
const canSubmitRef  = useRef(false);
const onSavedNewRef = useRef<(() => void) | undefined>(undefined);
const handleSaveRef = useRef<(andNew: boolean) => void>(() => {});
```

**3d.** Juste avant le `return`, ajouter les mises à jour synchrones des refs (pour éviter les stale closures dans le handler stable) :
```typescript
canSubmitRef.current  = canSubmit;
onSavedNewRef.current = onSavedNew;
// handleSaveRef est mis à jour après la définition de handleSave (voir 3e)
```

**3e.** Remplacer `handleSubmit` (lignes 103-147) par `handleSave` + mise à jour du ref :
```typescript
async function handleSave(andNew: boolean) {
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
    if (andNew) {
      setDate(defaultDate(fiscalYear));
      setDescription('');
      setPiece('');
      setLines([emptyLine(), emptyLine()]);
      setApiError(null);
      setTimeout(() => dateRef.current?.focus(), 0);
      onSavedNew!();
    } else {
      onCreated();
    }
  } catch (e: unknown) {
    setApiError((e as Error).message);
  } finally {
    setSubmitting(false);
  }
}
handleSaveRef.current = (andNew) => void handleSave(andNew);
```

**3f.** Ajouter le `useEffect` pour les raccourcis clavier (après le `useEffect` d'autofocus de Task 1) :
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (!e.ctrlKey) return;
    if (e.key === 's' && canSubmitRef.current) {
      e.preventDefault();
      handleSaveRef.current(false);
    }
    if (e.key === 'Enter' && onSavedNewRef.current && canSubmitRef.current) {
      e.preventDefault();
      handleSaveRef.current(true);
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**3g.** Modifier le `<form onSubmit>` (ligne 150) pour appeler `handleSave(false)` :
```tsx
<form
  onSubmit={(e) => { e.preventDefault(); void handleSave(false); }}
  aria-label="Formulaire de saisie d'écriture"
  noValidate
  className={styles.card}
>
```

**3h.** Ajouter le bouton "Enregistrer + Nouveau" dans `<div className={styles.actions}>` (entre Annuler et le bouton submit existant) :
```tsx
<div className={styles.actions}>
  <button type="button" onClick={onCancel} className={styles.cancelBtn}>Annuler</button>
  {!editEntry && onSavedNew && (
    <button
      type="button"
      disabled={!canSubmit}
      onClick={() => void handleSave(true)}
      className={styles.submitBtn}
    >
      {submitting ? 'Enregistrement…' : 'Enregistrer + Nouveau'}
    </button>
  )}
  <button
    type="submit"
    disabled={!canSubmit}
    className={styles.submitBtn}
  >
    {submitting ? 'Enregistrement…' : 'Enregistrer l\'écriture'}
  </button>
</div>
```

- [ ] **Step 4 : Implémenter dans `EntryFormModal.tsx`**

Remplacer le contenu du fichier entier par :
```typescript
import type { FiscalYear, Account, JournalEntry, JournalEntryLine } from '../types';
import EntryForm from './EntryForm';
import Modal from './Modal';
import styles from './EntryFormModal.module.css';

interface EntryFormModalProps {
  fiscalYear:  FiscalYear;
  accounts:    Account[];
  editEntry?:  JournalEntry & { lines: JournalEntryLine[] };
  onSaved:     () => void;
  onSavedNew?: () => void;
  onClose:     () => void;
}

export default function EntryFormModal({ fiscalYear, accounts, editEntry, onSaved, onSavedNew, onClose }: EntryFormModalProps) {
  const title = editEntry
    ? `Modifier l'écriture — exercice ${fiscalYear.year}`
    : `Nouvelle écriture — exercice ${fiscalYear.year}`;

  return (
    <Modal
      ariaLabelledby="modal-title"
      onClose={onClose}
      className={styles.card}
      data-testid="modal-overlay"
    >
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
        onSavedNew={onSavedNew}
      />
    </Modal>
  );
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```
cd app && npx vitest run src/__tests__/renderer/EntryForm.test.tsx
```

Attendu : tous les tests passent.

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/EntryForm.tsx app/src/components/EntryFormModal.tsx app/src/__tests__/renderer/EntryForm.test.tsx
git commit -m "feat(entry-form): Ctrl+S, Ctrl+Entrée, bouton Enregistrer + Nouveau"
```

---

### Task 3 : Ctrl+N JournalPage + câblage `onSavedNew` + HelpDrawer

**Files:**
- Modify: `app/src/pages/JournalPage.tsx`
- Modify: `app/src/components/HelpDrawer.tsx`
- Modify: `app/src/__tests__/renderer/JournalPage.test.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `EntryFormModal.onSavedNew?: () => void` (Task 2)

- [ ] **Step 1 : Ajouter `fireEvent` à l'import et écrire les tests qui échouent**

Dans `app/src/__tests__/renderer/JournalPage.test.tsx`, ligne 3, ajouter `fireEvent` :
```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
```

Ajouter à la fin du fichier :

```typescript
describe('JournalPage — raccourci Ctrl+N', () => {
  it('ouvre le formulaire si exercice ouvert et aucune modale', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    fireEvent.keyDown(document, { key: 'n', ctrlKey: true });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('ne fait rien si exercice clôturé', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:    vi.fn().mockResolvedValue([fyClosed]),
      getActiveAccounts: vi.fn().mockResolvedValue(accounts),
      getJournalEntries: vi.fn().mockResolvedValue([]),
    });
    render(<JournalPage />);
    // attendre que la page charge avec le FY clôturé (le bouton "Nouvelle écriture" est absent)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Nouvelle écriture/ })).not.toBeInTheDocument()
    );
    fireEvent.keyDown(document, { key: 'n', ctrlKey: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ne fait rien si une modale est déjà ouverte', async () => {
    render(<JournalPage />);
    await screen.findByText('Cotisation membre');
    // ouvrir la modale via le bouton
    await userEvent.click(screen.getByRole('button', { name: /Nouvelle écriture/ }));
    await screen.findByRole('dialog');
    // Ctrl+N avec modale déjà ouverte
    fireEvent.keyDown(document, { key: 'n', ctrlKey: true });
    // toujours une seule modale
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```
cd app && npx vitest run src/__tests__/renderer/JournalPage.test.tsx
```

Attendu : les 3 nouveaux tests échouent (pas de handler Ctrl+N).

- [ ] **Step 3 : Implémenter dans `JournalPage.tsx`**

**3a.** Ajouter `useRef` à l'import React (ligne 1) :
```typescript
import { useEffect, useRef, useState } from 'react';
```

**3b.** Ajouter 2 refs après les déclarations `useState` (avant les `useEffect` existants) :
```typescript
const modalRef             = useRef<ModalState>(null);
const currentFiscalYearRef = useRef<FiscalYear | undefined>(undefined);
```

**3c.** Ajouter le `useEffect` Ctrl+N après les deux `useEffect` existants (chargement initial et rechargement sur changement d'exercice) :
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      if (!currentFiscalYearRef.current?.is_closed && modalRef.current === null) {
        setModal({ mode: 'create' });
      }
    }
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**3d.** Mettre à jour les refs **juste avant le `return`** (après `const filtered = ...`) :
```typescript
modalRef.current             = modal;
currentFiscalYearRef.current = currentFiscalYear;
```

**3e.** Dans le JSX, ajouter la prop `onSavedNew` à `<EntryFormModal>` (après `onSaved`) :
```tsx
{modal !== null && currentFiscalYear && (
  <EntryFormModal
    fiscalYear={currentFiscalYear}
    accounts={accounts}
    editEntry={modal.mode === 'edit' ? modal.entry : undefined}
    onSaved={async () => {
      const isEdit = modal?.mode === 'edit';
      setModal(null);
      await reloadEntries();
      setToast(isEdit ? 'Écriture modifiée' : 'Écriture enregistrée');
    }}
    onSavedNew={modal.mode === 'create' ? async () => {
      await reloadEntries();
      setToast('Écriture enregistrée');
    } : undefined}
    onClose={() => setModal(null)}
  />
)}
```

- [ ] **Step 4 : Implémenter dans `HelpDrawer.tsx`**

Dans `app/src/components/HelpDrawer.tsx`, lignes 217-220, après `<tr><td><kbd>Entrée</kbd>...` et avant `</tbody>`, ajouter 3 lignes :
```tsx
<tr><td><kbd>Ctrl+N</kbd></td><td>Journal — ouvrir le formulaire Nouvelle écriture</td></tr>
<tr><td><kbd>Ctrl+S</kbd></td><td>Formulaire écriture — enregistrer et fermer</td></tr>
<tr><td><kbd>Ctrl+Entrée</kbd></td><td>Formulaire écriture — enregistrer et créer une nouvelle écriture</td></tr>
```

La section doit ressembler à ceci après modification :
```tsx
<h3 className={styles.sectionTitle}>Raccourcis clavier</h3>
<table className={styles.helpTable}>
  <tbody>
    <tr><td><kbd>F1</kbd></td><td>Ouvrir / fermer l'aide</td></tr>
    <tr><td><kbd>Escape</kbd></td><td>Fermer l'aide ou les modales</td></tr>
    <tr><td><kbd>Entrée</kbd></td><td>Dans le dernier champ montant d'une écriture — ajouter une ligne</td></tr>
    <tr><td><kbd>Ctrl+N</kbd></td><td>Journal — ouvrir le formulaire Nouvelle écriture</td></tr>
    <tr><td><kbd>Ctrl+S</kbd></td><td>Formulaire écriture — enregistrer et fermer</td></tr>
    <tr><td><kbd>Ctrl+Entrée</kbd></td><td>Formulaire écriture — enregistrer et créer une nouvelle écriture</td></tr>
  </tbody>
</table>
```

- [ ] **Step 5 : Lancer tous les tests**

```
cd app && npx vitest run
```

Attendu : tous les tests passent. Comptage attendu : 528 + 16 = 544 tests.

- [ ] **Step 6 : Mettre à jour CLAUDE.md**

Dans la section "État d'avancement / À faire / Fonctionnalités", trouver la ligne du Grand-livre et ajouter une nouvelle ligne marquée `[x]` juste après. Mettre également à jour le compteur de tests dans la même ligne pour refléter le nouveau total.

Changer dans la section Grand-livre :
```
- [x] Page **Grand-livre** (`AccountLedgerPage`) — ... — 525 tests
```
par :
```
- [x] Page **Grand-livre** (`AccountLedgerPage`) — ... — 525 tests
- [x] Journal UX — raccourcis `Ctrl+N` (JournalPage), `Ctrl+S` et `Ctrl+Entrée` (EntryForm), bouton "Enregistrer + Nouveau", autofocus champ Date, `defaultDate(fiscalYear)` — 544 tests
```

- [ ] **Step 7 : Commit**

```bash
git add app/src/pages/JournalPage.tsx app/src/components/HelpDrawer.tsx app/src/__tests__/renderer/JournalPage.test.tsx CLAUDE.md
git commit -m "feat(journal): Ctrl+N + onSavedNew câblé + raccourcis dans l'aide — 544 tests"
```
