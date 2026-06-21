import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  // Les tests E2E Electron nécessitent un build préalable : npm run package
  // ou lancer via electron-forge start dans un process séparé
});
