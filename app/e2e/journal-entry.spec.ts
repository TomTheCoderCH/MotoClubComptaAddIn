import { test, expect } from './electron-fixture';
import type { Page } from '@playwright/test';

async function setupYear(window: Page) {
  await window.getByRole('button', { name: 'Exercices' }).click();
  const input = window.getByLabel('Année');
  await input.fill('2025');
  await window.getByRole('button', { name: /Créer l'exercice 2025/ }).click();
  await expect(window.getByRole('cell', { name: '2025', exact: true })).toBeVisible();
}

async function goToJournal(window: Page) {
  await window.getByRole('button', { name: 'Journal' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Journal' })).toBeVisible();
}

async function createEntry(
  window: Page,
  opts: {
    libellé?: string;
    debitAccount?: string;
    creditAccount?: string;
    amount?: string;
  } = {},
) {
  const {
    libellé       = 'Cotisations annuelles',
    debitAccount  = '101 — Raiffeisen',
    creditAccount = '300 — Cotisations membres',
    amount        = '1410.00',
  } = opts;
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  const dialog = window.getByRole('dialog');
  // Scope to dialog to avoid conflicts with JournalFilters date/libellé labels
  await dialog.getByLabel('Date').fill('2025-03-01');
  await dialog.getByLabel('Libellé').fill(libellé);
  await dialog.getByLabel('Compte ligne 1').selectOption({ label: debitAccount });
  await dialog.getByLabel('Débit ligne 1').fill(amount);
  await dialog.getByLabel('Compte ligne 2').selectOption({ label: creditAccount });
  await dialog.getByLabel('Crédit ligne 2').fill(amount);
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();
}

test('crée une écriture simple et la voit dans le journal', async ({ window }) => {
  await setupYear(window);
  await goToJournal(window);

  // Ouvre le formulaire
  await window.getByRole('button', { name: /Nouvelle écriture/ }).click();
  await expect(window.getByRole('dialog')).toBeVisible();

  // Remplit les champs
  await window.getByLabel('Date').fill('2025-03-01');
  await window.getByLabel('Libellé').fill('Cotisations annuelles');
  await window.getByLabel('Compte ligne 1').selectOption({ label: '101 — Raiffeisen' });
  await window.getByLabel('Débit ligne 1').fill('1410.00');
  await window.getByLabel('Compte ligne 2').selectOption({ label: '300 — Cotisations membres' });
  await window.getByLabel('Crédit ligne 2').fill('1410.00');
  await expect(window.getByText('Ecriture équilibrée')).toBeVisible();
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  await expect(window.getByText('Cotisations annuelles')).toBeVisible();
});

test('modifie une écriture existante', async ({ window }) => {
  await setupYear(window);
  await goToJournal(window);
  await createEntry(window);

  await window.getByRole('button', { name: 'Modifier' }).click();
  const editDialog = window.getByRole('dialog');
  await expect(editDialog).toBeVisible();
  // Scope to dialog to avoid conflict with JournalFilters search input (aria-label contains "libellé")
  await editDialog.getByLabel('Libellé').fill('Cotisations modifiées');
  await window.getByRole('button', { name: "Enregistrer l'écriture" }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  await expect(window.getByText('Cotisations modifiées')).toBeVisible();
});

test('supprime une écriture', async ({ window }) => {
  await setupYear(window);
  await goToJournal(window);
  await createEntry(window);

  await window.getByRole('button', { name: 'Supprimer' }).click();
  await expect(window.getByRole('alertdialog')).toBeVisible();
  await window.getByRole('button', { name: 'Confirmer' }).click();

  // Confirmdialog includes the entry description, so check for the empty-state message directly
  await expect(window.getByText('Aucune écriture pour cet exercice.')).toBeVisible();
});

test('filtre les écritures par libellé', async ({ window }) => {
  await setupYear(window);
  await goToJournal(window);

  await createEntry(window, { libellé: 'Cotisations annuelles' });
  await createEntry(window, {
    libellé: 'Frais bancaires',
    debitAccount: '401 — Frais bancaires',
    creditAccount: '101 — Raiffeisen',
    amount: '20.00',
  });

  await window.getByLabel('Recherche dans le libellé ou la pièce').fill('Frais');

  // Use role=cell to avoid matching tooltip spans that also contain the account name
  await expect(window.getByRole('cell', { name: 'Frais bancaires', exact: true })).toBeVisible();
  await expect(window.getByRole('cell', { name: 'Cotisations annuelles', exact: true })).not.toBeVisible();
});

test('raccourci Ctrl+N ouvre le formulaire de nouvelle écriture', async ({ window }) => {
  await setupYear(window);
  await goToJournal(window);

  await window.keyboard.press('Control+n');
  await expect(window.getByRole('dialog')).toBeVisible();
});

test('le bouton de nouvelle écriture est absent sur un exercice clôturé', async ({ window }) => {
  await setupYear(window);

  // Clôture l'exercice
  await window.getByRole('button', { name: "Clôturer l'exercice" }).click();
  await window.getByRole('button', { name: 'Confirmer la clôture' }).click();
  await expect(window.getByText('Clôturé')).toBeVisible();

  await goToJournal(window);
  await expect(window.getByRole('button', { name: /Nouvelle écriture/ })).not.toBeVisible();
});
