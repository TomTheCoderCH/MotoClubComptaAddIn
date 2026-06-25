# Journal UX — Raccourcis clavier et améliorations saisie

## Objectif

Accélérer la saisie des écritures comptables avec trois améliorations :
1. Raccourci clavier pour ouvrir le formulaire depuis le journal
2. Focus automatique sur le champ Date à l'ouverture du formulaire
3. Raccourcis clavier pour enregistrer et pour enregistrer + nouveau

---

## Raccourcis clavier

| Raccourci | Contexte | Action |
|---|---|---|
| `Ctrl+N` | JournalPage, exercice ouvert, aucune modale ouverte | Ouvre le formulaire "Nouvelle écriture" |
| `Ctrl+S` | EntryForm (modale ouverte) | Enregistrer et fermer |
| `Ctrl+Enter` | EntryForm (modale ouverte) | Enregistrer + Nouveau |
| `Escape` | Modale ouverte | Fermer (existant, inchangé) |

**`Ctrl+N`** : `e.preventDefault()` obligatoire pour éviter le comportement navigateur. Actif uniquement si `currentFiscalYear?.is_closed === false` et `modal === null`.

**`Ctrl+S` et `Ctrl+Enter`** : actifs uniquement si `canSubmit === true`. Implémentés via `useEffect` + `document.addEventListener('keydown', ...)` dans `EntryForm`. Cleanup dans le `return` du `useEffect`.

---

## Autofocus sur le champ Date

En mode **création** uniquement (pas en édition) :
- `dateRef = useRef<HTMLInputElement>(null)` sur le champ Date
- `useEffect(() => { dateRef.current?.focus(); }, [])` — une seule fois au montage
- Après reset "enregistrer + nouveau" : `dateRef.current?.focus()` appelé directement dans la séquence de reset

Pas d'attribut HTML `autoFocus` — le `useRef` est réutilisé pour le refocus post-reset.

---

## Date par défaut

Fonction `defaultDate(fiscalYear: FiscalYear): string` remplaçant l'actuelle `today()` :

```typescript
function defaultDate(fiscalYear: FiscalYear): string {
  const now = new Date();
  const fyYear = fiscalYear.year;
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const currentYear = now.getFullYear();

  const candidate = currentYear === fyYear
    ? now.toISOString().slice(0, 10)   // aujourd'hui
    : `${fyYear}-${mm}-${dd}`;         // même jour/mois dans l'année de l'exercice

  if (candidate < fiscalYear.start_date) return fiscalYear.start_date;
  if (candidate > fiscalYear.end_date)   return fiscalYear.end_date;
  return candidate;
}
```

S'applique :
- À l'initialisation du formulaire en mode création
- Au reset après "enregistrer + nouveau"

---

## Enregistrer + Nouveau

### Comportement

Après `Ctrl+Enter` ou clic "Enregistrer + Nouveau" :
1. Sauvegarde identique à l'enregistrement normal
2. `onSavedNew()` appelé → rechargement des écritures + toast "Écriture enregistrée"
3. Modale reste ouverte
4. Formulaire réinitialisé : `date = defaultDate(fiscalYear)`, libellé vide, pièce vide, 2 lignes vides
5. Focus sur le champ Date

Le bouton "Enregistrer + Nouveau" est visible **uniquement en mode création** (pas en mode édition).

### Architecture

**`EntryForm`** — nouvelles props :
```typescript
interface EntryFormProps {
  // ... existant ...
  onSavedNew?: () => void;  // si défini → affiche le bouton + active Ctrl+Enter
}
```

Reset interne après save :
```typescript
setDate(defaultDate(fiscalYear));
setDescription('');
setPiece('');
setLines([emptyLine(), emptyLine()]);
setApiError(null);
dateRef.current?.focus();
onSavedNew();
```

**`EntryFormModal`** — nouvelle prop transmise à `EntryForm` :
```typescript
interface EntryFormModalProps {
  // ... existant ...
  onSavedNew?: () => void;
}
```

**`JournalPage`** — passage de `onSavedNew` sans fermer la modale :
```tsx
<EntryFormModal
  ...
  onSavedNew={async () => {
    await reloadEntries();
    setToast('Écriture enregistrée');
    // pas de setModal(null) → modale reste ouverte
  }}
/>
```

---

## Fichiers modifiés

| Fichier | Changements |
|---|---|
| `app/src/components/EntryForm.tsx` | `defaultDate()`, `dateRef`, autofocus, `onSavedNew`, reset, `Ctrl+S` / `Ctrl+Enter` |
| `app/src/components/EntryFormModal.tsx` | Prop `onSavedNew` transmise |
| `app/src/pages/JournalPage.tsx` | `Ctrl+N` handler, `onSavedNew` callback |
| `app/src/components/HelpDrawer.tsx` | Ajout des 3 raccourcis dans le tableau |
| `app/src/__tests__/renderer/EntryForm.test.tsx` | Tests raccourcis, autofocus, reset, defaultDate |
| `app/src/__tests__/renderer/JournalPage.test.tsx` | Test `Ctrl+N` |

---

## Tests

### `EntryForm.test.tsx`
- `Ctrl+S` soumet le formulaire quand `canSubmit` est vrai
- `Ctrl+S` ne soumet pas quand `canSubmit` est faux (formulaire incomplet)
- `Ctrl+Enter` appelle `onSavedNew` et réinitialise le formulaire
- `Ctrl+Enter` sans `onSavedNew` défini : aucun effet
- Le champ Date a le focus au montage en mode création
- Le champ Date n'a pas le focus au montage en mode édition
- `defaultDate` retourne aujourd'hui si exercice = année courante
- `defaultDate` retourne `fyYear-MM-DD` si exercice ≠ année courante
- `defaultDate` clamp à `start_date` si le candidat est antérieur
- `defaultDate` clamp à `end_date` si le candidat est postérieur
- Le bouton "Enregistrer + Nouveau" est visible en mode création si `onSavedNew` défini
- Le bouton "Enregistrer + Nouveau" est absent en mode édition

### `JournalPage.test.tsx`
- `Ctrl+N` ouvre la modale si exercice ouvert et modale fermée
- `Ctrl+N` n'ouvre pas la modale si exercice clôturé
- `Ctrl+N` n'ouvre pas la modale si une modale est déjà ouverte
