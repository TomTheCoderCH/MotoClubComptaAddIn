import type Database from 'better-sqlite3';

// Plan comptable MCY — inséré uniquement si la table n'a pas les 30 comptes
export function seedAccountsIfEmpty(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as n FROM accounts').get() as { n: number }).n;
  if (count >= 30) return;  // Skip if we already have all 30 accounts

  const insert = db.prepare(`
    INSERT OR IGNORE INTO accounts (number, name, class, type, normal_balance, description, account_group, must_be_zero_at_closing, is_closing_account)
    VALUES (@number, @name, @class, @type, @normal_balance, @description, @account_group, @must_be_zero_at_closing, @is_closing_account)
  `);

  const seedMany = db.transaction((rows: Parameters<typeof insert['run']>[0][]) => {
    for (const row of rows) insert.run(row);
  });

  seedMany([
    // Classe 1 — Actifs
    { number: '100', name: 'Caisse',              class: 1, type: 'ACTIF', normal_balance: 'DEBIT',  description: 'Espèces physiques',                                    account_group: null, must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '101', name: 'Raiffeisen',           class: 1, type: 'ACTIF', normal_balance: 'DEBIT',  description: 'Compte bancaire',                                      account_group: null, must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '102', name: 'Twint',                class: 1, type: 'ACTIF', normal_balance: 'DEBIT',  description: 'Compte de transit (doit être soldé en fin d\'exercice)', account_group: null, must_be_zero_at_closing: 1, is_closing_account: 0 },
    { number: '103', name: 'Avances caissier',     class: 1, type: 'ACTIF', normal_balance: 'DEBIT',  description: 'Avances remboursables au caissier',                    account_group: null, must_be_zero_at_closing: 1, is_closing_account: 0 },

    // Classe 2 — Passifs et fonds propres
    { number: '200', name: 'Passifs transitoires', class: 2, type: 'PASSIF',        normal_balance: 'CREDIT', description: 'Charges à payer sur exercice suivant', account_group: null, must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '290', name: 'Capital',              class: 2, type: 'FONDS_PROPRES', normal_balance: 'CREDIT', description: 'Fortune nette du club',               account_group: null, must_be_zero_at_closing: 0, is_closing_account: 0 },

    // Classe 3 — Produits
    { number: '300', name: 'Cotisations membres',       class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'CHF 30/an/membre',                            account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '310', name: 'Vente boissons (local)',    class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Ventes mensuelles au local',                  account_group: 'Boissons local',   must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '320', name: 'Assemblée générale',        class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Ventes vin et divers à l\'AG',                account_group: 'Assemblée générale', must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '330', name: 'Marché Villageois',         class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Recettes du marché',                          account_group: 'Marché',           must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '340', name: 'Broche',                    class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Recettes de la broche',                       account_group: 'Broche',           must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '350', name: 'Sorties',                   class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Remboursements participants, tournées',        account_group: 'Sorties',          must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '360', name: 'Souper fin d\'année',       class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Recettes du souper',                          account_group: 'Souper',           must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '370', name: 'Location matériel',         class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Location tente et autre matériel',             account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '390', name: 'Produits divers',           class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Crédits, remboursements assureurs, etc.',     account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '391', name: 'Dons',                      class: 3, type: 'PRODUIT', normal_balance: 'CREDIT', description: 'Dons divers',                                   account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },

    // Classe 4 — Charges
    { number: '400', name: 'Assurances',                class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'RC AXA et autres',                              account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '401', name: 'Frais bancaires',           class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Taxes compte Raiffeisen, taxe VISA',            account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '402', name: 'Frais Twint',               class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Commission ~1.3% sur transactions',              account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '410', name: 'Électricité',               class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Romande Energie (acomptes + solde)',             account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '411', name: 'Achats boissons (local)',   class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Réapprovisionnement du local',                  account_group: 'Boissons local',   must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '420', name: 'Assemblée générale',        class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Vin, nourriture, envois',                       account_group: 'Assemblée générale', must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '430', name: 'Marché Villageois',         class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Achats denrées, patente, matériel',             account_group: 'Marché',           must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '440', name: 'Broche',                    class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Viande, boissons, divers',                      account_group: 'Broche',           must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '450', name: 'Sorties',                   class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Repas, transports, cafés',                      account_group: 'Sorties',          must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '460', name: 'Souper fin d\'année',       class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Vin, nourriture, divers',                       account_group: 'Souper',           must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '470', name: 'Cadeaux et dons',           class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Ex. départ d\'un membre',                       account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '480', name: 'Achats matériel',           class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Petit équipement (verres, plastifieuse…)',       account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },
    { number: '490', name: 'Charges diverses',          class: 4, type: 'CHARGE', normal_balance: 'DEBIT', description: 'Tout ce qui ne rentre pas ailleurs',             account_group: null,               must_be_zero_at_closing: 0, is_closing_account: 0 },

    // Classe 9 — Clôture
    { number: '900', name: 'Profits et Pertes', class: 9, type: 'RESULTAT', normal_balance: 'CREDIT', description: 'Reçoit les soldes 3xx et 4xx en clôture', account_group: null, must_be_zero_at_closing: 0, is_closing_account: 1 },
  ]);
}
