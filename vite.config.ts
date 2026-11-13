/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` makes every asset URL relative, so the same build works at
// https://<user>.github.io/<repo>/ (GitHub Pages project path) and at a domain root.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
});
