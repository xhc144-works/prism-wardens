import { defineConfig, type Plugin } from 'vite';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * public/pvz 存放本机从原版安装包导入的素材（已 gitignore）。
 * 公开构建默认把它从 dist 中删掉；只有本地研究构建（PVZ_BUNDLE_ASSETS=1）才会保留。
 */
function stripOriginalAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'strip-original-assets',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      if (process.env.PVZ_BUNDLE_ASSETS === '1') return;
      rmSync(resolve(outDir, 'pvz'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  plugins: [stripOriginalAssets()],
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
