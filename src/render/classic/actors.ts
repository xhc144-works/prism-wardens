/**
 * 经典皮肤的演员：每个单位/敌人对应一个 Reanim 实例，
 * 只根据模拟状态切换动作、贴图与显隐，不修改游戏逻辑。
 */
import type { World } from '../../core/sim/world';
import type { Enemy, Unit } from '../../core/sim/entities';
import { CONTENT } from '../../core/content/registry';
import { PVZ } from '../../pvz/assets';
import { Reanim, type ReanimDef, segmentOf } from '../../pvz/reanim';
import { PLANT_SKINS, ZOMBIE_SKINS, type PlantSkin, type ZombieSkin } from './skins';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function findTrack(def: ReanimDef, names: string[]): string | null {
  for (const n of names) if (def.index.has(n)) return n;
  return null;
}

/* ================================ 植物 ================================ */

export class UnitActor {
  body: Reanim;
  heads: { r: Reanim; spec: { idle: string; shoot: string } }[] = [];
  skin: PlantSkin;
  blinkT = rand(3, 8);
  blink: Reanim | null = null;
  private lastArmed = false;
  private crackStage = 0;
  private digesting = false;
  private exploded = false;
  private rate: number;
  /** 发光（产出前、受击） */
  glow = 0;

  constructor(
    public unitId: number,
    public defId: string,
    def: ReanimDef,
    skin: PlantSkin,
  ) {
    this.skin = skin;
    this.rate = skin.rate ? rand(skin.rate[0], skin.rate[1]) : def.fps;
    this.body = new Reanim(def);
    if (!this.body.play(skin.idle)) this.body.playAll();
    this.body.rate = this.rate;
    this.body.t = Math.random();
    for (const h of skin.hide ?? []) this.body.setTrackVisible(h, false);
    for (const h of skin.heads ?? []) {
      const track = findTrack(def, h.track);
      if (!track) continue;
      const r = new Reanim(def, h.idle);
      r.rate = this.rate;
      r.t = this.body.t;
      this.body.attach(track, r, { relative: true });
      this.heads.push({ r, spec: h });
    }
    if (defId === 'volatile_geode') this.body.play('anim_idle', 'hold');
  }

  onShoot(): void {
    if (this.heads.length) {
      for (const h of this.heads) {
        h.r.play(h.spec.shoot, 'once', 0.05);
        h.r.rate = this.body.def.fps * 2.2;
      }
    } else if (this.skin.shoot && this.body.anim !== this.skin.shoot) {
      this.body.play(this.skin.shoot, 'once', 0.08);
      this.body.rate = this.body.def.fps * 1.6;
    }
  }

  sync(u: Unit, w: World, dt: number): void {
    const s = this.skin;
    // 动作结束后回到待机
    for (const h of this.heads) {
      if (h.r.done) {
        h.r.play(h.spec.idle, 'loop', 0.1);
        h.r.rate = this.rate;
      }
    }
    const b = u.def.behavior;
    if (b === 'mine') {
      if (u.armed && !this.lastArmed) {
        this.body.play('anim_rise', 'once');
        this.body.rate = 18;
      } else if (u.armed && this.body.done) {
        this.body.play('anim_armed', 'loop');
        this.body.rate = 12;
      } else if (!u.armed && this.body.anim !== 'anim_idle') this.body.play('anim_idle', 'hold');
      this.lastArmed = u.armed;
    } else if (b === 'devourer') {
      if (u.digest > 0) {
        if (!this.digesting && (this.body.anim !== 'anim_bite' || this.body.done)) {
          this.body.play('anim_chew', 'loop', 0.1);
          this.body.rate = 12;
          this.digesting = true;
        }
      } else if (this.digesting) {
        this.body.play('anim_swallow', 'once', 0.1);
        this.digesting = false;
      } else if (this.body.done) {
        this.body.play('anim_idle', 'loop', 0.1);
        this.body.rate = this.rate;
      }
    } else if (b === 'instantBomb' || b === 'laneBomb') {
      if (!this.exploded && this.body.has('anim_explode')) {
        this.body.play('anim_explode', 'hold');
        const fuse = Math.max(0.3, u.def.fuse ?? 1);
        this.body.rate = (this.body.count - 1) / fuse;
        this.exploded = true;
      }
    } else if (s.shoot && this.body.anim === s.shoot && this.body.done) {
      this.body.play(s.idle, 'loop', 0.1);
      this.body.rate = this.rate;
    }
    if (b === 'gale' && this.body.anim !== 'anim_blow') {
      this.body.play('anim_blow', 'loop');
    }
    // 坚果受损贴图
    if (s.cracked) {
      const k = u.hp / u.maxHp;
      const stage = k < 1 / 3 ? 2 : k < 2 / 3 ? 1 : 0;
      if (stage !== this.crackStage) {
        this.crackStage = stage;
        this.body.setImage(s.cracked[0], stage === 0 ? null : s.cracked[stage]);
      }
    }
    // 眨眼
    if (s.blink) {
      this.blinkT -= dt;
      if (this.blinkT <= 0 && !this.blink) {
        const r = new Reanim(this.body.def, s.blink.anim, 'once');
        r.rate = 18;
        this.body.attach(s.blink.track, r, { relative: true });
        this.blink = r;
      }
      if (this.blink?.done) {
        this.body.detach(s.blink.track);
        this.blink = null;
        this.blinkT = rand(3, 8);
      }
    }
    // 产出前发光（向日葵类）
    if (b === 'producer' || b === 'upgradeProducer') {
      const interval = (u.def.interval ?? 24) / Math.max(0.1, u.buff.prod);
      const left = u.timer;
      this.glow = left < 1.0 && left > 0 ? 1 - left : Math.max(0, this.glow - dt * 2);
      void interval;
    } else this.glow = Math.max(0, this.glow - dt * 3);
    this.body.flash = Math.max(u.flash > 0 ? 0.35 : 0, this.glow * 0.6);
    for (const h of this.heads) h.r.flash = this.body.flash;
    void w;
  }

  update(dt: number): void {
    this.body.update(dt);
  }
}

/* ================================ 僵尸 ================================ */

/** 计算行走动作的标称地面速度（像素/秒，按 reanim 原始帧率） */
const groundCache = new Map<string, number>();
export function groundSpeed(def: ReanimDef, anim: string): number {
  const key = `${def.name}|${anim}`;
  const got = groundCache.get(key);
  if (got !== undefined) return got;
  let v = 0;
  const seg = segmentOf(def, anim);
  const gi = def.index.get('_ground');
  if (seg && gi !== undefined) {
    const T = def.tracks[gi];
    const dx = Math.abs(T.x[seg[1]] - T.x[seg[0]]);
    const frames = seg[1] - seg[0];
    if (frames > 0) v = (dx / frames) * def.fps;
  }
  groundCache.set(key, v);
  return v;
}

export function isExplosiveSource(src: string): boolean {
  if (!src) return false;
  if (['meteor', 'bomber', 'nova', 'mine', 'fire', 'lane', 'skill', 'meteor_strike'].includes(src)) return true;
  const u = CONTENT.units.get(src);
  return !!u && (u.behavior === 'instantBomb' || u.behavior === 'mine' || u.behavior === 'laneBomb');
}

export class ZombieActor {
  body: Reanim;
  skin: ZombieSkin;
  armorStage = 0;
  armorGone = false;
  armLost = false;
  headLost = false;
  walkAnim: string;
  state = '';
  flag: Reanim | null = null;
  dir: -1 | 1 = -1;
  /** 最近一次的绘制位置（死亡时沿用） */
  lastX = 0;
  lastY = 0;
  lastRow = 0;
  hitFlash = 0;
  dying = false;
  dieT = 0;
  charred: Reanim | null = null;
  fade = 1;
  baseSpeed = 0;

  constructor(
    public enemyId: number,
    public defId: string,
    def: ReanimDef,
    skin: ZombieSkin,
    flagDef: ReanimDef | null,
  ) {
    this.skin = skin;
    this.body = new Reanim(def);
    this.walkAnim = skin.walk[Math.floor(Math.random() * skin.walk.length)];
    if (!this.body.has(this.walkAnim)) this.walkAnim = skin.walk.find((a) => this.body.has(a)) ?? 'anim_walk';
    if (!this.body.play(this.walkAnim)) this.body.playAll();
    this.body.t = Math.random();
    for (const h of skin.hide ?? []) this.body.setTrackVisible(h, false);
    if (skin.reanim === 'Zombie' && Math.random() < 0.5) this.body.setTrackVisible('anim_tongue', true);
    if (skin.tint) this.body.tint = skin.tint;
    if (skin.alpha) this.body.alpha = skin.alpha;
    this.applyArmor(true);
    if (skin.armor === 'flag' && flagDef) {
      this.flag = new Reanim(flagDef);
      if (!this.flag.play('Zombie_flag')) this.flag.playAll();
      this.flag.rate = 15;
      this.body.setTrackVisible('Zombie_flaghand', true);
      this.body.setTrackVisible('anim_innerarm3', false);
      this.body.attach('Zombie_flaghand', this.flag, { relative: true, baseFrame: 0 });
    }
    this.baseSpeed = groundSpeed(def, this.walkAnim);
  }

  private applyArmor(on: boolean): void {
    const a = this.skin.armor;
    const r = this.body;
    if (a === 'cone') r.setTrackVisible('anim_cone', on);
    else if (a === 'bucket') r.setTrackVisible('anim_bucket', on);
    else if (a === 'door') {
      for (const t of ['anim_screendoor', 'Zombie_innerarm_screendoor', 'Zombie_innerarm_screendoor_hand', 'Zombie_outerarm_screendoor']) r.setTrackVisible(t, on);
      for (const t of ['anim_innerarm1', 'anim_innerarm2', 'anim_innerarm3', 'Zombie_outerarm_upper', 'Zombie_outerarm_lower', 'Zombie_outerarm_hand']) r.setTrackVisible(t, !on);
      if (!on && this.armLost) for (const t of this.skin.arm?.drop ?? []) r.setTrackVisible(t, false);
    } else if (a === 'paper') {
      r.setTrackVisible('Zombie_paper_paper', on);
      r.setTrackVisible('Zombie_paper_hands', on);
    }
  }

  /** 返回本帧新产生的视觉事件（掉落物等） */
  sync(e: Enemy, w: World, dt: number): string[] {
    const ev: string[] = [];
    const s = this.skin;
    const r = this.body;
    // 护甲阶段
    if (e.armorMax > 0 && s.armor && s.armor !== 'flag') {
      const k = e.armor / e.armorMax;
      const stage = e.armor <= 0 ? 4 : k > 2 / 3 ? 1 : k > 1 / 3 ? 2 : 3;
      if (stage !== this.armorStage) {
        const prev = this.armorStage;
        this.armorStage = stage;
        const imgs: Record<string, [string, string][]> = {
          cone: [['anim_cone', 'IMAGE_REANIM_ZOMBIE_CONE']],
          bucket: [['anim_bucket', 'IMAGE_REANIM_ZOMBIE_BUCKET']],
          door: [['anim_screendoor', 'IMAGE_REANIM_ZOMBIE_SCREENDOOR']],
          paper: [['Zombie_paper_paper', 'IMAGE_REANIM_ZOMBIE_PAPER_PAPER']],
        };
        if (stage === 4) {
          if (!this.armorGone && prev !== 0) ev.push(`armor:${s.armor}`);
          this.armorGone = true;
          this.applyArmor(false);
          if (s.armor === 'paper') {
            r.play('anim_gasp', 'once', 0.1);
            this.state = 'gasp';
          }
        } else {
          for (const [track, base] of imgs[s.armor] ?? []) r.setImage(track, `${base}${stage}`);
        }
      }
    }
    // 掉臂
    if (!this.armLost && s.arm && e.hp < e.maxHp * (2 / 3)) {
      this.armLost = true;
      r.setImage(s.arm.upper, s.arm.img);
      for (const t of s.arm.drop) r.setTrackVisible(t, false);
      ev.push('arm');
    }
    // 掉头（生命低于 1/3 时头部脱落，之后无头前进）
    if (!this.headLost && s.head?.length && e.hp < e.maxHp / 3 && !e.def.boss) {
      this.headLost = true;
      for (const t of s.head) r.setTrackVisible(t, false);
      ev.push('head');
    }
    // 动作
    let want = this.walkAnim;
    let loop: 'loop' | 'once' | 'hold' = 'loop';
    const paperGone = s.armor === 'paper' && this.armorGone;
    if (this.state === 'gasp' && !r.done) want = 'anim_gasp';
    else if (e.state === 'eat' || e.state === 'smash') want = e.state === 'smash' ? 'anim_smash' : paperGone ? 'anim_eat_nopaper' : s.eat;
    else if (e.state === 'jump') {
      want = 'anim_jump';
      loop = 'hold';
    } else if (e.state === 'throw') {
      want = 'anim_throw';
      loop = 'hold';
    } else if (e.state === 'burrow') want = 'anim_dig';
    else if (e.state === 'emerge') {
      want = 'anim_landing';
      loop = 'hold';
    } else if (e.state === 'cast') want = r.has('anim_armraise') ? 'anim_armraise' : this.walkAnim;
    else if (e.def.jumper && !e.jumped) want = 'anim_run';
    else if (paperGone) want = 'anim_walk_nopaper';
    else if (e.def.catapult && e.ammo > 0 && e.x <= w.cols - 1.6 && e.state === 'walk') want = 'anim_shoot';
    if (e.stun > 0 && r.has('anim_dizzy')) want = 'anim_dizzy';
    if (!r.has(want)) want = r.has(this.walkAnim) ? this.walkAnim : r.anim;
    if (want !== r.anim) {
      r.play(want, loop, 0.12);
      this.state = want === 'anim_gasp' ? 'gasp' : want;
    }
    // 播放速度：行走动作按地面轨道匹配实际移速，避免滑步
    let rate = r.def.fps;
    const isWalk = want === this.walkAnim || want === 'anim_run' || want === 'anim_walk_nopaper' || want === 'anim_swim';
    if (isWalk) {
      const sp = groundSpeed(r.def, want);
      const simPx = e.def.speed * e.speedMul * (e.berserk ? 2.2 : 1) * 80;
      if (sp > 1) rate = r.def.fps * Math.min(3, Math.max(0.3, simPx / sp));
    }
    if (e.slow > 0) rate *= 0.5;
    if (e.freeze > 0 || (e.stun > 0 && !r.has('anim_dizzy'))) rate = 0;
    r.rate = rate;
    r.tint = e.freeze > 0 ? '#8ea8ff' : e.slow > 0 ? '#a9b9ff' : s.tint ?? null;
    this.hitFlash = e.flash > 0 ? 0.9 : Math.max(0, this.hitFlash - dt * 4);
    r.flash = this.hitFlash;
    this.dir = e.dir;
    return ev;
  }

  /** 进入死亡表演 */
  die(explosive: boolean, charredDef: ReanimDef | null): string[] {
    this.dying = true;
    this.dieT = 0;
    const ev: string[] = [];
    if (explosive && charredDef) {
      this.charred = new Reanim(charredDef);
      if (!this.charred.play('anim_crumble', 'hold')) this.charred.playAll('hold');
      this.charred.rate = charredDef.fps;
      return ev;
    }
    const r = this.body;
    r.tint = this.skin.tint ?? null;
    r.flash = 0;
    const death = (this.skin.death ?? ['anim_death']).filter((a) => r.has(a));
    if (death.length) {
      r.play(death[Math.floor(Math.random() * death.length)], 'hold', 0.08);
      r.rate = r.def.fps;
    }
    if (this.skin.head?.length && !this.headLost) {
      for (const t of this.skin.head) r.setTrackVisible(t, false);
      this.headLost = true;
      ev.push('head');
    }
    return ev;
  }

  update(dt: number): void {
    if (this.dying) {
      this.dieT += dt;
      const main = this.charred ?? this.body;
      main.update(dt);
      if (main.done) this.fade = Math.max(0, this.fade - dt * 1.6);
      if (this.dieT > 6) this.fade = 0;
    } else this.body.update(dt);
  }
}

/** 预加载一局所需的全部动画与贴图 */
export async function preloadForWorld(w: World): Promise<void> {
  const names = new Set<string>(['Sun', 'LawnMower', 'PoolCleaner', 'RoofCleaner', 'Zombie_flagpole', 'Zombie_charred', 'StartReadySetPlant', 'FirePea', 'Coin_silver', 'Coin_gold']);
  for (const d of w.deck) {
    const s = PLANT_SKINS[d.id];
    if (s) names.add(s.reanim);
  }
  for (const u of w.units) {
    const s = PLANT_SKINS[u.def.id];
    if (s) names.add(s.reanim);
  }
  const enemies = new Set<string>(w.level.enemyPool ?? []);
  for (const wave of w.level.waves ?? []) for (const sp of wave.spawns) enemies.add(sp.enemy);
  for (const id of ['husk', 'banner_husk', ...enemies]) {
    const s = ZOMBIE_SKINS[id];
    if (!s) continue;
    names.add(s.reanim);
    if (s.charred) names.add(s.charred);
  }
  await PVZ.loadReanimsWithImages([...names]);
}
