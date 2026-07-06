# Mise à jour HelpDrawer + onglet À propos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre à jour le contenu de l'aide intégrée (`HelpDrawer.tsx`) avec les fonctionnalités récentes (Membres, Bilan complet, restauration de sauvegarde, suivi des cotisations) et ajouter un quatrième onglet "À propos" affichant la version installée et un résumé des notes de version.

**Architecture:** Un nouveau handler IPC `app:getVersion` (suit le pattern déjà établi par `db:getSchemaVersion`) expose `app.getVersion()` d'Electron au renderer. `HelpDrawer.tsx` gagne un quatrième onglet `AboutTab` qui charge cette version au montage et affiche un résumé de notes de version écrit en dur (pas de lecture de `CHANGELOG.md`).

**Tech Stack:** TypeScript, React, Electron IPC, Vitest + React Testing Library

## Global Constraints

- Branche : `feature/members-dues` (déjà existante) — commiter directement dessus
- Nouveau handler `app:getVersion` retourne `app.getVersion()` (aucune nouvelle dépendance, `app` déjà importé dans `ipc-handlers.ts`)
- `window.api.getVersion(): Promise<string>` exposé via `preload.ts` + `window.d.ts`
- Notes de version = texte statique dans le composant, pas de lecture de fichier — à maintenir manuellement à chaque version (pratique déjà établie pour le HelpDrawer)
- Contenu exact des notes (du plus récent au plus ancien) :
  - **v1.2.0 (en cours)** : gestion de la caisse (comptages, sessions de manifestation) ; gestion des membres et cotisations (voir onglet Application)
  - **v1.1.2** : mise à jour automatique de l'application au démarrage
  - **v1.0.1** : logo du club sur la page de garde du PDF exporté
  - **v1.0.0** : première version — saisie des écritures, exercices, plan comptable, rapports, export Excel/PDF, sauvegarde automatique
- Ajouts à l'onglet Application : entrées "Membres" et "Bilan complet" dans la liste des pages, mention de la restauration dans la section Paramètres existante
- Ajout à l'onglet Démarrage rapide : étape "Suivre les cotisations" après "Consulter les soldes", avant "Clôturer l'exercice"

---

## Task 1 : Handler IPC `app:getVersion`

**Files:**
- Modify: `app/src/ipc-handlers.ts`
- Modify: `app/src/preload.ts`
- Modify: `app/src/window.d.ts`
- Modify: `app/src/__tests__/ipc-settings-handlers.test.ts`

**Interfaces:**
- Produces: `window.api.getVersion(): Promise<string>` — consommé par Task 2 (`AboutTab`)

- [ ] **Step 1 : Écrire le test du handler**

Dans `app/src/__tests__/ipc-settings-handlers.test.ts`, modifier le mock `electron` existant (bloc `vi.mock('electron', () => ({ ... app: { relaunch: vi.fn(), exit: vi.fn() } ... }))`) pour ajouter `getVersion` :

```typescript
  app: {
    relaunch:   vi.fn(),
    exit:       vi.fn(),
    getVersion: vi.fn().mockReturnValue('1.1.2'),
  },
```

Le fichier importe déjà `import { dialog } from 'electron';` (ligne 60) — modifier cette ligne pour ajouter `app` :

```typescript
import { app, dialog } from 'electron';
```

Ajouter un nouveau bloc `describe` :

```typescript
describe('app:getVersion', () => {
  it('enregistre le canal app:getVersion', () => {
    expect(handlers.has('app:getVersion')).toBe(true);
  });

  it('retourne app.getVersion()', async () => {
    vi.mocked(app.getVersion).mockReturnValue('1.2.0');
    const result = await call('app:getVersion');
    expect(result).toBe('1.2.0');
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- ipc-settings-handlers --reporter=verbose 2>&1 | tail -20
```

Expected : FAIL — `handlers.has('app:getVersion')` est `false`.

- [ ] **Step 3 : Ajouter le handler IPC**

Dans `app/src/ipc-handlers.ts`, ajouter (par exemple juste après le handler `db:getSchemaVersion` existant) :

```typescript
  ipcMain.handle('app:getVersion', () => app.getVersion());
```

- [ ] **Step 4 : Exposer la méthode dans `preload.ts`**

Dans `app/src/preload.ts`, section `contextBridge.exposeInMainWorld('api', { ... })`, ajouter :

```typescript
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
```

Dans le bloc `export type ElectronAPI = { ... }`, ajouter :

```typescript
  getVersion: () => Promise<string>;
```

- [ ] **Step 5 : Mettre à jour `window.d.ts`**

Ajouter dans `interface Window { api: { ... } }` :

```typescript
      getVersion: () => Promise<string>;
```

- [ ] **Step 6 : Vérifier que les tests passent**

```bash
cd app && npm test -- ipc-settings-handlers --reporter=verbose 2>&1 | tail -20
```

Expected : tous PASS.

- [ ] **Step 7 : Vérifier la suite complète**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 708 + 2 (nouveaux tests) = 710.

- [ ] **Step 8 : Commit**

```bash
git add app/src/ipc-handlers.ts app/src/preload.ts app/src/window.d.ts \
        app/src/__tests__/ipc-settings-handlers.test.ts
git commit -m "feat(help): handler IPC app:getVersion"
```

---

## Task 2 : Mise à jour du contenu HelpDrawer + onglet À propos

**Files:**
- Modify: `app/src/components/HelpDrawer.tsx`
- Modify: `app/src/__tests__/renderer/HelpDrawer.test.tsx`

**Interfaces:**
- Consumes: `window.api.getVersion(): Promise<string>` (Task 1)

- [ ] **Step 1 : Écrire les tests**

Dans `app/src/__tests__/renderer/HelpDrawer.test.tsx`, ajouter en haut du fichier, avant `describe('HelpDrawer', ...)` :

```typescript
import { beforeEach } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('api', {
    getVersion: vi.fn().mockResolvedValue('1.2.0'),
  });
});
```

Ajouter les nouveaux tests dans le `describe('HelpDrawer', ...)` existant, après le test `'affiche le handle de redimensionnement'` :

```typescript
  it('affiche un quatrième onglet "À propos"', () => {
    renderDrawer(true);
    expect(screen.getByRole('tab', { name: 'À propos' })).toBeInTheDocument();
  });

  it('affiche la version dans l\'onglet À propos', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'À propos' }));
    expect(await screen.findByText(/1\.2\.0/)).toBeInTheDocument();
  });

  it('affiche les notes de version dans l\'onglet À propos', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'À propos' }));
    expect(await screen.findByText(/v1\.0\.0/)).toBeInTheDocument();
  });

  it('affiche l\'entrée Membres dans l\'onglet Application', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Application' }));
    expect(screen.getByText('Membres')).toBeInTheDocument();
  });

  it('affiche l\'entrée Bilan complet dans l\'onglet Application', async () => {
    renderDrawer(true);
    await userEvent.click(screen.getByRole('tab', { name: 'Application' }));
    expect(screen.getByText('Bilan complet')).toBeInTheDocument();
  });

  it('mentionne le suivi des cotisations dans le Démarrage rapide', () => {
    renderDrawer(true);
    expect(screen.getByText(/Suivre les cotisations/)).toBeInTheDocument();
  });
```

- [ ] **Step 2 : Vérifier que les tests échouent**

```bash
cd app && npm test -- HelpDrawer.test --reporter=verbose 2>&1 | tail -40
```

Expected : FAIL — onglet "À propos" introuvable, entrées "Membres"/"Bilan complet" absentes, étape "Suivre les cotisations" absente.

- [ ] **Step 3 : Ajouter l'onglet "À propos" et mettre à jour le type `Tab`**

Dans `app/src/components/HelpDrawer.tsx`, modifier le type et le tableau `TABS` :

```typescript
type Tab = 'quickstart' | 'accounting' | 'app' | 'about';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'quickstart', label: 'Démarrage rapide' },
  { id: 'accounting', label: 'Comptabilité'     },
  { id: 'app',        label: 'Application'      },
  { id: 'about',      label: 'À propos'         },
];
```

Ajouter le rendu conditionnel dans la zone `<div className={styles.content}>` :

```typescript
          {tab === 'quickstart' && <QuickStartTab />}
          {tab === 'accounting' && <AccountingTab />}
          {tab === 'app'        && <AppTab />}
          {tab === 'about'      && <AboutTab />}
```

- [ ] **Step 4 : Ajouter le composant `AboutTab`**

Ajouter à la fin du fichier (après la fonction `AppTab`) :

```typescript
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
```

Ajouter `useEffect` à l'import React en haut du fichier :

```typescript
import { useState, useCallback, useEffect } from 'react';
```

Note : `styles.sectionTitle` est réutilisé pour les `<h4>` (pas de nouvelle classe CSS nécessaire — la police/le poids conviennent aussi pour un sous-titre de version).

- [ ] **Step 5 : Ajouter l'entrée "Membres" dans `AppTab`**

Dans la fonction `AppTab`, dans le `<dl className={styles.glossary}>`, ajouter une entrée entre `<dt>Journal</dt>`/`<dd>...</dd>` et `<dt>Analytique</dt>` :

```typescript
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
```

- [ ] **Step 6 : Ajouter l'entrée "Bilan complet" dans `AppTab`**

Ajouter après `<dt>Grand-livre</dt>`/`<dd>...</dd>`, avant `<dt>Paramètres</dt>` :

```typescript
        <dt>Bilan complet</dt>
        <dd>Présentation en deux colonnes : Actif / Passif &amp; Fonds propres à gauche,
            Résultat / Charges à droite. Un contrôle d&apos;équilibre automatique confirme
            que le bilan est cohérent.</dd>
```

- [ ] **Step 7 : Mettre à jour la section Paramètres dans `AppTab`**

Remplacer le contenu de `<dd>` associé à `<dt>Paramètres</dt>` :

```typescript
        <dt>Paramètres</dt>
        <dd>Chemin de la base de données, export de sauvegarde manuelle, historique des
            sauvegardes automatiques, export Excel global. Restauration possible depuis
            n&apos;importe quelle sauvegarde (automatique ou manuelle), avec confirmation
            avant remplacement de la base actuelle.</dd>
```

- [ ] **Step 8 : Ajouter l'étape cotisations dans `QuickStartTab`**

Dans la fonction `QuickStartTab`, ajouter un nouvel élément `<li>` dans le `<ol className={styles.steps}>`, après l'étape "Consulter les soldes" et avant l'étape "Clôturer l'exercice" :

```typescript
        <li>
          <strong>Suivre les cotisations</strong><br />
          Page <em>Membres</em> → cocher les cotisations reçues au fil de l&apos;année, ou
          utiliser &quot;Enregistrer un paiement&quot; pour générer automatiquement l&apos;écriture
          comptable correspondante.
        </li>
```

- [ ] **Step 9 : Vérifier que tous les tests passent**

```bash
cd app && npm test -- HelpDrawer.test --reporter=verbose 2>&1 | tail -40
```

Expected : tous PASS.

- [ ] **Step 10 : Vérifier la suite complète**

```bash
cd app && npm test 2>&1 | tail -10
```

Expected : 0 échec, nombre de tests ≥ 710 + 6 (nouveaux tests renderer) = 716.

- [ ] **Step 11 : Commit**

```bash
git add app/src/components/HelpDrawer.tsx app/src/__tests__/renderer/HelpDrawer.test.tsx
git commit -m "feat(help): mise à jour contenu HelpDrawer (Membres, Bilan complet, restauration) + onglet À propos"
```

---

## Auto-révision du plan

**Couverture spec :**
- Handler `app:getVersion` → Task 1.
- Onglet "À propos" (version + notes de version statiques) → Task 2 Step 3-4.
- Entrée "Membres" dans l'onglet Application → Task 2 Step 5.
- Entrée "Bilan complet" dans l'onglet Application → Task 2 Step 6.
- Mention de la restauration dans la section Paramètres → Task 2 Step 7.
- Étape "Suivre les cotisations" dans le Démarrage rapide → Task 2 Step 8.
- Contenu exact des notes de version (4 entrées, du plus récent au plus ancien) → Task 2 Step 4, respecte l'ordre et le texte des Global Constraints.

**Scan placeholders :** aucun trouvé — chaque étape contient le code exact.

**Cohérence des types :** `window.api.getVersion(): Promise<string>` cohérent entre Task 1 (handler, preload, window.d.ts) et Task 2 (`AboutTab`, mock de test).
