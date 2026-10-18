/**
 * 原版资源导入器：从玩家自己合法持有的《植物大战僵尸》PC 版（游戏目录或 main.pak）
 * 生成本游戏可用的资源包。只在本地运行，输出目录不进入版本库，也不随公开安装包分发。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import type { AssetManifest, FontEntry, ImageEntry } from '../../src/pvz/format';
import { readPak } from './pak';
import { parseReanimCompiled, parseReanimXml } from './reanim';
import { parseResources, resolveImage } from './resources';
import { decodeText, parseLawnStrings } from './strings';
import { parseParticleXml } from './particles';

export const IMPORTER_VERSION = '1.0.0';

export interface ImportOptions {
  /** 游戏目录（含 main.pak，可选含 reanim/ 文本动画） */
  gameDir: string;
  outDir: string;
  /** 将 MO3 音乐渲染为 OGG 的回调（需要 ffmpeg+libopenmpt，可缺省） */
  renderMusic?: (mo3: string, hihats: string | null, outDir: string) => AssetManifest['music'];
  log?: (msg: string) => void;
  progress?: (done: number, total: number, stage: string) => void;
}

/** 内存中的虚拟文件表：小写路径 -> 内容 */
type Vfs = Map<string, Uint8Array>;

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'));
  }
  return out;
}

/** 在游戏目录中查找 main.pak（大小写不敏感，允许多一层子目录） */
export function findGameRoot(dir: string): string | null {
  const has = (d: string) => existsSync(d) && readdirSync(d).some((f) => f.toLowerCase() === 'main.pak');
  if (has(dir)) return dir;
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    const p = join(dir, f);
    if (statSync(p).isDirectory() && has(p)) return p;
  }
  return null;
}

export function runImport(opt: ImportOptions): AssetManifest {
  const log = opt.log ?? (() => {});
  const root = findGameRoot(opt.gameDir);
  if (!root) throw new Error('在所选目录中没有找到 main.pak');
  const pakName = readdirSync(root).find((f) => f.toLowerCase() === 'main.pak')!;
  log(`读取 ${join(root, pakName)}`);
  const { entries, data } = readPak(new Uint8Array(readFileSync(join(root, pakName))));
  const vfs: Vfs = new Map();
  for (const e of entries) vfs.set(e.name.toLowerCase(), data.subarray(e.offset, e.offset + e.size));
  // 游戏目录中的散文件（如文本 reanim 与其贴图）优先于 pak 内同名文件
  for (const sub of ['reanim', 'particles', 'images', 'sounds', 'data', 'properties']) {
    const d = readdirSync(root).find((f) => f.toLowerCase() === sub);
    if (!d) continue;
    for (const rel of walk(join(root, d))) vfs.set(`${sub}/${rel}`.toLowerCase(), new Uint8Array(readFileSync(join(root, d, rel))));
  }
  log(`共 ${vfs.size} 个文件`);

  const out = opt.outDir;
  mkdirSync(out, { recursive: true });
  let files = 0;
  let bytes = 0;
  const write = (rel: string, content: Uint8Array | string) => {
    const p = join(out, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
    files++;
    bytes += typeof content === 'string' ? Buffer.byteLength(content) : content.length;
  };
  const manifest: AssetManifest = {
    format: 1,
    source: `${basename(root)}/${pakName}`,
    importedAt: new Date().toISOString(),
    importerVersion: IMPORTER_VERSION,
    images: {},
    reanims: {},
    particles: {},
    sounds: {},
    music: {},
    fonts: {},
    strings: 'strings.json',
    stats: { files: 0, bytes: 0 },
  };

  // 1. 贴图：images/ reanim/ particles/ data/ 下的所有图片原样复制（小写路径）
  const imgExt = new Set(['.png', '.jpg', '.jpeg', '.gif']);
  const imageFiles = [...vfs.keys()].filter((k) => imgExt.has(extname(k)) && /^(images|reanim|particles|data|properties)\//.test(k));
  const fileSet = new Set(imageFiles);
  let n = 0;
  for (const k of imageFiles) {
    write(k, vfs.get(k)!);
    if (++n % 100 === 0) opt.progress?.(n, imageFiles.length, '贴图');
  }
  log(`贴图 ${imageFiles.length} 张`);

  // 2. resources.xml -> 图片 id 表
  const resXml = vfs.get('properties/resources.xml');
  const res = resXml ? parseResources(decodeText(resXml)) : { images: {}, sounds: {}, fonts: {} };
  for (const [id, r] of Object.entries(res.images)) {
    const e = resolveImage(r.path, fileSet, r.alphagrid);
    if (!e) continue;
    if (r.rows) e.rows = r.rows;
    if (r.cols) e.cols = r.cols;
    manifest.images[id] = e;
  }
  // reanim 部件：IMAGE_REANIM_<文件名大写> -> reanim/<文件名>
  for (const k of imageFiles) {
    if (!k.startsWith('reanim/') && !k.startsWith('particles/')) continue;
    const stem = k.slice(k.indexOf('/') + 1).replace(/\.[^.]+$/, '');
    if (stem.endsWith('_') || stem.startsWith('_')) continue;
    const id = `IMAGE_${k.startsWith('reanim/') ? 'REANIM_' : ''}${stem.toUpperCase()}`;
    if (manifest.images[id]) continue;
    const e = resolveImage(k.replace(/\.[^.]+$/, ''), fileSet) as ImageEntry;
    manifest.images[id] = e;
  }
  log(`图片资源 ${Object.keys(manifest.images).length} 个`);

  // 3. reanim 动画：优先文本格式，否则解析 compiled
  const reanimKeys = [...vfs.keys()].filter((k) => k.startsWith('reanim/') && k.endsWith('.reanim'));
  const compiledKeys = [...vfs.keys()].filter((k) => k.endsWith('.reanim.compiled'));
  const originalName = (k: string, ext: string) => {
    // 尽量恢复原始大小写：游戏目录中的文件名
    const d = readdirSync(root).find((f) => f.toLowerCase() === 'reanim');
    const stem = basename(k, ext);
    if (d) {
      const f = readdirSync(join(root, d)).find((x) => x.toLowerCase() === stem + ext);
      if (f) return basename(f, ext);
    }
    const pe = entries.find((e) => e.name.toLowerCase() === k);
    return pe ? basename(pe.name, ext) : stem;
  };
  const done = new Set<string>();
  for (const k of reanimKeys) {
    const name = originalName(k, '.reanim');
    const r = parseReanimXml(name, decodeText(vfs.get(k)!));
    write(`reanim/${name.toLowerCase()}.json`, JSON.stringify(r));
    manifest.reanims[name] = `reanim/${name.toLowerCase()}.json`;
    done.add(name.toLowerCase());
  }
  for (const k of compiledKeys) {
    const stem = basename(k, '.reanim.compiled');
    if (done.has(stem)) continue;
    const pe = entries.find((e) => e.name.toLowerCase() === k);
    const name = pe ? basename(pe.name, '.reanim.compiled') : stem;
    try {
      const r = parseReanimCompiled(name, vfs.get(k)!, (b) => new Uint8Array(inflateSync(b)));
      write(`reanim/${name.toLowerCase()}.json`, JSON.stringify(r));
      manifest.reanims[name] = `reanim/${name.toLowerCase()}.json`;
    } catch (e) {
      log(`跳过 ${k}: ${(e as Error).message}`);
    }
  }
  log(`动画 ${Object.keys(manifest.reanims).length} 个`);

  // 4. 粒子（文本 xml）
  for (const k of vfs.keys()) {
    if (!k.startsWith('particles/') || !k.endsWith('.xml')) continue;
    const pe = entries.find((e) => e.name.toLowerCase() === k);
    const name = pe ? basename(pe.name, '.xml') : basename(k, '.xml');
    try {
      const p = parseParticleXml(name, decodeText(vfs.get(k)!));
      write(`particles/${name.toLowerCase()}.json`, JSON.stringify(p));
      manifest.particles[name] = `particles/${name.toLowerCase()}.json`;
    } catch (e) {
      log(`粒子 ${k} 解析失败: ${(e as Error).message}`);
    }
  }
  log(`粒子 ${Object.keys(manifest.particles).length} 个`);

  // 5. 音效
  for (const k of vfs.keys()) {
    if (!k.startsWith('sounds/')) continue;
    const ext = extname(k);
    if (ext === '.ogg' || ext === '.wav' || ext === '.mp3') {
      write(k, vfs.get(k)!);
      manifest.sounds[basename(k, ext)] = k;
    }
  }
  log(`音效 ${Object.keys(manifest.sounds).length} 个`);
  const mo3 = vfs.get('sounds/mainmusic.mo3');
  const hihats = vfs.get('sounds/mainmusic_hihats.mo3');
  if (mo3 && opt.renderMusic) {
    const tmp = join(out, '_tmp_mainmusic.mo3');
    const tmpH = join(out, '_tmp_mainmusic_hihats.mo3');
    writeFileSync(tmp, mo3);
    if (hihats) writeFileSync(tmpH, hihats);
    try {
      const tracks = opt.renderMusic(tmp, hihats ? tmpH : null, join(out, 'music'));
      for (const [id, p] of Object.entries(tracks)) manifest.music[id] = p;
      log(`音乐 ${Object.keys(tracks).length} 首`);
    } catch (e) {
      log(`音乐转换失败（将使用合成音乐）: ${(e as Error).message}`);
    }
    rmSync(tmp, { force: true });
    rmSync(tmpH, { force: true });
  }

  // 6. 字体描述
  for (const [id, path] of Object.entries(res.fonts)) {
    const key = path.toLowerCase();
    const buf = vfs.get(key) ?? vfs.get(`data/${basename(key)}`);
    if (!buf) continue;
    const desc = decodeText(buf);
    const img = /LayerSetImage\s+\w+\s+'([^']+)'/.exec(desc)?.[1];
    const fe: FontEntry = { desc };
    if (img) {
      const dir = dirname(key);
      const r = resolveImage(`${dir}/${img}`, fileSet) ?? resolveImage(`${dir}/_${img}`, fileSet);
      if (r) fe.image = r.src;
    }
    manifest.fonts[id] = fe;
  }

  // 7. 文本
  const ls = vfs.get('properties/lawnstrings.txt');
  write('strings.json', JSON.stringify(ls ? parseLawnStrings(decodeText(ls)) : {}));

  manifest.stats = { files, bytes };
  write('manifest.json', JSON.stringify(manifest));
  log(`完成：${files} 个文件，${(bytes / 1048576).toFixed(1)} MB`);
  return manifest;
}
