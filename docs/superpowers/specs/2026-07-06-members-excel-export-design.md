# Export Excel du récapitulatif Membres

## Contexte

La page Membres affiche un tableau récapitulatif (nom, prénom, entrée, statut, une colonne par année de la plage configurée, signalement rouge clair des arriérés). Il n'existe aucun moyen d'exporter ces données hors de l'application — utile pour archivage, transmission à un successeur, ou impression.

## Design

### Périmètre de l'export

L'export reproduit exactement ce qui est affiché à l'écran au moment du clic :
- La même plage d'années (`Début`/`Fin` actuellement sélectionnée sur la page)
- Le même filtre "Afficher les inactifs" (coché ou non)

Aucun paramètre supplémentaire n'est demandé à l'utilisateur au moment de l'export — seul le dialogue standard "Enregistrer sous" (choix de l'emplacement du fichier) s'affiche.

### Architecture

**Extraction de la règle métier partagée** — `isArrears` vit actuellement dans `MembresPage.tsx` (renderer uniquement). Elle est déplacée vers un nouveau module partagé `app/src/lib/members.ts`, aux côtés d'une fonction `isPaid` équivalente, pour être importable à la fois par le renderer (`MembresPage.tsx`) et le main process (`excel/export-members.ts`) sans dupliquer la logique. `app/src/lib/format.ts` est déjà un module de ce type (pur, sans dépendance DOM) — même principe.

**Génération Excel** — Nouveau fichier `app/src/excel/export-members.ts`, une fonction pure exportée :

```typescript
exportMembersToExcel(
  members: MemberWithDues[],
  fiscalYears: FiscalYear[],
  range: { start: number; end: number },
  showInactive: boolean,
  outputPath: string,
): Promise<void>
```

Ne fait aucun accès DB — reçoit les données déjà chargées, à l'image de ce que fait `MembresPage.tsx` côté renderer. Cela la rend testable indépendamment de SQLite.

**Handler IPC** — `excel:exportMembers` dans `ipc-handlers.ts`, suit le contrat déjà établi par `excel:export` (export comptable existant) :
1. Ouvre `dialog.showSaveDialog` avec un nom de fichier par défaut `mcy-membres-{début}-{fin}.xlsx`
2. Si annulé → retourne `null`
3. Charge les données via les fonctions DB existantes `getAllMembers()` et `getAllFiscalYears()`
4. Appelle `exportMembersToExcel(...)`
5. Retourne `{ path }` en cas de succès, `{ error: message }` en cas d'échec

**UI** — Nouveau bouton "Exporter Excel" sur `MembresPage.tsx`, à côté de "Importer depuis Excel", passant `yearRange` et `showInactive` courants. Toast de confirmation (succès avec le chemin, ou erreur) — même pattern que les autres exports du projet.

### Contenu de la feuille Excel

Une seule feuille nommée "Membres" :

- **Titre** (ligne 1, fusionnée) : `Membres et cotisations — {début}–{fin}`
- **En-têtes** (ligne 3, style cohérent avec les autres exports — fond coloré, gras) : Nom | Prénom | Entrée | Statut | {année 1} | {année 2} | … | {année N}
- **Lignes de données** : un membre par ligne, triés par nom puis prénom, filtrés selon `showInactive` (si décoché : seuls les membres actifs)
  - Entrée : formatée `DD.MM.YYYY` (réutilise `formatDate` de `lib/format.ts`), ou vide si non renseignée
  - Statut : "Actif" ou "Inactif"
  - Cellules années : `✓` si payé, `—` si non payé ; fond rouge clair (`#FEE2E2`, même valeur que le token CSS `--error-bg`) si la cellule est un arriéré selon `isArrears` (partagée avec l'écran)

## Composants modifiés / créés

- Créer : `app/src/lib/members.ts` — `isPaid`, `isArrears` (déplacées depuis `MembresPage.tsx`)
- Créer : `app/src/excel/export-members.ts` — `exportMembersToExcel`
- Modifier : `app/src/pages/MembresPage.tsx` — importe `isPaid`/`isArrears` depuis le nouveau module au lieu de les définir localement ; ajoute le bouton "Exporter Excel"
- Modifier : `app/src/ipc-handlers.ts` — handler `excel:exportMembers`
- Modifier : `app/src/preload.ts` + `app/src/window.d.ts` — expose `exportMembers(range, showInactive): Promise<{ path: string } | { error: string } | null>`

## Tests

- `app/src/main/__tests__/export-members.test.ts` (nouveau) : génère un classeur avec `exceljs`, relit le buffer, vérifie titre, en-têtes, valeurs des cellules (✓/—), et couleur de fond des cellules en arriéré vs cellules normales, pour plusieurs cas (membre actif/inactif filtré ou non, arriéré présent/absent).
- `app/src/main/__tests__/ipc-members-handlers.test.ts` (étendu) : le handler ouvre le dialogue, retourne `null` si annulé, `{ path }` en cas de succès, `{ error }` si `exportMembersToExcel` lève une exception.
- `app/src/__tests__/renderer/MembresPage.test.tsx` (étendu) : le bouton "Exporter Excel" appelle `window.api.exportMembers` avec la plage et le filtre courants, affiche un toast de succès/erreur.

## Hors périmètre

- Pas de paramètre supplémentaire au moment de l'export (pas de sélection d'un sous-ensemble de membres, pas de choix de colonnes) — reflet strict de l'écran.
- Pas de légende explicative dans le fichier Excel (déjà tranché).
- Pas de changement au module d'export comptable existant (`excel/export.ts`) — fichier séparé, responsabilité distincte.
