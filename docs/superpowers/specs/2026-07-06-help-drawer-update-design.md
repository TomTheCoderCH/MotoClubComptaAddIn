# Mise à jour de l'aide (HelpDrawer) + onglet "À propos"

## Contexte

`HelpDrawer.tsx` (3 onglets : Démarrage rapide, Comptabilité, Application) n'a pas été mis à jour depuis l'ajout de la page Membres, de la page Bilan complet, et de la restauration de sauvegarde. Par ailleurs, il n'existe aucun endroit dans l'application où le successeur non-technicien peut voir la version installée ou un historique des évolutions.

## Design

### 1. Onglet Application — pages manquantes

Ajouter deux entrées à la liste `<dl>` des pages (après "Bilan complet" pour Bilan, à la position correspondant à l'ordre de la sidebar pour Membres — entre "Caisse" et "Exercices") :

- **Membres** : fiche membre (nom, prénom, date d'entrée, statut actif/inactif) ; historique de cotisations avec case à cocher toujours éditable (y compris pour les années déjà liées à une écriture comptable — cocher/décocher ne modifie jamais l'écriture) ; possibilité d'ajouter une année antérieure manquante ; paiement d'une ou plusieurs cotisations avec génération automatique de l'écriture comptable (surplus versé en don) ; plage d'années affichées configurable ; les cotisations en retard sont signalées par un fond rouge clair ; export du récapitulatif en Excel ; import initial des noms/prénoms depuis un fichier Excel.
- **Bilan complet** : présentation en deux colonnes (Actif / Passif &amp; Fonds propres et Résultat / Charges), avec contrôle d'équilibre automatique.

Ajouter à la section **Paramètres** existante (actuellement : "Chemin de la base de données, export de sauvegarde manuelle, historique des sauvegardes automatiques, export Excel global") une mention de la restauration : *"restauration depuis n'importe quelle sauvegarde (automatique ou manuelle), avec confirmation avant remplacement de la base actuelle."*

### 2. Onglet Démarrage rapide — cotisations dans le workflow annuel

Ajouter une étape dans la liste `<ol>` du workflow annuel (après "Consulter les soldes", avant "Clôturer l'exercice") :

> **Suivre les cotisations**
> Page *Membres* → cocher les cotisations reçues au fil de l'année, ou utiliser "Enregistrer un paiement" pour générer automatiquement l'écriture comptable correspondante.

### 3. Nouvel onglet "À propos"

**Navigation** : quatrième onglet ajouté au tableau `TABS` de `HelpDrawer.tsx`, après "Application".

**Version** : nouveau handler IPC `app:getVersion` (suit le pattern déjà établi par `db:getSchemaVersion` — un appel simple sans paramètre) qui retourne `app.getVersion()` d'Electron (lit directement `package.json`, aucune duplication de source). Exposé via `window.api.getVersion(): Promise<string>`. Le nouvel onglet charge la version au montage (comme le fait déjà `SettingsPage.tsx` pour `getSchemaVersion`) et l'affiche en tête de contenu (ex. *"Version 1.1.2"*).

**Notes de version** : résumé succinct écrit à la main, dans le même style que le reste du HelpDrawer (`<h3>` par version + liste à puces courte), couvrant les versions déjà taguées et le travail en cours de la v1.2.0 :

- **v1.2.0** (en cours) : gestion de la caisse (comptages, sessions de manifestation) ; gestion des membres et cotisations (voir onglet Application).
- **v1.1.2** : mise à jour automatique de l'application au démarrage.
- **v1.0.1** : logo du club sur la page de garde du PDF exporté.
- **v1.0.0** : première version — saisie des écritures, exercices, plan comptable, rapports, export Excel/PDF, sauvegarde automatique.

Ce contenu est un texte statique dans le composant (pas de lecture de `CHANGELOG.md`) — à mettre à jour manuellement à chaque nouvelle version, comme le reste du HelpDrawer (déjà une pratique établie du projet, voir CLAUDE.md section "Système d'aide").

## Composants modifiés / créés

- Modifier : `app/src/components/HelpDrawer.tsx` — nouvel onglet `AboutTab`, mise à jour de `QuickStartTab` et `AppTab`
- Modifier : `app/src/ipc-handlers.ts` — handler `app:getVersion`
- Modifier : `app/src/preload.ts` + `app/src/window.d.ts` — expose `getVersion(): Promise<string>`
- Modifier : `app/src/__tests__/ipc-*-handlers.test.ts` (fichier pertinent existant) — test du nouveau handler
- Modifier : test(s) existant(s) de `HelpDrawer` si présents — sinon, création d'un test de base pour le nouvel onglet

## Tests

- Handler `app:getVersion` : enregistré, retourne bien la valeur de `app.getVersion()` (mocké dans le test).
- `HelpDrawer` : le nouvel onglet "À propos" apparaît dans la liste des onglets ; cliquer dessus affiche la version chargée et les notes de version ; les entrées "Membres" et "Bilan complet" apparaissent dans l'onglet Application.

## Hors périmètre

- Pas de lecture du fichier `CHANGELOG.md` réel — texte statique uniquement (décidé).
- Pas de mécanisme de vérification de mise à jour disponible dans cet onglet (déjà couvert par `update-electron-app`, hors périmètre de l'aide).
- Pas de traduction ni d'internationalisation — français uniquement, comme le reste de l'application.
