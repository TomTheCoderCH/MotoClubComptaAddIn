import { test, expect } from './electron-fixture';

test('la page Paramètres affiche les sections et la liste vide des sauvegardes', async ({ window }) => {
  await window.getByRole('button', { name: 'Paramètres' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();

  // Sections principales présentes
  await expect(window.getByRole('heading', { level: 2, name: 'Base de données' })).toBeVisible();
  await expect(window.getByRole('heading', { level: 2, name: 'Sauvegardes' })).toBeVisible();

  // Boutons d'action présents
  await expect(window.getByRole('button', { name: /Exporter une sauvegarde/ })).toBeVisible();
  await expect(window.getByRole('button', { name: /Restaurer depuis une sauvegarde/ })).toBeVisible();

  // Version du schéma SQLite affichée
  await expect(window.getByText(/Version du schéma : v/)).toBeVisible();

  // Aucune sauvegarde automatique sur une instance fraîche
  await expect(window.getByText("Aucune sauvegarde automatique pour l'instant.")).toBeVisible();
});
