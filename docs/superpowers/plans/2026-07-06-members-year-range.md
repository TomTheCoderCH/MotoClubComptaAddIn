# Plage d'années configurable — récapitulatif Membres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les colonnes figées (3 exercices les plus récents) du tableau récapitulatif de la page Membres par une plage d'années configurable (année de début / fin), persistée dans `settings.json`.

**Architecture:** Un nouveau champ optionnel `membersYearRange` dans l'interface `Settings` (`app/src/settings.ts`), un handler IPC dédié pour le sauvegarder (mirroir exact de `settings:saveDashboardCards` déjà existant), et une mise à jour de `MembresPage.tsx` qui lit ce champ via `window.api.getSettings()`, calcule un défaut si absent, affiche deux champs numériques, et sauvegarde à chaque changement valide.

**Tech Stack:** React + TypeScript, Electron IPC, CSS Modules, Vitest + React Testing Library

## Global Constraints

- Branche : `feature/members-dues` (déjà existante) — commiter directement dessus
- Nouveau champ `Settings.membersYearRange?: { start: number; end: number }` dans `app/src/settings.ts`
- Nouveau handler IPC `settings:saveMembersYearRange` — même forme que `settings:saveDashboardCards` : lit `readSettings()`, si `null` ne fait rien, sinon fusionne et réécrit via `writeSettings()`
- Aucune limite de plage imposée (l'utilisateur peut choisir n'importe quelles années)
- Si l'année de fin saisie est inférieure à l'année de début, échanger silencieusement les deux valeurs à l'affichage (pas de message d'erreur)
- Défaut si `membersYearRange` absent : les 3 années les plus récentes parmi l'union des exercices comptables ET des années présentes dans `member.dues` de tous les membres chargés ; si aucune année connue, utiliser l'année réelle courante pour `start` et `end`
- Colonnes générées = toutes les années entières de `start` à `end` inclus (pas seulement celles avec des données)
- CSS Modules uniquement, zéro `style={{}}` inline
- Sauvegarde immédiate à chaque changement valide (pas de bouton "Enregistrer" séparé)

---

## Task 1 : Settings + IPC + MembresPage — plage d'années configurable

**Files:**
- Modify: `app/src/settings.ts`
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Modify: `app/src/pages/MembresPage.tsx`
- Modify: `app/src/pages/MembresPage.module.css`
- Modify: `app/src/__tests__/ipc-settings-handlers.test.ts`
- Modify: `app/src/__tests__/renderer/MembresPage.test.tsx`

**Interfaces:**
- Consumes: `window.api.getSettings(): Promise<{ dataDir: string; dashboardCards?: DashboardCardConfig[]; membersYearRange?: { start: number; end: number } } | null>` (type existant élargi), `window.api.getFiscalYears()`, `window.api.getMembers()` (déjà utilisés par `MembresPage.tsx`)
- Produces: `window.api.saveMembersYearRange(range: { start: number; end: number }): Promise<void>`

- [ ] **Step 1 : Écrire le test du nouveau handler IPC**

Dans `app/src/__tests__/ipc-settings-handlers.test.ts`, ajouter après le bloc `describe('settings:saveDashboardCards', ...)` existant :

```typescript
describe('settings:saveMembersYearRange', () => {
  it('enregistre le canal settings:saveMembersYearRange', () => {
    expect(handlers.has('settings:saveMembersYearRange')).toBe(true);
  });

  it('appelle writeSettings avec la plage fusionnée aux settings existants', async () => {
    vi.mocked(readSettings).mockReturnValue({ dataDir: '/data' });
    const range = { start: 2023, end: 2025 };
    await call('settings:saveMembersYearRange', range);
    expect(writeSettings).toHaveBeenCalledWith({ dataDir: '/data', membersYearRange: range });
  });

  it('ne fait rien si readSettings() retourne null', async () => {
    vi.mocked(readSettings).mockReturnValue(null);
    await call('settings:saveMembersYearRange', { start: 2023, end: 2025 });
    expect(writeSettings).not.toHaveBeenCalled();
  });

  it('préserve les autres champs existants (dashboardCards) lors de la fusion', async () => {
    vi.mocked(readSettings).mockReturnValue({ dataDir: '/data', dashboardCards: [{ type: 'group', groupName: 'Marché' }] });
    const range = { start: 2020, end: 2022 };
    await call('settings:saveMembersYearRange', range);
    expect(writeSettings).toHaveBeenCalledWith({
      dataDir: '/data',
      dashboardCards: [{ type: 'group', groupName: 'Marché' }],
      membersYearRange: range,
    });
  });
});
```

- [ ] **Step 2 : Vérifier que le test échoue**

```bash
cd app && npm test -- ipc-settings-handlers --reporter=verbose 2>&1 | tail -20
```

Expected : FAIL — `handlers.has('settings:saveMembersYearRange')` est `false` (handler non enregistré).

- [ ] **Step 3 : Ajouter le champ à l'interface `Settings`**

Dans `app/src/settings.ts`, modifier l'interface :

```typescript
export interface Settings {
  dataDir: string;
  dashboardCards?: DashboardCardConfig[];
  membersYearRange?: { start: number; end: number };
}
```

- [ ] **Step 4 : Ajouter le handler IPC**

Dans `app/src/ipc-handlers.ts`, juste après le bloc existant `ipcMain.handle('settings:saveDashboardCards', ...)` (autour de la ligne 79), ajouter :

```typescript
  ipcMain.handle('settings:saveMembersYearRange', (_e, range: { start: number; end: number }) => {
    const current = readSettings();
    if (!current) return;
    writeSettings({ ...current, membersYearRange: range });
  });
```

- [ ] **Step 5 : Exposer la méthode dans `preload.ts`**

Dans `app/src/preload.ts`, section `contextBridge.exposeInMainWorld('api', { ... })`, ajouter juste après `saveDashboardCards` :

```typescript
  saveMembersYearRange: (range: { start: number; end: number }): Promise<void> =>
    ipcRenderer.invoke('settings:saveMembersYearRange', range),
```

Dans le même fichier, mettre à jour le type `getSettings` (deux occurrences : `contextBridge.exposeInMainWorld` n'a pas de signature de retour explicite donc rien à changer là ; c'est le bloc `export type ElectronAPI = { ... }` qui déclare les types) — modifier :

```typescript
  getSettings:    () => Promise<{ dataDir: string } | null>;
```

en :

```typescript
  getSettings:    () => Promise<{ dataDir: string; dashboardCards?: DashboardCardConfig[]; membersYearRange?: { start: number; end: number } } | null>;
```

Et ajouter dans le même bloc `ElectronAPI`, juste après `saveDashboardCards`:

```typescript
  saveMembersYearRange: (range: { start: number; end: number }) => Promise<void>;
```

- [ ] **Step 6 : Mettre à jour `window.d.ts`**

Dans `app/src/window.d.ts`, modifier la ligne :

```typescript
      getSettings:        () => Promise<{ dataDir: string } | null>;
```

en :

```typescript
      getSettings:        () => Promise<{ dataDir: string; dashboardCards?: DashboardCardConfig[]; membersYearRange?: { start: number; end: number } } | null>;
```

Ajouter juste après `saveDashboardCards:  (cards: DashboardCardConfig[]) => Promise<void>;` :

```typescript
      saveMembersYearRange: (range: { start: number; end: number }) => Promise<void>;
```

- [ ] **Step 7 : Vérifier que les tests IPC passent**

```bash
cd app && npm test -- ipc-settings-handlers --reporter=verbose 2>&1 | tail -20
```

Expected : tous PASS.

- [ ] **Step 8 : Écrire les tests renderer pour `MembresPage`**

Dans `app/src/__tests__/renderer/MembresPage.test.tsx`, mettre à jour le `beforeEach` pour ajouter `getSettings` et `saveMembersYearRange` au mock :

```typescript
beforeEach(() => {
  vi.stubGlobal('api', {
    getFiscalYears:         vi.fn().mockResolvedValue([mockYear]),
    getMembers:             vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
    deleteMember:           vi.fn().mockResolvedValue(undefined),
    importMembersFromExcel: vi.fn().mockResolvedValue({ imported: 2, skipped: 0 }),
    getSettings:            vi.fn().mockResolvedValue({ dataDir: '/data' }),
    saveMembersYearRange:   vi.fn().mockResolvedValue(undefined),
  });
});
```

Ajouter un nouveau `describe` à la fin du fichier, avant la fermeture du `describe('MembresPage', ...)` existant (ou juste après, au même niveau) :

```typescript
describe('Plage d\'années configurable', () => {
  it('affiche les champs Début/Fin avec la plage sauvegardée', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2023, end: 2025 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    expect(screen.getByLabelText('Début')).toHaveValue('2023');
    expect(screen.getByLabelText('Fin')).toHaveValue('2025');
    // Colonnes 2023, 2024, 2025 générées
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
  });

  it('calcule une plage par défaut si aucune plage n\'est enregistrée', async () => {
    vi.stubGlobal('api', {
      getFiscalYears: vi.fn().mockResolvedValue([mockYear]), // année 2025
      getMembers:     vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:    vi.fn().mockResolvedValue({ dataDir: '/data' }), // pas de membersYearRange
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    // Une seule année connue (2025, via l'exercice) → start = end = 2025
    expect(screen.getByLabelText('Début')).toHaveValue('2025');
    expect(screen.getByLabelText('Fin')).toHaveValue('2025');
  });

  it('modifier le champ Fin puis sortir du champ (blur) sauvegarde la nouvelle plage et met à jour les colonnes', async () => {
    const saveMembersYearRange = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2025 } }),
      saveMembersYearRange,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const endInput = screen.getByLabelText('Fin');
    await userEvent.clear(endInput);
    await userEvent.type(endInput, '2026');
    // Pas encore sauvegardé pendant la frappe (chaque touche ne doit pas déclencher un commit)
    expect(saveMembersYearRange).not.toHaveBeenCalled();
    await userEvent.tab(); // blur → commit
    expect(saveMembersYearRange).toHaveBeenCalledTimes(1);
    expect(saveMembersYearRange).toHaveBeenCalledWith({ start: 2024, end: 2026 });
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('une saisie invalide au blur (champ vide) revient à la dernière valeur valide sans sauvegarder', async () => {
    const saveMembersYearRange = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2024, end: 2025 } }),
      saveMembersYearRange,
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const endInput = screen.getByLabelText('Fin');
    await userEvent.clear(endInput);
    await userEvent.tab(); // blur avec champ vide
    expect(saveMembersYearRange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Fin')).toHaveValue('2025'); // revient à la valeur précédente
  });

  it('une plage inversée (fin < début) affiche quand même les colonnes dans l\'ordre croissant', async () => {
    vi.stubGlobal('api', {
      getFiscalYears:       vi.fn().mockResolvedValue([mockYear]),
      getMembers:           vi.fn().mockResolvedValue([mockMember, mockMemberUnpaid]),
      getSettings:          vi.fn().mockResolvedValue({ dataDir: '/data', membersYearRange: { start: 2025, end: 2023 } }),
      saveMembersYearRange: vi.fn().mockResolvedValue(undefined),
    });
    render(<MembresPage />);
    await screen.findByText('Merli');
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    const yearHeaders = headers.filter(h => /^\d{4}$/.test(h ?? ''));
    expect(yearHeaders).toEqual(['2023', '2024', '2025']);
  });
});
```

- [ ] **Step 9 : Vérifier que les nouveaux tests échouent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | tail -40
```

Expected : FAIL — champs "Début"/"Fin" introuvables, `getSettings` non appelé par le composant actuel.

- [ ] **Step 10 : Modifier `MembresPage.tsx`**

Remplacer la logique `recentYears` figée par une plage configurable. Voici le fichier complet mis à jour :

```typescript
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Upload, UserX, UserCheck } from 'lucide-react';
import MembreFormModal    from '../components/MembreFormModal';
import MembreDetailModal  from '../components/MembreDetailModal';
import ConfirmDialog      from '../components/ConfirmDialog';
import Toast              from '../components/Toast';
import { formatDate }     from '../lib/format';
import type { FiscalYear, MemberWithDues } from '../types';
import styles from './MembresPage.module.css';

function computeDefaultRange(years: FiscalYear[], members: MemberWithDues[]): { start: number; end: number } {
  const known = new Set<number>();
  years.forEach(y => known.add(y.year));
  members.forEach(m => m.dues.forEach(d => known.add(d.year)));
  const sorted = [...known].sort((a, b) => b - a);
  if (sorted.length === 0) {
    const current = new Date().getFullYear();
    return { start: current, end: current };
  }
  const recent = sorted.slice(0, 3);
  return { start: Math.min(...recent), end: Math.max(...recent) };
}

export default function MembresPage() {
  const [years,           setYears]           = useState<FiscalYear[]>([]);
  const [members,         setMembers]         = useState<MemberWithDues[]>([]);
  const [showInactive,    setShowInactive]    = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMember,      setEditMember]      = useState<MemberWithDues | null>(null);
  const [detailMember,    setDetailMember]    = useState<MemberWithDues | null>(null);
  const [deleteId,        setDeleteId]        = useState<number | null>(null);
  const [toast,           setToast]           = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
  const [importing,       setImporting]       = useState(false);
  const [yearRange,       setYearRange]       = useState<{ start: number; end: number } | null>(null);
  const [startInputStr,   setStartInputStr]   = useState('');
  const [endInputStr,     setEndInputStr]     = useState('');

  const load = useCallback(() => {
    Promise.all([
      window.api.getFiscalYears(),
      window.api.getMembers(),
      window.api.getSettings(),
    ]).then(([ys, ms, settings]) => {
      setYears(ys);
      setMembers(ms);
      const range = settings?.membersYearRange ?? computeDefaultRange(ys, ms);
      setYearRange(range);
      setStartInputStr(String(range.start));
      setEndInputStr(String(range.end));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayedYears = (() => {
    if (!yearRange) return [];
    const start = Math.min(yearRange.start, yearRange.end);
    const end = Math.max(yearRange.start, yearRange.end);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  const commitRange = (next: { start: number; end: number }) => {
    setYearRange(next);
    window.api.saveMembersYearRange(next);
  };

  // Les champs conservent leur propre texte de saisie (startInputStr/endInputStr) pendant
  // la frappe ; la plage n'est validée et sauvegardée qu'au blur, pour éviter d'écrire des
  // valeurs intermédiaires invalides (ex. taper "2026" déclencherait sinon une sauvegarde
  // après chaque chiffre : "2", "20", "202"…).
  const handleStartBlur = () => {
    if (!yearRange) return;
    const n = parseInt(startInputStr, 10);
    if (!Number.isInteger(n)) {
      setStartInputStr(String(yearRange.start));
      return;
    }
    commitRange({ start: n, end: yearRange.end });
  };

  const handleEndBlur = () => {
    if (!yearRange) return;
    const n = parseInt(endInputStr, 10);
    if (!Number.isInteger(n)) {
      setEndInputStr(String(yearRange.end));
      return;
    }
    commitRange({ start: yearRange.start, end: n });
  };

  const visible = members.filter(m => showInactive ? true : m.is_active === 1);

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await window.api.deleteMember(deleteId);
      setToast({ message: 'Membre supprimé', variant: 'success' });
      load();
    } catch {
      setToast({ message: 'Impossible de supprimer : des cotisations existent', variant: 'error' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (m: MemberWithDues) => {
    try {
      await window.api.updateMember(m.id, {
        last_name: m.last_name, first_name: m.first_name,
        entry_date: m.entry_date, is_active: m.is_active === 1 ? 0 : 1,
        inactive_note: m.inactive_note,
      });
      load();
    } catch {
      setToast({ message: 'Impossible de modifier le statut du membre', variant: 'error' });
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.api.importMembersFromExcel();
      setToast({ message: `${result.imported} membre(s) importé(s), ${result.skipped} ignoré(s)`, variant: 'success' });
      load();
    } catch {
      setToast({ message: "Erreur lors de l'import", variant: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const isPaid = (m: MemberWithDues, year: number) =>
    m.dues.some(d => d.year === year && d.paid === 1);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Membres</h1>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Afficher les inactifs
          </label>
          {yearRange && (
            <div className={styles.rangeControl}>
              <span>Années :</span>
              <label className={styles.rangeLabel}>
                Début
                <input
                  type="number"
                  className={styles.rangeInput}
                  value={startInputStr}
                  onChange={e => setStartInputStr(e.target.value)}
                  onBlur={handleStartBlur}
                />
              </label>
              <label className={styles.rangeLabel}>
                Fin
                <input
                  type="number"
                  className={styles.rangeInput}
                  value={endInputStr}
                  onChange={e => setEndInputStr(e.target.value)}
                  onBlur={handleEndBlur}
                />
              </label>
            </div>
          )}
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.btnSecondary}
            onClick={handleImport}
            disabled={importing}
          >
            <Upload size={16} /> {importing ? 'Import…' : 'Importer depuis Excel'}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => { setEditMember(null); setShowCreateModal(true); }}
          >
            <Plus size={16} /> Nouveau membre
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>Aucun membre. Utilisez &quot;Nouveau membre&quot; ou &quot;Importer depuis Excel&quot;.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              <th>Entrée</th>
              <th>Statut</th>
              {displayedYears.map(y => <th key={y} className={styles.num}>{y}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map(m => (
              <tr
                key={m.id}
                className={`${styles.row} ${m.is_active === 0 ? styles.inactive : ''}`}
                onClick={() => setDetailMember(m)}
              >
                <td>{m.last_name}</td>
                <td>{m.first_name}</td>
                <td>{m.entry_date ? formatDate(m.entry_date) : '—'}</td>
                <td>
                  {m.is_active === 0
                    ? <span className={styles.badgeInactif}>Inactif</span>
                    : <span className={styles.badgeActif}>Actif</span>
                  }
                </td>
                {displayedYears.map(y => (
                  <td key={y} className={styles.num}>
                    {isPaid(m, y)
                      ? <span className={styles.paid}>✓</span>
                      : <span className={styles.unpaid}>—</span>
                    }
                  </td>
                ))}
                <td className={styles.actions} onClick={e => e.stopPropagation()}>
                  <button
                    className={styles.btnIcon}
                    onClick={() => { setEditMember(m); setShowCreateModal(true); }}
                    aria-label="Modifier"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className={styles.btnIcon}
                    onClick={() => handleToggleActive(m)}
                    aria-label={m.is_active === 1 ? 'Désactiver' : 'Réactiver'}
                  >
                    {m.is_active === 1 ? <UserX size={14} /> : <UserCheck size={14} />}
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={() => setDeleteId(m.id)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreateModal && (
        <MembreFormModal
          member={editMember ?? undefined}
          onClose={() => { setShowCreateModal(false); setEditMember(null); }}
          onSaved={() => {
            setShowCreateModal(false);
            setEditMember(null);
            load();
            setToast({ message: editMember ? 'Membre modifié' : 'Membre créé', variant: 'success' });
          }}
        />
      )}

      {detailMember && (
        <MembreDetailModal
          member={detailMember}
          fiscalYears={years}
          onClose={() => setDetailMember(null)}
          onUpdated={() => { load(); setDetailMember(null); }}
        />
      )}

      {deleteId !== null && (
        <ConfirmDialog
          message="Supprimer ce membre ? Cette action est irréversible."
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
```

Notes sur les changements :
- `computeDefaultRange` est une fonction pure hors composant, facile à tester indirectement via le rendu.
- `load()` charge maintenant aussi `window.api.getSettings()` en parallèle, et initialise `yearRange` (soit depuis les settings, soit via le calcul par défaut).
- `displayedYears` remplace `recentYears` — génère la plage continue, gère l'inversion `start > end` via `Math.min`/`Math.max`.
- `startInputStr`/`endInputStr` sont l'état de saisie brut (texte tel que tapé) ; `yearRange` est l'état validé/commité. Le champ reflète toujours `startInputStr`/`endInputStr` — pas `yearRange` directement — pour permettre à l'utilisateur de taper librement sans sauvegarde prématurée.
- `commitRange` met à jour `yearRange` ET déclenche la sauvegarde IPC ; il n'est appelé que depuis `handleStartBlur`/`handleEndBlur`, jamais depuis `onChange`.
- Si la valeur au blur n'est pas un entier valide (champ vidé, texte non numérique), le champ revient à la dernière valeur commitée sans appeler `saveMembersYearRange`.
- Les champs `<input type="number">` sont wrappés dans des `<label>` avec le texte "Début"/"Fin" — assure que `getByLabelText('Début')` et `getByLabelText('Fin')` fonctionnent dans les tests (le texte du label doit précéder l'input pour l'association implicite HTML).

- [ ] **Step 11 : Ajouter les styles CSS pour les nouveaux champs**

Dans `app/src/pages/MembresPage.module.css`, ajouter après `.toggleLabel` :

```css
.rangeControl { display: flex; align-items: center; gap: 0.4rem; font-size: var(--font-size-sm); color: var(--text-muted); }
.rangeLabel   { display: flex; align-items: center; gap: 0.3rem; }
.rangeInput   { width: 4.5rem; padding: 0.2rem 0.4rem; border: 1px solid var(--border); border-radius: 3px; font-size: var(--font-size-sm); background: var(--bg); color: var(--text); }
```

- [ ] **Step 12 : Vérifier que tous les tests passent**

```bash
cd app && npm test -- MembresPage.test --reporter=verbose 2>&1 | tail -40
```

Expected : tous PASS (anciens + 4 nouveaux).

- [ ] **Step 13 : Vérifier que toute la suite passe (pas de régression)**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 668 + 4 (IPC) + 5 (renderer) = 677.

- [ ] **Step 14 : Commit**

```bash
git add app/src/settings.ts app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts \
        app/src/pages/MembresPage.tsx app/src/pages/MembresPage.module.css \
        app/src/__tests__/ipc-settings-handlers.test.ts \
        app/src/__tests__/renderer/MembresPage.test.tsx
git commit -m "feat(members): plage d'années configurable pour le récapitulatif (settings.json)"
```

---

## Auto-révision du plan

**Couverture spec :**
- Stockage `membersYearRange` dans `Settings` → Step 3.
- Handler IPC dédié mirroir de `saveDashboardCards` → Step 4, testé Step 1.
- UI deux champs numériques dans l'en-tête, sauvegarde immédiate → Step 10-11.
- Calcul du défaut (3 années les plus récentes, exercices + dues historiques, fallback année courante) → `computeDefaultRange` Step 10, testé Step 8.
- Échange silencieux si fin < début → `displayedYears` avec `Math.min`/`Math.max` Step 10, testé Step 8 (test plage inversée).
- Colonnes = plage continue, pas seulement années avec données → `Array.from({ length: end - start + 1 }, ...)` Step 10.

**Scan placeholders :** aucun trouvé — chaque étape contient le code exact.

**Cohérence des types :** `{ start: number; end: number }` utilisé de façon cohérente dans `Settings`, le handler IPC, `preload.ts`, `window.d.ts`, et `MembresPage.tsx`. `saveMembersYearRange` a la même signature partout.
