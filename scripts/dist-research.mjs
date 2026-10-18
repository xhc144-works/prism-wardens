// 本地研究构建：把 public/pvz 中导入的原版素材一起打进安装包。
// 生成的安装包只能在本机自用，不得分发或上传到 Releases（见 docs/ASSETS.md）。
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

if (!existsSync('public/pvz/manifest.json')) {
  console.error('public/pvz/manifest.json 不存在：请先运行 npm run assets:import');
  process.exit(1);
}
const env = { ...process.env, PVZ_BUNDLE_ASSETS: '1' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });
run('npm run build');
run('npx electron-builder --win --x64 --publish never -c electron-builder.research.cjs');
