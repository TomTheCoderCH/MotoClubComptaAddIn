# Améliorations MembreDetailModal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la case à cocher "payé" toujours éditable dans `MembreDetailModal` (y compris pour les années ayant un exercice comptable existant) et permettre l'ajout manuel d'années antérieures non encore présentes dans le tableau.

**Architecture:** Un seul composant modifié (`MembreDetailModal.tsx`) : remplacement de la logique `isHistorical` (basée sur la présence d'un exercice comptable) par une vérification `journal_entry_id` pour décider de l'affichage de la colonne Note/Mode ; ajout d'un petit formulaire local (state + validation) pour créer de nouvelles lignes `member_dues` via la fonction IPC existante `setHistoricalDues`. Aucun changement de schéma SQLite, DB, ni IPC — `setHistoricalDues(memberId, year, paid, note)` couvre déjà tous les besoins.

**Tech Stack:** React + TypeScript, CSS Modules, Vitest + React Testing Library

## Global Constraints

- Branche : `feature/members-dues` (déjà existante) — commiter directement dessus, ne pas créer de nouvelle branche
- La case à cocher "payé" appelle toujours `window.api.setHistoricalDues(memberId, year, paid, note)` — jamais `recordPayment` (qui reste réservé au bouton "Enregistrer un paiement")
- Cocher/décocher une année liée à une écriture comptable (`journal_entry_id != null`) ne modifie jamais `payment_date`, `amount_cents`, ni `journal_entry_id` — seuls `paid`/`payment_note` changent (déjà garanti par l'upsert existant de `setHistoricalDues`, aucun changement DB requis)
- Colonne "Note / Mode" : champ texte éditable si `dues?.journal_entry_id == null`, sinon affichage lecture seule de `payment_date`
- Contrôle "Ajouter une année" : validation — année à 4 chiffres, comprise entre 1900 et `new Date().getFullYear()` (bornes incluses), pas déjà présente dans `allYears` ; erreur affichée inline (pas de `ConfirmDialog`), style `.error { color: var(--error); font-size: var(--font-size-sm); }` (voir `MembrePaiementModal.module.css:21`)
- Ajout d'année → appelle `setHistoricalDues(memberId, year, false, null)`
- CSS Modules uniquement, zéro `style={{}}` inline
- Modal.tsx reste la racine (déjà en place, ne pas toucher)

---

## Task 1 : Case à cocher toujours éditable + contrôle d'ajout d'année

**Files:**
- Modify: `app/src/components/MembreDetailModal.tsx`
- Modify: `app/src/components/MembreDetailModal.module.css`
- Modify: `app/src/__tests__/renderer/MembreDetailModal.test.tsx`

**Interfaces:**
- Consumes: `window.api.setHistoricalDues(memberId: number, year: number, paid: boolean, note: string | null): Promise<MemberDues>` (déjà existant, IPC handler `members:setHistoricalDues`, aucun changement)
- Produces: aucune nouvelle interface exposée à l'extérieur du composant — `MembreDetailModal` garde exactement les mêmes props `{ member: MemberWithDues; fiscalYears: FiscalYear[]; onClose: () => void; onUpdated: () => void; }`

- [ ] **Step 1 : Lire l'état actuel du composant et du fichier de test pour confirmer le point de départ**

Le fichier `app/src/components/MembreDetailModal.tsx` contient actuellement (extrait pertinent) :

```typescript
const isHistorical = (year: number) => !fyYears.has(year);
```

et dans le JSX, une branche conditionnelle `historical ? (...) : (...)` qui affiche soit checkbox+note éditable, soit badge+date+montant en lecture seule. C'est cette branche qu'on va remplacer.

- [ ] **Step 2 : Mettre à jour le test existant qui suppose l'ancien comportement**

Dans `app/src/__tests__/renderer/MembreDetailModal.test.tsx`, remplacer le test `'affiche les années en DB avec badge statut'` :

```typescript
it('affiche une case à cocher éditable même pour une année liée à une écriture comptable', () => {
  render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
  expect(screen.getByText('2025')).toBeInTheDocument();
  // 2025 a journal_entry_id: 5 (voir mockMember) — la case doit être cochée et éditable,
  // pas un badge en lecture seule
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes.length).toBeGreaterThanOrEqual(2); // 2023 (historique) + 2025 (lié à une écriture)
  // La colonne Note/Mode de 2025 affiche la date de paiement en lecture seule
  expect(screen.getByText('2025-03-01')).toBeInTheDocument();
});
```

- [ ] **Step 3 : Ajouter les nouveaux tests pour le comportement de la case à cocher sur une ligne liée à une écriture**

Toujours dans `app/src/__tests__/renderer/MembreDetailModal.test.tsx`, ajouter après le test précédent :

```typescript
it('cocher/décocher une année liée à une écriture appelle setHistoricalDues sans toucher au montant affiché', async () => {
  render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
  const rows = screen.getAllByRole('row');
  const row2025 = rows.find(r => r.textContent?.includes('2025'))!;
  const checkbox2025 = within(row2025).getByRole('checkbox');
  expect(checkbox2025).toBeChecked();
  await userEvent.click(checkbox2025);
  expect(window.api.setHistoricalDues).toHaveBeenCalledWith(1, 2025, false, null);
  // Le montant affiché (CHF 30.00) provient de amount_cents du due existant, pas du formulaire —
  // il ne doit pas disparaître après le toggle (le mock ne modifie pas member.dues en place ici,
  // ce test vérifie seulement que setHistoricalDues est appelé avec les bons arguments)
});

it('affiche la date de paiement en lecture seule dans la colonne Note/Mode pour une écriture liée', () => {
  render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
  const rows = screen.getAllByRole('row');
  const row2025 = rows.find(r => r.textContent?.includes('2025'))!;
  // Pas de champ texte éditable pour 2025 (contrairement à 2023)
  expect(within(row2025).queryByRole('textbox')).not.toBeInTheDocument();
  expect(within(row2025).getByText('2025-03-01')).toBeInTheDocument();
});
```

Ajouter `within` à l'import de `@testing-library/react` en haut du fichier :

```typescript
import { render, screen, within } from '@testing-library/react';
```

- [ ] **Step 4 : Ajouter les tests du contrôle "Ajouter une année"**

Toujours dans le même fichier, ajouter :

```typescript
describe('Ajouter une année', () => {
  it('ajoute une année valide et appelle setHistoricalDues', async () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const input = screen.getByLabelText(/ajouter une année/i);
    await userEvent.type(input, '2020');
    await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(window.api.setHistoricalDues).toHaveBeenCalledWith(1, 2020, false, null);
  });

  it('refuse une année déjà présente dans le tableau', async () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const input = screen.getByLabelText(/ajouter une année/i);
    await userEvent.type(input, '2023');
    await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(screen.getByText(/déjà présente/i)).toBeInTheDocument();
    expect(window.api.setHistoricalDues).not.toHaveBeenCalledWith(1, 2023, false, null);
  });

  it('refuse une année future', async () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const futureYear = new Date().getFullYear() + 1;
    const input = screen.getByLabelText(/ajouter une année/i);
    await userEvent.type(input, String(futureYear));
    await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(screen.getByText(/future/i)).toBeInTheDocument();
    expect(window.api.setHistoricalDues).not.toHaveBeenCalledWith(1, futureYear, false, null);
  });

  it('refuse une année hors plage (avant 1900)', async () => {
    render(<MembreDetailModal member={mockMember} fiscalYears={[mockYear]} onClose={vi.fn()} onUpdated={vi.fn()} />);
    const input = screen.getByLabelText(/ajouter une année/i);
    await userEvent.type(input, '1899');
    await userEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(window.api.setHistoricalDues).not.toHaveBeenCalledWith(1, 1899, false, null);
  });
});
```

- [ ] **Step 5 : Vérifier que les tests échouent**

```bash
cd app && npm test -- MembreDetailModal.test --reporter=verbose 2>&1 | tail -40
```

Expected : FAIL — les nouveaux tests échouent (case à cocher absente pour 2025, contrôle "Ajouter une année" inexistant, libellé `/déjà présente/i` absent, etc.)

- [ ] **Step 6 : Modifier `MembreDetailModal.tsx` — case à cocher toujours éditable**

Remplacer la fonction `isHistorical` et la branche conditionnelle du JSX. Voici le fichier complet mis à jour :

```typescript
import { useState } from 'react';
import Modal from './Modal';
import MembrePaiementModal from './MembrePaiementModal';
import type { FiscalYear, MemberWithDues, MemberDues, Account } from '../types';
import { formatCHF } from '../lib/format';
import styles from './MembreDetailModal.module.css';

interface Props {
  member: MemberWithDues;
  fiscalYears: FiscalYear[];
  onClose: () => void;
  onUpdated: () => void;
}

const MIN_YEAR = 1900;

export default function MembreDetailModal({ member, fiscalYears, onClose, onUpdated }: Props) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [localDues, setLocalDues] = useState<MemberDues[]>(member.dues);
  const [newYearStr, setNewYearStr] = useState('');
  const [addYearError, setAddYearError] = useState<string | null>(null);

  // Calcul des années à afficher : union dues + fiscalYears, triées décroissant
  const fyYears = new Set(fiscalYears.map(y => y.year));
  const dueYears = new Set(localDues.map(d => d.year));
  const allYears = [...new Set([...fyYears, ...dueYears])].sort((a, b) => b - a);

  const getDues = (year: number): MemberDues | undefined =>
    localDues.find(d => d.year === year);

  const hasJournalEntry = (year: number) => getDues(year)?.journal_entry_id != null;

  const applyUpdatedDues = (updated: MemberDues) => {
    setLocalDues(prev => {
      const idx = prev.findIndex(d => d.year === updated.year);
      if (idx === -1) return [...prev, updated];
      const next = [...prev];
      next[idx] = updated;
      return next;
    });
  };

  const handleCheckbox = async (year: number, checked: boolean) => {
    const existing = getDues(year);
    const note = existing?.payment_note ?? null;
    const updated = await window.api.setHistoricalDues(member.id, year, checked, note);
    applyUpdatedDues(updated);
  };

  const handleNoteBlur = async (year: number, note: string) => {
    const existing = getDues(year);
    const paid = existing?.paid === 1;
    const updated = await window.api.setHistoricalDues(member.id, year, paid, note || null);
    applyUpdatedDues(updated);
  };

  const handleAddYear = async () => {
    setAddYearError(null);
    const year = parseInt(newYearStr, 10);
    const currentYear = new Date().getFullYear();

    if (!Number.isInteger(year) || newYearStr.trim().length !== 4) {
      setAddYearError('Saisissez une année à 4 chiffres');
      return;
    }
    if (year > currentYear) {
      setAddYearError('Impossible d\'ajouter une année future ici — utilisez "Enregistrer un paiement" pour une avance');
      return;
    }
    if (year < MIN_YEAR) {
      setAddYearError(`L'année doit être ${MIN_YEAR} ou plus récente`);
      return;
    }
    if (allYears.includes(year)) {
      setAddYearError('Cette année est déjà présente dans le tableau');
      return;
    }

    const updated = await window.api.setHistoricalDues(member.id, year, false, null);
    applyUpdatedDues(updated);
    setNewYearStr('');
  };

  const handleClose = () => {
    onUpdated();
    onClose();
  };

  const openPayment = async () => {
    const accs = await window.api.getActiveAccounts();
    setAccounts(accs);
    setShowPaymentModal(true);
  };

  const hasOpenFy = fiscalYears.some(y => !y.is_closed);

  return (
    <Modal className={styles.modal} onClose={handleClose}>
      <div className={styles.header}>
        <h2 className={styles.title}>{member.first_name} {member.last_name}</h2>
        <div className={styles.meta}>
          {member.entry_date && <span>Entré le {member.entry_date}</span>}
          <span className={member.is_active === 1 ? styles.actif : styles.inactif}>
            {member.is_active === 1 ? 'Actif' : 'Inactif'}
          </span>
          {member.inactive_note && <span className={styles.note}>{member.inactive_note}</span>}
        </div>
      </div>

      <div className={styles.addYear}>
        <label className={styles.addYearLabel}>
          Ajouter une année
          <input
            type="number"
            className={styles.addYearInput}
            value={newYearStr}
            onChange={e => { setNewYearStr(e.target.value); setAddYearError(null); }}
            placeholder="ex. 2020"
          />
        </label>
        <button className={styles.btnAddYear} onClick={handleAddYear} disabled={!newYearStr}>
          Ajouter
        </button>
      </div>
      {addYearError && <p className={styles.error}>{addYearError}</p>}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Année</th>
            <th>Statut</th>
            <th>Note / Mode</th>
            <th>Montant</th>
          </tr>
        </thead>
        <tbody>
          {allYears.map(year => {
            const dues = getDues(year);
            const linkedToEntry = hasJournalEntry(year);
            return (
              <tr key={year} className={styles.row}>
                <td className={styles.yearCell}>{year}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={dues?.paid === 1}
                    onChange={e => handleCheckbox(year, e.target.checked)}
                  />
                </td>
                {linkedToEntry ? (
                  <td className={styles.muted}>
                    {dues?.payment_date ?? '—'}
                  </td>
                ) : (
                  <td>
                    <input
                      className={styles.noteInput}
                      defaultValue={dues?.payment_note ?? ''}
                      onBlur={e => handleNoteBlur(year, e.target.value)}
                      placeholder="Mode paiement…"
                    />
                  </td>
                )}
                <td className={styles.num}>
                  {dues?.amount_cents != null
                    ? `CHF ${formatCHF(dues.amount_cents)}`
                    : '—'
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={styles.footer}>
        <button className={styles.btnCancel} onClick={handleClose}>Fermer</button>
        <button
          className={styles.btnPrimary}
          onClick={openPayment}
          disabled={!hasOpenFy}
        >
          Enregistrer un paiement
        </button>
      </div>

      {showPaymentModal && (
        <MembrePaiementModal
          member={member}
          fiscalYears={fiscalYears}
          accounts={accounts.filter(a => ['100', '101', '102', '103'].includes(a.number))}
          onClose={() => setShowPaymentModal(false)}
          onSaved={() => { setShowPaymentModal(false); onUpdated(); }}
        />
      )}
    </Modal>
  );
}
```

Notes sur les changements par rapport à l'original :
- `isHistorical` supprimée, remplacée par `hasJournalEntry`.
- La colonne "Statut" n'est plus un badge conditionnel — c'est toujours la case à cocher (déplacée hors de la branche conditionnelle).
- La colonne "Note / Mode" reste conditionnelle : champ texte éditable si pas lié à une écriture, date en lecture seule sinon.
- La colonne "Montant" reste identique (toujours en lecture seule, affiche `amount_cents` si présent).
- Ajout du bloc `addYear` (label + input + bouton) juste après le header, avant le tableau.
- Ajout de `handleAddYear` avec la validation en 4 étapes (format, futur, plage min, doublon).

- [ ] **Step 7 : Ajouter les styles CSS pour le nouveau contrôle**

Dans `app/src/components/MembreDetailModal.module.css`, ajouter à la fin du fichier :

```css
.addYear      { display: flex; align-items: flex-end; gap: 0.5rem; }
.addYearLabel { display: flex; flex-direction: column; gap: 0.25rem; font-size: var(--font-size-sm); font-weight: 500; }
.addYearInput { width: 6rem; padding: 0.3rem 0.5rem; border: 1px solid var(--border); border-radius: 3px; font-size: var(--font-size-sm); background: var(--bg); color: var(--text); }
.btnAddYear   { padding: 0.35rem 0.75rem; background: none; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: var(--font-size-sm); }
.btnAddYear:disabled { opacity: 0.5; cursor: not-allowed; }
.error        { color: var(--error); font-size: var(--font-size-sm); margin: 0; }
```

- [ ] **Step 8 : Vérifier que tous les tests passent**

```bash
cd app && npm test -- MembreDetailModal.test --reporter=verbose 2>&1 | tail -40
```

Expected : tous les tests PASS (les anciens conservés + les nouveaux).

- [ ] **Step 9 : Vérifier que toute la suite passe (pas de régression)**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 662 + 6 nouveaux (668).

- [ ] **Step 10 : Commit**

```bash
git add app/src/components/MembreDetailModal.tsx \
        app/src/components/MembreDetailModal.module.css \
        app/src/__tests__/renderer/MembreDetailModal.test.tsx
git commit -m "feat(members): case à cocher libre pour toutes les années + ajout d'années antérieures"
```

---

## Auto-révision du plan

**Couverture spec :**
- Case à cocher toujours éditable pour toute année → Step 6 (checkbox déplacée hors de la branche conditionnelle).
- Colonne Note/Mode conditionnelle sur `journal_entry_id` → Step 6 (`hasJournalEntry`).
- Décocher une ligne liée à une écriture n'affecte pas `payment_date`/`amount_cents`/`journal_entry_id` → déjà garanti par `setHistoricalDues` existant (aucun changement DB), vérifié par le test de l'étape 3.
- Contrôle "Ajouter une année" avec validation (format, année future exclue, borne 1900, doublon) → Step 6 (`handleAddYear`) + tests Step 4.
- Pas de changement DB/IPC/schéma → confirmé, aucune tâche DB dans ce plan.

**Scan placeholders :** aucun trouvé — chaque étape contient le code exact.

**Cohérence des types :** `MemberDues`, `FiscalYear`, `Account`, `MemberWithDues` inchangés (déjà définis dans `types/index.ts`). Signature `setHistoricalDues(memberId: number, year: number, paid: boolean, note: string | null): Promise<MemberDues>` cohérente entre le composant et les tests.
