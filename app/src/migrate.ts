import fs from 'node:fs';
import path from 'node:path';

const BACKUP_PATTERN = /^mcy-compta-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.db$/;

export async function migrateDataDir(oldDir: string, newDir: string): Promise<void> {
  if (path.resolve(oldDir) === path.resolve(newDir)) {
    throw new Error('Le dossier cible est identique au dossier actuel');
  }

  fs.mkdirSync(newDir, { recursive: true });

  // Step 1: copy and verify mcy-compta.db
  const oldDb = path.join(oldDir, 'mcy-compta.db');
  const newDb = path.join(newDir, 'mcy-compta.db');
  fs.copyFileSync(oldDb, newDb);
  if (fs.statSync(oldDb).size !== fs.statSync(newDb).size) {
    fs.unlinkSync(newDb);
    throw new Error('Vérification de mcy-compta.db échouée (tailles différentes)');
  }

  // Step 2: copy and verify each backup
  const oldBackups = path.join(oldDir, 'backups');
  const newBackups = path.join(newDir, 'backups');
  const copiedBackups: string[] = [];

  if (fs.existsSync(oldBackups)) {
    fs.mkdirSync(newBackups, { recursive: true });
    const files = fs.readdirSync(oldBackups).filter(f => BACKUP_PATTERN.test(f));
    for (const file of files) {
      const src = path.join(oldBackups, file);
      const dst = path.join(newBackups, file);
      fs.copyFileSync(src, dst);
      if (fs.statSync(src).size !== fs.statSync(dst).size) {
        fs.unlinkSync(dst);
        for (const b of copiedBackups) fs.unlinkSync(path.join(newBackups, b));
        fs.unlinkSync(newDb);
        throw new Error(`Vérification du backup ${file} échouée (tailles différentes)`);
      }
      copiedBackups.push(file);
    }
  }

  // Step 3: delete originals only after all copies verified
  fs.unlinkSync(oldDb);
  for (const file of copiedBackups) {
    fs.unlinkSync(path.join(oldBackups, file));
  }
}
