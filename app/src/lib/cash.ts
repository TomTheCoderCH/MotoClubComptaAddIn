export const DENOMINATIONS = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] as const;
export type Denomination = (typeof DENOMINATIONS)[number];

export const PIECES  = DENOMINATIONS.filter(d => d < 1000)  as readonly number[];
export const BILLETS = DENOMINATIONS.filter(d => d >= 1000) as readonly number[];

export function formatDenom(cents: number): string {
  return (cents / 100).toFixed(2) + ' CHF';
}

export function emptyLines(): Array<{ denomination: number; quantity: number }> {
  return DENOMINATIONS.map(d => ({ denomination: d, quantity: 0 }));
}
