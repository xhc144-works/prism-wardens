import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';

// 经典皮肤依赖本机导入的原版素材：只有本地研究构建（PVZ_BUNDLE_ASSETS=1 npm run build）
// 才会把 public/pvz 复制进 dist；公开构建与 CI 中没有这些素材，自动跳过。
test.skip(!existsSync('dist/pvz/manifest.json'), 'dist/pvz 不存在（公开构建不含原版素材）');

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('经典皮肤：载入界面 → 主菜单（选择界面）', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?skin=classic');
  await expect(page.locator('canvas.classic-loading')).toBeVisible();
  await expect(page.locator('.classic-menu canvas')).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('经典皮肤：AI 托管 1-1 通关并弹出石质结算对话框', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?skin=classic&quick=1-1&ai=1');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.click('button:has-text("16×")');
  await expect(page.locator('.pvz-dialog:has-text("胜利")')).toBeVisible({ timeout: 150_000 });
  expect(errors).toEqual([]);
});

test('经典皮肤：泳池关卡战斗场景渲染', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?skin=classic&quick=3-1&ai=1');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.click('button:has-text("4×")');
  await page.waitForTimeout(6000);
  expect(errors).toEqual([]);
});
