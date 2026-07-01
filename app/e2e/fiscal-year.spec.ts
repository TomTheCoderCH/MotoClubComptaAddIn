import { test, expect } from './electron-fixture';

async function goToExercices(window: import('@playwright/test').Page) {
  await window.getByRole('button', { name: 'Exercices' }).click();
  await expect(window.getByRole('heading', { level: 1, name: 'Exercices' })).toBeVisible();
}

async function createYear(window: import('@playwright/test').Page, year: number) {
  const input = window.getByLabel('Année');
  await input.fill(String(year));
  await window.getByRole('button', { name: new RegExp(`Créer l'exercice ${year}`) }).click();
  await expect(window.getByRole('cell', { name: String(year), exact: true })).toBeVisible();
}

test('crée un exercice et vérifie son statut ouvert', async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);
  await expect(window.getByText('Ouvert')).toBeVisible();
});

test('clôture un exercice vide puis le rouvre', async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);

  // Clôturer
  await window.getByRole('button', { name: "Clôturer l'exercice" }).click();
  await expect(window.getByRole('dialog')).toBeVisible();
  await expect(window.getByText('Résultat net')).toBeVisible();
  await window.getByRole('button', { name: 'Confirmer la clôture' }).click();
  await expect(window.getByText('Clôturé')).toBeVisible();

  // Rouvrir
  await window.getByRole('button', { name: 'Rouvrir' }).click();
  await expect(window.getByRole('alertdialog')).toBeVisible();
  await window.getByRole('button', { name: 'Confirmer' }).click();
  await expect(window.getByText('Ouvert')).toBeVisible();
});

test('ne peut pas créer deux fois le même exercice', async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);

  const input = window.getByLabel('Année');
  await input.fill('2025');
  await expect(window.getByText(/L'exercice 2025 existe déjà/)).toBeVisible();
  await expect(window.getByRole('button', { name: /Créer l'exercice 2025/ })).toBeDisabled();
});

test('saisir les soldes à nouveau affiche le badge Saisis', async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);

  // Ouvre la modale de soldes à nouveau
  await window.getByRole('button', { name: /Saisir les soldes à nouveau/ }).click();
  const dialog = window.getByRole('dialog');
  await expect(dialog.getByText(/Soldes à nouveau — Exercice 2025/)).toBeVisible();

  // Saisit Raiffeisen = 12000 (Capital calculé automatiquement = 12000)
  await dialog.getByLabel('Solde Raiffeisen').fill('12000.00');
  await window.getByRole('button', { name: 'Enregistrer les soldes' }).click();
  await expect(window.getByRole('dialog')).not.toBeVisible();

  // Le badge "Saisis" apparaît dans la colonne Soldes à nouveau
  await expect(window.getByText('Saisis')).toBeVisible();
});

test("la clôture avec une écriture affiche un bénéfice", async ({ window }) => {
  await goToExercices(window);
  await createYear(window, 2025);

  // Saisit une écriture D101 Raiffeisen / C300 Cotisations membres 1410 CHF
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

  // Clôture depuis la page Exercices
  await window.getByRole('button', { name: 'Exercices' }).click();
  await window.getByRole('button', { name: "Clôturer l'exercice" }).click();
  const dialog = window.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Résultat net positif (produit 300 soldé vers 900 → Capital) → Bénéfice
  await expect(dialog.getByText(/Bénéfice/)).toBeVisible();
  await window.getByRole('button', { name: 'Confirmer la clôture' }).click();
  await expect(window.getByText('Clôturé')).toBeVisible();
});
