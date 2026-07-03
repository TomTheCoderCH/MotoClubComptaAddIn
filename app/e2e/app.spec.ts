import { test, expect } from './electron-fixture';

test('affiche le titre Tableau de bord par défaut', async ({ window }) => {
  await expect(window.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeVisible();
});

test('affiche message si aucun exercice sur le tableau de bord', async ({ window }) => {
  await expect(window.locator('text=Aucun exercice disponible')).toBeVisible();
});

test('la sidebar affiche les 9 entrées de navigation', async ({ window }) => {
  const nav = window.getByRole('navigation', { name: 'Navigation principale' });
  const labels = [
    'Accueil', 'Plan comptable', 'Journal', 'Caisse', 'Exercices',
    'Soldes', 'Analytique', 'Bilan complet', 'Paramètres',
  ];
  for (const label of labels) {
    await expect(nav.getByRole('button', { name: label })).toBeVisible();
  }
});

test('navigue vers le Plan comptable avec 30 comptes', async ({ window }) => {
  await window.getByRole('button', { name: 'Plan comptable' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Plan comptable' })).toBeVisible();
  await expect(window.locator('p:has-text("30 comptes")')).toBeVisible();
});

test('affiche le compte Caisse (100) dans le plan comptable', async ({ window }) => {
  await window.getByRole('button', { name: 'Plan comptable' }).click();
  await expect(window.locator('text=Caisse')).toBeVisible();
  await expect(window.locator('code:has-text("100")')).toBeVisible();
});

test('affiche les colonnes du plan comptable', async ({ window }) => {
  await window.getByRole('button', { name: 'Plan comptable' }).click();
  await expect(window.locator('th:has-text("N°")')).toBeVisible();
  await expect(window.locator('th:has-text("Intitulé")')).toBeVisible();
  await expect(window.locator('th:has-text("Type")')).toBeVisible();
  await expect(window.locator('th:has-text("Balance")')).toBeVisible();
  await expect(window.locator('th:has-text("Groupe analytique")')).toBeVisible();
});
