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
