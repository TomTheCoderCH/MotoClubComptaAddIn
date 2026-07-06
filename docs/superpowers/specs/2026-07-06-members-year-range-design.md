# Plage d'années configurable — récapitulatif page Membres

## Contexte

La page Membres (`MembresPage.tsx`) affiche un tableau récapitulatif avec une colonne par année, montrant le statut payé/non-payé de chaque membre. Aujourd'hui, ces colonnes sont figées : les 3 exercices comptables les plus récents en DB (`recentYears = years.map(y => y.year).sort((a,b) => b-a).slice(0, 3)`).

Deux limitations :
1. Le nombre d'années (3) et leur sélection (uniquement les exercices comptables) sont codés en dur.
2. Depuis l'amélioration du 2026-07-06 (case à cocher libre), un membre peut avoir des cotisations sur des années **sans** exercice comptable correspondant (ex. adhésion en 2019, avant l'usage de l'application) — ces années n'apparaissent jamais dans le récapitulatif actuel.

## Design

### Stockage

Nouveau champ optionnel dans `Settings` (`app/src/settings.ts`) :

```typescript
export interface Settings {
  dataDir: string;
  dashboardCards?: DashboardCardConfig[];
  membersYearRange?: { start: number; end: number };
}
```

Persisté dans `settings.json` (`app.getPath('userData')`), suit exactement le pattern déjà en place pour `dashboardCards` : lu via le handler IPC existant `settings:get` (aucun changement requis là), sauvegardé via un nouveau handler dédié `settings:saveMembersYearRange`.

### UI — MembresPage

Deux champs numériques dans l'en-tête de la page, à côté de la case "Afficher les inactifs" :

```
[Afficher les inactifs]   Années : [2023] à [2025]
```

- Modification immédiate : à chaque changement valide d'un des deux champs, le nouveau tableau se recalcule ET la plage est sauvegardée dans `settings.json` (pas de bouton "Enregistrer" séparé).
- Aucune limite de plage imposée — l'utilisateur peut choisir n'importe quelles années (y compris avant la création de l'application, ou une plage très large avec beaucoup de colonnes vides).
- Si l'utilisateur entre une année de fin inférieure à l'année de début, l'affichage échange silencieusement les deux valeurs (pas de message d'erreur — aucune saisie individuelle n'est invalide, seul l'ordre compte).

### Comportement par défaut (première utilisation, aucune plage enregistrée)

Si `settings.membersYearRange` est absent (nouvelle installation ou mise à jour depuis une version antérieure à cette fonctionnalité), calculer une plage par défaut équivalente au comportement actuel :

- Rassembler toutes les années connues : les années des exercices comptables (`fiscalYears`) **et** toutes les années présentes dans `member.dues` pour l'ensemble des membres chargés (inclut les cotisations historiques).
- Trier ces années, prendre les 3 plus récentes.
- `start` = la plus ancienne de ces 3 années, `end` = la plus récente.
- Si aucune année connue n'existe (aucun membre, aucun exercice), utiliser l'année réelle courante pour `start` et `end` (une seule colonne, l'année en cours).

Ce calcul par défaut n'est fait qu'en mémoire côté renderer au premier chargement sans plage sauvegardée — il n'écrit rien dans `settings.json` tant que l'utilisateur ne modifie pas explicitement un des deux champs.

### Colonnes générées

Toutes les années entières de `start` à `end` inclus (`Array.from({ length: end - start + 1 }, (_, i) => start + i)`), même celles sans aucune donnée pour aucun membre — l'utilisateur voit explicitement les "trous" dans le suivi.

## Composants modifiés

- `app/src/settings.ts` — ajout du champ `membersYearRange?` à l'interface `Settings`.
- `app/src/ipc-handlers.ts` — nouveau handler `settings:saveMembersYearRange` (même forme que `settings:saveDashboardCards` : lit les settings actuels via `readSettings()`, fusionne le nouveau champ, réécrit via `writeSettings()`).
- `app/src/preload.ts` + `app/src/window.d.ts` — exposition de `saveMembersYearRange(range: { start: number; end: number }): Promise<void>` sur `window.api`.
- `app/src/pages/MembresPage.tsx` — remplace `recentYears` (calcul figé) par une plage lue depuis `window.api.getSettings()` au chargement, avec calcul du défaut si absente ; ajoute les deux champs numériques et leur logique de sauvegarde.
- `app/src/pages/MembresPage.module.css` — styles des deux nouveaux champs (cohérents avec `.toggleLabel` existant).

Aucun changement de schéma SQLite, aucune nouvelle table.

## Tests

- `app/src/main/__tests__/ipc-members-handlers.test.ts` ou fichier équivalent pour les settings : test du nouveau handler `settings:saveMembersYearRange` (délègue bien à `readSettings`/`writeSettings` avec fusion correcte, ne perd pas les autres champs de `Settings` existants comme `dashboardCards`).
- `app/src/__tests__/renderer/MembresPage.test.tsx` :
  - Les deux champs "de/à" apparaissent avec les valeurs de la plage sauvegardée (mock `getSettings` retourne `membersYearRange`).
  - En l'absence de `membersYearRange` dans `getSettings`, le calcul par défaut (3 années les plus récentes parmi exercices + dues historiques) produit la bonne plage.
  - Modifier un des deux champs déclenche `window.api.saveMembersYearRange` avec les bonnes valeurs et met à jour immédiatement les colonnes affichées.
  - Une plage inversée (fin < début) affiche quand même les colonnes dans l'ordre croissant correct (échange silencieux).

## Hors périmètre

- Pas de contrôle équivalent sur d'autres pages (Dashboard, Analytique, etc.) — spécifique à `MembresPage`.
- Pas de limite de plage maximale imposée (ex. "pas plus de 10 ans") — l'utilisateur reste libre.
- Pas de tri/filtre supplémentaire sur les colonnes au-delà de la plage continue start→end.
