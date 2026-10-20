import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(import.meta.dirname, 'src/presentation/pages/connexion'),
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: resolve(import.meta.dirname, 'dist/login'),
    emptyOutDir: true,
  },
});
