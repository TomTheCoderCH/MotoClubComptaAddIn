import { test, expect } from './electron-fixture';

test('affiche le titre Plan comptable', async ({ window }) => {
  await expect(window.locator('h1')).toHaveText('Plan comptable');
});

test('affiche le plan comptable avec 29 comptes', async ({ window }) => {
  await expect(window.locator('p').filter({ hasText: /\d+ comptes/ })).toBeVisible();
  const rows = window.locator('tbody tr');
  await expect(rows).toHaveCount(29);
});

test('affiche le compte Caisse (100)', async ({ window }) => {
  await expect(window.locator('text=Caisse')).toBeVisible();
  await expect(window.locator('code:has-text("100")')).toBeVisible();
});

test('affiche les colonnes N°, Intitulé, Type, Balance', async ({ window }) => {
  await expect(window.locator('th:has-text("N°")')).toBeVisible();
  await expect(window.locator('th:has-text("Intitulé")')).toBeVisible();
  await expect(window.locator('th:has-text("Type")')).toBeVisible();
  await expect(window.locator('th:has-text("Balance")')).toBeVisible();
});

test('la sidebar affiche les 5 entrées de navigation', async ({ window }) => {
  const nav = window.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('button', { name: 'Plan comptable' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Journal' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Exercices' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Soldes' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Paramètres' })).toBeVisible();
});
