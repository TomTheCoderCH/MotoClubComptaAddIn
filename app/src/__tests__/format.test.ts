import { describe, it, expect } from 'vitest';
import { formatCHF, formatDate, formatDateTime, formatSize } from '../lib/format';

describe('formatCHF', () => {
  it('formate zéro', () => {
    expect(formatCHF(0)).toBe('0.00');
  });
  it('formate un montant entier', () => {
    expect(formatCHF(3000)).toBe('30.00');
  });
  it('formate un montant avec centimes', () => {
    expect(formatCHF(3045)).toBe('30.45');
  });
  it('formate un grand montant', () => {
    expect(formatCHF(1244380)).toBe('12443.80');
  });
  it('formate un montant négatif', () => {
    expect(formatCHF(-5000)).toBe('-50.00');
  });
});

describe('formatDate', () => {
  it('convertit ISO YYYY-MM-DD en DD.MM.YYYY', () => {
    expect(formatDate('2025-03-08')).toBe('08.03.2025');
  });
  it('convertit le 1er janvier', () => {
    expect(formatDate('2025-01-01')).toBe('01.01.2025');
  });
  it('convertit le 31 décembre', () => {
    expect(formatDate('2025-12-31')).toBe('31.12.2025');
  });
});

describe('formatDateTime', () => {
  it('formate une date-heure ISO avec heure locale', () => {
    // On vérifie uniquement la structure DD.MM.YYYY HH:MM
    const result = formatDateTime('2025-03-08T14:30:00.000Z');
    expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
  });
});

describe('formatSize', () => {
  it('formate en Ko pour moins de 1 Mo', () => {
    expect(formatSize(512 * 1024)).toBe('512 Ko');
  });
  it('formate en Mo pour 1 Mo et plus', () => {
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 Mo');
  });
  it('formate exactement 1 Ko', () => {
    expect(formatSize(1024)).toBe('1 Ko');
  });
});
