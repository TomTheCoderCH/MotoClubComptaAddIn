# Help System Design — Tooltips + Drawer

**Date :** 2026-06-24
**Statut :** Approuvé

---

## Objectif

Ajouter une aide contextuelle dans `EntryForm` (tooltip dynamique par ligne) et un panneau d'aide global (drawer latéral droit) accessible via un bouton `?` dans la sidebar et la touche `F1`.

---

## Architecture

### Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `app/src/components/HelpContext.tsx` | Contexte React `{ isOpen, toggle, close }` + hook `useHelp()` |
| `app/src/components/Tooltip.tsx` + `.module.css` | Composant `?` réutilisable, tooltip CSS pur au `:hover` |
| `app/src/components/HelpDrawer.tsx` + `.module.css` | Drawer latéral droit avec 3 onglets |

### Fichiers modifiés

| Fichier | Changement |
|---|---|
| `app/src/components/Layout.tsx` | Fournit `HelpContext.Provider`, rend `<HelpDrawer />`, écoute `F1` + `Escape` |
| `app/src/components/Sidebar.tsx` | Bouton `? Aide` en bas (via `useHelp()`) |
| `app/src/components/Sidebar.module.css` | Styles `.helpSection` + `.helpBtn` |
| `app/src/components/EntryForm.tsx` | `<Tooltip>` dynamique par ligne + spacer dans header |
| `app/src/components/EntryForm.module.css` | `.colTooltipSpacer` |

### Flux de données

```
HelpContext (isOpen / toggle / close)
    ├── Layout.tsx  → Provider + HelpDrawer + listener F1/Escape
    ├── Sidebar.tsx → bouton ? lit toggle() via useHelp()
    └── HelpDrawer.tsx → lit isOpen, se rend si true
```

`EntryForm` n'accède pas à `HelpContext` — le `Tooltip` est indépendant du drawer.

---

## Composant `Tooltip`

### API

```tsx
<Tooltip content={React.ReactNode} />
```

Prop unique `content`. L'icône `?` (15×15px, cercle gris) est le déclencheur fixe.

### Comportement

- Tooltip CSS pur — pas de JS, pas d'état React
- Bulle positionnée **au-dessus** de l'icône, alignée à droite, largeur min 220px
- Flèche pointant vers le bas (↓) depuis le bas de la bulle
- Apparaît au `:hover` sur le wrapper

### Accessibilité

- Icône : `role="img"` `aria-label="Aide"`
- Bulle : `role="tooltip"`

### Usage dans EntryForm — contenu dynamique par ligne

La fonction `helpForType(type)` retourne le texte selon `account.type` :

| `type` | Contenu affiché |
|---|---|
| `ACTIF` | `Actif — Débit ↑ augmente · Crédit ↓ diminue` |
| `PASSIF` | `Passif — Crédit ↑ augmente · Débit ↓ diminue` |
| `FONDS_PROPRES` | `Capital — Crédit ↑ augmente · Débit ↓ diminue` |
| `PRODUIT` | `Produit — Crédit ↑ recette · Débit ↓ contre-passation` |
| `CHARGE` | `Charge — Débit ↑ dépense · Crédit ↓ contre-passation` |
| *(aucun compte)* | `Sélectionnez un compte pour voir l'aide` |

Position dans `lineRow` : entre le champ Crédit et le bouton Supprimer `×`.
Le `linesHeader` reçoit un `colTooltipSpacer` (15px) pour l'alignement.

---

## Composant `HelpDrawer`

### Apparence

Panneau de **420px** glissant depuis la droite, superposé au contenu principal.
Overlay semi-transparent `rgba(0,0,0,0.25)` derrière. Fermeture via :
- Bouton `×` dans le header du drawer
- Clic sur l'overlay
- Touche `Escape`
- `F1` (toggle)

### Structure

```
┌─────────────────────────────┐
│  Aide MCY Compta        [×] │
│  [Démarrage] [Compta] [App] │
│                             │
│  <contenu de l'onglet>      │
│                             │
└─────────────────────────────┘
```

### Onglet 1 — Démarrage rapide

Workflow annuel pas-à-pas :
1. Créer un exercice (Exercices → formulaire "Créer l'exercice AAAA")
2. Saisir les soldes à nouveau si exercice précédent clôturé (Exercices → "Saisir les soldes à nouveau")
3. Saisir les écritures au fil de l'année (Journal → "Nouvelle écriture")
4. Consulter les soldes en temps réel (Soldes)
5. En fin d'année : clôturer l'exercice (Exercices → "Clôturer l'exercice")
6. Exporter en Excel pour archivage ou transmission (Exercices → "Exporter Excel" ou Paramètres)

### Onglet 2 — Comptabilité

- **La partie double** : chaque écriture = au minimum 2 lignes, total Débit = total Crédit
- **Tableau débit/crédit** : même contenu que les tooltips de lignes, développé
- **Glossaire** : exercice fiscal, solde à nouveau, clôture, passifs transitoires, compte de résultat

### Onglet 3 — Application

- Description de chaque page (Plan comptable / Journal / Exercices / Soldes / Paramètres)
- Raccourcis clavier : `F1` ouvre/ferme l'aide, `Escape` ferme les modales et l'aide
- Sauvegarde automatique : explication (backup à chaque fermeture, 30 fichiers conservés dans `backups/`)
- Export Excel : quand l'utiliser (bouclement annuel, transmission successeur)

---

## `HelpContext`

Défini dans `app/src/components/HelpContext.tsx` (fichier séparé pour éviter les imports circulaires Layout → Sidebar → Layout).

```ts
interface HelpContextValue {
  isOpen: boolean;
  toggle: () => void;
  close:  () => void;
}

// Valeur par défaut : noops — Sidebar fonctionne hors Provider (tests isolés)
export const HelpContext = createContext<HelpContextValue>({
  isOpen: false,
  toggle: () => {},
  close:  () => {},
});

export const useHelp = () => useContext(HelpContext);
```

---

## Layout — intégration

`Layout.tsx` gère `useState(false)` pour `isOpen`. Le listener `keydown` écoute :
- `F1` → `toggle()` + `e.preventDefault()`
- `Escape` (si `isOpen`) → `close()`

`<HelpDrawer />` est rendu **en dehors** du `<div className={styles.shell}>` pour ne pas être contraint par le flex layout de la sidebar.

---

## Sidebar — bouton Aide

Bouton `? Aide` en bas de la sidebar, séparé des liens par un `border-top` :

```
Plan comptable
Journal
Exercices
Soldes
Paramètres
──────────────
? Aide           ← nouveau (aria-label="Aide", aria-expanded={isOpen})
```

---

## Règle de maintenance

> **Important :** À chaque correction de bug ou ajout de fonctionnalité, vérifier si le contenu du `HelpDrawer` doit être mis à jour. En particulier :
> - Onglet **Démarrage rapide** si le workflow ou les noms de boutons changent
> - Onglet **Application** si une page est ajoutée, renommée ou si les raccourcis changent
> - Onglet **Comptabilité** si le plan comptable ou les règles de saisie évoluent

Cette règle est également inscrite dans `CLAUDE.md`.

---

## Tests

### `Tooltip.test.tsx` (3 tests)
- Affiche l'icône `?` avec `role="img"` et `aria-label="Aide"`
- Le contenu est accessible via `role="tooltip"`
- Accepte du JSX comme contenu

### `HelpDrawer.test.tsx` (5 tests)
- Ne rend rien quand `isOpen=false`
- Rend le dialog quand `isOpen=true`
- `close()` appelé au clic sur `×`
- Onglet "Démarrage rapide" actif par défaut
- Changement d'onglet au clic

### `Layout.test.tsx` (2 tests ajoutés)
- `F1` ouvre le drawer
- `Escape` ferme le drawer

### `Sidebar.test.tsx` (2 tests ajoutés)
- Bouton "Aide" présent
- Clic sur "Aide" appelle `toggle()` du contexte

### `EntryForm.test.tsx` (3 tests ajoutés)
- Chaque ligne initiale a un `role="tooltip"`
- Sans compte sélectionné : texte "Sélectionnez un compte pour voir l'aide"
- Après sélection d'un compte ACTIF : texte "Actif — Débit ↑ augmente · Crédit ↓ diminue"
