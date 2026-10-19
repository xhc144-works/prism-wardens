/**
 * PopCap 位图字体（data/*.txt 描述 + 字图）的解析与绘制。
 * 描述文件是一种简单脚本：Define 列表 + Layer* 命令；每个图层有自己的字图与偏移，
 * 绘制时按图层顺序叠加（如描边层 + 主体层）。
 */
import { PVZ } from './assets';

type Val = string | number | Val[] | { id: string };

function tokenize(src: string): (string | { s: string } | number)[] {
  const out: (string | { s: string } | number)[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === ',' || c === ';') {
      out.push(c);
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
        } else s += src[j++];
      }
      out.push({ s });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < src.length && !/[\s(),;'"]/.test(src[j])) j++;
    const word = src.slice(i, j);
    const n = Number(word);
    out.push(word !== '' && !Number.isNaN(n) ? n : word);
    i = j === i ? i + 1 : j;
  }
  return out;
}

function parseScript(src: string): { defines: Map<string, Val>; cmds: { name: string; args: Val[] }[] } {
  const toks = tokenize(src);
  let p = 0;
  const value = (): Val => {
    const t = toks[p++];
    if (t === '(') {
      const list: Val[] = [];
      while (p < toks.length && toks[p] !== ')') {
        if (toks[p] === ',') {
          p++;
          continue;
        }
        list.push(value());
      }
      p++;
      return list;
    }
    if (typeof t === 'object') return t.s;
    if (typeof t === 'number') return t;
    return { id: String(t) };
  };
  const defines = new Map<string, Val>();
  const cmds: { name: string; args: Val[] }[] = [];
  while (p < toks.length) {
    const t = toks[p++];
    if (t === ';' || t === ',') continue;
    if (t === 'Define') {
      const name = String(toks[p++]);
      defines.set(name, value());
      continue;
    }
    if (typeof t === 'string') {
      const args: Val[] = [];
      while (p < toks.length && toks[p] !== ';') args.push(value());
      p++;
      cmds.push({ name: t, args });
    }
  }
  return { defines, cmds };
}

interface Glyph {
  w: number;
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  ox: number;
  oy: number;
}

interface Layer {
  name: string;
  image: string;
  glyphs: Map<string, Glyph>;
  ascent: number;
  height: number;
  offX: number;
  offY: number;
  color: [number, number, number, number] | null;
  order: number;
  kern: Map<string, number>;
  img: HTMLCanvasElement | HTMLImageElement | null;
}

const fontCache = new Map<string, BitmapFont | null>();
const fontPending = new Map<string, Promise<BitmapFont | null>>();

/** PopCap 约定：只有亮度信息的字图（黑底白字、无透明）需把亮度转为透明度 */
function normalizeGlyphImage(im: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const w = im.naturalWidth;
  const h = im.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, w, h);
  let opaque = true;
  for (let i = 3; i < d.data.length; i += 4 * 97) {
    if (d.data[i] < 250) {
      opaque = false;
      break;
    }
  }
  if (!opaque) return im;
  for (let i = 0; i < d.data.length; i += 4) {
    const a = Math.max(d.data[i], d.data[i + 1], d.data[i + 2]);
    d.data[i] = 255;
    d.data[i + 1] = 255;
    d.data[i + 2] = 255;
    d.data[i + 3] = a;
  }
  x.putImageData(d, 0, 0);
  return c;
}

function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

export class BitmapFont {
  layers: Layer[] = [];
  ascent = 12;
  height = 16;
  private tinted = new Map<string, HTMLCanvasElement>();

  static get(id: string): BitmapFont | null {
    const got = fontCache.get(id);
    if (got !== undefined) return got;
    void BitmapFont.load(id);
    return null;
  }

  static load(id: string): Promise<BitmapFont | null> {
    const got = fontCache.get(id);
    if (got !== undefined) return Promise.resolve(got);
    let p = fontPending.get(id);
    if (p) return p;
    p = (async () => {
      const fe = PVZ.manifest?.fonts[id];
      if (!fe) {
        fontCache.set(id, null);
        return null;
      }
      const f = new BitmapFont();
      f.parse(fe.desc);
      await Promise.all(
        f.layers.map(async (l) => {
          const lower = l.image.toLowerCase();
          const im = (await loadImg(PVZ.url(`data/${lower}.png`))) ?? (await loadImg(PVZ.url(`data/_${lower}.png`))) ?? (fe.image ? await loadImg(PVZ.url(fe.image)) : null);
          l.img = im ? normalizeGlyphImage(im) : null;
        }),
      );
      fontCache.set(id, f);
      PVZ.version++;
      return f;
    })();
    fontPending.set(id, p);
    return p;
  }

  parse(desc: string): void {
    const { defines, cmds } = parseScript(desc);
    const byName = new Map<string, Layer>();
    const list = (v: Val | undefined): Val[] => (Array.isArray(v) ? v : []);
    const ref = (v: Val): Val | undefined => (typeof v === 'object' && !Array.isArray(v) ? defines.get(v.id) : v);
    const layer = (v: Val): Layer | undefined => byName.get(typeof v === 'object' && !Array.isArray(v) ? v.id : String(v));
    for (const c of cmds) {
      const a = c.args;
      switch (c.name) {
        case 'CreateLayer': {
          const name = (a[0] as { id: string }).id;
          const l: Layer = { name, image: '', glyphs: new Map(), ascent: 12, height: 16, offX: 0, offY: 0, color: null, order: this.layers.length, kern: new Map(), img: null };
          byName.set(name, l);
          this.layers.push(l);
          break;
        }
        case 'LayerSetImage': {
          const l = layer(a[0]);
          if (l) l.image = String(a[1]);
          break;
        }
        case 'LayerSetAscent': {
          const l = layer(a[0]);
          if (l) l.ascent = Number(a[1]);
          break;
        }
        case 'LayerSetHeight': {
          const l = layer(a[0]);
          if (l) l.height = Number(a[1]);
          break;
        }
        case 'LayerSetOffset': {
          const l = layer(a[0]);
          const o = list(a[1]);
          if (l) {
            l.offX = Number(o[0] ?? 0);
            l.offY = Number(o[1] ?? 0);
          }
          break;
        }
        case 'LayerSetColorMult': {
          const l = layer(a[0]);
          const o = list(a[1]).map(Number);
          if (l && o.length >= 3) l.color = [o[0], o[1], o[2], o[3] ?? 1];
          break;
        }
        case 'LayerSetBaseOrder': {
          const l = layer(a[0]);
          if (l) l.order = Number(a[1]) * 100 + this.layers.indexOf(l);
          break;
        }
        case 'LayerSetCharWidths':
        case 'LayerSetImageMap':
        case 'LayerSetCharOffsets': {
          const l = layer(a[0]);
          const chars = list(ref(a[1]));
          const vals = list(ref(a[2]));
          if (!l) break;
          chars.forEach((ch, i) => {
            const k = String(ch);
            let g = l.glyphs.get(k);
            if (!g) {
              g = { w: 0, rx: 0, ry: 0, rw: 0, rh: 0, ox: 0, oy: 0 };
              l.glyphs.set(k, g);
            }
            const v = vals[i];
            if (c.name === 'LayerSetCharWidths') g.w = Number(v);
            else if (c.name === 'LayerSetImageMap') {
              const r = list(v).map(Number);
              g.rx = r[0];
              g.ry = r[1];
              g.rw = r[2];
              g.rh = r[3];
            } else {
              const o = list(v).map(Number);
              g.ox = o[0] ?? 0;
              g.oy = o[1] ?? 0;
            }
          });
          break;
        }
        case 'LayerSetKerningPairs': {
          const l = layer(a[0]);
          const pairs = list(ref(a[1]));
          const vals = list(ref(a[2]));
          if (l) pairs.forEach((pv, i) => l.kern.set(String(pv), Number(vals[i] ?? 0)));
          break;
        }
        default:
          break;
      }
    }
    this.layers.sort((x, y) => x.order - y.order);
    const main = this.layers[this.layers.length - 1];
    if (main) {
      this.ascent = main.ascent;
      this.height = main.height;
    }
  }

  measure(text: string): number {
    const l = this.layers[this.layers.length - 1];
    if (!l) return 0;
    let w = 0;
    let prev = '';
    for (const ch of text) {
      const g = l.glyphs.get(ch) ?? l.glyphs.get('?');
      w += (g?.w ?? 0) + (prev ? (l.kern.get(prev + ch) ?? 0) : 0);
      prev = ch;
    }
    return w;
  }

  private layerImage(l: Layer, color: string | null): CanvasImageSource | null {
    if (!l.img) return null;
    const c = color ?? (l.color ? `rgb(${Math.round(l.color[0] * 255)},${Math.round(l.color[1] * 255)},${Math.round(l.color[2] * 255)})` : null);
    if (!c) return l.img;
    const key = `${l.name}|${c}`;
    let t = this.tinted.get(key);
    if (!t) {
      const w = (l.img as HTMLImageElement).naturalWidth || (l.img as HTMLCanvasElement).width;
      const h = (l.img as HTMLImageElement).naturalHeight || (l.img as HTMLCanvasElement).height;
      t = document.createElement('canvas');
      t.width = w;
      t.height = h;
      const x = t.getContext('2d')!;
      x.drawImage(l.img, 0, 0);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = c;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(l.img, 0, 0);
      this.tinted.set(key, t);
    }
    return t;
  }

  /**
   * 绘制文本：(x, y) 为基线左端。color 只作用于最上层（主体层），描边层保持原色。
   * align: 0 左对齐，0.5 居中，1 右对齐。
   */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string | null = null, align = 0, scale = 1): void {
    const width = this.measure(text) * scale;
    const x0 = x - width * align;
    this.layers.forEach((l, li) => {
      const img = this.layerImage(l, li === this.layers.length - 1 ? color : null);
      if (!img) return;
      let cx = x0;
      let prev = '';
      for (const ch of text) {
        const g = l.glyphs.get(ch) ?? l.glyphs.get('?');
        if (!g) continue;
        if (prev) cx += (l.kern.get(prev + ch) ?? 0) * scale;
        if (g.rw > 0 && g.rh > 0) ctx.drawImage(img, g.rx, g.ry, g.rw, g.rh, cx + (g.ox + l.offX) * scale, y + (g.oy + l.offY - l.ascent) * scale, g.rw * scale, g.rh * scale);
        cx += g.w * scale;
        prev = ch;
      }
    });
  }

  /** 按宽度自动换行后逐行绘制 */
  drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, color: string | null = null, align = 0, lineH = this.height): number {
    const lines: string[] = [];
    for (const para of text.split('\n')) {
      let cur = '';
      for (const ch of para) {
        if (this.measure(cur + ch) > maxW && cur) {
          lines.push(cur);
          cur = ch;
        } else cur += ch;
      }
      lines.push(cur);
    }
    lines.forEach((ln, i) => this.draw(ctx, ln, x + maxW * align, y + i * lineH, color, align));
    return lines.length * lineH;
  }
}

/** 常用字体 id */
export const FONTS = {
  sun: 'FONT_CONTINUUMBOLD14',
  cost: 'FONT_PICO129',
  title: 'FONT_HOUSEOFTERROR28',
  label: 'FONT_BRIANNETOD16',
  label12: 'FONT_BRIANNETOD12',
  big: 'FONT_BRIANNETOD32',
  button: 'FONT_DWARVENTODCRAFT18',
  button24: 'FONT_DWARVENTODCRAFT24',
  green: 'FONT_DWARVENTODCRAFT18GREENINSET',
  yellow: 'FONT_DWARVENTODCRAFT18YELLOW',
  tiny: 'FONT_TINYBOLD',
} as const;
