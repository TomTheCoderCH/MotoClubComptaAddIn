import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface Settings {
  dataDir: string;
}

export function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
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
