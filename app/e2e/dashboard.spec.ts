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
