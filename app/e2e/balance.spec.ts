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

test('le grand-livre affiche le solde courant progressif', async ({ window }) => {
  // Deux écritures successives sur Raiffeisen (101)
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  await window.getByRole('button', { name: 'Journal' }).click();

  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  let dialog = window.getByRole('dialog');
  await dialog.getByLabel('Date').fill('2025-03-01');
  await dialog.getByLabel('Libellé').fill('Entrée 1');
  await dialog.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await dialog.getByLabel('Débit ligne 1').fill('1000.00');
  await dialog.getByLabel('Compte ligne 2').selectOption({ label: '300 — Cotisations membres' });
  await dialog.getByLabel('Crédit ligne 2').fill('1000.00');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  dialog = window.getByRole('dialog');
  await dialog.getByLabel('Date').fill('2025-04-01');
  await dialog.getByLabel('Libellé').fill('Entrée 2');
  await dialog.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await dialog.getByLabel('Débit ligne 1').fill('500.00');
  await dialog.getByLabel('Compte ligne 2').selectOption({ label: '300 — Cotisations membres' });
  await dialog.getByLabel('Crédit ligne 2').fill('500.00');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Grand-livre de Raiffeisen
  await window.getByRole('button', { name: 'Soldes' }).click();
  await window.getByRole('cell', { name: 'Raiffeisen' }).click();
  await expect(window.getByRole('heading', { level: 1, name: /101.*Raiffeisen/ })).toBeVisible();

  // Colonne "Solde CHF" présente (comptes de bilan uniquement)
  await expect(window.getByRole('columnheader', { name: 'Solde CHF' })).toBeVisible();

  // Le solde après les 2 écritures est 1'500.00 (1000 + 500)
  // first() car "1'500.00" apparaît aussi dans le Total Débit du footer
  await expect(window.getByRole('cell', { name: "1'500.00" }).first()).toBeVisible();
});

test('la contrepartie du solde à nouveau affiche un tiret', async ({ window }) => {
  // Crée exercice puis saisit un solde à nouveau : Raiffeisen = 12000
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByLabel('Année').fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();

  await window.getByRole('button', { name: /Saisir les soldes à nouveau/ }).click();
  const obDialog = window.getByRole('dialog');
  await obDialog.getByLabel('Solde Raiffeisen').fill('12000.00');
  await window.getByRole('button', { name: 'Enregistrer les soldes' }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Grand-livre de Raiffeisen : la contrepartie de la ligne "Soldes à nouveau" est "—"
  await window.getByRole('button', { name: 'Soldes' }).click();
  await window.getByRole('cell', { name: 'Raiffeisen' }).click();
  await expect(window.getByRole('heading', { level: 1, name: /101.*Raiffeisen/ })).toBeVisible();
  await expect(window.getByRole('cell', { name: '—' })).toBeVisible();
});
