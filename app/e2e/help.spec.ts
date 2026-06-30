import { test, expect } from './electron-fixture';

test('le bouton Aide ouvre le drawer d\'aide', async ({ window }) => {
  await window.getByRole('button', { name: 'Aide' }).click();
  await expect(window.getByRole('dialog', { name: 'Aide' })).toBeVisible();
});

test('Escape ferme le drawer d\'aide', async ({ window }) => {
  await window.getByRole('button', { name: 'Aide' }).click();
  await expect(window.getByRole('dialog', { name: 'Aide' })).toBeVisible();

  await window.keyboard.press('Escape');
  await expect(window.getByRole('dialog', { name: 'Aide' })).not.toBeVisible();
});

test('Escape ferme une modale journal', async ({ window }) => {
  // Crée un exercice pour pouvoir ouvrir le formulaire d'écriture
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  await expect(window.getByRole('dialog')).toBeVisible();

  await window.keyboard.press('Escape');
  await expect(window.getByRole('dialog')).not.toBeVisible();
});
