import { defineConfig } from 'vite';

// better-sqlite3 est un module natif — Vite ne doit pas le bundler
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['better-sqlite3'],
    },
  },
});
