import { test, expect, type Page } from '@playwright/test';

// 这些用例覆盖原始（公开构建）界面；本地研究构建内置经典素材时用 ?skin=original 固定皮肤。

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('dialog', (d) => void d.accept());
  return errors;
}

test('主菜单与全部界面可以打开且无报错', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?skin=original');
  await expect(page.locator('.logo')).toHaveText('棱镜守卫');
  for (const t of ['修改器', 'AI 控制台', '挑战编辑器', '关卡编辑器', '单位编辑器', '录像与战报', '图鉴', '商店', '成就', '存档', '设置']) {
    await page.click(`.menu-tile:has-text("${t}")`);
    await expect(page.locator('.topbar h2')).toBeVisible();
    await page.click('button:has-text("返回")');
  }
  for (const t of ['无尽模式', '生存挑战', '挑战模式', '自定义关卡']) {
    await page.click(`button:has-text("${t}")`);
    await expect(page.locator('.topbar h2')).toBeVisible();
    await page.click('button:has-text("返回")');
  }
  expect(errors).toEqual([]);
});

test('人类可以手动部署单位并收集光能', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?skin=original');
  await page.click('text=冒险模式');
  await page.click('.level-node >> nth=0');
  await page.click('text=开始战斗');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  // 选择第一张卡（光苔），点击第 1 行第 1 列
  await page.waitForTimeout(500);
  await page.keyboard.press('1');
  await expect(page.locator('.card.selected')).toHaveCount(1);
  const box = (await canvas.boundingBox())!;
  // 棋盘逻辑宽度 = 96 + 9*100 + 140，高度 = 26 + 5*110 + 24
  const scale = Math.min(box.width / 1136, box.height / 600);
  const ox = (box.width - 1136 * scale) / 2;
  const oy = (box.height - 600 * scale) / 2;
  await page.mouse.click(box.x + ox + (96 + 50) * scale, box.y + oy + (26 + 55) * scale);
  await expect(page.locator('.lumen-box .num')).toHaveText('25');
  expect(errors).toEqual([]);
});

test('AI 托管可以通关第一关并生成战报与录像', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?skin=original');
  await page.click('text=冒险模式');
  await page.click('.level-node >> nth=0');
  await page.selectOption('select >> nth=0', 'ai');
  await page.click('text=开始战斗');
  await page.click('button:has-text("16×")');
  await expect(page.locator('text=胜利！')).toBeVisible({ timeout: 120_000 });
  await page.click('button:has-text("查看战报")');
  await expect(page.locator('text=伤害贡献')).toBeVisible();
  await page.click('button:has-text("返回")');
  await page.goto('/?skin=original');
  await page.click('.menu-tile:has-text("录像与战报")');
  await page.click('button:has-text("回放") >> nth=0');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('AI 控制台批量模拟（多线程 Worker）', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?skin=original');
  await page.click('.menu-tile:has-text("AI 控制台")');
  await page.click('.tab:has-text("批量模拟")');
  await page.fill('input[type=number] >> nth=0', '2');
  await page.press('input[type=number] >> nth=0', 'Tab');
  await page.click('button:has-text("开始模拟")');
  await expect(page.locator('text=结果对比')).toBeVisible({ timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('修改器：开启无限光能后战斗中光能显示为 ∞', async ({ page }) => {
  await page.goto('/?skin=original');
  await page.click('.menu-tile:has-text("修改器")');
  await page.click('label:has-text("在战斗中启用修改器")');
  await page.click('label:has-text("无限光能")');
  await page.click('button:has-text("返回")');
  await page.click('text=冒险模式');
  await page.click('.level-node >> nth=0');
  await page.click('text=开始战斗');
  await expect(page.locator('.lumen-box .num')).toHaveText('∞');
});
