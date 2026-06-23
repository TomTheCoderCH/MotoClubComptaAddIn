import { test, expect } from './electron-fixture';

async function setupWithEntry(window: import('@playwright/test').Page) {
  // Crée exercice 2025
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  // Saisit une écriture : D 101 Raiffeisen 1410 / C 300 Cotisations 1410
  await window.getByRole('button', { name: 'Journal' }).click();
  await window.getByRole('button', { name: '+ Nouvelle écriture' }).click();
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

  // Raiffeisen (101) : solde débiteur 1410.00
  await expect(window.getByRole('cell', { name: /Raiffeisen/ })).toBeVisible();
  // Cotisations membres (300) : solde créditeur 1410.00
  await expect(window.getByRole('cell', { name: /Cotisations membres/ })).toBeVisible();

  // Les soldes montrent 1410.00
  const cells = window.getByRole('cell', { name: '1410.00' });
  await expect(cells.first()).toBeVisible();
});

test('la page soldes affiche le message d\'absence d\'exercice', async ({ window }) => {
  await window.getByRole('button', { name: 'Soldes' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Soldes' })).toBeVisible();
  await expect(window.getByText(/Aucun exercice disponible/)).toBeVisible();
});
