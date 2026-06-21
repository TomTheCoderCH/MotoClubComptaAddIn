export function formatAmount(centimes: number): string {
  return (centimes / 100).toFixed(2);
}

export function parseAmount(input: string): number {
  const n = parseFloat(input.replace(',', '.'));
  if (isNaN(n) || n < 0) throw new Error(`Montant invalide: "${input}"`);
  return Math.round(n * 100);
}

export function validateEntryBalance(
  lines: Array<{ debit?: number | null; credit?: number | null }>,
): void {
  if (lines.length < 2) throw new Error('Une écriture doit comporter au moins 2 lignes');
  const totalDebit  = lines.reduce((s, l) => s + (l.debit  ?? 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (totalDebit !== totalCredit) {
    throw new Error(`Écriture déséquilibrée : débit ${totalDebit} ≠ crédit ${totalCredit}`);
  }
}
