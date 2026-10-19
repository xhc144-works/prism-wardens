import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPackage } from '@electron/asar';

it('检查真实 app.asar：拒绝经典图片目录和第三方原版安装程序（含 Windows 路径）', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-public-'));
  try {
    for (const file of ['dist/pvz/image.png', 'Plants vs Zombies.exe']) {
      const input = path.join(dir, 'input');
      fs.rmSync(input, { recursive: true, force: true });
      const p = path.join(input, file);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'synthetic-test-fixture');
      const archive = path.join(dir, 'app.asar');
      await createPackage(input, archive);
      let stderr = '';
      try {
        execFileSync(process.execPath, [path.resolve('scripts/check-public-build.mjs'), archive], { cwd: dir, stdio: 'pipe' });
      } catch (e) { stderr = String((e as { stderr: Buffer }).stderr); }
      expect(stderr).toContain('公开构建中发现原版游戏素材');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
