/**
 * Build script for E2E tests.
 * Produces the same output as `electron-forge start` but in production mode:
 *  - .vite/build/main.js     (MAIN_WINDOW_VITE_DEV_SERVER_URL = '')
 *  - .vite/build/preload.js
 *  - .vite/renderer/main_window/index.html + assets
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const NODE_EXTERNALS = [
  'electron', 'better-sqlite3', 'electron-squirrel-startup',
  /^node:/,
  'path', 'fs', 'os', 'url', 'crypto', 'events', 'util', 'buffer', 'stream',
  'assert', 'constants', 'process',
];

console.log('Building main process…');
await build({
  configFile: false,
  root,
  define: {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(''),
    MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window'),
  },
  build: {
    outDir: path.join(root, '.vite/build'),
    emptyOutDir: false,
    lib: {
      entry: path.join(root, 'src/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: { external: NODE_EXTERNALS },
    minify: false,
  },
});

console.log('Building preload…');
await build({
  configFile: false,
  root,
  build: {
    outDir: path.join(root, '.vite/build'),
    emptyOutDir: false,
    lib: {
      entry: path.join(root, 'src/preload.ts'),
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    rollupOptions: { external: NODE_EXTERNALS },
    minify: false,
  },
});

console.log('Building renderer…');
await build({
  configFile: false,
  root,
  plugins: [react()],
  base: './',  // relative paths so file:// URL works in Electron
  build: {
    outDir: path.join(root, '.vite/renderer/main_window'),
    emptyOutDir: true,
    minify: false,
  },
});

console.log('E2E build done.');
