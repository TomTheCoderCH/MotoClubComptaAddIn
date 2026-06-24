import { useState } from 'react';
import { useHelp } from './HelpContext';
import styles from './HelpDrawer.module.css';

type Tab = 'quickstart' | 'accounting' | 'app';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quickstart', label: 'Démarrage rapide' },
  { id: 'accounting', label: 'Comptabilité'     },
  { id: 'app',        label: 'Application'      },
];

export default function HelpDrawer() {
  const { isOpen, close } = useHelp();
  const [tab, setTab] = useState<Tab>('quickstart');

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={close} aria-hidden="true" />
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Aide">
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
          (total Débit = total Crédit).
        </li>
        <li>
          <strong>Consulter les soldes</strong><br />
          Page <em>Soldes</em> — affichage en temps réel par classe de compte.
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
        <dt>Plan comptable</dt>
        <dd>Liste des 29 comptes MCY. Lecture seule — le plan est défini à l'installation.</dd>
        <dt>Journal</dt>
        <dd>Saisie et consultation des écritures comptables. Filtres par libellé, compte et
            période. Modification et suppression possibles tant que l'exercice est ouvert.</dd>
        <dt>Exercices</dt>
        <dd>Création et gestion des exercices fiscaux. Clôture, réouverture, soldes à
            nouveau, export Excel par exercice.</dd>
        <dt>Soldes</dt>
        <dd>Vue synthétique des soldes par compte pour l'exercice sélectionné, groupés
            par classe (Actifs, Passifs, Produits, Charges).</dd>
        <dt>Paramètres</dt>
        <dd>Chemin de la base de données, export de sauvegarde manuelle, historique des
            sauvegardes automatiques, export Excel global.</dd>
      </dl>

      <h3 className={styles.sectionTitle}>Raccourcis clavier</h3>
      <table className={styles.helpTable}>
        <tbody>
          <tr><td><kbd>F1</kbd></td><td>Ouvrir / fermer l'aide</td></tr>
          <tr><td><kbd>Escape</kbd></td><td>Fermer l'aide ou les modales</td></tr>
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
