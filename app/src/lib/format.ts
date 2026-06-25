/** Centimes → "X'XXX.XX" (séparateur de milliers apostrophe suisse, sans préfixe ni signe) */
export function formatCHF(centimes: number): string {
  const [int, dec] = (Math.abs(centimes) / 100).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return centimes < 0 ? `-${grouped}.${dec}` : `${grouped}.${dec}`;
}

/** ISO date YYYY-MM-DD → DD.MM.YYYY */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** ISO datetime (ou timestamp ISO complet) → DD.MM.YYYY HH:MM */
export function formatDateTime(iso: string): string {
  const dt = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Octets → "X Ko" ou "X.X Mo" */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
