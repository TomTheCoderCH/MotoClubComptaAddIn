import { test, expect } from './electron-fixture';

async function goToExercices(window: import('@playwright/test').Page) {
  await window.getByRole('button', { name: 'Exercices' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Exercices' })).toBeVisible();
}

async function createYear(window: import('@playwright/test').Page, year: number) {
  const input = window.getByLabel('Année');
  await input.fill(String(year));
  await window.getByRole('button', { name: new RegExp(`Créer l'exercice ${year}`) }).click();
  await expect(window.getByRole('cell', { name: String(year) })).toBeVisible();
}

test('crée un exercice et vérifie son statut ouvert', async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);
  await expect(window.getByText('Ouvert')).toBeVisible();
});

test('clôture un exercice vide puis le rouvre', async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);

  // Clôturer
  await window.getByRole('button', { name: "Clôturer l'exercice" }).click();
  await expect(window.getByRole('dialog')).toBeVisible();
  await expect(window.getByText('Résultat net')).toBeVisible();
  await window.getByRole('button', { name: 'Confirmer la clôture' }).click();
  await expect(window.getByText('Clôturé')).toBeVisible();

  // Rouvrir
  await window.getByRole('button', { name: 'Rouvrir' }).click();
  await expect(window.getByRole('alertdialog')).toBeVisible();
  await window.getByRole('button', { name: 'Confirmer' }).click();
  await expect(window.getByText('Ouvert')).toBeVisible();
});

test('ne peut pas créer deux fois le même exercice', async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);

  const input = window.getByLabel('Année');
  await input.fill('2025');
  await expect(window.getByText(/L'exercice 2025 existe déjà/)).toBeVisible();
  await expect(window.getByRole('button', { name: /Créer l'exercice 2025/ })).toBeDisabled();
});
