// 桌面版“游戏内导入原版素材”的端到端检查（需要先 npm run build；Linux 下用 xvfb-run 运行）。
// 使用全新的用户目录启动应用，调用导入接口，再确认重新载入后启用了经典画面。
import { _electron } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const installer = process.argv[2];
if (!installer) {
  console.error('用法：xvfb-run -a node scripts/test-electron-import.mjs <原版安装包或游戏目录>');
  process.exit(1);
}
const cfg = mkdtempSync(join(tmpdir(), 'pw-import-'));
const app = await _electron.launch({
  args: [resolve('.'), '--no-sandbox'],
  executablePath: resolve('node_modules/electron/dist/electron' + (process.platform === 'win32' ? '.exe' : '')),
  env: { ...process.env, XDG_CONFIG_HOME: cfg, ELECTRON_DISABLE_GPU: '1' },
});
const win = await app.firstWindow();
const errs = [];
win.on('pageerror', (e) => errs.push(e.message));
await win.waitForTimeout(3000);
const ud = await win.evaluate(() => window.prismNative.dataPath());
console.log('userData', ud);
console.log('before', JSON.stringify(await win.evaluate(() => window.prismNative.assets.status())));
console.log('classic before', await win.evaluate(() => document.documentElement.classList.contains('skin-classic')));
const t0 = Date.now();
const res = await win.evaluate(async (src) => {
  const logs = [];
  window.prismNative.assets.onProgress((m) => { if (m.type === 'log') logs.push(m.text); });
  const r = await window.prismNative.assets.import(src);
  return { r, logs: logs.slice(-4) };
}, resolve(installer));
console.log('import result', JSON.stringify(res.r), 'in', Math.round((Date.now() - t0) / 1000), 's');
console.log('last logs', res.logs.join(' | '));
console.log('after', JSON.stringify(await win.evaluate(() => window.prismNative.assets.status())));
await win.evaluate(() => window.prismNative.reload());
await win.waitForTimeout(6000);
const w2 = app.windows()[0];
console.log('classic after reload', await w2.evaluate(() => document.documentElement.classList.contains('skin-classic')), 'pvz manifest via app://', await w2.evaluate(async () => (await fetch('./pvz/manifest.json')).ok));
console.log('errors', errs.join(' | ') || 'none');
const ok = res.r.type === 'done' && (await w2.evaluate(() => document.documentElement.classList.contains('skin-classic'))) && !errs.length;
await app.close();
process.exit(ok ? 0 : 1);
