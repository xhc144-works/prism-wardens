import type { World } from '../core/sim/world';
import type { Enemy, Unit } from '../core/sim/entities';
import type { FxEvent, FxRecord, Theme, UnitDef } from '../core/types';
import { DT } from '../core/constants';
import { CONTENT } from '../core/content/registry';
import { COMBOS, WEATHER, EVENTS } from '../core/content/environment';
import type { DecisionTrace, Candidate } from '../ai/agent';
import { type Ctx, bolt, glow, rgba, roundRect, shade, star } from './art/common';
import { drawUnit } from './art/units';
import { drawEnemy } from './art/enemies';
import { Particles } from './particles';
import { BOARD_LEFT, BOARD_TOP, CELL_H, CELL_W, THEMES, boardSize, drawNode, drawSentinel, drawTerrain, drawTerrainFx, drawTomb } from './terrain';

import type { BattleRenderer, HoverState, RenderSettings } from './types';
export type { HoverState, RenderSettings } from './types';

interface Banner {
  text: string;
  sub?: string;
  color: string;
  t: number;
  dur: number;
}

interface FlyOrb {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  value: number;
}

/**
 * 战场渲染器。只读取 World 状态并消费表现事件，绝不修改游戏逻辑。
 */
export class Renderer implements BattleRenderer {
  readonly kind = 'procedural' as const;
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  dpr = 1;
  scale = 1;
  ox = 0;
  oy = 0;
  cssW = 0;
  cssH = 0;
  time = 0;
  particles = new Particles();
  banners: Banner[] = [];
  flyOrbs: FlyOrb[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  lightnings: { pts: [number, number][]; t: number; seed: number }[] = [];
  hover: HoverState | null = null;
  aiTrace?: DecisionTrace;
  aiSuggestion?: Candidate;
  showAiOverlay = false;
  settings: RenderSettings = { particles: 'high', damageNumbers: true, showHp: true, screenShake: true, showGrid: false };
  collectTarget = { x: 40, y: -30 };
  onCollectArrive?: (value: number) => void;
  private terrain?: HTMLCanvasElement;
  private terrainKey = '';
  private rainDrops: { x: number; y: number; s: number }[] = [];
  private lastWorld?: World;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 160; i++) this.rainDrops.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 });
  }

  resize(w: World): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(200, Math.floor(rect.width));
    const ch = Math.max(150, Math.floor(rect.height));
    if (cw !== this.cssW || ch !== this.cssH || dpr !== this.dpr) {
      this.cssW = cw;
      this.cssH = ch;
      this.dpr = dpr;
      this.canvas.width = Math.floor(cw * dpr);
      this.canvas.height = Math.floor(ch * dpr);
      this.terrainKey = '';
    }
    const size = boardSize(w.rows, w.cols);
    this.scale = Math.min(cw / size.w, ch / size.h);
    this.ox = (cw - size.w * this.scale) / 2;
    this.oy = (ch - size.h * this.scale) / 2;
  }

  theme(w: World): Theme {
    const t = w.map.theme;
    if (w.level.time === 'night' && t === 'day') return 'night';
    return t;
  }

  /* ---------------------------- 坐标换算 ---------------------------- */

  /** 屏幕(相对画布 CSS 像素) -> 棋盘逻辑坐标 */
  sceneRect(): { x: number; y: number; w: number; h: number; scale: number } {
    return { x: this.ox, y: this.oy, w: this.cssW - this.ox * 2, h: this.cssH - this.oy * 2, scale: this.scale };
  }

  toLogical(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
  }
  toScreen(lx: number, ly: number): { x: number; y: number } {
    return { x: lx * this.scale + this.ox, y: ly * this.scale + this.oy };
  }
  cellAt(px: number, py: number, w: World): { row: number; col: number } | null {
    const { x, y } = this.toLogical(px, py);
    const col = Math.floor((x - BOARD_LEFT) / CELL_W);
    const row = Math.floor((y - BOARD_TOP) / CELL_H);
    if (row < 0 || row >= w.rows || col < 0 || col >= w.cols) return null;
    return { row, col };
  }
  orbAt(px: number, py: number, w: World): number | null {
    const { x, y } = this.toLogical(px, py);
    let best: number | null = null;
    let bd = 46;
    for (const o of w.orbs) {
      const p = this.orbPos(o);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = o.id;
      }
    }
    return best;
  }
  /** 鼠标划过时收集（拖动收集光能） */
  orbsNear(px: number, py: number, w: World, r = 40): number[] {
    const { x, y } = this.toLogical(px, py);
    return w.orbs.filter((o) => {
      const p = this.orbPos(o);
      return Math.hypot(p.x - x, p.y - y) < r;
    }).map((o) => o.id);
  }

  colX(x: number): number {
    return BOARD_LEFT + x * CELL_W;
  }
  rowY(y: number): number {
    return BOARD_TOP + y * CELL_H + CELL_H * 0.82;
  }
  orbPos(o: { x: number; y: number; fromY: number; t: number; fall: number }): { x: number; y: number } {
    const k = o.t < o.fall ? o.t / o.fall : 1;
    const ease = o.fall < 1 ? 1 - Math.pow(1 - k, 2) : k;
    const ry = o.fromY + (o.y - o.fromY) * ease;
    const hop = o.fall < 1 && k < 1 ? -Math.sin(k * Math.PI) * 40 : 0;
    return { x: this.colX(o.x), y: BOARD_TOP + ry * CELL_H + CELL_H * 0.42 + hop };
  }

  /* ---------------------------- 表现事件 ---------------------------- */

  consume(w: World, fx: FxRecord[]): void {
    for (const f of fx) this.onFx(w, f.e);
  }

  banner(text: string, color = '#ffffff', sub?: string, dur = 2.4): void {
    this.banners.push({ text, sub, color, t: 0, dur });
    if (this.banners.length > 3) this.banners.shift();
  }

  private onFx(w: World, e: FxEvent): void {
    const P = this.particles;
    const low = this.settings.particles === 'low';
    const n = (k: number) => (low ? Math.ceil(k / 3) : k);
    switch (e.t) {
      case 'shoot': {
        const x = this.colX(e.x);
        const y = this.rowY(e.row) - 36;
        P.burst(x, y, n(3), { color: projColor(e.kind), speed: 60, life: 0.2, size: 2, additive: true });
        break;
      }
      case 'hit': {
        const x = this.colX(e.x);
        const y = this.rowY(e.row) - 40;
        P.burst(x, y, n(5), { color: projColor(e.kind), speed: 140, life: 0.3, size: 2, kind: 'spark', additive: true });
        if (e.kind === 'fire') P.burst(x, y, n(6), { color: '#ffb347', speed: 80, life: 0.4, size: 4, kind: 'flame', additive: true, gravity: -60 });
        if (this.settings.damageNumbers && e.dmg >= 10) P.spawn({ x: x + (Math.random() - 0.5) * 16, y: y - 20, vy: -50, life: 0.7, max: 0.7, kind: 'text', text: String(e.dmg), size: 13, color: e.kind === 'fire' ? '#ffb347' : '#ffffff', drag: 0.92 });
        break;
      }
      case 'explode': {
        const x = this.colX(e.x);
        const y = this.rowY(e.row) - 30;
        const r = e.radius * CELL_W;
        const col = e.kind === 'steam' ? '#e8f8ff' : e.kind === 'nova' ? '#ffd166' : e.kind === 'meteor' ? '#ff7b39' : '#ff9a5a';
        P.spawn({ x, y, kind: 'ring', size: r * 0.2, grow: r * 3, color: col, life: 0.5, max: 0.5, additive: true });
        P.burst(x, y, n(30), { color: col, speed: r * 3, life: 0.6, size: 5, kind: 'flame', additive: true, drag: 0.92 });
        P.burst(x, y, n(14), { color: 'rgba(60,40,40,0.6)', speed: r * 1.2, life: 1.2, size: 22, kind: 'smoke', drag: 0.94, gravity: -20 });
        P.burst(x, y, n(10), { color: '#5b4636', speed: r * 2.5, life: 0.8, size: 4, kind: 'shard', gravity: 400 });
        this.addShake(e.kind === 'nova' ? 10 : 6);
        if (e.kind === 'nova') {
          this.flash = 0.35;
          this.flashColor = '#fff2b3';
        }
        break;
      }
      case 'lane': {
        const y = this.rowY(e.row) - 30;
        for (let i = 0; i < n(50); i++) P.spawn({ x: this.colX(Math.random() * w.cols), y: y + (Math.random() - 0.5) * 30, vy: -80 - Math.random() * 80, vx: (Math.random() - 0.5) * 30, kind: 'flame', size: 8 + Math.random() * 8, color: Math.random() < 0.5 ? '#ff5d2a' : '#ffc36b', life: 0.9, max: 0.9, additive: true, drag: 0.96 });
        this.addShake(7);
        break;
      }
      case 'freeze':
        this.flash = 0.45;
        this.flashColor = '#bdeaff';
        for (let i = 0; i < n(60); i++) P.spawn({ x: this.colX(Math.random() * w.cols), y: BOARD_TOP + Math.random() * w.rows * CELL_H, kind: 'star', size: 6 + Math.random() * 6, color: '#e0fbff', life: 1.2, max: 1.2, vr: 2, additive: true, vy: 10 });
        break;
      case 'gale':
        for (let i = 0; i < n(50); i++) P.spawn({ x: this.colX(-0.5), y: BOARD_TOP + Math.random() * w.rows * CELL_H, vx: 900 + Math.random() * 400, kind: 'leaf', size: 6, color: Math.random() < 0.5 ? '#caffbf' : '#ffffff', life: 1.2, max: 1.2, vr: 8, drag: 0.995 });
        break;
      case 'place': {
        const x = this.colX(e.col + 0.5);
        const y = this.rowY(e.row);
        P.spawn({ x, y, kind: 'ring', size: 10, grow: 120, color: 'rgba(255,255,255,0.8)', life: 0.35, max: 0.35 });
        P.burst(x, y - 6, n(10), { color: '#e9dcc0', speed: 90, life: 0.45, size: 3, gravity: 200, angle: -Math.PI / 2, spread: Math.PI });
        P.burst(x, y - 40, n(6), { color: '#ffffff', speed: 60, life: 0.6, size: 6, kind: 'star', additive: true });
        break;
      }
      case 'upgrade': {
        const x = this.colX(e.col + 0.5);
        const y = this.rowY(e.row) - 40;
        P.burst(x, y, n(20), { color: '#ffd166', speed: 120, life: 0.8, size: 7, kind: 'star', additive: true, vr: 4 });
        P.spawn({ x, y: y - 40, vy: -40, kind: 'text', text: '★'.repeat(e.rank), size: 18, color: '#ffd166', life: 1, max: 1 });
        break;
      }
      case 'remove':
        P.burst(this.colX(e.col + 0.5), this.rowY(e.row) - 20, n(10), { color: '#bbbbbb', speed: 80, life: 0.5, size: 3, gravity: 200 });
        break;
      case 'unitDie': {
        const d = CONTENT.units.get(e.unit);
        const x = this.colX(e.col + 0.5);
        const y = this.rowY(e.row) - 30;
        P.burst(x, y, n(16), { color: d?.colors.a ?? '#ffffff', speed: 160, life: 0.7, size: 6, kind: 'shard', gravity: 380 });
        break;
      }
      case 'enemyDie': {
        const d = CONTENT.enemies.get(e.enemy);
        const x = this.colX(e.x);
        const y = BOARD_TOP + e.y * CELL_H + CELL_H * 0.82 - 40 * (d?.scale ?? 1);
        P.burst(x, y, n(18), { color: d?.colors.b ?? '#2a2340', speed: 90, life: 0.9, size: 14, kind: 'smoke', drag: 0.95, gravity: -40 });
        P.burst(x, y, n(8), { color: d?.colors.eye ?? '#ff5ec4', speed: 70, life: 1.1, size: 3, additive: true, gravity: -90 });
        if (d?.boss) {
          this.addShake(16);
          this.flash = 0.6;
          this.flashColor = '#ffffff';
        }
        break;
      }
      case 'armorBreak': {
        const x = this.colX(e.x);
        const y = this.rowY(e.row) - (e.kind === 'shield' ? 40 : 80);
        P.burst(x, y, n(12), { color: e.kind === 'helm' ? '#c9a0ff' : '#c0c6cf', speed: 160, life: 0.8, size: 6, kind: 'shard', gravity: 420 });
        break;
      }
      case 'orb':
        break;
      case 'collect': {
        const p = this.orbPos({ x: e.x, y: e.y, fromY: e.y, t: 1, fall: 0 });
        this.flyOrbs.push({ x: p.x, y: p.y, tx: 0, ty: 0, t: 0, value: e.value });
        break;
      }
      case 'coin': {
        const x = this.colX(e.x);
        const y = this.rowY(e.row) - 50;
        P.burst(x, y, 1, { color: '#ffd700', speed: 60, angle: -Math.PI / 2, spread: 0.6, life: 1.2, size: 9, kind: 'dot', gravity: 300, additive: false });
        P.spawn({ x, y: y - 20, vy: -30, kind: 'text', text: '+金币', size: 12, color: '#ffd700', life: 1, max: 1 });
        break;
      }
      case 'wave':
        if (e.flag) this.banner('一大波蚀潮来袭！', '#ff6b9d', `第 ${e.index} 波`, 3);
        else if (e.index === 1) this.banner('蚀潮开始了！', '#ffffff', '守住每一行', 2.2);
        break;
      case 'flagWarn':
        this.banner('大波敌人即将到来', '#ffd166', undefined, 2);
        break;
      case 'weather': {
        const wd = WEATHER[e.id];
        this.banner(`${wd.icon} ${wd.name}`, '#e0fbff', wd.desc, 2.6);
        break;
      }
      case 'event': {
        const def = EVENTS.find((x) => x.id === e.id);
        this.banner(`✦ ${def?.name ?? e.id}`, def?.good ? '#9ef01a' : '#ff6b6b', def?.desc, 2.8);
        break;
      }
      case 'combo': {
        const def = COMBOS.find((c) => c.id === e.id);
        const x = this.colX(e.col + 0.5);
        const y = this.rowY(e.row) - 90;
        P.spawn({ x, y, vy: -30, kind: 'text', text: `组合技·${def?.name ?? e.id}`, size: 15, color: '#ffe066', life: 1.8, max: 1.8 });
        P.burst(x, y + 40, n(14), { color: '#ffe066', speed: 100, life: 0.8, size: 6, kind: 'star', additive: true });
        break;
      }
      case 'lightning': {
        const x = this.colX(e.x);
        const y = this.rowY(e.row) - 30;
        const sx = e.x2 != null ? this.colX(e.x2) : x + (Math.random() - 0.5) * 80;
        const sy = e.row2 != null ? this.rowY(e.row2) - 120 : -20;
        this.lightnings.push({ pts: [[sx, sy], [x, y]], t: 0.3, seed: Math.floor(Math.random() * 1000) });
        P.burst(x, y, n(10), { color: '#e0ecff', speed: 160, life: 0.4, size: 2, kind: 'spark', additive: true });
        this.flash = Math.max(this.flash, 0.15);
        this.flashColor = '#dfe8ff';
        break;
      }
      case 'chain': {
        const pts = e.pts.map((p) => [this.colX(p.x), this.rowY(p.row) - (p === e.pts[0] ? 78 : 40)] as [number, number]);
        this.lightnings.push({ pts, t: 0.22, seed: Math.floor(Math.random() * 1000) });
        break;
      }
      case 'sentinel':
        this.banner('符文哨卫启动！', '#c4b5fd', `第 ${e.row + 1} 行`, 1.6);
        break;
      case 'bite':
        P.burst(this.colX(e.col + 0.8), this.rowY(e.row) - 40, n(3), { color: '#d9f99d', speed: 60, life: 0.3, size: 2.5 });
        break;
      case 'devour':
        P.burst(this.colX(e.col + 1), this.rowY(e.row) - 30, n(16), { color: '#7b2cbf', speed: 120, life: 0.6, size: 10, kind: 'smoke' });
        break;
      case 'boss':
        this.banner(e.text, '#ff4d6d', undefined, 2.6);
        this.addShake(8);
        break;
      case 'text':
        this.banner(e.text, e.color ?? '#ffffff', undefined, 1.8);
        break;
      case 'skill':
        this.flash = 0.2;
        this.flashColor = '#ffffff';
        if (e.id === 'time_warp') this.banner('⌛ 时之沙', '#9bf6ff', undefined, 1.4);
        if (e.id === 'aegis') this.banner('⛨ 守护结界', '#bde0fe', undefined, 1.4);
        if (e.id === 'lumen_rain' || e.id === 'lumen_crystal') for (let i = 0; i < n(30); i++) P.spawn({ x: this.colX(Math.random() * w.cols), y: -10, vy: 300 + Math.random() * 200, kind: 'star', size: 8, color: '#ffe680', life: 1, max: 1, additive: true });
        break;
      case 'heal':
        P.spawn({ x: this.colX(e.col + 0.5) + (Math.random() - 0.5) * 30, y: this.rowY(e.row) - 50, vy: -40, kind: 'text', text: '+', size: 16, color: '#95d5b2', life: 0.8, max: 0.8 });
        break;
      case 'pull': {
        const y = this.rowY(e.row) - 40;
        for (let i = 0; i < n(20); i++) P.spawn({ x: this.colX(Math.random() * w.cols), y: y + (Math.random() - 0.5) * 40, vx: 200, kind: 'spark', size: 2, color: '#e0aaff', life: 0.5, max: 0.5, additive: true });
        break;
      }
      case 'magnet':
        P.burst(this.colX(e.x), this.rowY(e.row) - 70, n(8), { color: '#c0c6cf', speed: 80, life: 0.6, size: 5, kind: 'shard' });
        break;
      case 'splash':
        P.burst(this.colX(e.x), this.rowY(e.row) - 10, n(6), { color: '#a08060', speed: 80, life: 0.4, size: 3, gravity: 300, angle: -Math.PI / 2, spread: Math.PI });
        break;
      case 'end':
        break;
    }
  }

  addShake(v: number): void {
    if (this.settings.screenShake) this.shake = Math.max(this.shake, v);
  }

  /* ---------------------------- 主绘制 ---------------------------- */

  render(w: World, alpha: number, dtReal: number): void {
    if (w !== this.lastWorld) {
      this.lastWorld = w;
      this.terrainKey = '';
      this.particles.list = [];
      this.banners = [];
      this.flyOrbs = [];
    }
    this.resize(w);
    this.time += dtReal;
    this.particles.max = this.settings.particles === 'low' ? 250 : 900;
    this.particles.update(dtReal);
    const ctx = this.ctx;
    const theme = this.theme(w);
    const T = THEMES[theme];

    // 地形缓存
    const key = `${w.map.id}|${theme}|${this.canvas.width}|${this.canvas.height}|${this.scale.toFixed(3)}`;
    if (key !== this.terrainKey) {
      const size = boardSize(w.rows, w.cols);
      const off = document.createElement('canvas');
      const px = this.scale * this.dpr;
      off.width = Math.ceil(size.w * px);
      off.height = Math.ceil(size.h * px);
      const octx = off.getContext('2d')!;
      octx.scale(px, px);
      drawTerrain(octx, w.map, theme);
      this.terrain = off;
      this.terrainKey = key;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = shade(T.sky[0], -0.3);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dtReal * 40);
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.terrain) {
      const size = boardSize(w.rows, w.cols);
      ctx.drawImage(this.terrain, this.ox + sx * this.scale, this.oy + sy * this.scale, size.w * this.scale, size.h * this.scale);
    }
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * (this.ox + sx * this.scale), this.dpr * (this.oy + sy * this.scale));

    const t = this.time;
    drawTerrainFx(ctx, w.map, t);
    this.drawCellFeatures(w, t);
    this.drawHover(w);

    // 实体：按行绘制
    const unitsByRow: Unit[][] = Array.from({ length: w.rows }, () => []);
    for (const u of w.units) if (!u.dead) unitsByRow[u.row]?.push(u);
    const enemiesByRow: Enemy[][] = Array.from({ length: w.rows }, () => []);
    const flying: Enemy[] = [];
    const bosses: Enemy[] = [];
    for (const e of w.enemies) {
      if (e.dead) continue;
      if (e.def.boss === 'king' || e.def.boss === 'tempest') bosses.push(e);
      else if (e.def.flying) flying.push(e);
      else enemiesByRow[Math.max(0, Math.min(w.rows - 1, Math.round(e.y)))]?.push(e);
    }
    for (let r = 0; r < w.rows; r++) {
      drawSentinel(ctx, BOARD_LEFT - 44, this.rowY(r) - 2, t, w.sentinelReady[r]);
      const us = unitsByRow[r].sort((a, b) => (a.layer === 'plate' ? -1 : b.layer === 'plate' ? 1 : a.col - b.col));
      for (const u of us) this.drawUnitEntity(w, u, t);
      const es = enemiesByRow[r].sort((a, b) => b.x - a.x);
      for (const e of es) this.drawEnemyEntity(w, e, t, alpha);
    }
    for (const s of w.sentinels) drawSentinel(ctx, this.colX(s.x), this.rowY(s.row) - 2, t, true, true);
    for (const e of bosses) this.drawEnemyEntity(w, e, t, alpha);
    for (const e of flying) this.drawEnemyEntity(w, e, t, alpha);

    this.drawCombos(w, t);
    this.drawProjectiles(w, alpha);
    this.particles.draw(ctx, false);
    ctx.globalCompositeOperation = 'lighter';
    this.particles.draw(ctx, true);
    ctx.globalCompositeOperation = 'source-over';
    this.drawLightning(dtReal);

    this.drawWeather(w, t, dtReal, theme);
    this.drawOrbs(w, t);
    if (this.showAiOverlay) this.drawAiOverlay(w, t);
    this.drawFlyOrbs(dtReal);

    // 闪光
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.flash > 0) {
      ctx.fillStyle = rgba(this.flashColor.startsWith('#') ? this.flashColor : '#ffffff', Math.min(0.6, this.flash));
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      this.flash = Math.max(0, this.flash - dtReal * 1.5);
    }
    this.drawBossBar(w);
    this.drawBanners(dtReal);
  }

  private drawCellFeatures(w: World, t: number): void {
    const ctx = this.ctx;
    for (let r = 0; r < w.rows; r++)
      for (let c = 0; c < w.cols; c++) {
        const cell = w.grid[r][c];
        const x = this.colX(c + 0.5);
        const y = this.rowY(r);
        if (cell.node) drawNode(ctx, x, y, t);
        if (cell.tomb) drawTomb(ctx, x, y, t);
        if (cell.arrow) {
          ctx.save();
          ctx.translate(x, BOARD_TOP + r * CELL_H + CELL_H / 2);
          ctx.fillStyle = 'rgba(255,230,120,0.55)';
          ctx.beginPath();
          const d = cell.arrow;
          ctx.moveTo(-12, -8 * d);
          ctx.lineTo(0, 16 * d);
          ctx.lineTo(12, -8 * d);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        if (cell.crack > 0) {
          ctx.strokeStyle = 'rgba(30,20,10,0.75)';
          ctx.lineWidth = 3;
          const bx = BOARD_LEFT + c * CELL_W;
          const by = BOARD_TOP + r * CELL_H;
          ctx.beginPath();
          ctx.moveTo(bx + 10, by + 20);
          ctx.lineTo(bx + 40, by + 55);
          ctx.lineTo(bx + 30, by + 90);
          ctx.moveTo(bx + 40, by + 55);
          ctx.lineTo(bx + 85, by + 70);
          ctx.stroke();
        }
        if (cell.iceTrail > 0) {
          ctx.fillStyle = 'rgba(220,245,255,0.45)';
          ctx.fillRect(BOARD_LEFT + c * CELL_W + 4, BOARD_TOP + r * CELL_H + CELL_H * 0.55, CELL_W - 8, CELL_H * 0.35);
        }
      }
    if (this.settings.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= w.rows; r++) {
        ctx.beginPath();
        ctx.moveTo(BOARD_LEFT, BOARD_TOP + r * CELL_H);
        ctx.lineTo(BOARD_LEFT + w.cols * CELL_W, BOARD_TOP + r * CELL_H);
        ctx.stroke();
      }
      for (let c = 0; c <= w.cols; c++) {
        ctx.beginPath();
        ctx.moveTo(BOARD_LEFT + c * CELL_W, BOARD_TOP);
        ctx.lineTo(BOARD_LEFT + c * CELL_W, BOARD_TOP + w.rows * CELL_H);
        ctx.stroke();
      }
    }
  }

  private drawHover(w: World): void {
    const h = this.hover;
    if (!h) return;
    const ctx = this.ctx;
    const col = h.valid ? 'rgba(120,255,160,' : 'rgba(255,90,90,';
    const cells: [number, number][] = [];
    if (h.area === 'row') for (let c = 0; c < w.cols; c++) cells.push([h.row, c]);
    else if (h.area === '3x3') {
      for (let r = h.row - 1; r <= h.row + 1; r++) for (let c = h.col - 1; c <= h.col + 1; c++) if (w.inBounds(r, c)) cells.push([r, c]);
    } else cells.push([h.row, h.col]);
    for (const [r, c] of cells) {
      ctx.fillStyle = col + '0.18)';
      ctx.fillRect(BOARD_LEFT + c * CELL_W + 2, BOARD_TOP + r * CELL_H + 2, CELL_W - 4, CELL_H - 4);
    }
    ctx.strokeStyle = col + '0.8)';
    ctx.lineWidth = 2.5;
    roundRect(ctx, BOARD_LEFT + h.col * CELL_W + 3, BOARD_TOP + h.row * CELL_H + 3, CELL_W - 6, CELL_H - 6, 10);
    ctx.stroke();
    if (h.def && h.mode === 'place' && h.valid) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.translate(this.colX(h.col + 0.5), this.rowY(h.row));
      drawUnit(ctx, { def: h.def, t: this.time, anim: 0, rank: 1, seed: 0, armed: true });
      ctx.restore();
      // 射程示意
      if (h.def.behavior === 'shooter' || h.def.behavior === 'lobber') {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.setLineDash([8, 8]);
        ctx.lineWidth = 2;
        for (const l of h.def.lanes ?? [0]) {
          const r = h.row + l;
          if (r < 0 || r >= w.rows) continue;
          const y = this.rowY(r) - 36;
          ctx.beginPath();
          ctx.moveTo(this.colX(h.col + 0.8), y);
          ctx.lineTo(this.colX(w.cols), y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }

  private drawUnitEntity(w: World, u: Unit, t: number): void {
    const ctx = this.ctx;
    const x = this.colX(u.col + 0.5);
    let y = this.rowY(u.row);
    const onPlate = u.layer === 'main' && !!w.grid[u.row][u.col].plate;
    if (onPlate) y -= 8 + Math.sin(t * 1.8 + u.id) * 2;
    ctx.save();
    ctx.translate(x, y);
    if (u.layer === 'instant') ctx.globalAlpha = 0.95;
    const animMax = u.def.behavior === 'devourer' ? 14 : u.def.behavior === 'producer' || u.def.behavior === 'upgradeProducer' ? 10 : 8;
    drawUnit(ctx, {
      def: u.def,
      t,
      anim: u.layer === 'instant' ? 1 - Math.max(0, u.fuse) / Math.max(0.01, u.def.fuse ?? 1) : u.anim / animMax,
      rank: u.rank,
      armed: u.armed,
      digest: u.digest,
      hpRatio: u.hp / u.maxHp,
      seed: u.id * 1.7,
    });
    if (u.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -36, 40, '#ff8080', 0.25);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (u.overcharge > 0) glow(ctx, 0, -40, 44, '#80ffdb', 0.35 + Math.sin(t * 12) * 0.1);
    if (u.shield > 0) {
      ctx.strokeStyle = 'rgba(190,230,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -40, 36, 46, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (w.aegis > 0 && !u.relic && u.layer !== 'instant') {
      ctx.strokeStyle = `rgba(189,224,254,${0.5 + Math.sin(t * 8) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -40, 42, Math.PI, Math.PI * 2);
      ctx.stroke();
    }
    if (this.settings.showHp && u.hp < u.maxHp && u.layer !== 'instant') {
      const k = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-26, 6, 52, 5);
      ctx.fillStyle = k > 0.5 ? '#7bed9f' : k > 0.25 ? '#ffd166' : '#ff6b6b';
      ctx.fillRect(-26, 6, 52 * k, 5);
    }
    if (u.def.behavior === 'mine' && !u.armed) {
      const k = 1 - u.armTimer / (u.def.armTime ?? 14);
      ctx.strokeStyle = 'rgba(255,210,122,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -12, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEnemyEntity(w: World, e: Enemy, t: number, alpha: number): void {
    const ctx = this.ctx;
    let ex = e.x;
    if (e.state === 'walk' && e.freeze <= 0 && e.stun <= 0) ex += e.dir * e.def.speed * e.speedMul * alpha * DT * (e.slow > 0 ? e.slowMul : 1);
    const x = this.colX(ex);
    let y = BOARD_TOP + e.y * CELL_H + CELL_H * 0.82;
    if (e.def.boss === 'king' && e.rowSpan) y = BOARD_TOP + (e.rowSpan[1] + 1) * CELL_H - 6;
    const visible = w.isVisible(e);
    ctx.save();
    ctx.translate(x, y);
    if (!visible) ctx.globalAlpha = 0.06;
    if (e.flash > 0) ctx.filter = 'brightness(1.8)';
    drawEnemy(ctx, {
      def: e.def,
      t: t + e.anim,
      state: e.state,
      armor: e.armorMax > 0 ? e.armor / e.armorMax : 0,
      hasArmor: e.armor > 0,
      metal: e.metal,
      dir: e.dir,
      slow: e.slow > 0,
      frozen: e.freeze > 0,
      stunned: e.stun > 0,
      hidden: e.hidden,
      submerged: e.submerged,
      burrowed: e.burrowed,
      berserk: e.berserk,
      hpRatio: e.hp / e.maxHp,
      seed: e.id * 2.3,
      thrown: e.thrown,
      bossPhase: e.boss?.phase,
      bossMode: e.boss?.mode,
    });
    ctx.filter = 'none';
    if (this.settings.showHp && visible && !e.def.boss && (e.hp < e.maxHp || e.armor < e.armorMax) && !e.burrowed && !e.submerged) {
      const total = e.maxHp + e.armorMax;
      const sc = e.def.scale;
      const top = (e.def.flying ? -116 : -96) * sc;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-22, top, 44, 5);
      ctx.fillStyle = '#ff5e7a';
      ctx.fillRect(-22, top, 44 * (Math.max(0, e.hp) / total), 5);
      ctx.fillStyle = '#c0c6cf';
      ctx.fillRect(-22 + 44 * (Math.max(0, e.hp) / total), top, 44 * (e.armor / total), 5);
    }
    ctx.restore();
  }

  private drawProjectiles(w: World, alpha: number): void {
    const ctx = this.ctx;
    for (const p of w.projectiles) {
      if (p.dead) continue;
      let x: number;
      let y: number;
      if (p.lob) {
        const L = p.lob;
        const k = Math.min(1, (L.t + alpha * DT) / L.dur);
        x = this.colX(L.sx + (L.tx - L.sx) * k);
        const y0 = this.rowY(p.fromRow) - 60;
        const y1 = this.rowY(L.trow) - 40;
        y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * L.h * CELL_H;
      } else if (p.enemyShot) {
        const k = Math.min(1, p.age / 1.0);
        x = this.colX(p.x + p.vx * k);
        y = this.rowY(p.row) - 50 - Math.sin(k * Math.PI) * 120;
      } else {
        x = this.colX(p.x + p.vx * alpha * DT);
        const k = Math.min(1, p.age * 6);
        const ry = p.fromRow + (p.row - p.fromRow) * k;
        y = this.rowY(ry) - 38;
        if (p.miss) y += Math.sin(p.age * 30) * 6;
      }
      drawProjectile(ctx, p.kind, x, y, this.time, p.vx);
    }
  }

  private drawCombos(w: World, t: number): void {
    if (!w.activeCombos.length) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const c of w.activeCombos) {
      const a = w.unitById(c.a);
      const b = w.unitById(c.b);
      if (!a || !b) continue;
      const x1 = this.colX(a.col + 0.5);
      const y1 = this.rowY(a.row) - 30;
      const x2 = this.colX(b.col + 0.5);
      const y2 = this.rowY(b.row) - 30;
      ctx.strokeStyle = `rgba(255,224,102,${0.18 + Math.sin(t * 3 + c.a) * 0.08})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawLightning(dt: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of this.lightnings) {
      ctx.strokeStyle = `rgba(200,220,255,${Math.min(1, l.t * 5)})`;
      ctx.lineWidth = 3;
      for (let i = 0; i + 1 < l.pts.length; i++) bolt(ctx, l.pts[i][0], l.pts[i][1], l.pts[i + 1][0], l.pts[i + 1][1], l.seed + i * 17 + Math.floor(this.time * 30));
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, l.t * 5)})`;
      ctx.lineWidth = 1.2;
      for (let i = 0; i + 1 < l.pts.length; i++) bolt(ctx, l.pts[i][0], l.pts[i][1], l.pts[i + 1][0], l.pts[i + 1][1], l.seed + i * 17 + Math.floor(this.time * 30));
      l.t -= dt;
    }
    this.lightnings = this.lightnings.filter((l) => l.t > 0);
    ctx.restore();
  }

  private drawOrbs(w: World, t: number): void {
    const ctx = this.ctx;
    for (const o of w.orbs) {
      const p = this.orbPos(o);
      const left = o.fall + o.life - o.t;
      const blink = left < 3 ? (Math.sin(t * 16) > 0 ? 1 : 0.35) : 1;
      const r = 13 + Math.min(10, o.value / 6);
      ctx.save();
      ctx.globalAlpha = blink;
      glow(ctx, p.x, p.y, r * 2.4, '#ffe680', 0.55);
      ctx.translate(p.x, p.y);
      ctx.rotate(t * 1.2 + o.id);
      ctx.fillStyle = 'rgba(255,240,170,0.6)';
      star(ctx, 0, 0, r * 1.5, 8, 0.4);
      ctx.fill();
      const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, '#fff3b0');
      g.addColorStop(1, '#f4a300');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawFlyOrbs(dt: number): void {
    const ctx = this.ctx;
    // 目标：画布左上角的光能计数器（逻辑坐标）
    const target = this.toLogical(this.collectTarget.x, this.collectTarget.y);
    for (const f of this.flyOrbs) {
      f.t += dt * 1.8;
      const k = Math.min(1, f.t);
      const e = 1 - Math.pow(1 - k, 3);
      const x = f.x + (target.x - f.x) * e;
      const y = f.y + (target.y - f.y) * e - Math.sin(k * Math.PI) * 60;
      glow(ctx, x, y, 22, '#ffe680', 0.6 * (1 - k * 0.5));
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(x, y, 9 * (1 - k * 0.4), 0, Math.PI * 2);
      ctx.fill();
      if (k >= 1) this.onCollectArrive?.(f.value);
    }
    this.flyOrbs = this.flyOrbs.filter((f) => f.t < 1);
  }

  private drawWeather(w: World, t: number, dt: number, theme: Theme): void {
    const ctx = this.ctx;
    const size = boardSize(w.rows, w.cols);
    const id = w.weather.id;
    const dark = THEMES[theme].dark + (w.weather.dark ? 0.35 : 0) + (id === 'storm' ? 0.15 : 0);
    if (dark > 0) {
      ctx.fillStyle = `rgba(8,12,40,${Math.min(0.6, dark)})`;
      ctx.fillRect(0, 0, size.w, size.h);
      // 光源
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const u of w.units) {
        if (u.dead) continue;
        const r = u.def.behavior === 'lantern' ? 160 : 50;
        glow(ctx, this.colX(u.col + 0.5), this.rowY(u.row) - 40, r, u.def.colors.glow, u.def.behavior === 'lantern' ? 0.35 : 0.12);
      }
      for (const o of w.orbs) {
        const p = this.orbPos(o);
        glow(ctx, p.x, p.y, 50, '#ffe680', 0.2);
      }
      ctx.restore();
    }
    if (id === 'rain' || id === 'storm') {
      ctx.strokeStyle = 'rgba(200,220,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        d.y += dt * 1.6 * d.s;
        d.x += dt * 0.15 * d.s;
        if (d.y > 1) {
          d.y -= 1;
          d.x = Math.random();
        }
        const x = (d.x % 1) * size.w;
        const y = d.y * size.h;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y - 18 * d.s);
      }
      ctx.stroke();
    } else if (id === 'blizzard') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const d of this.rainDrops) {
        d.y += dt * 0.25 * d.s;
        d.x += dt * 0.12 * d.s + Math.sin(t + d.s * 10) * 0.0005;
        if (d.y > 1) {
          d.y -= 1;
          d.x = Math.random();
        }
        ctx.beginPath();
        ctx.arc((d.x % 1) * size.w, d.y * size.h, 2 * d.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(220,240,255,0.12)';
      ctx.fillRect(0, 0, size.w, size.h);
    } else if (id === 'sandstorm') {
      ctx.fillStyle = 'rgba(210,170,110,0.18)';
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.fillStyle = 'rgba(230,200,140,0.6)';
      for (const d of this.rainDrops) {
        d.x += dt * 0.5 * d.s;
        d.y += Math.sin(t * 2 + d.s * 9) * dt * 0.05;
        if (d.x > 1) d.x -= 1;
        ctx.fillRect((d.x % 1) * size.w, ((d.y % 1) + 1) % 1 * size.h, 3, 1.5);
      }
    } else if (id === 'sunny') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const x = 200 + i * 260 + Math.sin(t * 0.3 + i) * 30;
        const g = ctx.createLinearGradient(x, 0, x - 120, size.h);
        g.addColorStop(0, 'rgba(255,240,180,0.18)');
        g.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 30, 0);
        ctx.lineTo(x + 30, 0);
        ctx.lineTo(x - 80, size.h);
        ctx.lineTo(x - 200, size.h);
        ctx.fill();
      }
      ctx.restore();
    } else if (id === 'eclipse') {
      const g = ctx.createRadialGradient(size.w / 2, size.h / 2, size.h * 0.3, size.w / 2, size.h / 2, size.w * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(80,0,20,0.4)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size.w, size.h);
    }
    if (w.weather.fog && w.fogClear <= 0 && !w.config.options?.fullVision) this.drawFog(w, t);
    if (w.timeWarp > 0) {
      ctx.fillStyle = 'rgba(155,246,255,0.08)';
      ctx.fillRect(0, 0, size.w, size.h);
    }
  }

  private drawFog(w: World, t: number): void {
    const ctx = this.ctx;
    const size = boardSize(w.rows, w.cols);
    const fx = this.colX(w.fogStart);
    const off = document.createElement('canvas');
    off.width = Math.ceil(size.w / 4);
    off.height = Math.ceil(size.h / 4);
    const o = off.getContext('2d')!;
    o.scale(0.25, 0.25);
    const g = o.createLinearGradient(fx - 60, 0, fx + 60, 0);
    g.addColorStop(0, 'rgba(200,215,210,0)');
    g.addColorStop(1, 'rgba(200,215,210,0.92)');
    o.fillStyle = g;
    o.fillRect(fx - 60, 0, size.w - fx + 60, size.h);
    for (let i = 0; i < 10; i++) {
      const cx = fx + ((i * 97 + t * 12) % (size.w - fx + 100));
      const cy = (i * 61) % size.h;
      const rg = o.createRadialGradient(cx, cy, 0, cx, cy, 120);
      rg.addColorStop(0, 'rgba(230,240,235,0.35)');
      rg.addColorStop(1, 'rgba(230,240,235,0)');
      o.fillStyle = rg;
      o.fillRect(cx - 120, cy - 120, 240, 240);
    }
    o.globalCompositeOperation = 'destination-out';
    for (const u of w.units) {
      if (u.dead || u.def.behavior !== 'lantern') continue;
      const cx = this.colX(u.col + 0.5);
      const cy = this.rowY(u.row) - 40;
      const rr = ((u.def.radius ?? 2) + 0.5) * CELL_W;
      const rg = o.createRadialGradient(cx, cy, rr * 0.4, cx, cy, rr);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = rg;
      o.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    ctx.drawImage(off, 0, 0, size.w, size.h);
  }

  private drawAiOverlay(w: World, t: number): void {
    const ctx = this.ctx;
    const tr = this.aiTrace;
    if (tr) {
      for (const l of tr.lanes) {
        const y = BOARD_TOP + l.row * CELL_H + 8;
        const x = BOARD_LEFT + w.cols * CELL_W + 10;
        const k = Math.min(1, l.pressure / 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, x, y, 118, 40, 6);
        ctx.fill();
        ctx.fillStyle = l.emergency ? '#ff4d6d' : k > 0.66 ? '#ffb347' : k > 0.33 ? '#ffe066' : '#7bed9f';
        ctx.fillRect(x + 6, y + 26, 106 * k, 7);
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`压力 ${l.pressure.toFixed(2)}`, x + 6, y + 13);
        ctx.fillText(`${l.dps}/${l.need} dps`, x + 62, y + 13);
      }
      const act = tr.chosen[0];
      const cmd = act?.cmd ?? this.aiSuggestion?.cmd;
      if (cmd && (cmd.type === 'place' || cmd.type === 'upgrade')) {
        const x = this.colX(cmd.col + 0.5);
        const y = BOARD_TOP + cmd.row * CELL_H;
        ctx.strokeStyle = `rgba(128,255,219,${0.6 + Math.sin(t * 8) * 0.3})`;
        ctx.lineWidth = 3;
        roundRect(ctx, x - CELL_W / 2 + 4, y + 4, CELL_W - 8, CELL_H - 8, 10);
        ctx.stroke();
      }
    }
    if (this.aiSuggestion && this.aiSuggestion.cmd.type === 'place') {
      const c = this.aiSuggestion.cmd;
      const def = CONTENT.units.get(c.card);
      if (def) {
        ctx.save();
        ctx.globalAlpha = 0.45 + Math.sin(t * 5) * 0.15;
        ctx.translate(this.colX(c.col + 0.5), this.rowY(c.row));
        drawUnit(ctx, { def, t, anim: 0, rank: 1, seed: 0, armed: true });
        ctx.restore();
        ctx.fillStyle = '#80ffdb';
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AI 建议', this.colX(c.col + 0.5), BOARD_TOP + c.row * CELL_H + 16);
      }
    }
  }

  private drawBossBar(w: World): void {
    const boss = w.bossIds.map((id) => w.enemyById(id)).find(Boolean);
    if (!boss) return;
    const ctx = this.ctx;
    const bw = Math.min(520, this.cssW * 0.5);
    const x = (this.cssW - bw) / 2;
    const y = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x - 6, y - 4, bw + 12, 30, 8);
    ctx.fill();
    const k = Math.max(0, boss.hp / boss.maxHp);
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    g.addColorStop(0, '#ff006e');
    g.addColorStop(1, '#8338ec');
    ctx.fillStyle = g;
    roundRect(ctx, x, y + 12, bw * k, 9, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${boss.def.name}  ${Math.ceil(boss.hp)} / ${Math.round(boss.maxHp)}${boss.boss ? `  ·  阶段 ${boss.boss.phase}` : ''}`, this.cssW / 2, y + 8);
  }

  private drawBanners(dt: number): void {
    const ctx = this.ctx;
    let i = 0;
    for (const b of this.banners) {
      b.t += dt;
      const k = b.t / b.dur;
      const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
      const y = this.cssH * 0.3 + i * 64;
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      ctx.font = `900 ${Math.round(Math.min(40, this.cssW / 26))}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      const sc = 1 + Math.max(0, 0.15 - b.t) * 2;
      ctx.save();
      ctx.translate(this.cssW / 2, y);
      ctx.scale(sc, sc);
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, 0, 0);
      if (b.sub) {
        ctx.font = `600 ${Math.round(Math.min(16, this.cssW / 70))}px "Microsoft YaHei", sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeText(b.sub, 0, 26);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(b.sub, 0, 26);
      }
      ctx.restore();
      i++;
    }
    ctx.globalAlpha = 1;
    this.banners = this.banners.filter((b) => b.t < b.dur);
  }
}

export function projColor(kind: string): string {
  switch (kind) {
    case 'frost':
      return '#bdf3ff';
    case 'fire':
      return '#ff9a3c';
    case 'steam':
      return '#f0f8ff';
    case 'thorn':
      return '#a7c957';
    case 'rock':
      return '#c49a6c';
    case 'meteor':
      return '#ffbe0b';
    case 'moon':
      return '#d6dbff';
    default:
      return '#8fe3ff';
  }
}

export function drawProjectile(ctx: Ctx, kind: string, x: number, y: number, t: number, vx: number): void {
  const c = projColor(kind);
  const dir = vx < 0 ? -1 : 1;
  switch (kind) {
    case 'fire': {
      glow(ctx, x, y, 22, '#ff7b00', 0.6);
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#ff5d2a', '#ff9a3c', '#ffd27a', '#fff3b0'][i];
        ctx.beginPath();
        ctx.ellipse(x - dir * (12 - i * 3), y + Math.sin(t * 30 + i) * 2, 12 - i * 2.5, 6 - i, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'frost':
      glow(ctx, x, y, 18, '#9ee6ff', 0.55);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 8);
      ctx.fillStyle = '#ffffff';
      star(ctx, 0, 0, 8, 6, 0.4);
      ctx.fill();
      ctx.restore();
      break;
    case 'steam':
      glow(ctx, x, y, 24, '#ffffff', 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(x - dir * i * 7, y + Math.sin(t * 20 + i) * 3, 8 - i * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'thorn':
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 20);
      ctx.fillStyle = c;
      star(ctx, 0, 0, 10, 4, 0.3);
      ctx.fill();
      ctx.restore();
      break;
    case 'rock':
      ctx.fillStyle = '#8a6a4a';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'meteor':
      glow(ctx, x, y, 30, '#ff7b00', 0.7);
      ctx.fillStyle = '#ffbe0b';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a3b0a';
      ctx.beginPath();
      ctx.arc(x + 2, y + 2, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'moon':
      glow(ctx, x, y, 18, '#c8ceff', 0.5);
      ctx.fillStyle = '#eef0ff';
      ctx.beginPath();
      ctx.arc(x, y, 8, Math.PI * 0.3, Math.PI * 1.7, dir < 0);
      ctx.arc(x + 4 * dir, y, 6, Math.PI * 1.65, Math.PI * 0.35, dir > 0);
      ctx.fill();
      break;
    default: {
      const g = ctx.createLinearGradient(x - dir * 26, y, x, y);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(1, rgba(c, 0.8));
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(x, x - dir * 26), y - 3, 26, 6);
      glow(ctx, x, y, 16, c, 0.6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
