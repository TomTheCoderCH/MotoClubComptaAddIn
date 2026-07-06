# Améliorations MembreDetailModal — sélection libre + ajout d'années

## Contexte

La feature "Gestion des membres et cotisations" (`feature/members-dues`, spec du 2026-07-03) a introduit `MembreDetailModal` : historique des cotisations d'un membre, année par année.

En usage réel, deux limitations bloquent le trésorier :

1. **Impossible de marquer une année comme payée sans passer par "Enregistrer un paiement"** dès que cette année correspond à un exercice comptable existant en DB (ex. 2025). Or la plupart des cotisations 2025 ont déjà été comptabilisées par ailleurs (écritures existantes, saisies avant l'usage de cette fonctionnalité) — forcer une nouvelle écriture via `recordPayment` créerait un double comptage.
2. **Impossible d'ajouter une année antérieure absente du tableau.** Le tableau n'affiche que l'union des exercices comptables en DB et des lignes `member_dues` déjà existantes — il n'y a aucun moyen de créer une ligne pour une année ancienne (ex. adhésion en 2020) qui n'a ni exercice ni cotisation enregistrée.

## Comportement actuel (rappel)

Dans `MembreDetailModal.tsx` :
- `isHistorical(year) = !fyYears.has(year)` — une année est "historique" seulement si aucun exercice comptable ne porte ce millésime.
- Année historique → case à cocher + champ note libre, appelle `setHistoricalDues(memberId, year, paid, note)` (upsert, ne touche que `paid`/`payment_note`, aucune écriture comptable).
- Année non-historique (exercice existant en DB) → lecture seule : badge ✓/✗, date de paiement, montant — modifiable uniquement via `MembrePaiementModal` → `recordPayment` (crée une écriture comptable équilibrée).
- `allYears = union(fiscalYears en DB, années déjà présentes dans member.dues)`, trié décroissant.

## Design

### 1. Case à cocher toujours éditable

Supprimer la distinction "historique vs exercice existant" pour l'éditabilité de la case à cocher. Nouvelle règle, par ligne :

- **Case à cocher "payé"** : toujours éditable, pour n'importe quelle année affichée. Appelle toujours `setHistoricalDues(memberId, year, paid, note)`. Cocher/décocher ne crée ni ne supprime jamais d'écriture comptable — cela ne touche que le suivi (`paid`, `payment_note`) du membre pour cette année.
- **Colonne "Note / Mode"** :
  - Si la ligne n'est **pas** liée à une écriture comptable (`dues?.journal_entry_id == null`) → champ texte libre éditable (comportement actuel des années historiques), `onBlur` appelle `setHistoricalDues`.
  - Si la ligne **est** liée à une écriture comptable (`dues?.journal_entry_id != null`, provenant d'un `recordPayment` antérieur via le bouton "Enregistrer un paiement") → affichage en lecture seule de la date de paiement (comportement actuel des années en DB). Cocher/décocher la case reste possible mais ne modifie ni `payment_date`, ni `amount_cents`, ni `journal_entry_id` — ces champs restent ceux de l'écriture d'origine.
- **Colonne "Montant"** : inchangée — affiche `CHF {amount}` si `amount_cents` est renseigné (uniquement le cas pour les lignes issues de `recordPayment`), sinon un tiret. Jamais éditable manuellement.

**Cas limite accepté** : décocher une année dont la ligne est liée à une écriture comptable (`journal_entry_id` non nul) est autorisé. Cela ne supprime ni ne modifie l'écriture existante (qui reste la source de vérité comptable) — seul le statut de suivi `paid` change. Le trésorier reste responsable de la cohérence entre le suivi et la comptabilité réelle.

Le bouton "Enregistrer un paiement" et son comportement (`recordPayment`, création d'écriture, désactivé si aucun exercice ouvert) restent strictement inchangés — c'est le chemin dédié aux **nouveaux** paiements nécessitant une écriture comptable.

### 2. Ajout d'une année antérieure

Nouveau contrôle au-dessus du tableau (dans l'en-tête de la modale ou juste avant le `<table>`) :

- Un champ numérique (`type="number"`) pour saisir une année à 4 chiffres.
- Un bouton "Ajouter une année", désactivé si le champ est vide ou invalide.
- Validation avant soumission :
  - L'année doit être un entier à 4 chiffres.
  - L'année doit être comprise entre 1900 et l'année réelle courante (`new Date().getFullYear()`) — pas d'ajout d'année future via ce contrôle (le cas "avance" reste couvert par `MembrePaiementModal`).
  - L'année ne doit pas déjà figurer dans `allYears` (pas de doublon).
  - Si la validation échoue, afficher un message d'erreur inline sous le contrôle (pas de `ConfirmDialog`, simple texte d'erreur comme dans les autres formulaires du projet).
- À la soumission valide : appeler `setHistoricalDues(memberId, year, false, null)` pour créer la ligne (non payée, sans note), vider le champ, la nouvelle ligne apparaît immédiatement dans le tableau (déjà éditable comme toutes les autres grâce au point 1).

## Composants modifiés

- `app/src/components/MembreDetailModal.tsx` — logique de rendu des lignes (remplace `isHistorical` par une vérification `journal_entry_id`), ajout du contrôle "Ajouter une année" (state local pour le champ + erreur de validation).
- `app/src/components/MembreDetailModal.module.css` — styles du nouveau contrôle d'ajout (champ + bouton + message d'erreur), cohérents avec les styles existants du fichier.
- `app/src/__tests__/renderer/MembreDetailModal.test.tsx` — tests mis à jour et étendus (voir Tests).

Aucune modification de schéma SQLite, ni de `db/index.ts`, ni des handlers IPC — `setHistoricalDues` couvre déjà tous les besoins (upsert sur `(member_id, year)`, ne touche que `paid`/`payment_note`).

## Tests

Mise à jour des tests existants dans `MembreDetailModal.test.tsx` :

- `'affiche les années en DB avec badge statut'` doit être adaptée : l'année 2025 (liée à `journal_entry_id: 5`) doit maintenant afficher une case à cocher (éditable) **et** la date de paiement en lecture seule dans la colonne Note/Mode — plus un badge non éditable.
- Le test `'cocher une case historique appelle setHistoricalDues sans fermer la modale'` reste valide tel quel pour l'année historique (2023).

Nouveaux tests :

- Cocher/décocher la case d'une année liée à une écriture comptable (2025, `journal_entry_id: 5`) appelle bien `setHistoricalDues(1, 2025, ...)`, sans toucher au montant affiché (`CHF 30.00` reste affiché après le toggle, car il vient de `amount_cents` du due existant, pas du formulaire).
- La colonne Note/Mode de l'année 2025 affiche la date de paiement en lecture seule (pas de champ éditable).
- Le contrôle "Ajouter une année" : saisir une année valide (ex. 2020) et cliquer "Ajouter" appelle `setHistoricalDues(1, 2020, false, null)` et la ligne 2020 apparaît dans le tableau.
- Validation : tenter d'ajouter une année déjà présente (ex. 2023) affiche une erreur et n'appelle pas `setHistoricalDues`.
- Validation : tenter d'ajouter une année future (ex. année réelle + 1) affiche une erreur et n'appelle pas `setHistoricalDues`.

## Hors périmètre

- Pas de changement à `MembrePaiementModal` ni à `recordPayment` — le flux de paiement avec écriture comptable automatique reste identique.
- Pas de suppression de ligne `member_dues` depuis cette modale (non demandé).
- Pas de limite au nombre d'années ajoutables manuellement au-delà de la validation de plage (1900 → année courante).
