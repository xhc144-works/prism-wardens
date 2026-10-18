// 把资源导入器打包成 Electron 工作进程脚本（electron/gen/import-worker.cjs）
import { build } from 'esbuild';
await build({
  entryPoints: ['tools/import/worker.ts'],
  outfile: 'electron/gen/import-worker.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  logLevel: 'warning',
});
console.log('import worker built');
