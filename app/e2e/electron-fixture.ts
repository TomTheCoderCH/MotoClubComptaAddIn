import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';

type Fixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

// Lance l'application Electron depuis le build Vite (.vite/build/main.js)
// Prérequis : avoir exécuté `npm run package` ou avoir un build disponible
export const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    const mainPath = path.join(__dirname, '../.vite/build/main.js');
    const app = await electron.launch({
      args: [mainPath],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    await use(app);
    await app.close();
  },

  window: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
