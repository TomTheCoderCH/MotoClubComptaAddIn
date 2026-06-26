import { test, expect } from './electron-fixture';

async function setupWithEntry(window: import('@playwright/test').Page) {
  // Crée exercice 2025
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  // Saisit une écriture : D 101 Raiffeisen 1410 / C 300 Cotisations 1410
  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  await window.getByLabel('Date').fill('2025-03-01');
  await window.getByLabel('Libellé').fill('Cotisations');
  await window.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await window.getByLabel('Débit ligne 1').fill('1410.00');
  await window.getByLabel('Compte ligne 2').selectOption({ label: '300 — Cotisations membres' });
  await window.getByLabel('Crédit ligne 2').fill('1410.00');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();
}

test('les soldes reflètent les écritures saisies', async ({ window }) => {
  await setupWithEntry(window);

  await window.getByRole('button', { name: 'Soldes' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Soldes' })).toBeVisible();

  // Raiffeisen (101) et Cotisations membres (300) doivent apparaître
  await expect(window.getByRole('cell', { name: /Raiffeisen/ })).toBeVisible();
  await expect(window.getByRole('cell', { name: /Cotisations membres/ })).toBeVisible();

  // Les montants 1410 CHF formatés en "1'410.00"
  const cells = window.getByRole('cell', { name: "1'410.00" });
  await expect(cells.first()).toBeVisible();
});

test("la page soldes affiche le message d'absence d'exercice", async ({ window }) => {
  await window.getByRole('button', { name: 'Soldes' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Soldes' })).toBeVisible();
  await expect(window.getByText(/Aucun exercice disponible/)).toBeVisible();
});

test('cliquer sur un compte ouvre son grand-livre', async ({ window }) => {
  await setupWithEntry(window);

  await window.getByRole('button', { name: 'Soldes' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Soldes' })).toBeVisible();

  // Cliquer sur la ligne Raiffeisen ouvre son grand-livre
  await window.getByRole('cell', { name: 'Raiffeisen' }).click();

  // Le grand-livre affiche l'en-tête du compte et le lien retour
  await expect(window.getByRole('heading', { level: 1, name: /101.*Raiffeisen/ })).toBeVisible();
  await expect(window.locator('text=← Retour aux soldes')).toBeVisible();

  // L'écriture saisie est visible dans le grand-livre (cellule Libellé exacte)
  await expect(window.getByRole('cell', { name: 'Cotisations', exact: true })).toBeVisible();
});
