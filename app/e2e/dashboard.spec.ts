import { test, expect } from './electron-fixture';

async function createYear(window: import('@playwright/test').Page, year: number) {
  await window.getByRole('button', { name: 'Exercices' }).click();
  const input = window.getByLabel('Année');
  await input.fill(String(year));
  await window.getByRole('button', { name: new RegExp(`Créer l'exercice ${year}`) }).click();
  await expect(window.getByRole('cell', { name: String(year), exact: true })).toBeVisible();
}

test('affiche le titre Tableau de bord par défaut', async ({ window }) => {
  await expect(window.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
});

test("affiche les cartes Caisse, Raiffeisen et Résultat après création d'exercice", async ({ window }) => {
  await createYear(window, 2025);
  await window.getByRole('button', { name: 'Accueil' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
  await expect(window.getByText('Caisse')).toBeVisible();
  await expect(window.getByText('Raiffeisen')).toBeVisible();
  await expect(window.getByText('Résultat')).toBeVisible();
});

test("panel Twint affiche message d'absence de mouvement si aucune écriture Twint", async ({ window }) => {
  await createYear(window, 2025);
  await window.getByRole('button', { name: 'Accueil' }).click();
  await expect(window.getByText('Twint — Récapitulatif')).toBeVisible();
  await expect(window.getByText('Aucun mouvement enregistré pour cet exercice.')).toBeVisible();
});

test('panel Twint affiche les données réelles après saisie d\'encaissements', async ({ window }) => {
  await createYear(window, 2025);

  // Encaissement Twint : D 102 100.00 / C 310 100.00
  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  let dialog = window.getByRole('dialog');
  await dialog.getByLabel('Date').fill('2025-05-01');
  await dialog.getByLabel('Libellé').fill('Encaissement Twint');
  await dialog.getByLabel('Compte ligne 1').selectOption({ label: '102 — Twint' });
  await dialog.getByLabel('Débit ligne 1').fill('100.00');
  await dialog.getByLabel('Compte ligne 2').selectOption({ label: '310 — Vente boissons — local' });
  await dialog.getByLabel('Crédit ligne 2').fill('100.00');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Frais Twint : D 402 1.30 / C 102 1.30
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  dialog = window.getByRole('dialog');
  await dialog.getByLabel('Date').fill('2025-05-31');
  await dialog.getByLabel('Libellé').fill('Frais Twint mai');
  await dialog.getByLabel('Compte ligne 1').selectOption({ label: '402 — Frais Twint' });
  await dialog.getByLabel('Débit ligne 1').fill('1.30');
  await dialog.getByLabel('Compte ligne 2').selectOption({ label: '102 — Twint' });
  await dialog.getByLabel('Crédit ligne 2').fill('1.30');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Dashboard : le panel Twint affiche les 3 lignes avec montants réels
  await window.getByRole('button', { name: 'Accueil' }).click();
  await expect(window.getByText('Twint — Récapitulatif')).toBeVisible();
  await expect(window.getByText('Encaissements bruts')).toBeVisible();
  await expect(window.getByText('Frais Twint')).toBeVisible();
  await expect(window.getByText('Net versé sur Raiffeisen')).toBeVisible();
  // Encaissements bruts = SUM(debit 102) = 100.00
  await expect(window.getByText('CHF 100.00')).toBeVisible();
});
