import { test, expect } from './electron-fixture';
import type { Page } from '@playwright/test';

async function setupWithEntry(window: Page) {
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  await window.getByLabel('Date').fill('2025-03-01');
  await window.getByLabel('Libellé').fill('Cotisations annuelles');
  await window.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await window.getByLabel('Débit ligne 1').fill('1410.00');
  await window.getByLabel('Compte ligne 2').selectOption({ label: '300 — Cotisations membres' });
  await window.getByLabel('Crédit ligne 2').fill('1410.00');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();
}

test('affiche le titre Analytique', async ({ window }) => {
  await window.getByRole('button', { name: 'Analytique' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Analytique' })).toBeVisible();
});

test('affiche la section Non groupés avec des mouvements sur des comptes sans groupe', async ({ window }) => {
  await setupWithEntry(window);

  await window.getByRole('button', { name: 'Analytique' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Analytique' })).toBeVisible();

  // Cotisations membres (300) n'a pas de groupe analytique → section Non groupés
  await expect(window.getByText(/Non group/)).toBeVisible();
  await expect(window.getByText(/Cotisations membres/)).toBeVisible();
});

test('affiche le titre Bilan complet', async ({ window }) => {
  await window.getByRole('button', { name: 'Bilan complet' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Bilan complet' })).toBeVisible();
});

test('affiche ✓ Bilan équilibré après une écriture simple', async ({ window }) => {
  await setupWithEntry(window);

  await window.getByRole('button', { name: 'Bilan complet' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Bilan complet' })).toBeVisible();

  await expect(window.getByText('✓ Bilan équilibré')).toBeVisible();
});

test('affiche les recettes d\'un groupe nommé avec le montant correct', async ({ window }) => {
  // Le groupe "Marché" est déjà assigné au compte 330 par le seed.
  // On vérifie tout de même via l'UI que le groupe est bien présent.
  await window.getByRole('button', { name: 'Plan comptable' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Plan comptable' })).toBeVisible();
  // 330 et 430 portent le même nom "Marché Villageois" → cibler la ligne 330 explicitement
  await window.getByRole('row', { name: /330/ }).getByRole('button', { name: /Modifier/ }).click();
  await window.getByLabel('Groupe analytique').fill('Marché');
  await window.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Crée un exercice et une écriture : D 101 500 / C 330 500 (recette Marché)
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByLabel('Date').fill('2025-06-01');
  await dialog.getByLabel('Libellé').fill('Recettes Marché');
  await dialog.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await dialog.getByLabel('Débit ligne 1').fill('500.00');
  await dialog.getByLabel('Compte ligne 2').selectOption({ label: '330 — Marché Villageois' });
  await dialog.getByLabel('Crédit ligne 2').fill('500.00');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Le groupe "Marché" apparaît avec 500.00 de recettes dans la page Analytique
  await window.getByRole('button', { name: 'Analytique' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Analytique' })).toBeVisible();
  const groupRow = window.getByRole('row').filter({ hasText: 'Marché' });
  await expect(groupRow).toBeVisible();
  await expect(groupRow.getByRole('cell', { name: '500.00' }).first()).toBeVisible();
});
