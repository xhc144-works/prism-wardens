import type { ImageEntry } from '../../src/pvz/format';

export interface ResourceIndex {
  images: Record<string, { path: string; rows?: number; cols?: number; alphagrid?: string }>;
  sounds: Record<string, string>;
  fonts: Record<string, string>;
}

const attr = (s: string, k: string): string | undefined => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1];

/** 解析 properties/resources.xml（SetDefaults 决定目录与 id 前缀） */
export function parseResources(xml: string): ResourceIndex {
  const out: ResourceIndex = { images: {}, sounds: {}, fonts: {} };
  let path = '';
  let prefix = '';
  const re = /<(SetDefaults|Image|Sound|Font)\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[1];
    const a = m[2];
    if (tag === 'SetDefaults') {
      path = attr(a, 'path') ?? path;
      prefix = attr(a, 'idprefix') ?? prefix;
      continue;
    }
    const id = prefix + (attr(a, 'id') ?? '');
    const p = attr(a, 'path') ?? '';
    const full = p.includes('/') || !path ? p : `${path}/${p}`;
    if (tag === 'Image') {
      const rows = Number(attr(a, 'rows') ?? 0) || undefined;
      const cols = Number(attr(a, 'cols') ?? 0) || undefined;
      const ag = attr(a, 'alphagrid');
      out.images[id] = { path: full.replace(/\\/g, '/'), rows, cols, alphagrid: ag ? `${path}/${ag}` : undefined };
    } else if (tag === 'Sound') out.sounds[id] = full.replace(/\\/g, '/');
    else out.fonts[id] = full.replace(/\\/g, '/');
  }
  return out;
}

/**
 * 根据资源包中实际存在的文件（小写路径集合）解析每个图片的最终文件与透明遮罩。
 * PopCap 约定：foo.jpg 的透明通道保存在 foo_.png（或 _foo.png / alphagrid 指定的图）。
 */
export function resolveImage(base: string, files: Set<string>, alphagrid?: string): ImageEntry | null {
  const b = base.toLowerCase();
  const pick = (stem: string) => ['.png', '.jpg', '.gif', '.jpeg'].map((e) => stem + e).find((f) => files.has(f));
  const src = pick(b);
  if (!src) return null;
  const e: ImageEntry = { src };
  if (!src.endsWith('.png')) {
    const dir = b.includes('/') ? b.slice(0, b.lastIndexOf('/') + 1) : '';
    const file = b.slice(dir.length);
    const mask = (alphagrid && pick(alphagrid.toLowerCase())) || pick(`${b}_`) || pick(`${dir}_${file}`);
    if (mask) e.mask = mask;
  } else if (alphagrid) {
    const mask = pick(alphagrid.toLowerCase());
    if (mask) e.mask = mask;
  }
  return e;
}
