/**
 * 经典皮肤战场渲染器：使用玩家本地导入的原版资源（背景、骨骼动画、粒子、文字图片），
 * 按原版 800×600 场景坐标绘制；只读取 World 状态，绝不修改游戏逻辑。
 */
import type { World } from '../../core/sim/world';
import type { Enemy, Unit } from '../../core/sim/entities';
import type { FxEvent, FxRecord } from '../../core/types';
import { DT } from '../../core/constants';
import { CONTENT } from '../../core/content/registry';
import { COMBOS, EVENTS, WEATHER } from '../../core/content/environment';
import type { DecisionTrace, Candidate } from '../../ai/agent';
import { PVZ, PVZ_IMAGES } from '../../pvz/assets';
import { IDENTITY, Reanim, type Mat, mul, scaleMat, translate } from '../../pvz/reanim';
import { PvzParticles } from '../../pvz/particles';
import { BitmapFont, FONTS } from '../../pvz/font';
import { Particles } from '../particles';
import { bolt } from '../art/common';
import type { BattleRenderer, HoverState, RenderSettings } from '../types';
import { type ClassicLayout, BG_OFFSET, CELL_W, LAWN_X, cellX, cellY, groundY, makeLayout, slope } from './layout';
import { packetCanvas } from './packets';
import { PLANT_SKINS, PROJECTILE_SKINS, ZOMBIE_SKINS } from './skins';
import { UnitActor, ZombieActor, isExplosiveSource, preloadForWorld } from './actors';

interface Banner {
  image?: string;
  text?: string;
  sub?: string;
  color: string;
  t: number;
  dur: number;
}

interface FlySun {
  r: Reanim | null;
  x: number;
  y: number;
  t: number;
  value: number;
  scale: number;
}

interface FireLane {
  row: number;
  t: number;
  flames: Reanim[];
}

const PARTICLE_PRELOAD = ['PeaSplat', 'SnowPeaSplat', 'CabbageSplat', 'melonimpact', 'StarSplat', 'ButterSplat', 'Powie', 'PotatoMine', 'JackExplode', 'Doom', 'ZombieHead', 'ZombieArm', 'ZombieTrafficCone', 'ZombiePail', 'ZombieDoor', 'ZombieNewspaper', 'ZombieFlag', 'Planting', 'PlantingPool', 'PoolSplash', 'IceTrap', 'MowerCloud', 'WallnutEatSmall', 'WallnutEatLarge', 'ZombieRise', 'GraveStoneRise', 'SnowPeaPuff', 'DiggerRise', 'DancerRise', 'ZamboniExplosion', 'CatapultExplosion', 'BossExplosion', 'Pow', 'MindControl', 'LanternShine', 'FumeCloud'];

export class ClassicRenderer implements BattleRenderer {
  readonly kind = 'classic' as const;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  scale = 1;
  ox = 0;
  oy = 0;
  cssW = 0;
  cssH = 0;
  time = 0;
  L!: ClassicLayout;
  settings: RenderSettings = { particles: 'high', damageNumbers: false, showHp: false, screenShake: true, showGrid: false };
  showAiOverlay = false;
  aiTrace?: DecisionTrace;
  aiSuggestion?: Candidate;
  hover: HoverState | null = null;
  collectTarget = { x: 40, y: 30 };
  onCollectArrive?: (value: number) => void;

  private units = new Map<number, UnitActor>();
  private zombies = new Map<number, ZombieActor>();
  private zombieLastHit = new Map<number, string>();
  private corpses: ZombieActor[] = [];
  private pfx = new PvzParticles();
  private sparks = new Particles();
  private banners: Banner[] = [];
  private suns = new Map<number, Reanim>();
  private flySuns: FlySun[] = [];
  private fireLanes: FireLane[] = [];
  private projFx = new Map<number, Reanim>();
  private mowers = new Map<number, Reanim>();
  private lightnings: { pts: [number, number][]; t: number; seed: number }[] = [];
  /** 被蹦极僵尸抓走、正在升空的植物 */
  private carried: { a: UnitActor; x: number; y: number; t: number }[] = [];
  private start: Reanim | null = null;
  private startPlayed = false;
  private shake = 0;
  private flash = 0;
  private flashColor = '#ffffff';
  private lastWorld?: World;
  private ready = false;
  private rainDrops: { x: number; y: number; s: number }[] = [];
  private lastWaveShown = -1;
  private base: Mat = [1, 0, 0, 1, 0, 0];
  /** 经典 HUD：当前选中的工具与鼠标位置（由战斗界面设置） */
  hudState: { selected: { kind: string; id?: string } | null; mouse: { x: number; y: number } | null } = { selected: null, mouse: null };
  private sunPulse = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 160; i++) this.rainDrops.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 });
  }

  /* ---------------------------- 坐标 ---------------------------- */

  resize(): void {
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
    }
    const L = this.L;
    // 宽屏时按高度适配并露出更多背景（房子与街道），窄屏时按宽度适配
    this.scale = cw / ch >= L.viewW / L.viewH ? ch / L.viewH : cw / L.viewW;
    this.ox = (cw - L.viewW * this.scale) / 2;
    this.oy = (ch - L.viewH * this.scale) / 2;
  }

  sceneRect(): { x: number; y: number; w: number; h: number; scale: number } {
    return { x: this.ox, y: this.oy, w: (this.L?.viewW ?? 800) * this.scale, h: (this.L?.viewH ?? 600) * this.scale, scale: this.scale };
  }

  toLogical(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
  }

  cellAt(px: number, py: number, w: World): { row: number; col: number } | null {
    if (!this.L) return null;
    const { x, y } = this.toLogical(px, py);
    const col = Math.floor((x - LAWN_X) / CELL_W);
    if (col < 0 || col >= w.cols) return null;
    const row = Math.floor((y - cellY(this.L, 0, col)) / this.L.rowH);
    if (row < 0 || row >= w.rows) return null;
    return { row, col };
  }

  /** 模拟中的列坐标 -> 场景 x */
  colX(x: number): number {
    return LAWN_X + x * CELL_W;
  }

  orbPos(o: { x: number; y: number; fromY: number; t: number; fall: number }): { x: number; y: number } {
    const k = o.t < o.fall ? o.t / o.fall : 1;
    const ease = o.fall < 1 ? 1 - Math.pow(1 - k, 2) : k;
    const ry = o.fromY + (o.y - o.fromY) * ease;
    const hop = o.fall < 1 && k < 1 ? -Math.sin(k * Math.PI) * 50 : 0;
    const col = Math.max(0, o.x - 0.5);
    return { x: this.colX(o.x), y: cellY(this.L, 0, col) + ry * this.L.rowH + this.L.rowH * 0.45 + hop };
  }

  orbAt(px: number, py: number, w: World): number | null {
    const { x, y } = this.toLogical(px, py);
    let best: number | null = null;
    let bd = 50;
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

  orbsNear(px: number, py: number, w: World, r = 40): number[] {
    const { x, y } = this.toLogical(px, py);
    return w.orbs.filter((o) => {
      const p = this.orbPos(o);
      return Math.hypot(p.x - x, p.y - y) < r / this.scale + 20;
    }).map((o) => o.id);
  }

  /* ---------------------------- 事件 ---------------------------- */

  consume(w: World, fx: FxRecord[]): void {
    if (!this.L) this.L = makeLayout(w);
    for (const f of fx) this.onFx(w, f.e);
  }

  banner(text: string, color = '#ffffff', sub?: string, dur = 2.4): void {
    this.banners.push({ text, sub, color, t: 0, dur });
    if (this.banners.length > 3) this.banners.shift();
  }

  private hitPos(x: number, row: number): { x: number; y: number } {
    return { x: this.colX(x), y: groundY(this.L, row, x) - 50 };
  }

  private onFx(w: World, e: FxEvent): void {
    const L = this.L;
    switch (e.t) {
      case 'shoot': {
        this.units.get(e.unit)?.onShoot();
        const u = w.unitById(e.unit);
        if (u && (e.kind === 'fume' || e.kind === 'spore')) {
          const x = cellX(L, u.col) + (e.kind === 'fume' ? 95 : 70);
          const y = cellY(L, u.row, u.col) + (e.kind === 'fume' ? 55 : 62);
          this.pfx.spawn(e.kind === 'fume' ? 'FumeCloud' : 'PuffShroomMuzzle', x, y);
        }
        break;
      }
      case 'hit': {
        const p = this.hitPos(e.x, e.row);
        const HIT: Record<string, string> = {
          frost: 'SnowPeaSplat',
          rock: 'CabbageSplat',
          meteor: 'melonimpact',
          icemeteor: 'WinterMelonImpact',
          moon: 'StarSplat',
          thorn: 'StarSplat',
          fire: 'Pow',
          spore: 'PuffSplat',
          kernel: 'KernelSplat',
          butter: 'ButterSplat',
        };
        const lobbed = e.kind === 'rock' || e.kind === 'meteor' || e.kind === 'icemeteor' || e.kind === 'kernel' || e.kind === 'butter';
        if (e.kind !== 'steam' && e.kind !== 'fume') this.pfx.spawn(HIT[e.kind] ?? 'PeaSplat', p.x, p.y + (lobbed ? 10 : 0));
        if (e.kind === 'fire') this.sparks.burst(p.x, p.y, 8, { color: '#ffb347', speed: 90, life: 0.4, size: 4, kind: 'flame', additive: true, gravity: -60 });
        break;
      }
      case 'explode': {
        const x = this.colX(e.x);
        const y = groundY(L, e.row, e.x) - 40;
        if (e.kind === 'nova') {
          this.pfx.spawn('Powie', x, y);
          this.addShake(10);
        } else if (e.kind === 'mine') {
          this.pfx.spawn('PotatoMine', x, y + 20);
          this.addShake(6);
        } else if (e.kind === 'bomber') {
          this.pfx.spawn('JackExplode', x, y);
          this.addShake(8);
        } else if (e.kind === 'meteor') {
          this.pfx.spawn('melonimpact', x, y + 20);
          this.pfx.spawn('Powie', x, y);
          this.addShake(6);
        } else if (e.kind === 'steam') {
          this.pfx.spawn('IceTrap', x, y);
        } else if (e.kind === 'doom') {
          this.pfx.spawn('Doom', x, y + 40);
          this.addShake(22);
          this.flash = 0.6;
          this.flashColor = '#ffffff';
        } else if (e.kind === 'squash') {
          this.pfx.spawn('Dust_Squash', x, y + 40);
          this.addShake(5);
        } else this.pfx.spawn('Powie', x, y);
        break;
      }
      case 'aura': {
        this.units.get(e.unit)?.onShoot();
        this.pfx.spawn('GloomCloud', cellX(L, e.col) + 40, cellY(L, e.row, e.col) + L.rowH * 0.6);
        break;
      }
      case 'tombBreak':
        this.pfx.spawn('GraveBusterDie', cellX(L, e.col) + 40, cellY(L, e.row, e.col) + L.rowH * 0.7);
        break;
      case 'steal': {
        const skin = PLANT_SKINS[e.unit];
        const def = skin ? PVZ.reanim(skin.reanim) : null;
        if (skin && def) this.carried.push({ a: new UnitActor(0, e.unit, def, skin), x: cellX(L, e.col), y: cellY(L, e.row, e.col), t: 0 });
        break;
      }
      case 'squash':
      case 'divert':
      case 'bungee':
        break;
      case 'lane': {
        const flames: Reanim[] = [];
        const def = PVZ.reanim('fire');
        if (def) {
          for (let c = 0; c < w.cols; c++) {
            const r = new Reanim(def);
            r.playAll('once');
            r.rate = def.fps * (0.9 + Math.random() * 0.3);
            r.t = -Math.random() * 0.05;
            flames.push(r);
          }
        }
        this.fireLanes.push({ row: e.row, t: 0, flames });
        this.addShake(7);
        break;
      }
      case 'freeze':
        this.flash = 0.5;
        this.flashColor = '#cfefff';
        for (const z of this.zombies.values()) this.pfx.spawn('IceTrap', z.lastX + 60, z.lastY + 90);
        break;
      case 'place': {
        const water = w.grid[e.row]?.[e.col]?.terrain === 'w';
        this.pfx.spawn(water ? 'PlantingPool' : 'Planting', cellX(L, e.col) + 40, cellY(L, e.row, e.col) + L.rowH * 0.8);
        break;
      }
      case 'remove':
        this.pfx.spawn('Planting', cellX(L, e.col) + 40, cellY(L, e.row, e.col) + L.rowH * 0.8);
        break;
      case 'collect': {
        const sun = this.suns.get(e.id);
        const p = this.orbPos({ x: e.x, y: e.y, fromY: e.y, t: 1, fall: 0 });
        this.flySuns.push({ r: sun ?? this.makeSun(), x: p.x, y: p.y, t: 0, value: e.value, scale: this.sunScale(e.value) });
        this.suns.delete(e.id);
        break;
      }
      case 'coin': {
        const p = this.hitPos(e.x, e.row);
        this.sparks.spawn({ x: p.x, y: p.y - 20, vy: -30, kind: 'text', text: '+$', size: 14, color: '#ffe066', life: 1, max: 1 });
        break;
      }
      case 'wave':
        if (e.flag && e.index !== this.lastWaveShown) {
          this.lastWaveShown = e.index;
          const isFinal = e.index >= (w.totalWaves ?? 999);
          this.banners.push({ image: isFinal ? 'IMAGE_REANIM_FINALWAVE' : 'IMAGE_REANIM_APPROACHING', color: '#ff2020', t: 0, dur: 3.2 });
        }
        break;
      case 'flagWarn':
        break;
      case 'weather': {
        const wd = WEATHER[e.id];
        this.banner(`${wd.icon} ${wd.name}`, '#e0fbff', wd.desc, 2.6);
        break;
      }
      case 'event': {
        const def = EVENTS.find((x) => x.id === e.id);
        this.banner(`${def?.name ?? e.id}`, def?.good ? '#9ef01a' : '#ff6b6b', def?.desc, 2.8);
        break;
      }
      case 'combo': {
        const def = COMBOS.find((c) => c.id === e.id);
        this.sparks.spawn({ x: cellX(L, e.col) + 40, y: cellY(L, e.row, e.col) - 10, vy: -30, kind: 'text', text: `组合技·${def?.name ?? e.id}`, size: 15, color: '#ffe066', life: 1.8, max: 1.8 });
        break;
      }
      case 'lightning': {
        const x = this.colX(e.x);
        const y = groundY(L, e.row, e.x) - 40;
        const sx = e.x2 != null ? this.colX(e.x2) : x + (Math.random() - 0.5) * 80;
        const sy = e.row2 != null ? groundY(L, e.row2, e.x2 ?? e.x) - 100 : -20;
        this.lightnings.push({ pts: [[sx, sy], [x, y]], t: 0.3, seed: Math.floor(Math.random() * 1000) });
        this.flash = Math.max(this.flash, 0.15);
        this.flashColor = '#dfe8ff';
        break;
      }
      case 'chain': {
        const pts = e.pts.map((p, i) => [this.colX(p.x), groundY(L, p.row, p.x) - (i === 0 ? 70 : 45)] as [number, number]);
        this.lightnings.push({ pts, t: 0.22, seed: Math.floor(Math.random() * 1000) });
        break;
      }
      case 'sentinel':
        break;
      case 'bite': {
        const u = w.unitAt(e.row, e.col);
        if (u && (u.def.behavior === 'wall') && Math.random() < 0.3) this.pfx.spawn(u.def.id === 'monolith' ? 'WallnutEatLarge' : 'WallnutEatSmall', cellX(L, e.col) + 50, cellY(L, e.row, e.col) + 40);
        break;
      }
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
        break;
      case 'heal':
        this.sparks.spawn({ x: cellX(L, e.col) + 40 + (Math.random() - 0.5) * 30, y: cellY(L, e.row, e.col) + 20, vy: -40, kind: 'text', text: '+', size: 18, color: '#7CFC00', life: 0.8, max: 0.8 });
        break;
      case 'gale':
        for (let i = 0; i < 40; i++) this.sparks.spawn({ x: -20, y: 80 + Math.random() * w.rows * L.rowH, vx: 900 + Math.random() * 400, kind: 'leaf', size: 6, color: Math.random() < 0.5 ? '#caffbf' : '#ffffff', life: 1.2, max: 1.2, vr: 8, drag: 0.995 });
        break;
      case 'magnet': {
        const p = this.hitPos(e.x, e.row);
        this.pfx.spawn('ZombiePail', p.x, p.y - 30);
        break;
      }
      case 'splash': {
        const p = this.hitPos(e.x, e.row);
        this.pfx.spawn('PoolSplash', p.x, p.y + 40);
        break;
      }
      case 'devour':
      case 'pull':
      case 'enemyDie':
      case 'armorBreak':
      case 'unitDie':
      case 'upgrade':
      case 'orb':
      case 'end':
        break;
    }
  }

  addShake(v: number): void {
    if (this.settings.screenShake) this.shake = Math.max(this.shake, v);
  }

  /* ---------------------------- 演员管理 ---------------------------- */

  private reset(w: World): void {
    this.lastWorld = w;
    this.L = makeLayout(w);
    this.units.clear();
    this.zombies.clear();
    this.corpses = [];
    this.suns.clear();
    this.flySuns = [];
    this.fireLanes = [];
    this.mowers.clear();
    this.pfx.clear();
    this.banners = [];
    this.startPlayed = w.tick > 30;
    this.lastWaveShown = -1;
    this.ready = false;
    void preloadForWorld(w).then(() => {
      this.ready = true;
    });
    void this.pfx.preload(PARTICLE_PRELOAD);
    void PVZ.preloadImages([this.L.bg, 'IMAGE_PLANTSHADOW', 'IMAGE_PEA_SHADOWS', 'IMAGE_TOMBSTONES', 'IMAGE_TOMBSTONE_MOUNDS', 'IMAGE_FLAGMETER', 'IMAGE_FLAGMETERPARTS', 'IMAGE_FLAGMETERLEVELPROGRESS', 'IMAGE_REANIM_APPROACHING', 'IMAGE_REANIM_FINALWAVE', 'IMAGE_FOG', 'IMAGE_ICE', 'IMAGE_CRATER', 'IMAGE_ROCKSMALL', 'IMAGE_DIRTBIG', 'IMAGE_PROJECTILEPEA', 'IMAGE_PROJECTILESNOWPEA', 'IMAGE_PROJECTILECACTUS', 'IMAGE_PROJECTILE_STAR', 'IMAGE_SEEDBANK', 'IMAGE_SEEDPACKET_LARGER', 'IMAGE_SEEDS', 'IMAGE_PACKET_PLANTS', 'IMAGE_ICE_CAP', 'IMAGE_ICE_SPARKLES', 'IMAGE_PUFFSHROOM_PUFF1', 'IMAGE_REANIM_CORNPULT_KERNAL', 'IMAGE_REANIM_CORNPULT_BUTTER', 'IMAGE_REANIM_WINTERMELON_PROJECTILE', 'IMAGE_BUNGEECORD', 'IMAGE_BUNGEETARGET', 'IMAGE_POOL', 'IMAGE_POOL_NIGHT', 'IMAGE_POOL_BASE', 'IMAGE_POOL_BASE_NIGHT', 'IMAGE_POOL_SHADING', 'IMAGE_POOL_SHADING_NIGHT', 'IMAGE_POOL_CAUSTIC_EFFECT', 'IMAGE_SHOVELBANK', 'IMAGE_SHOVEL']);
    void BitmapFont.load(FONTS.sun);
    void BitmapFont.load(FONTS.cost);
  }

  private syncActors(w: World, dt: number): void {
    // 单位
    const seenU = new Set<number>();
    for (const u of w.units) {
      if (u.dead) continue;
      seenU.add(u.id);
      let a = this.units.get(u.id);
      if (!a) {
        const skin = PLANT_SKINS[u.def.id];
        const def = skin ? PVZ.reanim(skin.reanim) : null;
        if (!skin || !def) continue;
        a = new UnitActor(u.id, u.def.id, def, skin);
        this.units.set(u.id, a);
      }
      a.sync(u, w, dt);
      a.update(dt);
    }
    for (const id of [...this.units.keys()]) if (!seenU.has(id)) this.units.delete(id);
    // 敌人
    const seenE = new Set<number>();
    for (const e of w.enemies) {
      if (e.dead) continue;
      seenE.add(e.id);
      let a = this.zombies.get(e.id);
      if (!a) {
        const skin = ZOMBIE_SKINS[e.def.id];
        const def = skin ? PVZ.reanim(skin.reanim) : null;
        if (!skin || !def) continue;
        a = new ZombieActor(e.id, e.def.id, def, skin, PVZ.reanim('Zombie_flagpole'));
        this.zombies.set(e.id, a);
      }
      const ev = a.sync(e, w, dt);
      this.zombieLastHit.set(e.id, e.lastHit);
      a.update(dt);
      const p = this.zombiePos(e, 0);
      a.lastX = p.x;
      a.lastY = p.y;
      a.lastRow = e.row;
      for (const v of ev) this.zombieDrop(a, v);
    }
    for (const [id, a] of [...this.zombies]) {
      if (seenE.has(id)) continue;
      this.zombies.delete(id);
      const enemy = w.enemies.find((e) => e.id === id);
      if (enemy?.escaped) continue;
      const src = this.zombieLastHit.get(id) ?? '';
      this.zombieLastHit.delete(id);
      const explosive = isExplosiveSource(src);
      const charred = explosive && a.skin.charred ? PVZ.reanim(a.skin.charred) : null;
      for (const v of a.die(explosive, charred)) this.zombieDrop(a, v);
      this.corpses.push(a);
    }
    for (const c of this.corpses) c.update(dt);
    this.corpses = this.corpses.filter((c) => c.fade > 0);
  }

  /** 掉落物粒子：头、手臂、路障、铁桶、铁门、报纸 */
  private zombieDrop(a: ZombieActor, v: string): void {
    const s = a.skin.scale ?? 1;
    const x = a.lastX + 50 * s;
    const y = a.lastY + 30 * s;
    const heads: Record<string, string> = {
      Zombie_polevaulter: 'IMAGE_ZOMBIEPOLEVAULTERHEAD',
      Zombie_football: 'IMAGE_ZOMBIEFOOTBALLHEAD',
      Zombie_dancer: 'IMAGE_ZOMBIEDANCERHEAD',
      Zombie_balloon: 'IMAGE_ZOMBIEBALLOONHEAD',
      Zombie_imp: 'IMAGE_ZOMBIEIMPHEAD',
      Zombie_digger: 'IMAGE_ZOMBIEDIGGERHEAD',
      Zombie_backup: 'IMAGE_ZOMBIEBACKUPDANCERHEAD',
      Zombie_ladder: 'IMAGE_ZOMBIELADDERHEAD',
      Zombie_yeti: 'IMAGE_ZOMBIEYETIHEAD',
      Zombie_pogo: 'IMAGE_ZOMBIEPOGOHEAD',
    };
    if (v === 'head') {
      if (a.skin.reanim === 'Zombie_paper') this.pfx.spawn('ZombieNewspaperHead', x, y);
      else this.pfx.spawn('ZombieHead', x, y, heads[a.skin.reanim]);
    } else if (v === 'arm') {
      const arm = a.skin.reanim === 'Zombie_digger' ? 'IMAGE_ZOMBIEDIGGERARM' : a.skin.reanim === 'Zombie_jackbox' ? 'IMAGE_ZOMBIEJACKBOXARM' : undefined;
      this.pfx.spawn('ZombieArm', x, y + 30, arm);
    } else if (v === 'armor:cone') this.pfx.spawn('ZombieTrafficCone', x, y - 10);
    else if (v === 'armor:bucket') this.pfx.spawn('ZombiePail', x, y - 10);
    else if (v === 'armor:door') this.pfx.spawn('ZombieDoor', x - 20, y + 20);
    else if (v === 'armor:paper') this.pfx.spawn('ZombieNewspaper', x - 10, y + 20);
    else if (v === 'pogo') this.pfx.spawn('ZombiePogo', x, y + 20);
  }

  /** 敌人的绘制原点（reanim 左上角） */
  private zombiePos(e: Enemy, alpha: number): { x: number; y: number } {
    let ex = e.x;
    if (e.state === 'walk' && e.freeze <= 0 && e.stun <= 0) ex += e.dir * e.def.speed * e.speedMul * alpha * DT * (e.slow > 0 ? e.slowMul : 1);
    const skin = ZOMBIE_SKINS[e.def.id];
    const s = skin?.scale ?? 1;
    const front = this.colX(ex);
    // 原版：mPosX 与植物接触时 = 植物格 x + 20，reanim 原点 = (mPosX + 15 + 30(1-s), mPosY - 8 + 120(1-s))，mPosY = 行顶 - 30
    const posX = front - 72;
    let x = posX + 15 + 30 * (1 - s) + (skin?.dx ?? 0);
    let y = cellY(this.L, 0, ex) + e.y * this.L.rowH - 38 + 120 * (1 - s) + (skin?.dy ?? 0) + (this.L.rowH === 85 ? -10 : 0);
    if (e.dir > 0) x = front - 18 - 90 * s;
    if (e.def.flying || skin?.flying) y -= 30;
    // 海豚骑士：骑乘/跳跃时图像右移；跳跃过程中由动画本身完成位移
    if (skin?.ride && !e.jumped) x += skin.ride.dx;
    if (skin?.ride && e.state === 'jump') x += (e.jumpFrom - ex) * CELL_W;
    if (e.def.boss === 'king' && e.rowSpan) {
      x = this.colX(this.L.cols) - 520;
      y = groundY(this.L, e.rowSpan[1], 8) - 560;
    }
    return { x, y };
  }

  private makeSun(): Reanim | null {
    const def = PVZ.reanim('Sun');
    if (!def) return null;
    const r = new Reanim(def);
    r.playAll();
    r.t = Math.random();
    return r;
  }

  private sunScale(v: number): number {
    return v <= 15 ? 0.55 : v >= 50 ? 1.3 : v / 25;
  }

  /* ---------------------------- 主绘制 ---------------------------- */

  render(w: World, alpha: number, dtReal: number): void {
    if (w !== this.lastWorld) this.reset(w);
    this.L = this.L ?? makeLayout(w);
    this.resize();
    this.time += dtReal;
    const dt = Math.min(0.1, dtReal);
    const ctx = this.ctx;
    const L = this.L;

    this.syncActors(w, dt);
    this.pfx.update(dt);
    this.sparks.max = 300;
    this.sparks.update(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dtReal * 40);
    }
    const k = this.dpr * this.scale;
    const base: Mat = [k, 0, 0, k, this.dpr * (this.ox + sx * this.scale), this.dpr * (this.oy + sy * this.scale)];
    this.base = base;
    ctx.setTransform(...base);

    this.drawBackground(w);
    this.drawCellFeatures(w);
    this.drawHover(w, base);

    // 实体按行绘制：割草机 → 植物 → 僵尸 → 本行弹道
    const unitsByRow: Unit[][] = Array.from({ length: w.rows }, () => []);
    for (const u of w.units) if (!u.dead) unitsByRow[u.row]?.push(u);
    const enemiesByRow: Enemy[][] = Array.from({ length: w.rows }, () => []);
    const airborne: Enemy[] = [];
    for (const e of w.enemies) {
      if (e.dead) continue;
      if (e.def.boss === 'king' || e.def.flying) airborne.push(e);
      else enemiesByRow[Math.max(0, Math.min(w.rows - 1, Math.round(e.y)))]?.push(e);
    }
    const corpsesByRow: ZombieActor[][] = Array.from({ length: w.rows }, () => []);
    for (const c of this.corpses) corpsesByRow[Math.max(0, Math.min(w.rows - 1, c.lastRow))]?.push(c);

    for (let r = 0; r < w.rows; r++) {
      this.drawMower(w, r, base, dt);
      const us = unitsByRow[r].sort((a, b) => (a.layer === 'plate' ? -1 : b.layer === 'plate' ? 1 : a.col - b.col));
      for (const u of us) this.drawShadow(cellX(L, u.col) + 40, cellY(L, u.row, u.col) + L.rowH * 0.78, 1);
      for (const u of us) this.drawUnit(w, u, base);
      for (const c of corpsesByRow[r]) this.drawCorpse(c, base);
      const es = enemiesByRow[r].sort((a, b) => b.x - a.x);
      for (const e of es) {
        // 水中与潜地的敌人没有地面阴影
        const cell = w.grid[e.row]?.[Math.max(0, Math.min(w.cols - 1, Math.floor(e.x)))];
        if (cell?.terrain === 'w' || e.burrowed) continue;
        this.drawShadow(this.colX(e.x) + 15, groundY(L, e.y, e.x) - 4, (ZOMBIE_SKINS[e.def.id]?.scale ?? 1) * 1.1);
      }
      for (const e of es) this.drawZombie(w, e, alpha, base);
      this.drawProjectiles(w, r, alpha, base);
      this.drawFireLane(w, r, base, dt);
    }
    for (const e of airborne) this.drawZombie(w, e, alpha, base);
    this.drawCarried(base, dt);
    this.drawProjectiles(w, -1, alpha, base);

    ctx.setTransform(...base);
    this.pfx.draw(ctx);
    ctx.setTransform(...base);
    this.sparks.draw(ctx, false);
    ctx.globalCompositeOperation = 'lighter';
    this.sparks.draw(ctx, true);
    ctx.globalCompositeOperation = 'source-over';
    this.drawLightning(dtReal);

    this.drawWeather(w, dtReal);
    if (w.weather.fog && w.fogClear <= 0 && !w.config.options?.fullVision) this.drawFog(w);
    this.drawSuns(w, base, dt);
    if (this.showAiOverlay) this.drawAiOverlay(w, base);
    this.drawFlySuns(base, dt);
    this.drawFlagMeter(w);
    this.drawHud(w, base, dt);
    this.drawStart(w, base, dt);
    this.drawBanners(dt);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.6, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
      this.flash = Math.max(0, this.flash - dtReal * 1.5);
    }
    if (!this.ready) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    this.drawBossBar(w);
  }

  private img(id: string) {
    return PVZ.image(id);
  }

  private drawBackground(w: World): void {
    const ctx = this.ctx;
    const L = this.L;
    const bg = this.img(L.bg);
    if (bg) ctx.drawImage(bg.img, -BG_OFFSET, 0);
    else {
      ctx.fillStyle = '#3d7a2a';
      ctx.fillRect(-BG_OFFSET, 0, 1400, 600);
    }
    if (L.theme === 'lake' || L.theme === 'fog') this.drawPool(L.theme === 'fog');
    // 超出背景的区域（极宽屏或 10 列地图）用背景边缘延展
    if (bg && L.viewW > 1400 - BG_OFFSET) {
      ctx.drawImage(bg.img, 1399, 0, 1, 600, 1400 - BG_OFFSET, 0, L.viewW, 600);
    }
    void w;
  }

  /** 泳池水面：原版在背景上叠加泳池图与两层按正弦波扭曲的水面，再叠加焦散光斑 */
  private drawPool(night: boolean): void {
    const ctx = this.ctx;
    const pool = this.img(night ? 'IMAGE_POOL_NIGHT' : 'IMAGE_POOL');
    if (pool) ctx.drawImage(pool.img, 34, 278);
    const phase = this.time * 100 * 2 * Math.PI;
    const strips = 48;
    for (const [id, amp, k] of [
      [night ? 'IMAGE_POOL_BASE_NIGHT' : 'IMAGE_POOL_BASE', 1, 0],
      [night ? 'IMAGE_POOL_SHADING_NIGHT' : 'IMAGE_POOL_SHADING', 1, 1],
    ] as [string, number, number][]) {
      const li = this.img(id);
      if (!li || !pool) continue;
      const W = pool.w;
      const H = pool.h;
      const sw = li.w / strips;
      const dw = W / strips;
      for (let i = 0; i < strips; i++) {
        const xPhase = ((i / strips) * 15 * 3 * 2 * Math.PI) / 15;
        const f = k === 0 ? 0.2 : 1;
        const off =
          k === 0
            ? Math.sin(xPhase + phase / 110) * 0.01 + Math.sin(xPhase + phase / 900) * 0.015 + Math.sin(xPhase + phase / 800) * 0.005
            : Math.sin(xPhase * f + phase / 110) * 0.005 + Math.sin(xPhase * f + phase / 900) * 0.015 + Math.sin(xPhase * f + phase / 800) * 0.02;
        const edge = Math.min(1, Math.min(i, strips - 1 - i) / 3);
        const sy = Math.max(0, off * amp * edge * li.h);
        ctx.drawImage(li.img, i * sw, sy, sw + 0.5, li.h - sy, 35 + i * dw, 279, dw + 0.5, H - sy * (H / li.h));
      }
    }
    const caustic = this.img('IMAGE_POOL_CAUSTIC_EFFECT');
    if (caustic) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(45, 288, 704, 150);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      for (const [a, sp, sc] of [
        [night ? 0.06 : 0.16, 9, 1],
        [night ? 0.04 : 0.1, -6, 1.4],
      ] as [number, number, number][]) {
        ctx.globalAlpha = a;
        const ox = (this.time * sp) % (caustic.w * sc);
        const oy = (this.time * sp * 0.6) % (caustic.h * sc);
        for (let x = 45 - caustic.w * sc + ox; x < 749; x += caustic.w * sc) for (let y = 288 - caustic.h * sc + oy; y < 438; y += caustic.h * sc) ctx.drawImage(caustic.img, x, y, caustic.w * sc, caustic.h * sc);
      }
      ctx.restore();
    }
  }

  /**
   * 冰面（地形冰面与冰车留下的冰道）：原版 Board::DrawIce —— 从冰道起点向右平铺 IMAGE_ICE，
   * 起点处画 IMAGE_ICE_CAP，纵向位于行顶 +20。屋顶斜坡上按格切片以保持纹理连续。
   */
  private drawIce(w: World): void {
    const ctx = this.ctx;
    const L = this.L;
    const ice = this.img('IMAGE_ICE');
    const cap = this.img('IMAGE_ICE_CAP');
    if (!ice) return;
    const k = L.rowH / 100;
    const h = ice.h * k;
    for (let r = 0; r < w.rows; r++) {
      let c = 0;
      while (c < w.cols) {
        const strength = (cc: number) => {
          const cell = w.grid[r][cc];
          return cell.terrain === 'i' ? 1 : Math.min(1, (cell.iceTrail ?? 0) / 3);
        };
        if (strength(c) <= 0) {
          c++;
          continue;
        }
        const c0 = c;
        while (c < w.cols && strength(c) > 0) c++;
        const startX = cellX(L, c0) + 13;
        for (let cc = c0; cc < c; cc++) {
          const a = strength(cc);
          ctx.globalAlpha = a;
          const x0 = cc === c0 ? startX : cellX(L, cc);
          const x1 = cellX(L, cc) + CELL_W;
          const y = cellY(L, r, cc) + 20 * k;
          // 源图按距冰道右端的位置取样，使平铺纹理连续
          let x = x0;
          while (x < x1) {
            const off = (((x - startX) % ice.w) + ice.w) % ice.w;
            const wd = Math.min(ice.w - off, x1 - x);
            ctx.drawImage(ice.img, off, 0, wd, ice.h, x, y, wd, h);
            x += wd;
          }
          if (cc === c0 && cap) ctx.drawImage(cap.img, cellX(L, c0), y, cap.w, h);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawCellFeatures(w: World): void {
    const ctx = this.ctx;
    const L = this.L;
    const t = this.time;
    this.drawIce(w);
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        const cell = w.grid[r][c];
        const x = cellX(L, c);
        const y = cellY(L, r, c);
        const code = cell.terrain;
        if (code === 'w' && L.theme !== 'lake' && L.theme !== 'fog') {
          ctx.fillStyle = 'rgba(60,170,230,0.75)';
          ctx.fillRect(x + 2, y + 6, CELL_W - 4, L.rowH - 10);
        } else if (code === 'r') {
          const rock = this.img('IMAGE_ROCKSMALL');
          if (rock) {
            const i = (r * 7 + c * 3) % 8;
            for (let k = 0; k < 3; k++) ctx.drawImage(rock.img, ((i + k) % 8) * rock.cw, 0, rock.cw, rock.ch, x + 8 + k * 20, y + L.rowH * 0.45 + ((k * 13) % 17), rock.cw * 1.4, rock.ch * 1.4);
          }
          const dirt = this.img('IMAGE_DIRTBIG');
          if (dirt) ctx.drawImage(dirt.img, ((r + c) % 4) * dirt.cw, 0, dirt.cw, dirt.ch, x + 2, y + L.rowH * 0.3, CELL_W - 4, L.rowH * 0.6);
        } else if (code === 'b' || code === 'x') {
          const crater = this.img('IMAGE_CRATER');
          if (crater) {
            ctx.globalAlpha = code === 'x' ? 1 : 0.8;
            ctx.drawImage(crater.img, 0, code === 'x' ? crater.ch : 0, crater.cw, crater.ch, x - 10, y + L.rowH * 0.45, CELL_W + 20, L.rowH * 0.45);
            ctx.globalAlpha = 1;
          }
          if (code === 'b') {
            ctx.fillStyle = `rgba(110,40,140,${0.18 + Math.sin(t * 2 + r + c) * 0.05})`;
            ctx.fillRect(x + 3, y + 3, CELL_W - 6, L.rowH - 6);
          }
        } else if (code === 'v') {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(x + 40, y + L.rowH * 0.75, 4, x + 40, y + L.rowH * 0.75, 38);
          g.addColorStop(0, `rgba(255,240,140,${0.22 + Math.sin(t * 2.5 + c) * 0.06})`);
          g.addColorStop(1, 'rgba(255,240,140,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, CELL_W, L.rowH);
          ctx.restore();
        } else if (code === 'h') {
          const dirt = this.img('IMAGE_DIRTBIG');
          if (dirt) ctx.drawImage(dirt.img, ((r * 3 + c) % 4) * dirt.cw, dirt.ch, dirt.cw, dirt.ch, x - 4, y + L.rowH * 0.55, CELL_W + 8, L.rowH * 0.45);
        }
        if (cell.tomb || cell.node) this.drawTomb(r, c, !!cell.node);
        if (cell.crack > 0) {
          const crater = this.img('IMAGE_CRATER');
          if (crater) ctx.drawImage(crater.img, 0, 0, crater.cw, crater.ch, x - 6, y + L.rowH * 0.5, CELL_W + 12, L.rowH * 0.42);
        }
      }
    }
    if (this.settings.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) ctx.strokeRect(cellX(L, c) + 0.5, cellY(L, r, c) + 0.5, CELL_W - 1, L.rowH - 1);
    }
  }

  private drawTomb(r: number, c: number, node: boolean): void {
    const ctx = this.ctx;
    const L = this.L;
    const tomb = this.img('IMAGE_TOMBSTONES');
    const mound = this.img('IMAGE_TOMBSTONE_MOUNDS');
    const x = cellX(L, c) - 3;
    const y = cellY(L, r, c) + L.rowH - 92;
    const v = (r * 5 + c * 3) % 5;
    if (tomb) ctx.drawImage(tomb.img, v * tomb.cw, (node ? 2 : 0) * tomb.ch, tomb.cw, tomb.ch, x, y, tomb.cw, tomb.ch);
    if (mound) ctx.drawImage(mound.img, v * mound.cw, 0, mound.cw, mound.ch, x, y + 34, mound.cw, mound.ch);
  }

  private drawShadow(x: number, y: number, s: number): void {
    const sh = this.img('IMAGE_PLANTSHADOW');
    if (!sh) return;
    this.ctx.setTransform(...this.base);
    this.ctx.drawImage(sh.img, x - (sh.w * s) / 2, y - (sh.h * s) / 2, sh.w * s, sh.h * s);
  }

  private plantOrigin(w: World, u: Unit): { x: number; y: number } {
    const L = this.L;
    let x = cellX(L, u.col);
    let y = cellY(L, u.row, u.col);
    const skin = PLANT_SKINS[u.def.id];
    if (skin?.dx) x += skin.dx;
    if (skin?.dy) y += skin.dy;
    const cell = w.grid[u.row][u.col];
    if (u.layer === 'main' && cell.plate) y -= 12 + Math.sin(this.time * 1.6 + u.id) * 1.5;
    if (u.layer === 'plate') y += 6 + Math.sin(this.time * 1.6 + u.id) * 1.5;
    return { x, y };
  }

  private drawUnit(w: World, u: Unit, base: Mat): void {
    const a = this.units.get(u.id);
    if (!a) return;
    const p = this.plantOrigin(w, u);
    const s = a.skin.scale ?? 1;
    let m = translate(base, p.x + a.ox, p.y + a.oy);
    if (s !== 1) m = scaleMat(m, s);
    a.body.draw(this.ctx, m, PVZ_IMAGES);
    const ctx = this.ctx;
    // 星级强化标记
    if (u.rank > 1) {
      ctx.setTransform(...base);
      ctx.fillStyle = '#ffe066';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      const txt = '★'.repeat(u.rank - 1);
      ctx.strokeText(txt, p.x + 40, p.y + 12);
      ctx.fillText(txt, p.x + 40, p.y + 12);
    }
    if (u.shield > 0 || (w.aegis > 0 && !u.relic && u.layer !== 'instant')) {
      ctx.setTransform(...base);
      ctx.strokeStyle = `rgba(190,230,255,${0.55 + Math.sin(this.time * 8) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x + 40, p.y + 45, 38, 44, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.settings.showHp && u.hp < u.maxHp && u.layer !== 'instant') {
      ctx.setTransform(...base);
      const k = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x + 14, p.y + 84, 52, 5);
      ctx.fillStyle = k > 0.5 ? '#7bed9f' : k > 0.25 ? '#ffd166' : '#ff6b6b';
      ctx.fillRect(p.x + 14, p.y + 84, 52 * k, 5);
    }
  }

  private drawZombie(w: World, e: Enemy, alpha: number, base: Mat): void {
    const a = this.zombies.get(e.id);
    if (!a) return;
    const p = this.zombiePos(e, alpha);
    const s = a.skin.scale ?? 1;
    if (e.def.bungee) this.drawBungeeCord(e, p, base);
    if (e.def.bungee) p.y += this.bungeeLift(e, alpha);
    let m = translate(base, p.x, p.y);
    if (e.dir > 0) m = mul(m, -1, 0, 0, 1, 160 * s, 0);
    if (s !== 1) m = scaleMat(m, s);
    const visible = w.isVisible(e);
    const prevAlpha = a.body.alpha;
    if (!visible) a.body.alpha = 0.08;
    else if (e.submerged || e.burrowed) a.body.alpha = 0.55;
    const water = !e.def.flying && w.grid[e.row]?.[Math.max(0, Math.min(w.cols - 1, Math.floor(e.x)))]?.terrain === 'w';
    // 普通僵尸在泳池中套上鸭子游泳圈
    if (a.skin.reanim === 'Zombie' && a.body.def.index.has('Zombie_duckytube')) a.body.setTrackVisible('Zombie_duckytube', water);
    const riding = !!a.skin.ride && !e.jumped;
    if (water && e.def.id !== 'diver' && !a.skin.noWaterClip && !riding) {
      // 水中：裁掉下半身
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(...base);
      ctx.beginPath();
      ctx.rect(p.x - 200, p.y - 400, 600, 400 + 125 * s - 40);
      ctx.clip();
      a.body.draw(ctx, translate(m, 0, 30), PVZ_IMAGES);
      ctx.restore();
    } else a.body.draw(this.ctx, m, PVZ_IMAGES);
    a.body.alpha = prevAlpha;
    if (this.settings.showHp && visible && !e.def.boss && (e.hp < e.maxHp || e.armor < e.armorMax)) {
      const ctx = this.ctx;
      ctx.setTransform(...base);
      const total = e.maxHp + e.armorMax;
      const bx = this.colX(e.x) - 10;
      const by = p.y + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, 44, 5);
      ctx.fillStyle = '#ff5e7a';
      ctx.fillRect(bx, by, 44 * (Math.max(0, e.hp) / total), 5);
      ctx.fillStyle = '#c0c6cf';
      ctx.fillRect(bx + 44 * (Math.max(0, e.hp) / total), by, 44 * (e.armor / total), 5);
    }
  }

  /** 蹦极僵尸的高度偏移：降落阶段从空中落下，离开阶段被拉回天空 */
  private bungeeLift(e: Enemy, alpha: number): number {
    const t = e.stateT + (e.freeze > 0 || e.stun > 0 ? 0 : alpha * DT);
    if (e.state === 'drop') return -560 * Math.pow(1 - Math.min(1, t / 1.6), 2);
    if (e.state === 'leave') return -560 * Math.min(1, t / 1) ** 2;
    return 0;
  }

  private drawBungeeCord(e: Enemy, p: { x: number; y: number }, base: Mat): void {
    const ctx = this.ctx;
    const L = this.L;
    ctx.setTransform(...base);
    // 降落前的目标标记
    if (e.state === 'drop') {
      const tgt = this.img('IMAGE_BUNGEETARGET');
      if (tgt) {
        const gx = this.colX(e.x);
        const gy = groundY(L, e.row, e.x);
        ctx.globalAlpha = 0.8;
        ctx.drawImage(tgt.img, gx - tgt.w / 2, gy - tgt.h / 2 - 20);
        ctx.globalAlpha = 1;
      }
    }
    const cord = this.img('IMAGE_BUNGEECORD');
    if (!cord) return;
    const cx = p.x + 66;
    const bottom = p.y + this.bungeeLift(e, 0) + 20;
    for (let y = bottom - cord.h; y > -cord.h - 200; y -= cord.h) ctx.drawImage(cord.img, cx - cord.w / 2, y);
  }

  private drawCarried(base: Mat, dt: number): void {
    for (const c of this.carried) {
      c.t += dt;
      c.a.update(dt);
      const lift = -560 * Math.min(1, (c.t / 1.0) ** 2);
      c.a.body.alpha = Math.max(0, 1 - c.t);
      c.a.body.draw(this.ctx, translate(base, c.x, c.y + lift), PVZ_IMAGES);
    }
    this.carried = this.carried.filter((c) => c.t < 1.2);
  }

  private drawCorpse(c: ZombieActor, base: Mat): void {
    const s = c.skin.scale ?? 1;
    let m = translate(base, c.lastX, c.lastY);
    if (c.dir > 0 && !c.charred) m = mul(m, -1, 0, 0, 1, 160 * s, 0);
    if (s !== 1) m = scaleMat(m, s);
    if (c.charred) {
      c.charred.alpha = c.fade;
      c.charred.draw(this.ctx, translate(m, 0, 0), PVZ_IMAGES);
    } else {
      c.body.alpha = c.fade * (c.skin.alpha ?? 1);
      c.body.draw(this.ctx, m, PVZ_IMAGES);
    }
  }

  private drawMower(w: World, r: number, base: Mat, dt: number): void {
    const L = this.L;
    const active = w.sentinels.find((s) => s.row === r);
    const ready = w.sentinelReady[r];
    if (!ready && !active) {
      this.mowers.delete(r);
      return;
    }
    const water = w.grid[r]?.[0]?.terrain === 'w';
    const name = water ? 'PoolCleaner' : L.roof ? 'RoofCleaner' : 'LawnMower';
    let m = this.mowers.get(r);
    if (!m) {
      const def = PVZ.reanim(name);
      if (!def) return;
      m = new Reanim(def);
      if (name === 'LawnMower') m.play('anim_normal');
      else if (name === 'PoolCleaner') m.play('anim_water');
      else m.playAll();
      m.rate = 0;
      this.mowers.set(r, m);
    }
    const x = active ? this.colX(active.x) - 30 : LAWN_X - 52;
    m.rate = active ? m.def.fps * 1.5 : 0;
    m.update(dt);
    const y = cellY(L, r, active ? active.x : 0) + L.rowH - (water ? 70 : 72) + (L.rowH === 85 ? -6 : 0);
    m.draw(this.ctx, translate(base, x, y), PVZ_IMAGES);
  }

  private drawProjectiles(w: World, row: number, alpha: number, base: Mat): void {
    const ctx = this.ctx;
    const L = this.L;
    for (const p of w.projectiles) {
      if (p.dead) continue;
      const lob = !!p.lob || !!p.enemyShot;
      if (row >= 0 ? lob || p.row !== row : !lob) continue;
      let x: number;
      let y: number;
      let gy: number;
      if (p.lob) {
        const Lb = p.lob;
        const k = Math.min(1, (Lb.t + alpha * DT) / Lb.dur);
        const cx = Lb.sx + (Lb.tx - Lb.sx) * k;
        x = this.colX(cx);
        const y0 = groundY(L, p.fromRow, Lb.sx) - 70;
        const y1 = groundY(L, Lb.trow, Lb.tx) - 50;
        gy = groundY(L, p.fromRow + (Lb.trow - p.fromRow) * k, cx);
        y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * Lb.h * L.rowH;
      } else if (p.enemyShot) {
        const k = Math.min(1, p.age / 1.0);
        x = this.colX(p.x + p.vx * k);
        gy = groundY(L, p.row, p.x);
        y = gy - 60 - Math.sin(k * Math.PI) * 140;
      } else {
        x = this.colX(p.x + p.vx * alpha * DT);
        const k = Math.min(1, p.age * 6);
        const ry = p.fromRow + (p.row - p.fromRow) * k;
        gy = groundY(L, ry, p.x);
        y = gy - 62;
        if (p.miss) y += Math.sin(p.age * 30) * 6;
      }
      const skin = PROJECTILE_SKINS[p.enemyShot ? 'enemy' : p.kind] ?? PROJECTILE_SKINS.bolt;
      ctx.setTransform(...base);
      if (skin.shadow) {
        const sh = this.img('IMAGE_PEA_SHADOWS');
        if (sh) ctx.drawImage(sh.img, 0, 0, sh.cw, sh.ch, x - sh.cw / 2, gy - 10, sh.cw, sh.ch);
      }
      if (skin.reanim) {
        let r = this.projFx.get(p.id);
        if (!r) {
          const def = PVZ.reanim(skin.reanim);
          if (def) {
            r = new Reanim(def);
            r.playAll();
            this.projFx.set(p.id, r);
          }
        }
        if (r) {
          r.update(1 / 60);
          const dir = p.vx < 0 ? -1 : 1;
          r.draw(ctx, mul(translate(base, x, y), dir, 0, 0, 1, -28 * dir, -25), PVZ_IMAGES);
        }
        continue;
      }
      const li = skin.image ? this.img(skin.image) : null;
      if (!li) continue;
      const rot = skin.spin ? this.time * skin.spin * (p.vx < 0 ? -1 : 1) : p.kind === 'thorn' ? 0 : 0;
      const m = mul(translate(base, x, y), Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), 0, 0);
      ctx.setTransform(...m);
      if (skin.tint) ctx.globalAlpha = 0.8;
      const flip = p.vx < 0 && p.kind === 'thorn' ? -1 : 1;
      if (flip < 0) ctx.scale(-1, 1);
      ctx.drawImage(li.img, -li.w / 2, -li.h / 2);
      ctx.globalAlpha = 1;
    }
    if (row === -1 && this.projFx.size > 200) {
      const alive = new Set(w.projectiles.map((p) => p.id));
      for (const id of [...this.projFx.keys()]) if (!alive.has(id)) this.projFx.delete(id);
    }
  }

  private drawFireLane(w: World, row: number, base: Mat, dt: number): void {
    const L = this.L;
    for (const f of this.fireLanes) {
      if (f.row !== row) continue;
      f.t += dt / Math.max(1, w.rows);
      f.flames.forEach((r, c) => {
        r.update(dt / Math.max(1, w.rows));
        if (r.t < 0) return;
        r.draw(this.ctx, translate(base, cellX(L, c) - 10, cellY(L, row, c) + L.rowH - 120), PVZ_IMAGES);
      });
    }
    if (row === w.rows - 1) this.fireLanes = this.fireLanes.filter((f) => f.t < 1.6 && !f.flames.every((r) => r.done));
  }

  private drawSuns(w: World, base: Mat, dt: number): void {
    const alive = new Set<number>();
    for (const o of w.orbs) {
      alive.add(o.id);
      let r = this.suns.get(o.id);
      if (!r) {
        const made = this.makeSun();
        if (!made) continue;
        r = made;
        this.suns.set(o.id, r);
      }
      r.update(dt);
      const p = this.orbPos(o);
      const left = o.fall + o.life - o.t;
      r.alpha = left < 3 ? (Math.sin(this.time * 16) > 0 ? 1 : 0.4) : 1;
      r.draw(this.ctx, scaleMat(translate(base, p.x, p.y), this.sunScale(o.value)), PVZ_IMAGES);
    }
    for (const id of [...this.suns.keys()]) if (!alive.has(id)) this.suns.delete(id);
  }

  private drawFlySuns(base: Mat, dt: number): void {
    const bank = this.bankLayout(this.lastWorld?.deck.length ?? 6);
    const target = { x: bank.x + 39, y: bank.y + 36 };
    for (const f of this.flySuns) {
      f.t += dt * 1.6;
      const k = Math.min(1, f.t);
      const e = 1 - Math.pow(1 - k, 3);
      const x = f.x + (target.x - f.x) * e;
      const y = f.y + (target.y - f.y) * e;
      if (f.r) {
        f.r.update(dt);
        f.r.alpha = 1 - k * 0.3;
        f.r.draw(this.ctx, scaleMat(translate(base, x, y), f.scale * (1 - k * 0.45)), PVZ_IMAGES);
      }
      if (k >= 1) {
        this.onCollectArrive?.(f.value);
        this.sunPulse = 0.25;
      }
    }
    this.flySuns = this.flySuns.filter((f) => f.t < 1);
  }

  private drawHover(w: World, base: Mat): void {
    const h = this.hover;
    if (!h) return;
    const ctx = this.ctx;
    const L = this.L;
    const cells: [number, number][] = [];
    if (h.area === 'row') for (let c = 0; c < w.cols; c++) cells.push([h.row, c]);
    else if (h.area === '3x3') {
      for (let r = h.row - 1; r <= h.row + 1; r++) for (let c = h.col - 1; c <= h.col + 1; c++) if (w.inBounds(r, c)) cells.push([r, c]);
    } else cells.push([h.row, h.col]);
    ctx.setTransform(...base);
    for (const [r, c] of cells) {
      ctx.fillStyle = h.valid ? 'rgba(255,255,255,0.16)' : 'rgba(255,60,60,0.22)';
      ctx.fillRect(cellX(L, c) + 1, cellY(L, r, c) + 1, CELL_W - 2, L.rowH - 2);
    }
    if (h.def && h.mode === 'place' && h.valid) {
      const skin = PLANT_SKINS[h.def.id];
      const def = skin ? PVZ.reanim(skin.reanim) : null;
      if (skin && def) {
        const r = new Reanim(def);
        if (!r.play(skin.thumb ?? skin.idle)) r.playAll();
        r.alpha = 0.45;
        const y = cellY(L, h.row, h.col) - (L.rowH === 85 ? 8 : 0) - (w.grid[h.row][h.col].plate ? 12 : 0);
        r.draw(ctx, translate(base, cellX(L, h.col), y), PVZ_IMAGES);
      }
    }
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

  private drawWeather(w: World, dt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(...this.base);
    const L = this.L;
    const id = w.weather.id;
    const x0 = -BG_OFFSET;
    const W = 1400;
    const H = L.viewH;
    if (w.weather.dark) {
      ctx.fillStyle = 'rgba(8,12,40,0.35)';
      ctx.fillRect(x0, 0, W, H);
    }
    if (id === 'rain' || id === 'storm') {
      ctx.fillStyle = 'rgba(10,20,40,0.18)';
      ctx.fillRect(x0, 0, W, H);
      ctx.strokeStyle = 'rgba(200,220,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const d of this.rainDrops) {
        d.y += dt * 1.6 * d.s;
        d.x += dt * 0.15 * d.s;
        if (d.y > 1) {
          d.y -= 1;
          d.x = Math.random();
        }
        const x = x0 + (d.x % 1) * W;
        const y = d.y * H;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y - 18 * d.s);
      }
      ctx.stroke();
    } else if (id === 'blizzard') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const d of this.rainDrops) {
        d.y += dt * 0.25 * d.s;
        d.x += dt * 0.12 * d.s;
        if (d.y > 1) {
          d.y -= 1;
          d.x = Math.random();
        }
        ctx.beginPath();
        ctx.arc(x0 + (d.x % 1) * W, d.y * H, 2 * d.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(220,240,255,0.12)';
      ctx.fillRect(x0, 0, W, H);
    } else if (id === 'sandstorm') {
      ctx.fillStyle = 'rgba(210,170,110,0.2)';
      ctx.fillRect(x0, 0, W, H);
    } else if (id === 'eclipse') {
      const g = ctx.createRadialGradient(400, 300, 200, 400, 300, 800);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(80,0,20,0.45)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, W, H);
    } else if (id === 'sunny') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,240,180,0.06)';
      ctx.fillRect(x0, 0, W, H);
      ctx.restore();
    }
    if (w.timeWarp > 0) {
      ctx.fillStyle = 'rgba(155,246,255,0.08)';
      ctx.fillRect(x0, 0, W, H);
    }
  }

  private drawFog(w: World): void {
    const ctx = this.ctx;
    ctx.setTransform(...this.base);
    const L = this.L;
    const fog = this.img('IMAGE_FOG');
    const t = this.time;
    for (let r = 0; r < w.rows; r++) {
      for (let c = Math.max(0, Math.floor(w.fogStart)); c < w.cols + 2; c++) {
        let a = 1;
        for (const u of w.units) {
          if (u.dead || u.def.behavior !== 'lantern') continue;
          const d = Math.hypot(u.col - c, (u.row - r) * 0.9);
          const rr = (u.def.radius ?? 2) + 0.5;
          if (d < rr) a = Math.min(a, Math.max(0, (d - rr + 1) / 1));
        }
        if (a <= 0.02) continue;
        const x = cellX(L, c) - 40 + Math.sin(t * 0.6 + r * 1.7 + c) * 8;
        const y = cellY(L, r, Math.min(c, w.cols - 1)) - 40;
        ctx.globalAlpha = a * 0.92;
        if (fog) {
          const sxp = ((r * 3 + c * 5) % 8) * 210;
          ctx.drawImage(fog.img, sxp, 0, 210, fog.h, x - 30, y, 210, fog.h);
        } else {
          ctx.fillStyle = 'rgba(200,215,210,0.9)';
          ctx.fillRect(x, y + 30, 160, 120);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawAiOverlay(w: World, base: Mat): void {
    const ctx = this.ctx;
    const L = this.L;
    ctx.setTransform(...base);
    const tr = this.aiTrace;
    if (tr) {
      for (const l of tr.lanes) {
        const y = cellY(L, l.row, w.cols) + 6;
        const x = cellX(L, w.cols) + 4;
        const k = Math.min(1, l.pressure / 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, y, 110, 34);
        ctx.fillStyle = l.emergency ? '#ff4d6d' : k > 0.66 ? '#ffb347' : k > 0.33 ? '#ffe066' : '#7bed9f';
        ctx.fillRect(x + 5, y + 23, 100 * k, 6);
        ctx.fillStyle = '#fff';
        ctx.font = '11px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`压力 ${l.pressure.toFixed(2)}  ${l.dps}/${l.need}`, x + 5, y + 14);
      }
      const cmd = tr.chosen[0]?.cmd ?? this.aiSuggestion?.cmd;
      if (cmd && (cmd.type === 'place' || cmd.type === 'upgrade')) {
        ctx.strokeStyle = `rgba(128,255,219,${0.6 + Math.sin(this.time * 8) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(cellX(L, cmd.col) + 3, cellY(L, cmd.row, cmd.col) + 3, CELL_W - 6, L.rowH - 6);
      }
    }
    const sug = this.aiSuggestion;
    if (sug && sug.cmd.type === 'place') {
      const c = sug.cmd;
      const def = CONTENT.units.get(c.card);
      const skin = def ? PLANT_SKINS[def.id] : undefined;
      const rd = skin ? PVZ.reanim(skin.reanim) : null;
      if (skin && rd) {
        const r = new Reanim(rd);
        if (!r.play(skin.thumb ?? skin.idle)) r.playAll();
        r.alpha = 0.45 + Math.sin(this.time * 5) * 0.15;
        r.draw(ctx, translate(base, cellX(L, c.col), cellY(L, c.row, c.col)), PVZ_IMAGES);
        ctx.setTransform(...base);
        ctx.fillStyle = '#80ffdb';
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AI 建议', cellX(L, c.col) + 40, cellY(L, c.row, c.col) + 14);
      }
    }
  }

  /** 右下角关卡进度条（原版旗帜进度条） */
  private drawFlagMeter(w: World): void {
    const total = w.totalWaves ?? 0;
    if (!total) return;
    const ctx = this.ctx;
    const meter = this.img('IMAGE_FLAGMETER');
    const parts = this.img('IMAGE_FLAGMETERPARTS');
    const label = this.img('IMAGE_FLAGMETERLEVELPROGRESS');
    if (!meter) return;
    ctx.setTransform(...this.base);
    const x = Math.min(this.L.viewW, (this.cssW - this.ox) / this.scale) - meter.w - 14;
    const y = this.L.viewH - meter.ch - 8;
    const prog = Math.min(1, Math.max(0, (w.waveIndex + (w.waveTimer > 0 ? 0 : 0)) / total));
    // 底框
    ctx.drawImage(meter.img, 0, 0, meter.w, meter.ch, x, y, meter.w, meter.ch);
    // 进度（从右往左填充）
    const fillW = (meter.w - 14) * prog;
    ctx.drawImage(meter.img, meter.w - 7 - fillW, meter.ch, fillW, meter.ch, x + meter.w - 7 - fillW, y, fillW, meter.ch);
    if (parts) {
      // 旗帜
      for (let i = 1; i <= total; i++) {
        if (!w.level.waves?.[i - 1]?.flag && !(w.level.gen && (i % (w.level.gen.flagEvery ?? 10) === 0 || i === total))) continue;
        const fx = x + meter.w - 7 - (meter.w - 14) * (i / total);
        const raised = w.waveIndex >= i ? -8 : 0;
        ctx.drawImage(parts.img, parts.cw * 1, 0, parts.cw, parts.h, fx - 10, y - 8 + raised, parts.cw, parts.h);
        ctx.drawImage(parts.img, parts.cw * 2, 0, parts.cw, parts.h, fx - 10, y - 4, parts.cw, parts.h);
      }
      // 僵尸头
      const hx = x + meter.w - 7 - (meter.w - 14) * prog;
      ctx.drawImage(parts.img, 0, 0, parts.cw, parts.h, hx - 12, y + 2, parts.cw, parts.h);
    }
    if (label) ctx.drawImage(label.img, x + (meter.w - label.w) / 2, y + meter.ch - 14);
  }

  /* ---------------------------- 经典 HUD（种子槽） ---------------------------- */

  /** 种子槽布局：原版在 6 格以上时缩小卡片间距 */
  bankLayout(n: number): { x: number; y: number; w: number; spacing: number; first: number; shovelX: number; upgradeX: number } {
    const spacing = n <= 7 ? 59 : n === 8 ? 54 : n === 9 ? 52 : 51;
    const first = 85;
    const w = Math.max(446, first + n * spacing + 10);
    const x = 10;
    return { x, y: 0, w, spacing, first, shovelX: x + w + 2, upgradeX: x + w + 74 };
  }

  /** 屏幕坐标命中测试：返回点击到的 HUD 元素 */
  hudAt(px: number, py: number, w: World): { kind: 'card'; index: number } | { kind: 'shovel' } | { kind: 'upgrade' } | null {
    if (!this.L) return null;
    const { x, y } = this.toLogical(px, py);
    const B = this.bankLayout(w.deck.length);
    if (y >= B.y && y <= B.y + 87) {
      for (let i = 0; i < w.deck.length; i++) {
        const cx = B.x + B.first + i * B.spacing - 4;
        if (x >= cx && x <= cx + 50 && y >= B.y + 6 && y <= B.y + 80) return { kind: 'card', index: i };
      }
      if (x >= B.shovelX && x <= B.shovelX + 70 && y <= B.y + 72) return { kind: 'shovel' };
      if (x >= B.upgradeX && x <= B.upgradeX + 70 && y <= B.y + 72) return { kind: 'upgrade' };
    }
    return null;
  }

  /** 生成种子包缩略图（50×70，与原版一致） */
  private drawHud(w: World, base: Mat, dt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(...base);
    const B = this.bankLayout(w.deck.length);
    const bank = this.img('IMAGE_SEEDBANK');
    if (bank) {
      // 左段 + 可延展中段 + 右端
      ctx.drawImage(bank.img, 0, 0, 430, 87, B.x, B.y, 430, 87);
      if (B.w > 446) ctx.drawImage(bank.img, 380, 0, 50, 87, B.x + 430, B.y, B.w - 446, 87);
      ctx.drawImage(bank.img, 430, 0, 16, 87, B.x + B.w - 16, B.y, 16, 87);
    }
    // 阳光数
    this.sunPulse = Math.max(0, this.sunPulse - dt);
    const sunFont = BitmapFont.get(FONTS.sun);
    const sunText = w.cheats?.infiniteLumen ? '∞' : String(Math.floor(w.lumen));
    if (sunFont && !w.cheats?.infiniteLumen) sunFont.draw(ctx, sunText, B.x + 39, B.y + 79, '#000000', 0.5, 1 + this.sunPulse);
    else {
      ctx.fillStyle = '#000';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sunText, B.x + 39, B.y + 79);
    }
    // 种子包
    const costFont = BitmapFont.get(FONTS.cost);
    const sel = this.hudState.selected;
    w.deck.forEach((c, i) => {
      const px = B.x + B.first + i * B.spacing - 4;
      const py = B.y + 8;
      const cost = w.cardCost(c.def);
      const afford = w.lumen >= cost || !!w.cheats?.infiniteLumen;
      const ready = c.cooldown <= 0;
      const picked = sel?.kind === 'card' && sel.id === c.id;
      // 原版：阳光不足/已拿起时整包置灰（128），冷却中从上往下覆盖深色（64）
      const img = packetCanvas(c.id, 1, !afford || picked ? 1 : 0);
      if (img) ctx.drawImage(img, px, py);
      else {
        ctx.fillStyle = '#c9e6a3';
        ctx.fillRect(px, py, 50, 70);
      }
      if (!ready) {
        const max = w.cardCooldown(c.def);
        const k = Math.min(1, c.cooldown / Math.max(0.01, max));
        const dark = packetCanvas(c.id, 1, 2);
        const hh = Math.round(68 * k) + 2;
        if (dark) ctx.drawImage(dark, 0, 0, 50, hh, px, py, 50, hh);
      }
      if (costFont) costFont.draw(ctx, String(cost), px + 32, py + 66, '#000000', 1);
      else {
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(cost), px + 40, py + 66);
      }
      // 快捷键数字
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1 <= 9 ? i + 1 : 0), px + 3, py + 10);
    });
    // 铲子槽
    const sb = this.img('IMAGE_SHOVELBANK');
    const sh = this.img('IMAGE_SHOVEL');
    if (sb) ctx.drawImage(sb.img, B.shovelX, B.y);
    if (sh && sel?.kind !== 'remove') ctx.drawImage(sh.img, B.shovelX - 5, B.y - 4);
    // 强化槽（本作新增）：同款木槽 + 星形
    if (sb) ctx.drawImage(sb.img, B.upgradeX, B.y);
    if (sel?.kind !== 'upgrade') this.drawStar(B.upgradeX + 35, B.y + 34, 20);
    // 光标跟随
    const m = this.hudState.mouse;
    if (m) {
      const p = this.toLogical(m.x, m.y);
      if (sel?.kind === 'card' && sel.id) {
        const skin = PLANT_SKINS[sel.id];
        const def = skin ? PVZ.reanim(skin.reanim) : null;
        if (skin && def) {
          const r = new Reanim(def);
          if (!r.play(skin.thumb ?? skin.idle)) r.playAll();
          r.draw(ctx, translate(base, p.x - 40, p.y - 60), PVZ_IMAGES);
        }
      } else if (sel?.kind === 'remove' && sh) {
        ctx.setTransform(...base);
        ctx.drawImage(sh.img, p.x - 20, p.y - 60);
      } else if (sel?.kind === 'upgrade') {
        ctx.setTransform(...base);
        this.drawStar(p.x, p.y - 20, 18);
      }
    }
    ctx.setTransform(...base);
  }

  private drawStar(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.setTransform(...this.base);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, '#fff6a0');
    g.addColorStop(1, '#f0a020');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#6b3d0a';
    ctx.stroke();
  }

  private drawStart(w: World, base: Mat, dt: number): void {
    if (this.startPlayed) return;
    if (!this.start) {
      const def = PVZ.reanim('StartReadySetPlant');
      if (!def) return;
      this.start = new Reanim(def);
      this.start.playAll('hold');
    }
    this.start.update(dt);
    const L = this.L;
    this.start.draw(this.ctx, translate(base, L.viewW / 2 - 150, L.viewH / 2 - 70), PVZ_IMAGES);
    if (this.start.done) this.startPlayed = true;
    void w;
  }

  private drawBanners(dt: number): void {
    const ctx = this.ctx;
    ctx.setTransform(...this.base);
    const L = this.L;
    let i = 0;
    for (const b of this.banners) {
      b.t += dt;
      const k = b.t / b.dur;
      const a = k < 0.12 ? k / 0.12 : k > 0.82 ? (1 - k) / 0.18 : 1;
      const sc = 1 + Math.max(0, 0.12 - b.t) * 3;
      if (b.image) {
        const li = this.img(b.image);
        if (li) {
          ctx.globalAlpha = Math.max(0, a);
          const pulse = 1 + Math.sin(b.t * 10) * 0.02;
          const s2 = sc * pulse;
          ctx.drawImage(li.img, L.viewW / 2 - (li.w * s2) / 2, L.viewH / 2 - (li.h * s2) / 2, li.w * s2, li.h * s2);
        }
      } else if (b.text) {
        const y = L.viewH * 0.36 + i * 56;
        ctx.globalAlpha = Math.max(0, a);
        ctx.textAlign = 'center';
        ctx.font = `900 34px "Microsoft YaHei", "PingFang SC", sans-serif`;
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.save();
        ctx.translate(L.viewW / 2, y);
        ctx.scale(sc, sc);
        ctx.strokeText(b.text, 0, 0);
        ctx.fillStyle = b.color;
        ctx.fillText(b.text, 0, 0);
        if (b.sub) {
          ctx.font = '600 15px "Microsoft YaHei", sans-serif';
          ctx.lineWidth = 4;
          ctx.strokeText(b.sub, 0, 26);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(b.sub, 0, 26);
        }
        ctx.restore();
        i++;
      }
    }
    ctx.globalAlpha = 1;
    this.banners = this.banners.filter((b) => b.t < b.dur);
  }

  private drawBossBar(w: World): void {
    const boss = w.bossIds.map((id) => w.enemyById(id)).find(Boolean);
    if (!boss) return;
    const ctx = this.ctx;
    const bw = Math.min(520, this.cssW * 0.5);
    const x = (this.cssW - bw) / 2;
    const y = 10;
    ctx.fillStyle = 'rgba(40,20,10,0.8)';
    ctx.fillRect(x - 6, y - 4, bw + 12, 30);
    ctx.strokeStyle = '#c8a050';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 6, y - 4, bw + 12, 30);
    const k = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x, y + 13, bw * k, 8);
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    const name = PVZ.str(ZOMBIE_SKINS[boss.def.id]?.nameKey ?? '', boss.def.name);
    ctx.fillText(`${name}  ${Math.ceil(boss.hp)} / ${Math.round(boss.maxHp)}${boss.boss ? `  ·  阶段 ${boss.boss.phase}` : ''}`, this.cssW / 2, y + 9);
  }
}

export { IDENTITY, slope };
