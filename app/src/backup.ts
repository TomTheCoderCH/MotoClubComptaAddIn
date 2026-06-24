import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { BackupInfo } from './types';

export function formatBackupFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `mcy-compta-${date.getFullYear()}` +
    `-${pad(date.getMonth() + 1)}` +
    `-${pad(date.getDate())}` +
    `_${pad(date.getHours())}` +
    `-${pad(date.getMinutes())}.db`
  );
}

export async function performBackup(
  db: Database.Database,
  backupDir: string,
): Promise<string> {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const destPath = path.join(backupDir, formatBackupFilename());
  await db.backup(destPath);
  return destPath;
}

export function pruneBackups(backupDir: string, maxCount = 30): void {
  if (!fs.existsSync(backupDir)) return;
  const files = fs
    .readdirSync(backupDir)
    .filter(f => /^mcy-compta-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db$/.test(f))
    .sort();
  const toDelete = files.slice(0, Math.max(0, files.length - maxCount));
  for (const f of toDelete) {
    fs.unlinkSync(path.join(backupDir, f));
  }
}

// Lit user_version (offset 60 du header SQLite) sans ouvrir de connexion DB.
// Retourne -1 si le fichier n'est pas un fichier SQLite valide ou est illisible.
function readSchemaVersion(filePath: string): number {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(64);
    if (fs.readSync(fd, header, 0, 64, 0) < 64) return -1;
    if (header.toString('ascii', 0, 15) !== 'SQLite format 3') return -1;
    return header.readInt32BE(60);
  } catch {
    return -1;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

export function listBackups(backupDir: string): BackupInfo[] {
  if (!fs.existsSync(backupDir)) return [];
  const files = fs
    .readdirSync(backupDir)
    .filter(f => /^mcy-compta-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse();
  return files.map(filename => {
    const fullPath = path.join(backupDir, filename);
    const stat = fs.statSync(fullPath);
    const m = filename.match(
      /mcy-compta-(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})\.db/,
    )!;
    const date = new Date(
      parseInt(m[1]),
      parseInt(m[2]) - 1,
      parseInt(m[3]),
      parseInt(m[4]),
      parseInt(m[5]),
    ).toISOString();
    return { filename, date, sizeBytes: stat.size, schemaVersion: readSchemaVersion(fullPath) };
  });
}
