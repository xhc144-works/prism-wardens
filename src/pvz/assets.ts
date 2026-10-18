/**
 * 原版资源包运行时加载器。资源包由玩家本地导入（见 tools/import），
 * 不存在时 available=false，游戏自动回退到内置的原创美术。
 */
import type { AssetManifest, ImageEntry, ParticleFile, ReanimFile } from './format';
import { compileReanim, type ReanimDef } from './reanim';

export type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface LoadedImage {
  img: Drawable;
  w: number;
  h: number;
  rows: number;
  cols: number;
  /** 单格尺寸 */
  cw: number;
  ch: number;
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`无法加载 ${url}`));
    im.src = url;
  });
}

/** jpg + 灰度遮罩合成为带透明通道的画布 */
function applyMask(color: HTMLImageElement, mask: HTMLImageElement): HTMLCanvasElement {
  const w = color.naturalWidth;
  const h = color.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(mask, 0, 0, w, h);
  const m = ctx.getImageData(0, 0, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(color, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) d.data[i + 3] = m.data[i];
  ctx.putImageData(d, 0, 0);
  return c;
}

export class PvzAssets {
  base = './pvz/';
  manifest: AssetManifest | null = null;
  available = false;
  strings: Record<string, string> = {};
  private images = new Map<string, LoadedImage | null>();
  private pending = new Map<string, Promise<LoadedImage | null>>();
  private reanims = new Map<string, ReanimDef>();
  private reanimPending = new Map<string, Promise<ReanimDef | null>>();
  private particles = new Map<string, ParticleFile>();
  private lowerReanim = new Map<string, string>();
  private tinted = new Map<string, HTMLCanvasElement>();
  /** 每次有新图片就绪时递增，供渲染器判断是否需要重绘缓存 */
  version = 0;

  async init(base = './pvz/'): Promise<boolean> {
    this.base = base;
    try {
      const r = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
      if (!r.ok) return false;
      const m = (await r.json()) as AssetManifest;
      if (m.format !== 1) return false;
      this.manifest = m;
      for (const k of Object.keys(m.reanims)) this.lowerReanim.set(k.toLowerCase(), k);
      try {
        this.strings = await (await fetch(`${base}${m.strings}`)).json();
      } catch {
        this.strings = {};
      }
      this.available = true;
      return true;
    } catch {
      return false;
    }
  }

  url(rel: string): string {
    return this.base + rel;
  }

  imageEntry(id: string): ImageEntry | undefined {
    return this.manifest?.images[id];
  }

  hasImage(id: string): boolean {
    return !!this.manifest?.images[id];
  }

  /** 同步获取已加载图片；未加载则触发加载并返回 null */
  image(id: string): LoadedImage | null {
    const got = this.images.get(id);
    if (got !== undefined) return got;
    void this.loadImage(id);
    return null;
  }

  loadImage(id: string): Promise<LoadedImage | null> {
    const got = this.images.get(id);
    if (got !== undefined) return Promise.resolve(got);
    let p = this.pending.get(id);
    if (p) return p;
    const e = this.manifest?.images[id];
    if (!e) {
      this.images.set(id, null);
      return Promise.resolve(null);
    }
    p = (async () => {
      try {
        const color = await loadHtmlImage(this.url(e.src));
        let img: Drawable = color;
        if (e.mask) {
          try {
            img = applyMask(color, await loadHtmlImage(this.url(e.mask)));
          } catch {
            /* 遮罩缺失时直接使用不透明图 */
          }
        }
        const w = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width;
        const h = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height;
        const rows = e.rows ?? 1;
        const cols = e.cols ?? 1;
        const li: LoadedImage = { img, w, h, rows, cols, cw: w / cols, ch: h / rows };
        this.images.set(id, li);
        this.version++;
        return li;
      } catch {
        this.images.set(id, null);
        return null;
      } finally {
        this.pending.delete(id);
      }
    })();
    this.pending.set(id, p);
    return p;
  }

  preloadImages(ids: string[]): Promise<unknown> {
    return Promise.all(ids.map((id) => this.loadImage(id)));
  }

  /** 着色缓存：multiply 颜色并保留透明度（冰冻、魅惑等状态） */
  tintedImage(id: string, li: LoadedImage, color: string): HTMLCanvasElement {
    const key = `${id}|${color}`;
    let c = this.tinted.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = li.w;
    c.height = li.h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(li.img, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, li.w, li.h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(li.img, 0, 0);
    this.tinted.set(key, c);
    return c;
  }

  reanimName(name: string): string | undefined {
    return this.lowerReanim.get(name.toLowerCase());
  }

  reanim(name: string): ReanimDef | null {
    const real = this.reanimName(name);
    if (!real) return null;
    const got = this.reanims.get(real);
    if (got) return got;
    void this.loadReanim(real);
    return null;
  }

  loadReanim(name: string): Promise<ReanimDef | null> {
    const real = this.reanimName(name);
    if (!real || !this.manifest) return Promise.resolve(null);
    const got = this.reanims.get(real);
    if (got) return Promise.resolve(got);
    let p = this.reanimPending.get(real);
    if (p) return p;
    p = (async () => {
      try {
        const file = (await (await fetch(this.url(this.manifest!.reanims[real]))).json()) as ReanimFile;
        const def = compileReanim(file);
        this.reanims.set(real, def);
        // 预取部件贴图
        void this.preloadImages(def.images);
        this.version++;
        return def;
      } catch {
        return null;
      } finally {
        this.reanimPending.delete(real);
      }
    })();
    this.reanimPending.set(real, p);
    return p;
  }

  async loadReanimsWithImages(names: string[]): Promise<void> {
    const defs = await Promise.all(names.map((n) => this.loadReanim(n)));
    await Promise.all(defs.map((d) => (d ? this.preloadImages(d.images) : null)));
  }

  particle(name: string): ParticleFile | null {
    return this.particles.get(name) ?? null;
  }

  async loadParticle(name: string): Promise<ParticleFile | null> {
    const got = this.particles.get(name);
    if (got) return got;
    const path = this.manifest?.particles[name];
    if (!path) return null;
    try {
      const p = (await (await fetch(this.url(path))).json()) as ParticleFile;
      this.particles.set(name, p);
      return p;
    } catch {
      return null;
    }
  }

  soundUrl(id: string): string | null {
    const p = this.manifest?.sounds[id.toLowerCase()];
    return p ? this.url(p) : null;
  }

  musicUrl(id: string): string | null {
    const p = this.manifest?.music[id];
    return p ? this.url(p) : null;
  }

  str(key: string, fallback = ''): string {
    return this.strings[key] ?? fallback;
  }
}

export const PVZ = new PvzAssets();

/** 供 Reanim 使用的图片源 */
export const PVZ_IMAGES = {
  draw(ctx: CanvasRenderingContext2D, id: string, tint: string | null): boolean {
    const li = PVZ.image(id);
    if (!li) return false;
    ctx.drawImage(tint ? PVZ.tintedImage(id, li, tint) : li.img, 0, 0);
    return true;
  },
};
