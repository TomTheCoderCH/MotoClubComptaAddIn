# Changelog — MCY Compta

Toutes les versions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Versioning selon [Semantic Versioning](https://semver.org/).

---

## [1.2.0] — en cours

### Ajouté

- **Gestion de la caisse** — nouvelle page "Caisse" (sidebar, entre Journal et Exercices)
  - **Comptages de caisse physiques** : saisie des 12 coupures CHF (0.05 → 200.00) avec saisie bidirectionnelle quantité ↔ total ; écart automatique vs solde théorique du compte 100 ; contextes AVANT / FONDS / APRÈS / LIBRE
  - **Modification** d'un comptage existant (bouton Modifier par ligne, pré-chargement des valeurs)
  - **Sessions de manifestation** (onglet Manifestations) : regroupement de comptages AVANT/FONDS/APRÈS par événement (Marché, Broche, Souper…) ; CA caisse calculé = APRÈS − (AVANT + FONDS) ; expand/collapse du détail par session ; badges de contexte colorés
  - Sélecteur de session optionnel lors de la création/modification d'un comptage
  - Migration schéma SQLite v3 : tables `cash_counts`, `cash_count_lines`, `cash_sessions`
  - 53 nouveaux tests Vitest (CRUD DB, handlers IPC cash, composants CaissePage / CashCountModal / CashSessionModal)

- **Gestion des membres et cotisations** — nouvelle page "Membres" (sidebar, entre Caisse et Exercices)
  - **Fiche membre** : nom, prénom, date d'entrée (optionnelle), statut actif/inactif avec note libre
  - **Historique des cotisations** : case à cocher "payé" toujours éditable pour toute année, y compris celles liées à une écriture comptable existante (le suivi peut être corrigé sans jamais modifier l'écriture) ; note de mode de paiement éditable sauf pour les années liées à une écriture (date de paiement affichée à la place) ; ajout manuel d'une année antérieure absente du tableau
  - **Paiement de cotisation avec écriture comptable automatique** : sélection libre des années à couvrir (y compris paiement en avance sur une année future, même si des arriérés plus anciens restent impayés) ; répartition du montant en cotisation (CHF 30/an, compte 300) + surplus versé en don (compte 391 Dons) ; écriture générée dans l'exercice correspondant à la date de paiement, moyens de paiement 100/101/102/103
  - **Import Excel** des noms/prénoms membres depuis le fichier historique de cotisations (`exceljs`), dédoublonnage par nom/prénom
  - Migration schéma SQLite v4 : tables `members`, `member_dues` ; compte 391 "Dons" ajouté au plan comptable
  - 49 nouveaux tests Vitest (CRUD DB, `recordPayment` transactionnel, handlers IPC, composants MembresPage / MembreFormModal / MembreDetailModal / MembrePaiementModal)

---

## [1.1.2] — 2026-07-01

### Ajouté

- **CI/CD GitHub Actions** (`.github/workflows/release.yml`) : build Windows automatique et publication de la GitHub Release sur chaque push de tag `v*`. L'installeur `MCYCompta-Setup.exe`, le package Squirrel `.nupkg` et le fichier `RELEASES` sont générés et uploadés sans intervention manuelle.
- **Mise à jour automatique** : l'application vérifie les nouvelles releases GitHub au démarrage (`update-electron-app`) et installe silencieusement en arrière-plan. Un redémarrage est proposé à l'utilisateur quand la mise à jour est prête. Désactivé en mode développement et lors des tests E2E.
- **Release notes** : le contenu du CHANGELOG est injecté automatiquement dans chaque GitHub Release via le workflow.

---

## [1.0.1] — 2026-07-01

### Amélioré

- **PDF — Page de garde** : logo du club centré sur la page (rapport 260×163 pt, aspect ratio préservé) avec titre, statut et date positionnés dessous. Le contenu du rapport démarre sur une nouvelle page séparée.

---

## [1.0.0] — 2026-07-01

Première version stable. Toutes les fonctionnalités essentielles au suivi comptable du MCY sont livrées et couvertes par des tests automatisés (559 Vitest + 41 E2E Playwright).

### Fonctionnalités

#### Saisie et journal
- Saisie d'écritures en partie double avec validation débit/crédit en temps réel
- Formulaire multi-lignes (≥ 2 lignes), libellé + n° de pièce optionnel
- Raccourcis clavier : `Ctrl+N` nouvelle écriture, `Ctrl+S` enregistrer, `Ctrl+Entrée` enregistrer + nouveau, `Entrée` ajouter une ligne
- Modification et suppression d'écritures (exercice ouvert uniquement)
- Filtres journal : libellé, compte, plage de dates
- Flèches ▲▼ colorées sur les champs débit/crédit selon le type de compte
- Validation inline : alerte si la date est hors de l'exercice sélectionné

#### Exercices comptables
- Création d'exercices annuels (multi-exercices)
- Saisie des soldes à nouveau depuis l'exercice N−1
- Clôture automatique : soldage 3xx/4xx → 900 (Profits & Pertes) → 290 (Capital)
- Réouverture d'un exercice clôturé
- Exercice clôturé en lecture seule

#### Plan comptable
- 29 comptes prédéfinis, classes 1/2/3/4/9
- Édition complète depuis l'UI : créer, renommer, modifier groupe analytique, désactiver
- Suppression possible si aucune écriture
- Groupes analytiques libres avec autocomplétion

#### Vues et rapports
- **Tableau de bord** : soldes Caisse / Raiffeisen / Résultat P&L ; panel Twint (encaissements, frais, net versé)
- **Journal** avec filtres et modification inline
- **Soldes** par compte, filtrables par N°/nom ou classe
- **Grand-livre** par compte (depuis Soldes) : contreparties résolues, solde courant progressif
- **Analytique** : P&L par groupe + section "Non groupés"
- **Bilan complet** : deux colonnes Actif / Passif & FP, contrôle d'équilibre ✓

#### Exports
- **Excel** (`exceljs`) : Journal, Bilan & Résultat, feuille Analytique, une feuille par compte avec SUBTOTAL et solde courant ; décomposition Twint par contrepartie
- **PDF** (`pdfkit`) : page de garde, Bilan, Compte de résultat, Journal général, Grand-livre enchaîné ; polices Inter (texte) + JetBrains Mono (montants, alignement décimal) ; hauteur de ligne auto-expand ; format `1'494,26`

#### Sauvegarde et paramètres
- Dossier de données choisi librement (compatible OneDrive/NAS)
- Backup automatique à la fermeture si modifications (30 derniers conservés)
- Export manuel de sauvegarde
- Restauration depuis n'importe quel fichier `.db`
- Affichage de la version du schéma SQLite par sauvegarde

#### UX
- Système d'aide intégré : drawer latéral (F1 / bouton Aide), tooltips contextuels
- Toast de confirmation après création/modification/export
- Icônes Lucide React sur tous les boutons d'action
- CSS Modules — zéro style inline dans les composants

### Infrastructure technique
- Electron 42 + React + TypeScript + Vite + SQLite (`better-sqlite3`)
- Schéma SQLite v2 avec migrations automatiques (`PRAGMA user_version`)
- Montants en centimes (INTEGER) — aucun float
- Pont IPC sécurisé via `contextBridge`
- Polices embarquées cross-platform : `app/resources/fonts/` → `extraResources` Electron Forge
- Packaging : `electron-forge make` → `MCYCompta-Setup.exe` (Squirrel.Windows)
- 559 tests Vitest (unitaires, intégration SQLite, handlers IPC, composants React)
- 41 tests E2E Playwright (app réelle, DB temporaire isolée)

---

*Les versions suivantes seront développées dans des branches `feature/` et mergées sur `main` avec un tag SemVer.*
