# Signalement visuel des cotisations en arriéré — page Membres

## Contexte

Le tableau récapitulatif de la page Membres (`MembresPage.tsx`) affiche une cellule par membre/année, avec ✓ (payé) ou — (non payé). Rien ne distingue visuellement une année non payée "normale" (le membre n'était pas encore là, ou l'année n'est pas encore échue) d'un véritable arriéré (le membre était déjà au club et aurait dû payer).

## Design

### Règle de signalement

Pour chaque cellule non payée (`isPaid(m, year) === false`) d'un membre visible dans le tableau, appliquer un fond rouge clair (réutilise le token CSS existant `var(--error-bg)` = `#fee2e2`, déjà utilisé pour les messages d'erreur ailleurs dans l'application) si :

1. **L'année de la colonne n'est pas future** : `year <= new Date().getFullYear()`. Une année pas encore échue n'est jamais signalée, même non payée.
2. **ET**, selon la présence de `entry_date` :
   - Si `entry_date` est **présente** : signalée seulement si `year >= entryYear` (année extraite de `entry_date`). Les années précédant l'adhésion ne sont jamais signalées (le membre n'était pas encore au club).
   - Si `entry_date` est **absente** : toujours signalée (on ne peut pas déterminer une borne d'adhésion, donc toute année non payée et non future est considérée comme potentiellement due).

### Implémentation

Nouvelle fonction pure `isArrears(member: MemberWithDues, year: number): boolean` dans `MembresPage.tsx` :

```typescript
function isArrears(member: MemberWithDues, year: number): boolean {
  const currentYear = new Date().getFullYear();
  if (year > currentYear) return false;
  if (!member.entry_date) return true;
  const entryYear = parseInt(member.entry_date.slice(0, 4), 10);
  return year >= entryYear;
}
```

Utilisée dans le rendu de chaque cellule année, en combinaison avec `isPaid`. Le projet a déjà une convention établie pour les styles conditionnels — attribut `data-*` + sélecteur CSS `[data-*]` (voir `data-negative` utilisé pour les soldes négatifs dans `BalancesPage.tsx`/`BilanPage.tsx`/etc.) — plutôt qu'une classe conditionnelle. On suit cette convention :

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

Nouvelle règle CSS dans `MembresPage.module.css` :

```css
.num[data-arrears] { background: var(--error-bg); }
```

## Composants modifiés

- `app/src/pages/MembresPage.tsx` — ajout de `isArrears`, application conditionnelle de l'attribut `data-arrears` sur les cellules concernées.
- `app/src/pages/MembresPage.module.css` — nouvelle règle `.num[data-arrears]`.
- `app/src/__tests__/renderer/MembresPage.test.tsx` — tests étendus (voir Tests).

Aucun changement de schéma, IPC, ou logique de paiement — purement un rendu visuel conditionnel côté renderer.

## Tests

- Un membre avec `entry_date` renseignée et une année non payée ≥ année d'entrée et ≤ année courante → la cellule a la classe `arrears`.
- Le même membre, une année non payée < année d'entrée → pas de classe `arrears`.
- Un membre sans `entry_date`, une année non payée ≤ année courante → classe `arrears` appliquée.
- Une année non payée future (> année réelle courante) → jamais de classe `arrears`, peu importe `entry_date`.
- Une année payée n'a jamais la classe `arrears`, même si elle serait autrement éligible.

## Hors périmètre

- Pas de légende ni de tooltip explicatif ajouté (peut être une amélioration future si le sens du fond rouge n'est pas évident pour l'utilisateur).
- Pas de changement de la logique `isPaid` existante ni des autres pages (Dashboard, Analytique).
