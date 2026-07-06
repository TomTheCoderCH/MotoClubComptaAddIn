import { useState, useCallback, useEffect } from 'react';
import { useHelp } from './HelpContext';
import styles from './HelpDrawer.module.css';

type Tab = 'quickstart' | 'accounting' | 'app' | 'about';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quickstart', label: 'Démarrage rapide' },
  { id: 'accounting', label: 'Comptabilité'     },
  { id: 'app',        label: 'Application'      },
  { id: 'about',      label: 'À propos'         },
];

const MIN_WIDTH = 260;
const MAX_WIDTH = 700;

export default function HelpDrawer() {
  const { isOpen, close } = useHelp();
  const [tab,   setTab]   = useState<Tab>('quickstart');
  const [width, setWidth] = useState(420);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - ev.clientX));
      setWidth(newWidth);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={close} aria-hidden="true" />
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Aide" style={{ width }}>
        <div className={styles.resizeHandle} onMouseDown={startResize} aria-hidden="true" />
        <div className={styles.header}>
          <h2 className={styles.title}>Aide MCY Compta</h2>
          <button onClick={close} className={styles.closeBtn} aria-label="Fermer l'aide">×</button>
        </div>

        <div className={styles.tabs} role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={styles.tab}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.content}>
          {tab === 'quickstart' && <QuickStartTab />}
          {tab === 'accounting' && <AccountingTab />}
          {tab === 'app'        && <AppTab />}
          {tab === 'about'      && <AboutTab />}
        </div>
      </div>
    </>
  );
}

function QuickStartTab() {
  return (
    <div>
      <h3 className={styles.sectionTitle}>Workflow annuel</h3>
      <ol className={styles.steps}>
        <li>
          <strong>Créer un exercice</strong><br />
          Page <em>Exercices</em> → formulaire "Créer l'exercice AAAA".
        </li>
        <li>
          <strong>Saisir les soldes à nouveau</strong><br />
          Si un exercice précédent existe : <em>Exercices</em> → "Saisir les soldes à nouveau".
          Saisir les soldes finaux de l'exercice précédent (Caisse, Raiffeisen, etc.).
        </li>
        <li>
          <strong>Saisir les écritures</strong><br />
          Page <em>Journal</em> → "Nouvelle écriture". Chaque écriture doit être équilibrée
          (total Débit = total Crédit). Appuyez sur <kbd>Entrée</kbd> dans le dernier champ
          montant pour ajouter rapidement une ligne supplémentaire.
        </li>
        <li>
          <strong>Consulter les soldes</strong><br />
          Page <em>Soldes</em> — affichage en temps réel par classe de compte.
          Le <em>Tableau de bord</em> (page d'accueil) affiche les soldes clés et le résultat P&amp;L.
        </li>
        <li>
          <strong>Suivre les cotisations</strong><br />
          Page <em>Membres</em> → cocher les cotisations reçues au fil de l&apos;année, ou
          utiliser &quot;Enregistrer un paiement&quot; pour générer automatiquement l&apos;écriture
          comptable correspondante.
        </li>
        <li>
          <strong>Clôturer l'exercice</strong><br />
          En fin d'année : <em>Exercices</em> → "Clôturer l'exercice". Les comptes de
          résultat (3xx, 4xx) sont soldés automatiquement vers le Capital.
        </li>
        <li>
          <strong>Exporter en Excel</strong><br />
          <em>Exercices</em> → "Exporter Excel" ou <em>Paramètres</em> → Export Excel.
          À faire après la clôture pour transmission ou archivage.
        </li>
      </ol>
    </div>
  );
}

function AccountingTab() {
  return (
    <div>
      <h3 className={styles.sectionTitle}>La partie double</h3>
      <p className={styles.para}>
        Chaque écriture comporte au minimum 2 lignes. La somme des débits doit
        toujours être égale à la somme des crédits. L'application valide cet
        équilibre en temps réel.
      </p>

      <h3 className={styles.sectionTitle}>Débit / Crédit par type de compte</h3>
      <table className={styles.helpTable}>
        <thead>
          <tr>
            <th>Type de compte</th>
            <th>Débit</th>
            <th>Crédit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Actif (1xx) — Caisse, Banque, Twint…</td>
            <td>↑ augmente</td>
            <td>↓ diminue</td>
          </tr>
          <tr>
            <td>Passif / Capital (2xx)</td>
            <td>↓ diminue</td>
            <td>↑ augmente</td>
          </tr>
          <tr>
            <td>Produit (3xx) — Cotisations, Ventes…</td>
            <td>↓ (rare)</td>
            <td>↑ recette</td>
          </tr>
          <tr>
            <td>Charge (4xx) — Assurance, Électricité…</td>
            <td>↑ dépense</td>
            <td>↓ (rare)</td>
          </tr>
        </tbody>
      </table>

      <h3 className={styles.sectionTitle}>Groupes analytiques</h3>
      <p className={styles.para}>
        Un groupe analytique est une étiquette libre assignée à un ou plusieurs comptes
        (ex. "Marché Villageois", "Broche"). La page <em>Analytique</em> regroupe ensuite
        les produits et charges par groupe pour visualiser le résultat de chaque événement.
        Assigner un groupe : <em>Plan comptable</em> → bouton <em>Modifier</em> → champ "Groupe analytique".
      </p>

      <h3 className={styles.sectionTitle}>Glossaire</h3>
      <dl className={styles.glossary}>
        <dt>Exercice fiscal</dt>
        <dd>Période comptable d'un an (généralement 1er janvier – 31 décembre).</dd>
        <dt>Solde à nouveau</dt>
        <dd>Solde final d'un exercice reporté comme solde initial de l'exercice suivant.</dd>
        <dt>Clôture</dt>
        <dd>Opération en fin d'exercice qui solde les comptes de résultat (3xx, 4xx)
            vers Profits &amp; Pertes (900) puis vers le Capital (290).</dd>
        <dt>Passifs transitoires (200)</dt>
        <dd>Charges engagées sur l'exercice en cours mais payées sur l'exercice suivant
            (ex. facture reçue en décembre, payée en janvier).</dd>
        <dt>Compte de résultat</dt>
        <dd>Comptes 3xx (produits) et 4xx (charges) — soldés à chaque clôture, contrairement
            aux comptes de bilan (1xx, 2xx) qui survivent d'un exercice à l'autre.</dd>
      </dl>
    </div>
  );
}

function AppTab() {
  return (
    <div>
      <h3 className={styles.sectionTitle}>Pages de l'application</h3>
      <dl className={styles.glossary}>
        <dt>Tableau de bord</dt>
        <dd>Page d'accueil. Affiche les soldes Caisse et Raiffeisen, un panel Twint
            récapitulatif (encaissements bruts / frais avec taux % / net versé sur Raiffeisen)
            et le résultat P&amp;L de l'exercice sélectionné. Les cartes sont
            configurables (compte ou groupe analytique).</dd>
        <dt>Plan comptable</dt>
        <dd>Liste des comptes MCY. Renommer un compte, modifier sa description ou son groupe
            analytique via le bouton crayon. Ajouter un compte avec le bouton "+ Nouveau compte".
            Désactiver (archiver) ou supprimer les comptes sans écritures.</dd>
        <dt>Journal</dt>
        <dd>Saisie et consultation des écritures comptables. Filtres par libellé, compte et
            période. Modification et suppression possibles tant que l'exercice est ouvert.
            Un message d'avertissement s'affiche si la date est hors de l'exercice.</dd>
        <dt>Membres</dt>
        <dd>Fiche membre (nom, prénom, date d&apos;entrée, statut actif/inactif). Historique de
            cotisations avec case à cocher toujours éditable — y compris pour les années déjà
            liées à une écriture comptable (cocher/décocher ne modifie jamais l&apos;écriture).
            Possibilité d&apos;ajouter une année antérieure manquante. Le bouton
            &quot;Enregistrer un paiement&quot; génère automatiquement l&apos;écriture comptable
            correspondante (le surplus éventuel est versé en don). La plage d&apos;années
            affichées dans le récapitulatif est configurable ; les cotisations en retard sont
            signalées par un fond rouge clair. Export du récapitulatif en Excel ; import initial
            des noms/prénoms depuis un fichier Excel.</dd>
        <dt>Analytique</dt>
        <dd>Vue P&amp;L regroupée par groupe analytique pour l'exercice sélectionné.
            Les comptes sans groupe apparaissent dans la section "Non groupés".
            Les groupes sont définis dans le Plan comptable.</dd>
        <dt>Exercices</dt>
        <dd>Création et gestion des exercices fiscaux. Clôture, réouverture, soldes à
            nouveau, export Excel par exercice.</dd>
        <dt>Soldes</dt>
        <dd>Vue synthétique des soldes par compte pour l'exercice sélectionné, groupés
            par classe (Actifs, Passifs, Produits, Charges).
            Cliquer sur un compte ouvre son <em>grand-livre</em>.</dd>
        <dt>Grand-livre</dt>
        <dd>Détail de tous les mouvements d'un compte pour l'exercice : date, pièce,
            libellé, contrepartie(s) et montants. Pour les comptes de bilan (1xx, 2xx),
            une colonne <em>Solde courant</em> affiche le solde progressif après chaque ligne.
            Les contreparties affichées sont uniquement celles du côté opposé de l'écriture
            (débit ↔ crédit). Accessible via <em>Soldes</em> → clic sur un compte.</dd>
        <dt>Bilan complet</dt>
        <dd>Présentation en deux colonnes : Actif / Passif &amp; Fonds propres à gauche,
            Résultat / Charges à droite. Un contrôle d&apos;équilibre automatique confirme
            que le bilan est cohérent.</dd>
        <dt>Paramètres</dt>
        <dd>Chemin de la base de données, export de sauvegarde manuelle, historique des
            sauvegardes automatiques, export Excel global. Restauration possible depuis
            n&apos;importe quelle sauvegarde (automatique ou manuelle), avec confirmation
            avant remplacement de la base actuelle.</dd>
      </dl>

      <h3 className={styles.sectionTitle}>Caisse</h3>
      <p className={styles.para}>
        La page <strong>Caisse</strong> permet d'enregistrer des comptages de caisse physiques
        (décompte pièce par pièce de toutes les coupures). Pour chaque coupure, saisissez la quantité <em>ou</em> le
        montant total — l'autre champ se calcule automatiquement.
      </p>
      <p className={styles.para}>
        Chaque comptage affiche l'écart entre le total compté et le solde théorique du compte
        100 (Caisse) à la même date. Un écart nul est affiché avec <strong>✓</strong>,
        un écart non nul en rouge.
      </p>
      <p className={styles.para}>
        Contextes disponibles : <strong>Libre</strong>, <strong>Avant manifestation</strong>,
        <strong> Fonds de caisse</strong>, <strong>Après manifestation</strong>.
      </p>
      <p className={styles.para}>
        L'onglet <strong>Manifestations</strong> regroupe les comptages par session
        (Marché Villageois, Broche, Souper…). Créez une session, puis liez vos comptages
        AVANT / FONDS / APRÈS à cette session lors de leur saisie. Le CA caisse de la
        session est calculé automatiquement : <code>APRÈS − (AVANT + FONDS)</code>.
        Cliquez sur une session pour voir le détail de ses comptages.
      </p>

      <h3 className={styles.sectionTitle}>Raccourcis clavier</h3>
      <table className={styles.helpTable}>
        <tbody>
          <tr><td><kbd>F1</kbd></td><td>Ouvrir / fermer l'aide</td></tr>
          <tr><td><kbd>Escape</kbd></td><td>Fermer l'aide ou les modales</td></tr>
          <tr><td><kbd>Entrée</kbd></td><td>Dans le dernier champ montant d'une écriture — ajouter une ligne</td></tr>
          <tr><td><kbd>Ctrl+N</kbd></td><td>Journal — ouvrir le formulaire Nouvelle écriture</td></tr>
          <tr><td><kbd>Ctrl+S</kbd></td><td>Formulaire écriture — enregistrer et fermer</td></tr>
          <tr><td><kbd>Ctrl+Entrée</kbd></td><td>Formulaire écriture — enregistrer et créer une nouvelle écriture</td></tr>
        </tbody>
      </table>

      <h3 className={styles.sectionTitle}>Sauvegarde automatique</h3>
      <p className={styles.para}>
        La base de données est sauvegardée automatiquement à chaque fermeture de
        l'application. Les 30 dernières sauvegardes sont conservées dans le sous-dossier
        <code> backups/</code> du dossier de données. Placer ce dossier dans OneDrive
        (ou équivalent) suffit pour une protection cloud.
      </p>

      <h3 className={styles.sectionTitle}>Export Excel</h3>
      <p className={styles.para}>
        L'export génère un classeur Excel reproduisant la structure comptable du club
        (Journal, Bilan, Résultat, un onglet par compte). À utiliser après la clôture
        annuelle pour archivage ou transmission à un successeur non-informaticien.
      </p>
    </div>
  );
}

function AboutTab() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    window.api.getVersion().then(setVersion);
  }, []);

  return (
    <div>
      <h3 className={styles.sectionTitle}>Version</h3>
      <p className={styles.para}>
        {version ? `Version ${version}` : 'Chargement…'}
      </p>

      <h3 className={styles.sectionTitle}>Notes de version</h3>

      <h4 className={styles.sectionTitle}>v1.2.0 (en cours)</h4>
      <ul className={styles.steps}>
        <li>Gestion de la caisse (comptages, sessions de manifestation)</li>
        <li>Gestion des membres et cotisations (voir onglet Application)</li>
      </ul>

      <h4 className={styles.sectionTitle}>v1.1.2</h4>
      <ul className={styles.steps}>
        <li>Mise à jour automatique de l&apos;application au démarrage</li>
      </ul>

      <h4 className={styles.sectionTitle}>v1.0.1</h4>
      <ul className={styles.steps}>
        <li>Logo du club sur la page de garde du PDF exporté</li>
      </ul>

      <h4 className={styles.sectionTitle}>v1.0.0</h4>
      <ul className={styles.steps}>
        <li>Première version — saisie des écritures, exercices, plan comptable,
            rapports, export Excel/PDF, sauvegarde automatique</li>
      </ul>
    </div>
  );
}
