import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

type Fixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

// Chaque test reçoit un APPDATA isolé avec settings.json pré-configuré
// → l'app démarre directement sur AccountsPage (WelcomePage bypassée)
// → DB temporaire fraîche, aucune pollution entre tests
export const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    const tempAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'mcy-e2e-'));
    const dataDir = path.join(tempAppData, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(tempAppData, 'MCY Compta'), { recursive: true });
    fs.writeFileSync(
      path.join(tempAppData, 'MCY Compta', 'settings.json'),
      JSON.stringify({ dataDir }),
      'utf-8',
    );

    const mainPath = path.join(__dirname, '../.vite/build/main.js');
    const app = await electron.launch({
      args: [mainPath],
      env: { ...process.env, APPDATA: tempAppData, NODE_ENV: 'test' },
    });

    await use(app);
    await app.close();
    // Small delay to let Electron release file locks (SQLite, backup) before cleanup
    await new Promise(r => setTimeout(r, 500));
    try { fs.rmSync(tempAppData, { recursive: true, force: true }); } catch { /* ignore EPERM */ }
  },

  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    // Wait for React to finish the initial async render (getSettings IPC + state update)
    await page.locator('h1').waitFor({ state: 'visible', timeout: 15000 });
    await use(page);
  },
});

export { expect } from '@playwright/test';
