import { test, expect } from './electron-fixture';

async function setupYear(window: import('@playwright/test').Page) {
  await window.getByRole('button', { name: 'Exercices' }).click();
  const input = window.getByLabel('Année');
  await input.fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();
}

async function goToJournal(window: import('@playwright/test').Page) {
  await window.getByRole('button', { name: 'Journal' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible();
}

test('crée une écriture simple et la voit dans le journal', async ({ window }) => {
  await setupYear(window);
  await goToJournal(window);

  // Ouvre le formulaire
  await window.getByRole('button', { name: '+ Nouvelle écriture' }).click();
  await expect(window.getByRole('dialog')).toBeVisible();

  // Remplit les champs de l'en-tête
  await window.getByLabel('Date').fill('2025-03-01');
  await window.getByLabel('Libellé').fill('Cotisations annuelles');

  // Ligne 1 : Débit Raiffeisen (101) 1410.00
  await window.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await window.getByLabel('Débit ligne 1').fill('1410.00');

  // Ligne 2 : Crédit Cotisations membres (300) 1410.00
  await window.getByLabel('Compte ligne 2').selectOption({ label: '300 — Cotisations membres' });
  await window.getByLabel('Crédit ligne 2').fill('1410.00');

  // Vérifie l'équilibre avant soumission
  await expect(window.getByText('Ecriture équilibrée')).toBeVisible();

  // Soumet
  await window.getByRole('button', { name: 'Enregistrer l\'écriture' }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // L'écriture apparaît dans le journal
  await expect(window.getByText('Cotisations annuelles')).toBeVisible();
});

test('le bouton de nouvelle écriture est absent sur un exercice clôturé', async ({ window }) => {
  await setupYear(window);

  // Clôture l'exercice
  await window.getByRole('button', { name: "Clôturer l'exercice" }).click();
  await window.getByRole('button', { name: 'Confirmer la clôture' }).click();
  await expect(window.getByText('Clôturé')).toBeVisible();

  await goToJournal(window);
  await expect(window.getByRole('button', { name: '+ Nouvelle écriture' })).not.toBeVisible();
});
