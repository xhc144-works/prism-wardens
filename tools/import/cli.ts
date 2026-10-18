/**
 * 命令行：npm run assets:import -- [游戏目录 | main.pak 所在目录 | 安装包.exe] [--out public/pvz]
 * 不带参数时自动使用仓库根目录下的原版安装包。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runImport } from './importer';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : 'public/pvz');
const positional = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
let src = positional[0] ? resolve(positional[0]) : '';
if (!src) {
  const exe = readdirSync('.').find((f) => /plants.*zombies.*\.exe$/i.test(f));
  if (!exe) {
    console.error('请指定游戏目录或安装包路径');
    process.exit(1);
  }
  src = resolve(exe);
}

function sevenZip(): string {
  for (const c of ['7z', '7za', '7zz']) if (spawnSync(c, ['i'], { stdio: 'ignore' }).status === 0) return c;
  // electron-builder 依赖的 7zip-bin 自带 7za
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('7zip-bin').path7za as string;
}

let gameDir = src;
if (statSync(src).isFile()) {
  const tmp = resolve('local/.extract');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  console.log(`解压安装包 ${src} ...`);
  execFileSync(sevenZip(), ['x', '-y', `-o${tmp}`, src], { stdio: 'ignore' });
  gameDir = tmp;
}

const musicScript = resolve('tools/import/render_music.py');
const renderMusic = (mo3: string, hihats: string | null, dir: string) => {
  const r = spawnSync('python3', ['-I', musicScript, mo3, hihats ?? '-', dir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr || '需要 python3 + libopenmpt + ffmpeg');
  return JSON.parse(r.stdout.trim().split('\n').pop()!);
};

const t0 = Date.now();
rmSync(outDir, { recursive: true, force: true });
const m = runImport({ gameDir, outDir, renderMusic, log: (s) => console.log(s) });
console.log(`资源包已生成到 ${outDir}（${Object.keys(m.reanims).length} 动画，${Object.keys(m.images).length} 图片，${Object.keys(m.sounds).length} 音效，${Object.keys(m.music).length} 音乐），用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (existsSync(resolve('local/.extract'))) rmSync(resolve('local/.extract'), { recursive: true, force: true });
