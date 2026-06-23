import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  reporter: 'list',
  // Electron tests must run sequentially — concurrent Electron processes conflict
  workers: 1,
  fullyParallel: false,
});
