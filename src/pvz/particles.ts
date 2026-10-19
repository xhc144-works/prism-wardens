/**
 * 原版粒子定义（particles/*.xml）的 Canvas 实现。
 * 轨道语法："值[,时间%] 值[,时间%] ..."，值可为数字或 [低 高] 随机区间，可带曲线名；
 * 时间单位为百分比（粒子寿命或系统寿命），时长单位为 1/100 秒。
 */
import type { ParticleEmitterDef, ParticleFile } from './format';
import { PVZ, type LoadedImage } from './assets';

interface TrackNode {
  t: number;
  lo: number;
  hi: number;
  curve: string;
}

type Track = TrackNode[];

const CURVES: Record<string, (k: number) => number> = {
  linear: (k) => k,
  easein: (k) => k * k,
  easeout: (k) => 1 - (1 - k) * (1 - k),
  easeinout: (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)),
  easeinoutweak: (k) => k * k * (3 - 2 * k),
  fastinoutweak: (k) => k,
  fastinout: (k) => k,
  constant: () => 0,
  bounce: (k) => Math.abs(Math.sin(k * Math.PI)),
  sincurve: (k) => Math.sin(k * Math.PI),
};

export function parseTrack(src: string | undefined): Track | null {
  if (src === undefined || src.trim() === '') return null;
  const tokens = src.match(/\[[^\]]*\](?:,[-\d.]+)?|[A-Za-z]+|[-\d.]+(?:,[-\d.]+)?/g);
  if (!tokens) return null;
  const nodes: (TrackNode & { hasT: boolean })[] = [];
  let curve = 'linear';
  for (const tok of tokens) {
    if (/^[A-Za-z]+$/.test(tok)) {
      curve = tok.toLowerCase();
      continue;
    }
    let valPart = tok;
    let tPart: string | undefined;
    const ci = tok.lastIndexOf(',');
    if (ci > 0 && !tok.slice(ci).includes(']')) {
      valPart = tok.slice(0, ci);
      tPart = tok.slice(ci + 1);
    }
    let lo: number;
    let hi: number;
    if (valPart.startsWith('[')) {
      const nums = valPart.slice(1, -1).trim().split(/\s+/).map(Number);
      lo = nums[0] ?? 0;
      hi = nums[1] ?? lo;
    } else {
      lo = hi = Number(valPart);
    }
    nodes.push({ t: tPart !== undefined ? Number(tPart) / 100 : 0, lo, hi, curve, hasT: tPart !== undefined });
    curve = 'linear';
  }
  if (!nodes.length) return null;
  if (!nodes[0].hasT) nodes[0].t = 0;
  if (nodes.length > 1 && !nodes[nodes.length - 1].hasT) nodes[nodes.length - 1].t = 1;
  // 未指定时间的中间节点：在左右已知时间之间均匀分布
  for (let i = 1; i < nodes.length - 1; i++) {
    if (nodes[i].hasT) continue;
    let j = i + 1;
    while (j < nodes.length && !nodes[j].hasT && j < nodes.length - 1) j++;
    const t0 = nodes[i - 1].t;
    const t1 = nodes[j].t;
    for (let k = i; k < j; k++) nodes[k].t = t0 + ((t1 - t0) * (k - i + 1)) / (j - i + 1);
    i = j - 1;
  }
  return nodes.map(({ t, lo, hi, curve: c }) => ({ t, lo, hi, curve: c }));
}

export function evalTrack(tr: Track | null, t: number, r: number, def: number): number {
  if (!tr || !tr.length) return def;
  if (tr.length === 1 || t <= tr[0].t) return tr[0].lo + (tr[0].hi - tr[0].lo) * r;
  for (let i = 1; i < tr.length; i++) {
    const b = tr[i];
    if (t <= b.t) {
      const a = tr[i - 1];
      const va = a.lo + (a.hi - a.lo) * r;
      const vb = b.lo + (b.hi - b.lo) * r;
      const span = b.t - a.t;
      const k = span > 0 ? (t - a.t) / span : 1;
      const f = CURVES[b.curve] ?? CURVES.linear;
      return va + (vb - va) * f(k);
    }
  }
  const z = tr[tr.length - 1];
  return z.lo + (z.hi - z.lo) * r;
}

const TRACK_KEYS = [
  'SpawnRate',
  'SpawnMinActive',
  'SpawnMaxActive',
  'SpawnMaxLaunched',
  'EmitterRadius',
  'EmitterOffsetX',
  'EmitterOffsetY',
  'EmitterBoxX',
  'EmitterBoxY',
  'ParticleDuration',
  'SystemDuration',
  'LaunchSpeed',
  'LaunchAngle',
  'ParticleRed',
  'ParticleGreen',
  'ParticleBlue',
  'ParticleAlpha',
  'ParticleBrightness',
  'SystemRed',
  'SystemGreen',
  'SystemBlue',
  'SystemAlpha',
  'SystemBrightness',
  'ParticleScale',
  'SystemScale',
  'ParticleSpinAngle',
  'ParticleSpinSpeed',
  'ParticleStretch',
  'CollisionReflect',
  'CollisionSpin',
  'AnimationRate',
  'EmitterSkewX',
  'EmitterSkewY',
  'ClipTop',
  'ClipBottom',
  'ClipLeft',
  'ClipRight',
] as const;

type TrackKey = (typeof TRACK_KEYS)[number];

interface CompiledField {
  type: string;
  x: Track | null;
  y: Track | null;
}

interface CompiledEmitter {
  name: string;
  image: string | null;
  frames: number;
  row: number;
  col: number;
  animated: boolean;
  additive: boolean;
  randomSpin: boolean;
  alignSpin: boolean;
  dontFollow: boolean;
  systemLoops: boolean;
  particleLoops: boolean;
  fullScreen: boolean;
  type: string;
  tracks: Partial<Record<TrackKey, Track | null>>;
  fields: CompiledField[];
  systemFields: CompiledField[];
}

const compiledCache = new Map<string, CompiledEmitter[]>();

function flag(p: Record<string, string>, k: string): boolean {
  return p[k] !== undefined && p[k] !== '0';
}

function compileEmitter(e: ParticleEmitterDef): CompiledEmitter {
  const p = e.props;
  const tracks: Partial<Record<TrackKey, Track | null>> = {};
  for (const k of TRACK_KEYS) if (p[k] !== undefined) tracks[k] = parseTrack(p[k]);
  const cf = (f: { type: string; x?: string; y?: string }): CompiledField => ({ type: f.type, x: parseTrack(f.x), y: parseTrack(f.y) });
  return {
    name: p.Name ?? '',
    image: p.Image ?? null,
    frames: Number(p.ImageFrames ?? 1) || 1,
    row: Number(p.ImageRow ?? 0) || 0,
    col: Number(p.ImageCol ?? 0) || 0,
    animated: flag(p, 'Animated'),
    additive: flag(p, 'Additive'),
    randomSpin: flag(p, 'RandomLaunchSpin'),
    alignSpin: flag(p, 'AlignLaunchSpin'),
    dontFollow: flag(p, 'ParticlesDontFollow'),
    systemLoops: flag(p, 'SystemLoops'),
    particleLoops: flag(p, 'ParticleLoops'),
    fullScreen: flag(p, 'FullScreen'),
    type: (p.EmitterType ?? 'Circle').toLowerCase(),
    tracks,
    fields: e.fields.map(cf),
    systemFields: e.systemFields.map(cf),
  };
}

function compileFile(f: ParticleFile): CompiledEmitter[] {
  let c = compiledCache.get(f.name);
  if (!c) {
    c = f.emitters.map(compileEmitter);
    compiledCache.set(f.name, c);
  }
  return c;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number[]; // 每条轨道的随机插值
  spin: number;
  spinSpeed: number;
  frame: number;
  bounces: number;
  spinVel: number;
}

class EmitterInst {
  particles: Particle[] = [];
  launched = 0;
  spawnAcc = 0;
  sysR: number[];
  done = false;
  imageOverride: string | null = null;
  constructor(
    public def: CompiledEmitter,
    public sys: ParticleSystemInst,
  ) {
    this.sysR = Array.from({ length: 8 }, () => Math.random());
  }

  sysVal(k: TrackKey, def: number, ri = 0): number {
    return evalTrack(this.def.tracks[k] ?? null, this.sys.progress, this.sysR[ri % 8], def);
  }

  spawn(): void {
    const d = this.def;
    const p: Particle = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r: Array.from({ length: 12 }, () => Math.random()), spin: 0, spinSpeed: 0, frame: 0, bounces: 0, spinVel: 0 };
    const radius = this.sysVal('EmitterRadius', 0, 1);
    const ox = this.sysVal('EmitterOffsetX', 0, 2);
    const oy = this.sysVal('EmitterOffsetY', 0, 3);
    if (d.type.startsWith('box')) {
      const bx = evalTrack(d.tracks.EmitterBoxX ?? null, this.sys.progress, Math.random(), 0);
      const by = evalTrack(d.tracks.EmitterBoxY ?? null, this.sys.progress, Math.random(), 0);
      p.x = ox + bx;
      p.y = oy + by;
    } else {
      const ang = d.type === 'circleevenspacing' ? (this.launched / Math.max(1, this.sysVal('SpawnMaxLaunched', 8))) * Math.PI * 2 : Math.random() * Math.PI * 2;
      const rr = d.type === 'circlepath' || d.type === 'circleevenspacing' ? radius : Math.random() * radius;
      p.x = ox + Math.cos(ang) * rr;
      p.y = oy + Math.sin(ang) * rr;
    }
    const speed = evalTrack(d.tracks.LaunchSpeed ?? null, this.sys.progress, p.r[0], 0);
    const angT = d.tracks.LaunchAngle;
    const ang = angT && angT.length ? (evalTrack(angT, this.sys.progress, p.r[1], 0) * Math.PI) / 180 : Math.random() * Math.PI * 2;
    p.vx = Math.sin(ang) * speed;
    p.vy = Math.cos(ang) * speed;
    p.life = Math.max(0.01, evalTrack(d.tracks.ParticleDuration ?? null, this.sys.progress, p.r[2], 100) / 100);
    p.spin = d.randomSpin ? Math.random() * Math.PI * 2 : d.alignSpin ? Math.atan2(p.vy, p.vx) : 0;
    if (d.frames > 1 && !d.animated) p.frame = Math.floor(Math.random() * d.frames);
    if (d.dontFollow) {
      p.x += this.sys.x;
      p.y += this.sys.y;
    }
    this.particles.push(p);
    this.launched++;
  }

  update(dt: number): void {
    const d = this.def;
    const sysAlive = this.sys.progress < 1 || this.sys.loops;
    if (sysAlive) {
      const maxLaunched = this.sysVal('SpawnMaxLaunched', -1, 4);
      const maxActive = this.sysVal('SpawnMaxActive', -1, 5);
      const minActive = this.sysVal('SpawnMinActive', -1, 6);
      const rate = this.sysVal('SpawnRate', 0, 7);
      const canLaunch = () => (maxLaunched < 0 || this.launched < Math.floor(maxLaunched)) && (maxActive < 0 || this.particles.length < Math.floor(maxActive));
      if (minActive > 0) while (this.particles.length < Math.floor(minActive) && canLaunch()) this.spawn();
      this.spawnAcc += rate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (canLaunch()) this.spawn();
      }
    }
    const ticks = dt * 100;
    for (const p of this.particles) {
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      for (const f of d.fields) {
        const fx = evalTrack(f.x, k, p.r[3], 0);
        const fy = evalTrack(f.y, k, p.r[4], 0);
        switch (f.type) {
          case 'Acceleration':
            p.vx += fx * 100 * dt;
            p.vy += fy * 100 * dt;
            break;
          case 'Friction':
            p.vx *= Math.pow(1 - Math.min(0.99, fx), ticks);
            p.vy *= Math.pow(1 - Math.min(0.99, fy), ticks);
            break;
          case 'MaxVelocity': {
            const m = Math.hypot(p.vx, p.vy);
            const lim = fx || fy;
            if (lim > 0 && m > lim) {
              p.vx *= lim / m;
              p.vy *= lim / m;
            }
            break;
          }
          case 'Velocity':
            p.x += fx * dt;
            p.y += fy * dt;
            break;
          case 'GroundConstraint': {
            const ground = fy + (d.dontFollow ? this.sys.y : 0);
            if (p.y > ground && p.vy > 0) {
              p.y = ground;
              const refl = evalTrack(d.tracks.CollisionReflect ?? null, k, p.r[5], 0);
              p.vy = -p.vy * refl;
              p.vx *= refl > 0 ? 0.6 : 0;
              const cs = evalTrack(d.tracks.CollisionSpin ?? null, k, p.r[6], 0);
              p.spinVel = (-p.vy / refl || 0) * cs / 1000 * 100;
              p.bounces++;
            }
            break;
          }
          case 'Shake':
            p.x += (Math.random() - 0.5) * fx;
            p.y += (Math.random() - 0.5) * fy;
            break;
          case 'Circle': {
            const dx = p.x;
            const dy = p.y;
            p.vx += -dy * fx * dt;
            p.vy += dx * fy * dt;
            break;
          }
          case 'Away': {
            const m = Math.hypot(p.x, p.y) || 1;
            p.vx += (p.x / m) * fx * dt * 100;
            p.vy += (p.y / m) * fy * dt * 100;
            break;
          }
          default:
            break;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const ss = evalTrack(d.tracks.ParticleSpinSpeed ?? null, k, p.r[7], 0);
      p.spin += ((ss + p.spinSpeed) * Math.PI * dt) / 180 + p.spinVel * dt;
      if (d.particleLoops && p.age >= p.life) p.age = 0;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    if (!sysAlive && !this.particles.length) this.done = true;
  }

  draw(ctx: CanvasRenderingContext2D, alphaMul: number): void {
    const d = this.def;
    const imgId = this.imageOverride ?? d.image;
    if (!imgId) return;
    const li = PVZ.image(imgId);
    if (!li) return;
    const sp = this.sys.progress;
    const sysA = this.sysVal('SystemAlpha', 1);
    const sysS = this.sysVal('SystemScale', 1);
    const sysR = this.sysVal('SystemRed', 1);
    const sysG = this.sysVal('SystemGreen', 1);
    const sysB = this.sysVal('SystemBlue', 1);
    const sysBr = this.sysVal('SystemBrightness', 1);
    void sp;
    ctx.globalCompositeOperation = d.additive ? 'lighter' : 'source-over';
    const base = ctx.getTransform();
    for (const p of this.particles) {
      const k = Math.min(1, p.age / p.life);
      const a = evalTrack(d.tracks.ParticleAlpha ?? null, k, p.r[8], 1) * sysA * alphaMul;
      if (a <= 0.004) continue;
      const sc = evalTrack(d.tracks.ParticleScale ?? null, k, p.r[9], 1) * sysS;
      if (sc <= 0.001) continue;
      const br = evalTrack(d.tracks.ParticleBrightness ?? null, k, p.r[10], 1) * sysBr;
      const cr = Math.min(1, evalTrack(d.tracks.ParticleRed ?? null, k, p.r[11], 1) * sysR * br);
      const cg = Math.min(1, evalTrack(d.tracks.ParticleGreen ?? null, k, p.r[11], 1) * sysG * br);
      const cb = Math.min(1, evalTrack(d.tracks.ParticleBlue ?? null, k, p.r[11], 1) * sysB * br);
      const spinA = d.tracks.ParticleSpinAngle ? (evalTrack(d.tracks.ParticleSpinAngle, k, p.r[7], 0) * Math.PI) / 180 : 0;
      let frame = p.frame;
      if (d.animated && d.frames > 1) frame = Math.min(d.frames - 1, Math.floor(k * d.frames));
      const px = d.dontFollow ? p.x : p.x + this.sys.x;
      const py = d.dontFollow ? p.y : p.y + this.sys.y;
      drawCell(ctx, base, imgId, li, frame, d, px, py, sc, -(p.spin + spinA), Math.min(1, a * Math.max(0, br)), cr, cg, cb);
    }
    ctx.setTransform(base);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

const tintCache = new Map<string, HTMLCanvasElement>();

function drawCell(ctx: CanvasRenderingContext2D, m: DOMMatrix, id: string, li: LoadedImage, frame: number, d: CompiledEmitter, x: number, y: number, sc: number, rot: number, a: number, r: number, g: number, b: number): void {
  // 精灵图：ImageFrames 横向排列；ImageRow/ImageCol 选择单元
  const cols = li.cols;
  const rows = li.rows;
  let cx = d.col;
  let cy = d.row;
  if (d.frames > 1) {
    if (cols >= d.frames) cx = frame;
    else cy = frame;
  }
  cx = Math.min(cols - 1, cx);
  cy = Math.min(rows - 1, cy);
  const cw = li.w / cols;
  const ch = li.h / rows;
  let src: CanvasImageSource = li.img;
  if (r < 0.98 || g < 0.98 || b < 0.98) {
    const q = (v: number) => Math.round(Math.max(0, v) * 15);
    const key = `${id}|${q(r)},${q(g)},${q(b)}`;
    let c = tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = li.w;
      c.height = li.h;
      const t = c.getContext('2d')!;
      t.drawImage(li.img, 0, 0);
      t.globalCompositeOperation = 'multiply';
      t.fillStyle = `rgb(${Math.round((q(r) / 15) * 255)},${Math.round((q(g) / 15) * 255)},${Math.round((q(b) / 15) * 255)})`;
      t.fillRect(0, 0, li.w, li.h);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(li.img, 0, 0);
      tintCache.set(key, c);
    }
    src = c;
  }
  ctx.globalAlpha = Math.min(1, a);
  const cos = Math.cos(rot) * sc;
  const sin = Math.sin(rot) * sc;
  ctx.setTransform(m.a * cos + m.c * sin, m.b * cos + m.d * sin, -m.a * sin + m.c * cos, -m.b * sin + m.d * cos, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
  ctx.drawImage(src, cx * cw, cy * ch, cw, ch, -cw / 2, -ch / 2, cw, ch);
}

export class ParticleSystemInst {
  emitters: EmitterInst[];
  age = 0;
  duration: number;
  loops = false;
  dead = false;
  constructor(
    public name: string,
    defs: CompiledEmitter[],
    public x: number,
    public y: number,
  ) {
    this.emitters = defs.map((d) => new EmitterInst(d, this));
    let dur = 0;
    for (const d of defs) {
      dur = Math.max(dur, evalTrack(d.tracks.SystemDuration ?? null, 0, Math.random(), 0) / 100);
      if (d.systemLoops) this.loops = true;
    }
    this.duration = dur > 0 ? dur : 0.01;
  }

  get progress(): number {
    return this.loops ? (this.age % this.duration) / this.duration : Math.min(1, this.age / this.duration);
  }

  overrideImage(emitterName: string | null, image: string): void {
    for (const e of this.emitters) if (!emitterName || e.def.name === emitterName) e.imageOverride = image;
  }

  update(dt: number): void {
    this.age += dt;
    for (const e of this.emitters) if (!e.done) e.update(dt);
    if (!this.loops && this.emitters.every((e) => e.done)) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D, alpha = 1): void {
    for (const e of this.emitters) e.draw(ctx, alpha);
  }
}

/** 粒子管理器：按名称生成原版粒子效果 */
export class PvzParticles {
  systems: ParticleSystemInst[] = [];
  max = 120;
  private pending = new Set<string>();

  preload(names: string[]): Promise<unknown> {
    return Promise.all(
      names.map(async (n) => {
        const f = await PVZ.loadParticle(n);
        if (f) await PVZ.preloadImages(f.emitters.map((e) => e.props.Image).filter(Boolean) as string[]);
      }),
    );
  }

  spawn(name: string, x: number, y: number, image?: string): ParticleSystemInst | null {
    const f = PVZ.particle(name);
    if (!f) {
      if (!this.pending.has(name)) {
        this.pending.add(name);
        void this.preload([name]);
      }
      return null;
    }
    if (this.systems.length >= this.max) this.systems.shift();
    const s = new ParticleSystemInst(name, compileFile(f), x, y);
    if (image) s.overrideImage(null, image);
    this.systems.push(s);
    return s;
  }

  update(dt: number): void {
    for (const s of this.systems) s.update(dt);
    this.systems = this.systems.filter((s) => !s.dead);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const s of this.systems) s.draw(ctx);
  }

  clear(): void {
    this.systems = [];
  }
}
