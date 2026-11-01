import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` keeps the build deployable under any sub-path (GitHub Pages etc.).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // sqlite-wasm resolves its .wasm via import.meta.url; pre-bundling breaks that.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
