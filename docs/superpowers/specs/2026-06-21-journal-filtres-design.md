# Spec : Vue journal avec filtres, modification et suppression

**Date :** 2026-06-21
**Statut :** Approuvée

---

## Contexte

La `JournalPage` affiche actuellement toutes les écritures d'un exercice sous forme de table aplatie (une ligne par `JournalEntryLine`). Il n'existe aucun moyen de filtrer, modifier ou supprimer une écriture existante.

Cette spec couvre :
- Une barre de filtres (libellé, compte, plage de dates)
- La vue "grand-livre" lors d'un filtre par compte
- La modification et la suppression d'écritures existantes via une modale
- Un composant `ConfirmDialog` réutilisable

---

## Périmètre

### Dans le périmètre

- Filtres en mémoire (renderer) sur les données déjà chargées
- Vue grand-livre : quand un compte est sélectionné, seules les lignes de ce compte s'affichent
- Modale `EntryFormModal` pour créer et modifier des écritures
- Boutons Modifier / Supprimer sur chaque écriture (exercice ouvert uniquement)
- `ConfirmDialog` pour la suppression
- Opérations `updateJournalEntry` et `deleteJournalEntry` côté DB + IPC
- Tests à tous les niveaux

### Hors périmètre

- Filtrage côté SQLite (inutile pour le volume de données du club)
- Différenciation par type d'écriture (ouverture/clôture) — une seule occurrence de chaque, pas besoin
- Pagination

---

## Composants et fichiers touchés

| Fichier | Nature |
|---|---|
| `pages/JournalPage.tsx` | Étendu : état filtres, écriture en édition, ouverture modale |
| `components/JournalFilters.tsx` | **Nouveau** — barre de filtres |
| `components/EntryFormModal.tsx` | **Nouveau** — overlay + `EntryForm` |
| `components/ConfirmDialog.tsx` | **Nouveau** — boîte de confirmation réutilisable |
| `components/EntryForm.tsx` | Étendu : prop `editEntry?` pour le mode édition |
| `db/index.ts` | Deux nouvelles fonctions : `updateJournalEntry`, `deleteJournalEntry` |
| `preload.ts` | Deux nouvelles entrées IPC |
| `main.ts` | Deux nouveaux handlers IPC |
| `types/index.ts` | Nouveau type `UpdateJournalEntryPayload` |

---

## Section 2 — État des filtres

L'état des filtres vit dans `JournalPage`. Type dédié dans `types/index.ts` :

```typescript
export interface JournalFilters {
  text: string;              // recherche libre sur description et pièce
  accountId: number | null;  // filtre compte → active la vue grand-livre
  dateFrom: string;          // 'YYYY-MM-DD' ou '' (pas de borne inférieure)
  dateTo: string;            // 'YYYY-MM-DD' ou '' (pas de borne supérieure)
}

export const DEFAULT_FILTERS: JournalFilters = {
  text: '',
  accountId: null,
  dateFrom: '',
  dateTo: '',
};
```

Un bouton "Réinitialiser" remet `filters` à `DEFAULT_FILTERS`.

### Logique de filtrage (fonction pure)

```typescript
function applyFilters(
  entries: EntryWithLines[],
  filters: JournalFilters,
): EntryWithLines[]
```

Étapes appliquées dans l'ordre :

1. **Dates** — `entry.date >= dateFrom` et/ou `entry.date <= dateTo` (comparaison de strings ISO, correcte car format `YYYY-MM-DD`)
2. **Texte** — `entry.description` ou `entry.piece` contient `filters.text` (insensible à la casse)
3. **Compte (vue grand-livre)** — si `accountId` non nul : filtrer les lignes de chaque écriture pour ne garder que celles du compte ; exclure les écritures dont il ne reste aucune ligne

Une écriture doit passer tous les filtres actifs pour apparaître. La fonction est pure (pas de side-effect) et facilement testable.

---

## Section 3 — Modale et mode édition

### EntryFormModal

Overlay fullscreen (`position: fixed`, fond `rgba(0,0,0,0.4)`). Carte centrée avec :

- **En-tête** : titre dynamique ("Nouvelle écriture" / "Modifier l'écriture") + bouton ✕
- **Corps** : `EntryForm`
- **Pied** : boutons **Annuler** et **Enregistrer**

Règles de fermeture :
- **Seuls** le bouton ✕, le bouton Annuler et le bouton Enregistrer (après succès) ferment la modale
- Un clic sur le fond extérieur **ne ferme pas** la modale (évite la perte de saisie accidentelle)

### EntryForm — mode édition

Prop optionnelle ajoutée :

```typescript
editEntry?: JournalEntry & { lines: JournalEntryLine[] }
```

En mode édition :
- `date`, `description`, `piece` pré-remplis depuis `editEntry`
- Lignes pré-remplies (compte, montant débit/crédit)
- Soumission appelle `window.api.updateJournalEntry(payload)` au lieu de `createJournalEntry`

En mode création : comportement actuel inchangé.

### Boutons dans la table

Chaque groupe d'écriture (première ligne) affiche deux boutons discrets : **Modifier** et **Supprimer**. Ils ne s'affichent que si `!currentFiscalYear.is_closed`.

- **Modifier** → ouvre `EntryFormModal` avec `editEntry` pré-rempli
- **Supprimer** → ouvre `ConfirmDialog`

### ConfirmDialog

Petite modale avec :
- Un message configurable (ex. "Supprimer cette écriture ?")
- Boutons **Confirmer** et **Annuler**
- Pas de fermeture au clic extérieur
- Props : `message: string`, `onConfirm: () => void`, `onCancel: () => void`

Réutilisable pour les futures confirmations (clôture d'exercice, restauration de backup, etc.).

---

## Section 4 — Couche DB et IPC

### Nouveau type

```typescript
export interface UpdateJournalEntryPayload {
  id: number;
  date: string;
  description: string;
  piece?: string;
  lines: Array<{ account_id: number; debit?: number; credit?: number }>;
}
```

### updateJournalEntry(payload: UpdateJournalEntryPayload)

Dans une transaction :
1. Vérifier que l'exercice associé est ouvert (sinon erreur)
2. Valider l'équilibre débit/crédit des nouvelles lignes (`validateEntryBalance`)
3. Supprimer toutes les lignes existantes (`DELETE FROM journal_entry_lines WHERE journal_entry_id = ?`)
4. Réinsérer les nouvelles lignes
5. Mettre à jour l'en-tête (`date`, `description`, `piece`, `updated_at`)

Retourne le `JournalEntry` mis à jour avec ses lignes.

> Rationale du delete + re-insert : le nombre de lignes est variable (l'utilisateur peut en ajouter ou supprimer lors de la modification). Un diff UPDATE/INSERT/DELETE est plus complexe sans bénéfice — les IDs de lignes ne sont référencés nulle part ailleurs dans le schéma.

### deleteJournalEntry(id: number)

1. Vérifier que l'exercice associé est ouvert (sinon erreur)
2. Supprimer l'en-tête (`DELETE FROM journal_entries WHERE id = ?`) — les lignes sont supprimées en cascade via `ON DELETE CASCADE`

### IPC

| Canal | Handler DB |
|---|---|
| `db:updateJournalEntry` | `updateJournalEntry(payload)` |
| `db:deleteJournalEntry` | `deleteJournalEntry(id)` |

---

## Section 5 — Tests

| Fichier | Contenu |
|---|---|
| `db.test.ts` | `updateJournalEntry` : modification réussie, changement du nombre de lignes, erreur exercice fermé. `deleteJournalEntry` : suppression avec cascade lignes, erreur exercice fermé. |
| `renderer/JournalFilters.test.tsx` | Rendu des 4 champs (texte, compte, dateFrom, dateTo), bouton Réinitialiser, événements `onChange` transmis au parent |
| `renderer/JournalPage.test.tsx` | Filtrage texte, filtrage compte (vue grand-livre : seules les lignes du compte), filtrage dateFrom/dateTo, combinaison de filtres, boutons Modifier/Supprimer absents sur exercice clôturé |
| `renderer/EntryForm.test.tsx` | Mode édition : pré-remplissage de tous les champs, appel `updateJournalEntry` à la soumission (et non `createJournalEntry`) |
| `renderer/ConfirmDialog.test.tsx` | Rendu avec message, clic Confirmer appelle `onConfirm`, clic Annuler appelle `onCancel`, clic fond extérieur sans effet |
| `renderer/EntryFormModal.test.tsx` | Rendu titre dynamique, clic ✕ ferme, clic fond extérieur sans effet |
