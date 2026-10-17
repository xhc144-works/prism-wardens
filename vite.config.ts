import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  worker: { format: 'es' },
  server: { port: 5173 },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120000,
  },
} as any);
