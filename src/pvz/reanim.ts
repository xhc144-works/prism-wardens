/**
 * Reanim 骨骼动画播放器（Canvas2D）。
 * 按原版语义实现：空帧沿用上一帧；anim_* 轨道的显示区间定义动作段；
 * 循环播放在段内插值、末帧回绕时瞬切；附着动画以挂点轨道相对基准姿势的变化驱动。
 */
import type { ReanimFile } from './format';

export interface ReanimTrackDef {
  name: string;
  x: Float32Array;
  y: Float32Array;
  kx: Float32Array;
  ky: Float32Array;
  sx: Float32Array;
  sy: Float32Array;
  a: Float32Array;
  f: Float32Array;
  /** 图片索引（指向 ReanimDef.images），-1 = 无 */
  img: Int16Array;
  hasImage: boolean;
}

export interface ReanimDef {
  name: string;
  fps: number;
  frames: number;
  tracks: ReanimTrackDef[];
  images: string[];
  index: Map<string, number>;
}

export function compileReanim(file: ReanimFile): ReanimDef {
  const frames = Math.max(1, ...file.tracks.map((t) => t.t.length));
  const images: string[] = [];
  const imgIdx = new Map<string, number>();
  const tracks: ReanimTrackDef[] = file.tracks.map((t) => {
    const T: ReanimTrackDef = {
      name: t.name,
      x: new Float32Array(frames),
      y: new Float32Array(frames),
      kx: new Float32Array(frames),
      ky: new Float32Array(frames),
      sx: new Float32Array(frames),
      sy: new Float32Array(frames),
      a: new Float32Array(frames),
      f: new Float32Array(frames),
      img: new Int16Array(frames),
      hasImage: false,
    };
    let x = 0,
      y = 0,
      kx = 0,
      ky = 0,
      sx = 1,
      sy = 1,
      a = 1,
      f = 0,
      im = -1;
    for (let i = 0; i < frames; i++) {
      const fr = t.t[i];
      if (fr) {
        if (fr.x !== undefined) x = fr.x;
        if (fr.y !== undefined) y = fr.y;
        if (fr.kx !== undefined) kx = fr.kx;
        if (fr.ky !== undefined) ky = fr.ky;
        if (fr.sx !== undefined) sx = fr.sx;
        if (fr.sy !== undefined) sy = fr.sy;
        if (fr.a !== undefined) a = fr.a;
        if (fr.f !== undefined) f = fr.f;
        if (fr.i) {
          let k = imgIdx.get(fr.i);
          if (k === undefined) {
            k = images.length;
            images.push(fr.i);
            imgIdx.set(fr.i, k);
          }
          im = k;
          T.hasImage = true;
        }
      }
      T.x[i] = x;
      T.y[i] = y;
      T.kx[i] = kx;
      T.ky[i] = ky;
      T.sx[i] = sx;
      T.sy[i] = sy;
      T.a[i] = a;
      T.f[i] = f;
      T.img[i] = im;
    }
    return T;
  });
  const index = new Map<string, number>();
  tracks.forEach((t, i) => {
    if (!index.has(t.name)) index.set(t.name, i);
  });
  return { name: file.name, fps: file.fps || 12, frames, tracks, images, index };
}

/** 某轨道显示区间 [首个显示帧, 末个显示帧]，作为动作段 */
export function segmentOf(def: ReanimDef, track: string): [number, number] | null {
  const i = def.index.get(track);
  if (i === undefined) return null;
  const f = def.tracks[i].f;
  let s = -1;
  let e = -1;
  for (let k = 0; k < def.frames; k++) {
    if (f[k] >= 0) {
      if (s < 0) s = k;
      e = k;
    }
  }
  return s < 0 ? null : [s, e];
}

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(p: Mat, a: number, b: number, c: number, d: number, e: number, f: number): Mat {
  return [p[0] * a + p[2] * b, p[1] * a + p[3] * b, p[0] * c + p[2] * d, p[1] * c + p[3] * d, p[0] * e + p[2] * f + p[4], p[1] * e + p[3] * f + p[5]];
}

export function mulMat(p: Mat, m: Mat): Mat {
  return mul(p, m[0], m[1], m[2], m[3], m[4], m[5]);
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function translate(p: Mat, x: number, y: number): Mat {
  return mul(p, 1, 0, 0, 1, x, y);
}

export function scaleMat(p: Mat, sx: number, sy = sx): Mat {
  return mul(p, sx, 0, 0, sy, 0, 0);
}

const D2R = Math.PI / 180;

export interface Xform {
  x: number;
  y: number;
  kx: number;
  ky: number;
  sx: number;
  sy: number;
  a: number;
  f: number;
  img: number;
}

export function xformMatrix(t: Xform): Mat {
  const kx = t.kx * D2R;
  const ky = t.ky * D2R;
  return [Math.cos(kx) * t.sx, Math.sin(kx) * t.sx, -Math.sin(ky) * t.sy, Math.cos(ky) * t.sy, t.x, t.y];
}

export type LoopMode = 'loop' | 'once' | 'hold';

/** 图片解析回调：返回可绘制对象（可能尚未加载） */
export interface ReanimImageSource {
  draw(ctx: CanvasRenderingContext2D, imageId: string, tint: string | null): boolean;
}

interface Attachment {
  track: number;
  child: Reanim;
  /** 子动画额外偏移 */
  offset: Mat;
  /** 是否扣除挂点轨道的基准姿势（用于同文件内的头部等） */
  relative: boolean;
  /** 指定基准姿势帧（默认为父动画当前段首帧） */
  baseFrame?: number;
}

export class Reanim {
  def: ReanimDef;
  start = 0;
  count = 1;
  /** 段内进度 [0,1] */
  t = 0;
  /** 播放速度（帧/秒） */
  rate: number;
  loop: LoopMode = 'loop';
  done = false;
  /** 循环完成次数 */
  loops = 0;
  anim = '';
  /** 轨道显隐覆盖：true 隐藏 */
  hidden: Uint8Array;
  /** 轨道图片覆盖（图片 id） */
  imageOverride = new Map<number, string>();
  attachments: Attachment[] = [];
  /** 颜色乘算（如冰冻蓝） */
  tint: string | null = null;
  alpha = 1;
  /** 叠加高亮（受击闪白），0..1 */
  flash = 0;
  private blendFrom: Xform[] | null = null;
  private blendT = 0;
  private blendDur = 0;

  constructor(def: ReanimDef, anim?: string, loop: LoopMode = 'loop') {
    this.def = def;
    this.rate = def.fps;
    this.hidden = new Uint8Array(def.tracks.length);
    this.count = def.frames;
    if (anim) this.play(anim, loop);
  }

  has(anim: string): boolean {
    return segmentOf(this.def, anim) !== null;
  }

  /** 切换动作段；blend > 0 时从当前姿势平滑过渡（秒） */
  play(anim: string, loop: LoopMode = 'loop', blend = 0, rate?: number): boolean {
    const seg = segmentOf(this.def, anim);
    if (!seg) return false;
    if (blend > 0 && this.anim) {
      this.blendFrom = this.def.tracks.map((_, i) => this.trackXform(i));
      this.blendT = 0;
      this.blendDur = blend;
    } else this.blendFrom = null;
    this.anim = anim;
    this.start = seg[0];
    this.count = seg[1] - seg[0] + 1;
    this.t = 0;
    this.loop = loop;
    this.done = false;
    this.loops = 0;
    if (rate !== undefined) this.rate = rate;
    return true;
  }

  /** 播放整条时间线 */
  playAll(loop: LoopMode = 'loop'): void {
    this.anim = '*';
    this.start = 0;
    this.count = this.def.frames;
    this.t = 0;
    this.loop = loop;
    this.done = false;
  }

  setTrackVisible(name: string, visible: boolean): void {
    for (let i = 0; i < this.def.tracks.length; i++) if (this.def.tracks[i].name === name) this.hidden[i] = visible ? 0 : 1;
  }

  /** 按名称前缀批量显隐 */
  showPrefix(prefix: string, visible: boolean): void {
    for (let i = 0; i < this.def.tracks.length; i++) if (this.def.tracks[i].name.startsWith(prefix)) this.hidden[i] = visible ? 0 : 1;
  }

  setImage(track: string, imageId: string | null): void {
    for (let i = 0; i < this.def.tracks.length; i++) {
      if (this.def.tracks[i].name !== track) continue;
      if (imageId) this.imageOverride.set(i, imageId);
      else this.imageOverride.delete(i);
    }
  }

  /** 将子动画挂到本动画的某条轨道上 */
  attach(track: string, child: Reanim, opts: { offset?: Mat; relative?: boolean; baseFrame?: number } = {}): void {
    const i = this.def.index.get(track);
    if (i === undefined) return;
    this.attachments = this.attachments.filter((a) => a.track !== i);
    this.attachments.push({ track: i, child, offset: opts.offset ?? IDENTITY, relative: opts.relative ?? true, baseFrame: opts.baseFrame });
  }

  detach(track: string): void {
    const i = this.def.index.get(track);
    this.attachments = this.attachments.filter((a) => a.track !== i);
  }

  update(dt: number): void {
    if (this.blendFrom) {
      this.blendT += dt;
      if (this.blendT >= this.blendDur) this.blendFrom = null;
    }
    if (!this.done && this.count > 0) {
      this.t += (dt * this.rate) / this.count;
      if (this.t >= 1) {
        if (this.loop === 'loop') {
          this.loops += Math.floor(this.t);
          this.t -= Math.floor(this.t);
        } else {
          this.t = 1;
          this.done = true;
          this.loops = 1;
        }
      }
    }
    for (const a of this.attachments) a.child.update(dt);
  }

  /** 当前帧位置（含小数） */
  framePos(): { before: number; after: number; frac: number } {
    const span = this.loop === 'loop' ? this.count - 1 : this.count - 1;
    const pos = this.start + Math.max(0, span) * this.t;
    let before = Math.floor(pos);
    const frac = pos - before;
    const last = this.start + this.count - 1;
    let after: number;
    if (before >= last) {
      before = last;
      after = last;
    } else after = before + 1;
    return { before, after, frac };
  }

  /** 轨道在当前时刻的变换（插值） */
  trackXform(i: number): Xform {
    const T = this.def.tracks[i];
    const { before: b, after: n, frac: k } = this.framePos();
    let x: Xform = {
      x: T.x[b] + (T.x[n] - T.x[b]) * k,
      y: T.y[b] + (T.y[n] - T.y[b]) * k,
      kx: T.kx[b] + (T.kx[n] - T.kx[b]) * k,
      ky: T.ky[b] + (T.ky[n] - T.ky[b]) * k,
      sx: T.sx[b] + (T.sx[n] - T.sx[b]) * k,
      sy: T.sy[b] + (T.sy[n] - T.sy[b]) * k,
      a: T.a[b] + (T.a[n] - T.a[b]) * k,
      f: T.f[b] !== -1 && T.f[n] === -1 && k > 0 ? -1 : T.f[b],
      img: T.img[b],
    };
    if (this.blendFrom) {
      const s = this.blendFrom[i];
      const w = this.blendT / this.blendDur;
      x = {
        ...x,
        x: s.x + (x.x - s.x) * w,
        y: s.y + (x.y - s.y) * w,
        kx: s.kx + (x.kx - s.kx) * w,
        ky: s.ky + (x.ky - s.ky) * w,
        sx: s.sx + (x.sx - s.sx) * w,
        sy: s.sy + (x.sy - s.sy) * w,
        a: s.a + (x.a - s.a) * w,
      };
    }
    return x;
  }

  /** 挂接矩阵：Track(t) · Track(基准姿势)⁻¹，基准姿势为当前动作段首帧（与原版一致） */
  trackDelta(i: number, baseFrame?: number): Mat {
    const cur = xformMatrix(this.trackXform(i));
    const T = this.def.tracks[i];
    const b = baseFrame ?? this.start;
    const base = xformMatrix({ x: T.x[b], y: T.y[b], kx: T.kx[b], ky: T.ky[b], sx: T.sx[b], sy: T.sy[b], a: 1, f: 0, img: -1 });
    return mulMat(cur, invert(base));
  }

  /** 获取轨道当前的世界矩阵（例如发射口、手部位置） */
  trackMatrix(name: string, base: Mat = IDENTITY): Mat | null {
    const i = this.def.index.get(name);
    if (i === undefined) return null;
    return mulMat(base, xformMatrix(this.trackXform(i)));
  }

  draw(ctx: CanvasRenderingContext2D, base: Mat, src: ReanimImageSource, parentAlpha = 1): void {
    const tracks = this.def.tracks;
    const alpha = this.alpha * parentAlpha;
    for (let i = 0; i < tracks.length; i++) {
      const T = tracks[i];
      const att = this.attachments.length ? this.attachments.find((a) => a.track === i) : undefined;
      if (!T.hasImage && !att && !this.imageOverride.has(i)) continue;
      if (this.hidden[i]) continue;
      const x = this.trackXform(i);
      if (x.f < 0 && !att) continue;
      if (T.hasImage || this.imageOverride.has(i)) {
        const imgId = this.imageOverride.get(i) ?? (x.img >= 0 ? this.def.images[x.img] : null);
        if (imgId && x.f >= 0) {
          const m = mulMat(base, xformMatrix(x));
          ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
          const a = alpha * x.a;
          if (a > 0.003) {
            ctx.globalAlpha = Math.min(1, a);
            src.draw(ctx, imgId, this.tint);
            if (this.flash > 0.01) {
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = Math.min(1, a * this.flash);
              src.draw(ctx, imgId, null);
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        }
      }
      if (att) {
        const m = att.relative ? mulMat(mulMat(base, this.trackDelta(i, att.baseFrame)), att.offset) : mulMat(mulMat(base, xformMatrix(x)), att.offset);
        att.child.draw(ctx, m, src, alpha);
      }
    }
    ctx.globalAlpha = 1;
  }
}
