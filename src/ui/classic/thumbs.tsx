/**
 * 经典皮肤的通用绘制组件：原版贴图（含精灵图单元格）、植物/僵尸动画缩略图、种子包。
 * 资源异步加载，加载完成后自动重绘。
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { PVZ, PVZ_IMAGES } from '../../pvz/assets';
import { BitmapFont, FONTS } from '../../pvz/font';
import { Reanim, type Mat, scaleMat, translate } from '../../pvz/reanim';

const curMat = (ctx: CanvasRenderingContext2D): Mat => {
  const m = ctx.getTransform();
  return [m.a, m.b, m.c, m.d, m.e, m.f];
};
import { PLANT_SKINS, ZOMBIE_SKINS } from '../../render/classic/skins';
import { UnitActor, ZombieActor } from '../../render/classic/actors';

/** 等待一组资源加载完成后返回 true（用于触发重绘） */
function useAssets(load: () => Promise<unknown>, deps: unknown[]): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    setReady(false);
    void load().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, deps);
  return ready;
}

function useCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.ceil(w * dpr);
    c.height = Math.ceil(h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, deps);
  return ref;
}

/** 原版贴图（可指定精灵图单元格与缩放） */
export function PvzImage(props: { id: string; col?: number; row?: number; scale?: number; w?: number; h?: number; crop?: [number, number, number, number]; class?: string; style?: Record<string, string | number> }) {
  const ready = useAssets(() => PVZ.loadImage(props.id), [props.id]);
  const li = ready ? PVZ.image(props.id) : null;
  const cw = li ? li.cw : (props.w ?? 1);
  const ch = li ? li.ch : (props.h ?? 1);
  const w = props.w ?? cw * (props.scale ?? 1);
  const h = props.h ?? ch * (props.scale ?? 1);
  const ref = useCanvas(
    w,
    h,
    (ctx) => {
      if (!li) return;
      const c = props.crop;
      if (c) ctx.drawImage(li.img, c[0], c[1], c[2], c[3], 0, 0, w, h);
      else ctx.drawImage(li.img, (props.col ?? 0) * li.cw, (props.row ?? 0) * li.ch, li.cw, li.ch, 0, 0, w, h);
    },
    [ready, props.id, props.col, props.row, w, h, props.crop?.join(',')],
  );
  return <canvas ref={ref} class={props.class} style={{ width: `${w}px`, height: `${h}px`, ...(props.style ?? {}) }} />;
}

/** 植物动画定格（用于卡片、图鉴） */
export function drawPlant(ctx: CanvasRenderingContext2D, defId: string, x: number, y: number, scale: number, t = 0): boolean {
  const skin = PLANT_SKINS[defId];
  const def = skin ? PVZ.reanim(skin.reanim) : null;
  if (!skin || !def) return false;
  if (skin.thumb) {
    const r = new Reanim(def);
    if (!r.play(skin.thumb)) r.playAll();
    r.update(t);
    r.draw(ctx, scaleMat(translate(curMat(ctx), x, y), scale), PVZ_IMAGES);
    return true;
  }
  const a = new UnitActor(0, defId, def, skin);
  a.body.t = 0;
  for (const h of a.heads) h.r.t = 0;
  a.update(t);
  a.body.draw(ctx, scaleMat(translate(curMat(ctx), x, y), scale), PVZ_IMAGES);
  return true;
}

export function drawZombie(ctx: CanvasRenderingContext2D, enemyId: string, x: number, y: number, scale: number, t = 0): boolean {
  const skin = ZOMBIE_SKINS[enemyId];
  const def = skin ? PVZ.reanim(skin.reanim) : null;
  if (!skin || !def) return false;
  const a = new ZombieActor(0, enemyId, def, skin, PVZ.reanim('Zombie_flagpole'));
  const idle = skin.idle && a.body.has(skin.idle) ? skin.idle : a.walkAnim;
  a.body.play(idle);
  a.body.t = 0;
  a.body.update(t);
  a.body.alpha = 1;
  a.body.draw(ctx, scaleMat(translate(curMat(ctx), x, y), scale * (skin.scale ?? 1)), PVZ_IMAGES);
  return true;
}

async function loadReanimFor(kind: 'plant' | 'zombie', id: string): Promise<void> {
  const skin = kind === 'plant' ? PLANT_SKINS[id] : ZOMBIE_SKINS[id];
  if (!skin) return;
  await PVZ.loadReanimsWithImages(kind === 'zombie' ? [skin.reanim, 'Zombie_flagpole'] : [skin.reanim]);
}

const snapCache = new Map<string, HTMLCanvasElement | null>();

/** 把一帧动画渲染到离屏画布并裁掉透明边，用于自适应缩略图 */
export function snapshot(kind: 'plant' | 'zombie', id: string): HTMLCanvasElement | null {
  const key = `${kind}:${id}`;
  if (snapCache.has(key)) return snapCache.get(key)!;
  const W = 520;
  const H = 520;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const ok = kind === 'plant' ? drawPlant(ctx, id, 200, 220, 1) : drawZombie(ctx, id, 160, 160, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!ok) return null;
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      if (d[(y * W + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 <= x0) return null;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 4;
  out.height = y1 - y0 + 4;
  out.getContext('2d')!.drawImage(c, x0 - 2, y0 - 2, out.width, out.height, 0, 0, out.width, out.height);
  snapCache.set(key, out);
  return out;
}

function Snap(props: { kind: 'plant' | 'zombie'; id: string; w: number; h: number; pad?: number }) {
  const ready = useAssets(() => loadReanimFor(props.kind, props.id), [props.kind, props.id]);
  const ref = useCanvas(
    props.w,
    props.h,
    (ctx) => {
      if (!ready) return;
      const img = snapshot(props.kind, props.id);
      if (!img) return;
      const pad = props.pad ?? 2;
      const k = Math.min((props.w - pad * 2) / img.width, (props.h - pad * 2) / img.height);
      const dw = img.width * k;
      const dh = img.height * k;
      ctx.drawImage(img, (props.w - dw) / 2, props.h - pad - dh, dw, dh);
    },
    [ready, props.id, props.w, props.h],
  );
  return <canvas ref={ref} style={{ width: `${props.w}px`, height: `${props.h}px` }} />;
}

export function PlantThumb(props: { id: string; size?: number; w?: number; h?: number }) {
  return <Snap kind="plant" id={props.id} w={props.w ?? props.size ?? 80} h={props.h ?? props.size ?? 80} />;
}

export function ZombieThumb(props: { id: string; size?: number; w?: number; h?: number }) {
  return <Snap kind="zombie" id={props.id} w={props.w ?? props.size ?? 80} h={props.h ?? props.size ?? 80} />;
}

/** 原版种子包（底图 + 植物 + 价格） */
export function SeedPacket(props: { id: string; cost: number; scale?: number; dim?: boolean; selected?: boolean }) {
  const s = props.scale ?? 0.5;
  const w = 100 * s;
  const h = 140 * s;
  const ready = useAssets(async () => {
    await Promise.all([PVZ.loadImage('IMAGE_SEEDPACKET_LARGER'), loadReanimFor('plant', props.id), BitmapFont.load(FONTS.cost)]);
  }, [props.id]);
  const ref = useCanvas(
    w,
    h,
    (ctx) => {
      if (!ready) return;
      const bg = PVZ.image('IMAGE_SEEDPACKET_LARGER');
      ctx.save();
      ctx.scale(s, s);
      if (bg) ctx.drawImage(bg.img, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(6, 18, 88, 92);
      ctx.clip();
      const m = ctx.getTransform();
      drawPlantAt(ctx, props.id, m.a, m.e, m.f, props.id === 'monolith');
      ctx.restore();
      ctx.setTransform(m);
      const f = BitmapFont.get(FONTS.cost);
      if (f) f.draw(ctx, String(props.cost), 64, 132, '#000000', 1, 2);
      ctx.restore();
      if (props.dim || props.selected) {
        ctx.fillStyle = props.selected ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
      }
    },
    [ready, props.id, props.cost, s, props.dim, props.selected],
  );
  return <canvas ref={ref} style={{ width: `${w}px`, height: `${h}px` }} />;
}

/** 在当前缩放下把植物画进种子包（坐标为种子包 100×140 空间） */
function drawPlantAt(ctx: CanvasRenderingContext2D, id: string, k: number, ex: number, ey: number, tall: boolean) {
  const skin = PLANT_SKINS[id];
  const def = skin ? PVZ.reanim(skin.reanim) : null;
  if (!skin || !def) return;
  const sc = tall ? 0.85 : 1;
  const base: [number, number, number, number, number, number] = [k * sc, 0, 0, k * sc, ex + (tall ? 22 : 10) * k, ey + (tall ? 16 : 24) * k];
  if (skin.thumb) {
    const r = new Reanim(def);
    if (!r.play(skin.thumb)) r.playAll();
    r.draw(ctx, base, PVZ_IMAGES);
  } else {
    const a = new UnitActor(0, id, def, skin);
    a.body.t = 0;
    for (const h of a.heads) h.r.t = 0;
    a.body.draw(ctx, base, PVZ_IMAGES);
  }
}

/** 位图字体文本（原版字体），按文字宽度自动设定画布大小 */
export function PvzText(props: { font: string; text: string; color?: string; scale?: number; class?: string; style?: Record<string, string | number> }) {
  const ready = useAssets(() => BitmapFont.load(props.font), [props.font]);
  const f = ready ? BitmapFont.get(props.font) : null;
  const s = props.scale ?? 1;
  const w = f ? Math.ceil((f.measure(props.text) + 8) * s) : 10;
  const h = f ? Math.ceil((f.height + 10) * s) : 10;
  const ref = useCanvas(
    w,
    h,
    (ctx) => {
      if (!f) return;
      f.draw(ctx, props.text, 4 * s, (f.ascent + 4) * s, props.color ?? null, 0, s);
    },
    [ready, props.text, props.color, s, w, h],
  );
  return <canvas ref={ref} class={props.class} style={{ width: `${w}px`, height: `${h}px`, ...(props.style ?? {}) }} />;
}

/** 循环播放的植物/僵尸动画（图鉴预览） */
export function LiveActor(props: { kind: 'plant' | 'zombie'; id: string; w: number; h: number; x: number; y: number; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let alive = true;
    void loadReanimFor(props.kind, props.id).then(() => {
      if (!alive) return;
      const c = ref.current;
      if (!c) return;
      let draw: ((ctx: CanvasRenderingContext2D, dt: number) => void) | null = null;
      if (props.kind === 'plant') {
        const skin = PLANT_SKINS[props.id];
        const def = skin ? PVZ.reanim(skin.reanim) : null;
        if (skin && def) {
          const a = new UnitActor(0, props.id, def, skin);
          draw = (ctx, dt) => {
            a.update(dt);
            a.body.draw(ctx, scaleMat(translate(curMat(ctx), props.x, props.y), props.scale ?? 1), PVZ_IMAGES);
          };
        }
      } else {
        const skin = ZOMBIE_SKINS[props.id];
        const def = skin ? PVZ.reanim(skin.reanim) : null;
        if (skin && def) {
          const a = new ZombieActor(0, props.id, def, skin, PVZ.reanim('Zombie_flagpole'));
          const idle = skin.idle && a.body.has(skin.idle) ? skin.idle : a.body.has('anim_idle') ? 'anim_idle' : a.walkAnim;
          a.body.play(idle);
          draw = (ctx, dt) => {
            a.body.update(dt);
            a.body.draw(ctx, scaleMat(translate(curMat(ctx), props.x, props.y), (props.scale ?? 1) * (skin.scale && skin.scale > 1 ? 0.7 : 1)), PVZ_IMAGES);
          };
        }
      }
      if (!draw) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(props.w * dpr);
      c.height = Math.round(props.h * dpr);
      let last = performance.now();
      const loop = (now: number) => {
        if (!alive) return;
        const ctx = c.getContext('2d')!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw!(ctx, Math.min(0.1, (now - last) / 1000));
        last = now;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [props.kind, props.id]);
  return <canvas ref={ref} style={{ width: `${props.w}px`, height: `${props.h}px` }} />;
}

/** 解析原版图鉴描述中的 {KEYWORD}{STAT}{FLAVOR}{SHORTLINE} 标记 */
export function AlmanacText(props: { text: string }) {
  const parts: { cls: string; t: string }[] = [];
  let cls = 'flavor';
  for (const seg of props.text.split(/(\{[A-Z0-9]+\})/)) {
    const m = /^\{([A-Z0-9]+)\}$/.exec(seg);
    if (m) {
      if (m[1] === 'SHORTLINE') parts.push({ cls: 'gap', t: '' });
      else if (m[1] === 'KEYWORD') cls = 'kw';
      else if (m[1] === 'STAT') cls = 'stat';
      else if (m[1] === 'FLAVOR') cls = 'flavor';
      continue;
    }
    if (seg) parts.push({ cls, t: seg.replace(/^\n/, '') });
  }
  return (
    <div class="pvz-almanac-text">
      {parts.map((p) => (p.cls === 'gap' ? <div class="gap" /> : <span class={p.cls}>{p.t}</span>))}
    </div>
  );
}
