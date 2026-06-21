import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environmentMatchGlobs: [
      ['src/__tests__/renderer/**', 'jsdom'],
    ],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/__tests__/**',
        'src/renderer.tsx',
        'src/main.ts',
        'src/preload.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
