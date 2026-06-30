import { test, expect } from './electron-fixture';

test('crée un nouveau compte dans le plan comptable', async ({ window }) => {
  await window.getByRole('button', { name: 'Plan comptable' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Plan comptable' })).toBeVisible();

  await window.getByRole('button', { name: 'Nouveau compte' }).click();
  await expect(window.getByRole('dialog')).toBeVisible();

  await window.getByLabel('Numéro *').fill('395');
  await window.getByLabel('Libellé *').fill('Subvention test');
  await window.locator('#acc-type').selectOption('PRODUIT');
  await window.getByRole('button', { name: 'Créer' }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  await expect(window.getByText('Subvention test')).toBeVisible();
});

test('modifie le groupe analytique d\'un compte existant', async ({ window }) => {
  await window.getByRole('button', { name: 'Plan comptable' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Plan comptable' })).toBeVisible();

  await window.getByRole('button', { name: 'Modifier Cotisations membres' }).click();
  await expect(window.getByRole('dialog')).toBeVisible();

  await window.getByLabel('Groupe analytique').fill('cotisations');
  await window.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Group tag renders in the table; use first() to avoid strict-mode conflict with DOM internals
  await expect(window.getByText('cotisations').first()).toBeVisible();
});

test('un compte avec groupe apparaît dans la page Analytique', async ({ window }) => {
  // Assigne un groupe au compte Cotisations membres (300)
  await window.getByRole('button', { name: 'Plan comptable' }).click();
  await window.getByRole('button', { name: 'Modifier Cotisations membres' }).click();
  await window.getByLabel('Groupe analytique').fill('cotisations');
  await window.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Crée un exercice et une écriture sur ce compte
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  await window.getByLabel('Date').fill('2025-03-01');
  await window.getByLabel('Libellé').fill('Cotisations 2025');
  await window.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await window.getByLabel('Débit ligne 1').fill('1410.00');
  await window.getByLabel('Compte ligne 2').selectOption({ label: '300 — Cotisations membres' });
  await window.getByLabel('Crédit ligne 2').fill('1410.00');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Vérifie que le groupe apparaît dans la page Analytique
  await window.getByRole('button', { name: 'Analytique' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Analytique' })).toBeVisible();
  await expect(window.getByText('cotisations')).toBeVisible();
});
