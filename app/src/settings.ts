import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
  dataDir: string;
}

export function getSettingsPath(): string {
  // process.env.APPDATA respects env overrides (E2E test isolation);
  // app.getPath('appData') reads from the Windows registry and ignores them.
  const appDataDir = process.env['APPDATA'] ?? app.getPath('appData');
  return path.join(appDataDir, 'MCYCompta', 'settings.json');
}

export function readSettings(): Settings | null {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Settings;
}

export function writeSettings(settings: Settings): void {
  const filePath = getSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
}
