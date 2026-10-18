// 公开构建守卫：dist/ 与（若已打包）app.asar 中不得出现从原版游戏导入的素材。
// 用法：node scripts/check-public-build.mjs [path/to/app.asar ...]
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BANNED_DIR = /(^|[\\/])pvz([\\/]|$)/i;
const BANNED_FILE = /\.(reanim|mo3|pak)$|LawnStrings|mainmusic|(^|[\\/])manifest\.json$/i;
const problems = [];

function walk(dir, root) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(root, p);
    if (statSync(p).isDirectory()) {
      if (BANNED_DIR.test(rel)) problems.push(`${root}/${rel}/`);
      else walk(p, root);
    } else if (BANNED_FILE.test(rel)) problems.push(`${root}/${rel}`);
  }
}

if (existsSync('dist')) walk('dist', 'dist');
else console.warn('dist/ 不存在，跳过');

const asars = process.argv.slice(2);
if (asars.length) {
  const asar = await import('@electron/asar');
  for (const a of asars) {
    if (!existsSync(a)) {
      problems.push(`找不到 ${a}`);
      continue;
    }
    for (const f of asar.listPackage(a)) {
      const rel = f.replace(/^[\\/]/, '');
      if (!rel.startsWith('dist')) continue;
      if (BANNED_DIR.test(rel.slice(5)) || BANNED_FILE.test(rel)) problems.push(`${a}:${rel}`);
    }
  }
}

if (problems.length) {
  console.error('公开构建中发现原版游戏素材（只允许出现在本地研究构建中）：');
  for (const p of problems.slice(0, 30)) console.error('  ' + p);
  if (problems.length > 30) console.error(`  …共 ${problems.length} 项`);
  process.exit(1);
}
console.log('公开构建检查通过：未包含原版素材');
