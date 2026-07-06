# Signalement visuel des arriérés — page Membres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un fond rouge clair sur les cellules non payées du récapitulatif Membres lorsqu'elles représentent un véritable arriéré (le membre était déjà au club et l'année n'est pas future).

**Architecture:** Une fonction pure `isArrears(member, year)` ajoutée à `MembresPage.tsx`, appliquée via un attribut `data-arrears` sur la cellule `<td>` (convention déjà établie dans le projet pour les styles conditionnels — voir `data-negative` dans `BalancesPage.tsx`/`BilanPage.tsx`), stylé par une règle CSS `[data-arrears]` dans `MembresPage.module.css`.

**Tech Stack:** React + TypeScript, CSS Modules, Vitest + React Testing Library

## Global Constraints

- Branche : `feature/members-dues` (déjà existante) — commiter directement dessus
- Une cellule non payée est signalée (`data-arrears`) si :
  1. L'année de la colonne n'est pas future : `year <= new Date().getFullYear()`
  2. **ET**, selon `entry_date` du membre :
     - Présente : signalée seulement si `year >= entryYear` (année extraite de `entry_date`, format ISO `YYYY-MM-DD`)
     - Absente (`null`) : toujours signalée (dès lors que la condition 1 est vraie)
- Une cellule payée n'est jamais signalée, quelle que soit l'année
- Style : réutiliser le token CSS existant `var(--error-bg)` (`#fee2e2`), pas de nouvelle couleur inventée
- Convention du projet : styles conditionnels via attribut `data-*` (`data-arrears={condition || undefined}`) + sélecteur CSS `[data-arrears]`, pas de classe conditionnelle ni de `style={{}}` inline
- Aucun changement de schéma, IPC, ou logique de paiement — purement un rendu visuel côté renderer

---

## Task 1 : `isArrears` + attribut `data-arrears` sur les cellules du récapitulatif

**Files:**
- Modify: `app/src/pages/MembresPage.tsx`
- Modify: `app/src/pages/MembresPage.module.css`
- Modify: `app/src/__tests__/renderer/MembresPage.test.tsx`

**Interfaces:**
- Consumes: `MemberWithDues` (déjà défini dans `../types`, champs `entry_date: string | null`, `dues: MemberDues[]`), `isPaid(m, year)` (fonction déjà existante dans le composant)
- Produces: fonction `isArrears(member: MemberWithDues, year: number): boolean` locale au fichier (pas exportée, pas consommée ailleurs)

- [ ] **Step 1 : Écrire les tests avec contrôle du temps système**

Dans `app/src/__tests__/renderer/MembresPage.test.tsx`, ajouter en haut du fichier (après les imports existants, avant les constantes `mockYear`/`mockMember`) :

```typescript
import { afterEach } from 'vitest';
```

Ajouter à la fin du fichier un nouveau `describe` :

```typescript
describe('Signalement des arriérés', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('signale une année non payée si entry_date est absente (année non future)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01'));
    const memberNoEntry: MemberWithDues = {
      id: 10, last_name: 'Sans', first_name: 'Entree',
      entry_date: null, is_active: 1, inactive_note: null, created_at: '',
      dues: [],
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getMembers:     vi.fn().mockResolvedValue([memberNoEntry]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2024 } }),
    });
    render(<MembresPage />);
    await screen.findByText('Sans');
    const cell = screen.getByText('—').closest('td')!;
    expect(cell).toHaveAttribute('data-arrears', 'true');
  });

  it('ne signale pas une année non payée antérieure à entry_date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01'));
    const memberEntry2022: MemberWithDues = {
      id: 11, last_name: 'Entree', first_name: 'Tardive',
      entry_date: '2022-06-01', is_active: 1, inactive_note: null, created_at: '',
      dues: [],
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getMembers:     vi.fn().mockResolvedValue([memberEntry2022]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2020, end: 2020 } }),
    });
    render(<MembresPage />);
    await screen.findByText('Tardive');
    const cell = screen.getByText('—').closest('td')!;
    expect(cell).not.toHaveAttribute('data-arrears');
  });

  it('signale une année non payée égale ou postérieure à entry_date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01'));
    const memberEntry2022: MemberWithDues = {
      id: 12, last_name: 'Entree', first_name: 'Normale',
      entry_date: '2022-06-01', is_active: 1, inactive_note: null, created_at: '',
      dues: [],
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getMembers:     vi.fn().mockResolvedValue([memberEntry2022]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2022, end: 2022 } }),
    });
    render(<MembresPage />);
    await screen.findByText('Normale');
    const cell = screen.getByText('—').closest('td')!;
    expect(cell).toHaveAttribute('data-arrears', 'true');
  });

  it('ne signale jamais une année future, même si entry_date est absente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01'));
    const memberNoEntry: MemberWithDues = {
      id: 13, last_name: 'Sans', first_name: 'Futur',
      entry_date: null, is_active: 1, inactive_note: null, created_at: '',
      dues: [],
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getMembers:     vi.fn().mockResolvedValue([memberNoEntry]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2027, end: 2027 } }),
    });
    render(<MembresPage />);
    await screen.findByText('Futur');
    const cell = screen.getByText('—').closest('td')!;
    expect(cell).not.toHaveAttribute('data-arrears');
  });

  it('ne signale jamais une cellule payée', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01'));
    const memberPaidNoEntry: MemberWithDues = {
      id: 14, last_name: 'Paye', first_name: 'SansEntree',
      entry_date: null, is_active: 1, inactive_note: null, created_at: '',
      dues: [{ id: 99, member_id: 14, year: 2024, paid: 1, payment_note: null,
               payment_date: '2024-03-01', amount_cents: 3000, journal_entry_id: 20, created_at: '' }],
    };
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([]),
      getMembers:     vi.fn().mockResolvedValue([memberPaidNoEntry]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2024 } }),
    });
    render(<MembresPage />);
    await screen.findByText('Paye');
    const cell = screen.getByText('✓').closest('td')!;
    expect(cell).not.toHaveAttribute('data-arrears');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | tail -40
```

Expected : FAIL — `data-arrears` jamais présent (attribut inexistant sur les cellules actuelles).

- [ ] **Step 3 : Ajouter `isArrears` dans `MembresPage.tsx`**

Ajouter la fonction juste après `computeDefaultRange` (avant `export default function MembresPage()`) :

```typescript
function isArrears(member: MemberWithDues, year: number): boolean {
  const currentYear = new Date().getFullYear();
  if (year > currentYear) return false;
  if (!member.entry_date) return true;
  const entryYear = parseInt(member.entry_date.slice(0, 4), 10);
  return year >= entryYear;
}
```

- [ ] **Step 4 : Appliquer `data-arrears` sur les cellules année**

Remplacer le bloc de rendu des cellules année (actuellement) :

```typescript
                {displayedYears.map(y => (
                  <td key={y} className={styles.num}>
                    {isPaid(m, y)
                      ? <span className={styles.paid}>✓</span>
                      : <span className={styles.unpaid}>—</span>
                    }
                  </td>
                ))}
```

par :

```typescript
                {displayedYears.map(y => (
                  <td key={y} className={styles.num} data-arrears={!isPaid(m, y) && isArrears(m, y) || undefined}>
                    {isPaid(m, y)
                      ? <span className={styles.paid}>✓</span>
                      : <span className={styles.unpaid}>—</span>
                    }
                  </td>
                ))}
```

- [ ] **Step 5 : Ajouter la règle CSS**

Dans `app/src/pages/MembresPage.module.css`, ajouter après la règle `.num` :

```css
.num[data-arrears] { background: var(--error-bg); }
```

- [ ] **Step 6 : Vérifier que les tests passent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | tail -40
```

Expected : tous PASS (anciens + 5 nouveaux).

- [ ] **Step 7 : Vérifier que toute la suite passe (pas de régression)**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 679 + 5 = 684.

- [ ] **Step 8 : Commit**

```bash
git add app/src/pages/MembresPage.tsx app/src/pages/MembresPage.module.css \
        app/src/__tests__/renderer/MembresPage.test.tsx
git commit -m "feat(members): signalement visuel des arriérés (fond rouge clair) sur le récapitulatif"
```

---

## Auto-révision du plan

**Couverture spec :**
- Signalement si non payé + non futur + (entry_date absente OU année ≥ entrée) → `isArrears` Step 3, appliqué Step 4.
- Année future jamais signalée → testé Step 1 (test "ne signale jamais une année future").
- Année < entrée jamais signalée si `entry_date` présente → testé Step 1.
- Entry_date absente → toujours signalée (si non future) → testé Step 1.
- Cellule payée jamais signalée → testé Step 1.
- Réutilisation de `var(--error-bg)`, convention `data-*` → Step 5, Step 4.

**Scan placeholders :** aucun trouvé — chaque étape contient le code exact.

**Cohérence des types :** `isArrears(member: MemberWithDues, year: number): boolean` — signature cohérente entre définition (Step 3) et usage (Step 4). Pas de nouveau type introduit, réutilise `MemberWithDues` existant.
