import { describe, it, expect } from 'vitest';
import { formatAmount, parseAmount, validateEntryBalance } from '../lib/accounting';

describe('formatAmount', () => {
  it('formate 0 centimes', () => {
    expect(formatAmount(0)).toBe('0.00');
  });

  it('formate 3000 centimes → 30.00', () => {
    expect(formatAmount(3000)).toBe('30.00');
  });

  it('formate 3045 centimes → 30.45', () => {
    expect(formatAmount(3045)).toBe('30.45');
  });

  it('formate 161800 centimes → 1618.00 (bénéfice Marché Villageois)', () => {
    expect(formatAmount(161800)).toBe('1618.00');
  });

  it('formate 1244380 centimes → 12443.80 (capital exercice)', () => {
    expect(formatAmount(1244380)).toBe('12443.80');
  });
});

describe('parseAmount', () => {
  it('parse "30.45" → 3045', () => {
    expect(parseAmount('30.45')).toBe(3045);
  });

  it('parse "30" → 3000', () => {
    expect(parseAmount('30')).toBe(3000);
  });

  it('parse "0.10" → 10', () => {
    expect(parseAmount('0.10')).toBe(10);
  });

  it('accepte la virgule comme séparateur décimal', () => {
    expect(parseAmount('30,45')).toBe(3045);
  });

  it('lève une erreur pour une valeur non numérique', () => {
    expect(() => parseAmount('abc')).toThrow('Montant invalide');
  });

  it('lève une erreur pour un montant négatif', () => {
    expect(() => parseAmount('-5')).toThrow('Montant invalide');
  });

  it('lève une erreur pour une chaîne vide', () => {
    expect(() => parseAmount('')).toThrow('Montant invalide');
  });
});

describe('validateEntryBalance', () => {
  it('accepte une écriture simple équilibrée (2 lignes)', () => {
    expect(() => validateEntryBalance([
      { debit: 3000 },
      { credit: 3000 },
    ])).not.toThrow();
  });

  it('accepte une écriture à plusieurs lignes équilibrée', () => {
    expect(() => validateEntryBalance([
      { debit: 3000 },
      { debit: 1500 },
      { credit: 4500 },
    ])).not.toThrow();
  });

  it('rejette une liste vide', () => {
    expect(() => validateEntryBalance([])).toThrow('au moins 2 lignes');
  });

  it('rejette une écriture avec une seule ligne', () => {
    expect(() => validateEntryBalance([{ debit: 3000 }])).toThrow('au moins 2 lignes');
  });

  it('rejette une écriture déséquilibrée', () => {
    expect(() => validateEntryBalance([
      { debit: 3000 },
      { credit: 2000 },
    ])).toThrow('déséquilibrée');
  });

  it('le message d\'erreur indique les montants en cause', () => {
    expect(() => validateEntryBalance([
      { debit: 3000 },
      { credit: 2000 },
    ])).toThrow('3000');
  });

  it('traite null comme 0 (ligne sans montant)', () => {
    expect(() => validateEntryBalance([
      { debit: 3000, credit: null },
      { debit: null, credit: 3000 },
    ])).not.toThrow();
  });
});
