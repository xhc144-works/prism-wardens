// 用安装后的 Electron 可执行文件验证实际渲染、原生接口及公开 GitHub 更新检查。
import { _electron } from 'playwright';
import { expect } from '@playwright/test';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const { version } = createRequire(import.meta.url)('../package.json');
const exe = process.argv[2];
if (!exe) throw new Error('需要传入本次构建并安装的 Prism Wardens.exe 路径');
const app = await _electron.launch({ executablePath: resolve(exe), timeout: 60_000 });
try {
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await expect(win.locator('.logo')).toHaveText('棱镜守卫', { timeout: 60_000 });
  const info = await win.evaluate(async () => ({ version: window.prismNative.version, platform: window.prismNative.platform,
    update: await window.prismNative.update.info(), assets: await window.prismNative.assets.status() }));
  expect(info.version).toBe(version);
  expect(info.platform).toBe('win32');
  expect(info.update.enabled).toBe(true);
  expect(info.update.signature).toBe(true);
  expect(info.assets.bundled).toBe(false);
  await win.click('.menu-tile:has-text("设置")');
  await expect(win.getByRole('button', { name: '检查更新', exact: true })).toBeVisible();
  console.log('安装版与更新入口：', JSON.stringify(info));
  const check = await win.evaluate(() => window.prismNative.update.check());
  console.log('实际 GitHub 更新源检查：', JSON.stringify(check));
  expect(['manual', 'not-available']).toContain(check.status);
  await win.screenshot({ path: 'release/installed-app.png' });
  expect(errors).toEqual([]);
} finally { await app.close(); }
