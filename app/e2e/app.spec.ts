import { test, expect } from './electron-fixture';

test('affiche le titre MCY Compta', async ({ window }) => {
  await expect(window.locator('h1')).toHaveText('MCY Compta');
});

test('affiche le plan comptable avec 29 comptes', async ({ window }) => {
  await expect(window.locator('h2')).toContainText('29 comptes');
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
