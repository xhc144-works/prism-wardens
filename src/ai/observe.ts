import type { World } from '../core/sim/world';
import type { Enemy, Unit } from '../core/sim/entities';
import type { EnemyDef, UnitDef } from '../core/types';
import { CONTENT } from '../core/content/registry';
import { TERRAIN } from '../core/content/environment';
import { enemySpeed } from '../core/sim/enemySystem';

/**
 * AI 观察层：只通过游戏内部状态接口读取信息（不做截图识别）。
 * 迷雾中不可见的敌人不会出现在观察结果里（除非开启全视野选项）。
 */

export interface EnemyObs {
  id: number;
  def: EnemyDef;
  row: number;
  x: number;
  hp: number;
  armor: number;
  effHp: number;
  speed: number;
  eta: number; // 到达 x=0 的秒数（忽略阻挡）
  flying: boolean;
  burrowed: boolean;
  shielded: boolean;
  metal: boolean;
  eating: boolean;
  boss: boolean;
  behind: boolean; // 从背后进攻（掘地者钻出后）
}

export interface LaneInfo {
  row: number;
  water: boolean;
  enemies: EnemyObs[];
  groundHp: number;
  airHp: number;
  urgentHp: number;
  nearestX: number;
  dps: number;
  airDps: number;
  lobDps: number;
  shooters: number;
  frontAttackCol: number;
  wallCol: number;
  wallHp: number;
  wallMaxHp: number;
  producers: number;
  timeToBreach: number;
  killTime: number;
  pressure: number;
  shields: number;
  metal: number;
  flyers: number;
  vehicles: number;
  burrowers: number;
  behind: number;
  tanks: number;
  sentinel: boolean;
}

export interface CardObs {
  id: string;
  def: UnitDef;
  cost: number;
  cooldown: number;
  ready: boolean;
  affordable: boolean;
}

export interface Observation {
  time: number;
  lumen: number;
  rows: number;
  cols: number;
  cards: CardObs[];
  lanes: LaneInfo[];
  enemies: EnemyObs[];
  units: Unit[];
  orbs: { id: number; value: number }[];
  wave: number;
  totalWaves: number;
  progress: number;
  producers: number;
  attackers: number;
  totalDps: number;
  maxPressure: number;
  dark: boolean;
  fog: boolean;
  weather: string;
  skyDrops: boolean;
  bossAlive: boolean;
  intermission: boolean;
  expectedWaveHp: number;
  landRows: number;
  levelPool: EnemyDef[];
}

export function unitDps(w: World, u: Unit): number {
  const d = u.def;
  if (u.dead) return 0;
  const rate = w.unitRateMul(u);
  switch (d.behavior) {
    case 'shooter':
      return ((w.unitDamage(u) * (d.shots ?? 1)) / (d.interval ?? 1.4)) * rate;
    case 'lobber':
      return ((w.unitDamage(u) / (d.interval ?? 2.4)) * rate) * (d.splash ? 1.3 : 1);
    case 'chain':
      return ((w.unitDamage(u) * (1 + (d.chains ?? 3) * 0.5)) / (d.interval ?? 2)) * rate;
    case 'spike':
      return (w.unitDamage(u) / (d.interval ?? 1)) * rate * 0.6;
    case 'aura':
      return ((w.unitDamage(u) * (d.shots ?? 1)) / (d.interval ?? 2)) * rate;
    default:
      return 0;
  }
}

export function enemyEffHp(e: { hp: number; armor: number }): number {
  return e.hp + e.armor;
}

export function observe(w: World): Observation {
  const enemies: EnemyObs[] = [];
  for (const e of w.enemies) {
    if (e.dead || e.escaped) continue;
    if (!w.isVisible(e)) continue;
    if (e.hidden && !w.config.options?.fullVision) continue;
    const sp = Math.max(0.05, enemySpeed(w, e) || e.def.speed);
    enemies.push(toObs(e, sp));
  }
  const lanes: LaneInfo[] = [];
  let producers = 0;
  let attackers = 0;
  let totalDps = 0;
  for (let r = 0; r < w.rows; r++) {
    lanes.push({
      row: r,
      water: w.isWaterRow(r),
      enemies: [],
      groundHp: 0,
      airHp: 0,
      urgentHp: 0,
      nearestX: 99,
      dps: 0,
      airDps: 0,
      lobDps: 0,
      shooters: 0,
      frontAttackCol: -1,
      wallCol: -1,
      wallHp: 0,
      wallMaxHp: 0,
      producers: 0,
      timeToBreach: 999,
      killTime: 0,
      pressure: 0,
      shields: 0,
      metal: 0,
      flyers: 0,
      vehicles: 0,
      burrowers: 0,
      behind: 0,
      tanks: 0,
      sentinel: w.sentinelReady[r],
    });
  }
  const units = w.units.filter((u) => !u.dead && !u.relic && u.layer !== 'instant');
  for (const u of units) {
    const d = u.def;
    const lane = lanes[u.row];
    if (d.behavior === 'producer' || d.behavior === 'upgradeProducer') {
      producers++;
      lane.producers++;
    }
    const dps = unitDps(w, u);
    if (dps > 0) {
      attackers++;
      totalDps += dps;
      if (d.behavior === 'shooter') {
        for (const l of d.lanes ?? [0]) {
          const ln = lanes[u.row + l];
          if (!ln) continue;
          ln.dps += dps / (d.lanes?.length ?? 1);
          if (d.antiAir) ln.airDps += dps / (d.lanes?.length ?? 1);
          ln.shooters++;
          ln.frontAttackCol = Math.max(ln.frontAttackCol, u.col);
        }
      } else if (d.behavior === 'chain') {
        lane.dps += dps * 0.7;
        lane.airDps += dps * 0.7;
        lane.shooters++;
        lane.frontAttackCol = Math.max(lane.frontAttackCol, u.col);
        for (const ln of [lanes[u.row - 1], lanes[u.row + 1]]) {
          if (!ln) continue;
          ln.dps += dps * 0.3;
          ln.airDps += dps * 0.3;
        }
      } else if (d.behavior === 'aura') {
        // 3×3 范围：本行与相邻两行都计入，但只在近距离生效
        for (const ln of [lanes[u.row - 1], lane, lanes[u.row + 1]]) {
          if (!ln) continue;
          ln.dps += ln === lane ? dps * 0.8 : dps * 0.4;
          ln.shooters++;
          ln.frontAttackCol = Math.max(ln.frontAttackCol, u.col);
        }
      } else if (d.behavior === 'lobber') {
        lane.dps += dps;
        lane.lobDps += dps;
        lane.shooters++;
        lane.frontAttackCol = Math.max(lane.frontAttackCol, u.col);
      } else {
        lane.dps += dps;
      }
    }
    if (d.category === 'wall' && u.col > lane.wallCol) {
      lane.wallCol = u.col;
      lane.wallHp = u.hp;
      lane.wallMaxHp = u.maxHp;
    }
  }
  // 熔火图腾：火焰弹伤害 ×2
  for (const u of units) {
    if (u.def.behavior !== 'totem') continue;
    const lane = lanes[u.row];
    let boost = 0;
    for (const s of units) if (s.row === u.row && s.col < u.col && s.def.behavior === 'shooter' && !s.def.pierce) boost += unitDps(w, s) / (s.def.lanes?.length ?? 1);
    lane.dps += boost;
  }
  for (const e of enemies) {
    const lane = lanes[e.row];
    if (!lane) continue;
    lane.enemies.push(e);
    if (e.flying) {
      lane.airHp += e.effHp;
      lane.flyers++;
    } else {
      lane.groundHp += e.shielded && lane.lobDps > lane.dps * 0.4 ? e.hp + e.armor * 0.4 : e.effHp;
      if (!e.burrowed && !e.behind && e.x < lane.nearestX) lane.nearestX = e.x;
    }
    if (e.shielded) lane.shields++;
    if (e.metal) lane.metal++;
    if (e.def.vehicle) lane.vehicles++;
    if (e.burrowed) lane.burrowers++;
    if (e.behind) lane.behind++;
    if (e.effHp >= 1000) lane.tanks++;
  }
  let maxPressure = 0;
  for (const lane of lanes) {
    // 突破时间：最前敌人到达防线的时间 + 屏障能拖延的时间
    let tt = 999;
    for (const e of lane.enemies) {
      if (e.burrowed) continue;
      const defenseX = Math.max(0, lane.frontAttackCol + 1);
      const dist = Math.max(0, e.x - defenseX);
      let t = dist / Math.max(0.05, e.speed);
      if (e.flying) t = e.x / Math.max(0.05, e.speed);
      if (lane.wallCol >= 0 && !e.flying && !e.def.jumper) t += lane.wallHp / Math.max(50, e.def.dps * 1.0 + (e.def.crusher ? 3000 : 0));
      tt = Math.min(tt, t);
      if (e.x < lane.frontAttackCol + 3.5) lane.urgentHp += e.effHp;
    }
    lane.timeToBreach = tt;
    const airKill = lane.airHp > 0 ? lane.airHp / Math.max(1, lane.airDps) : 0;
    const groundKill = lane.groundHp / Math.max(1, lane.dps);
    lane.killTime = Math.max(airKill, groundKill);
    // 压力：需要的击杀时间 / 可用时间（敌人走完整行的时间作为可用窗口）
    const window = Math.max(4, lane.enemies.length ? Math.min(...lane.enemies.map((e) => e.eta)) : 999);
    lane.pressure = lane.enemies.length ? groundKill / Math.max(4, window) + (lane.airHp > 0 && lane.airDps < 1 ? 2 : airKill / Math.max(4, window)) : 0;
    if (lane.pressure > maxPressure) maxPressure = lane.pressure;
  }

  const cards: CardObs[] = w.deck.map((d) => {
    const cost = w.cardCost(d.def);
    return { id: d.id, def: d.def, cost, cooldown: d.cooldown, ready: d.cooldown <= 0, affordable: w.lumen >= cost || !!w.cheats?.infiniteLumen };
  });

  const L = w.level;
  let expectedWaveHp = 0;
  if (L.gen) {
    const i = Math.min(w.waveIndex, (Number.isFinite(w.totalWaves) ? w.totalWaves : 999) - 1);
    expectedWaveHp = (L.gen.base + L.gen.growth * Math.max(0, i)) * 230 * w.hpMul;
  } else if (w.waves[w.waveIndex]) {
    for (const s of w.waves[w.waveIndex].spawns) {
      const d = CONTENT.enemies.get(s.enemy);
      if (d) expectedWaveHp += (d.hp + (d.armor?.hp ?? 0)) * s.count * w.hpMul;
    }
  }
  const levelPool = (L.enemyPool ?? []).map((id) => CONTENT.enemies.get(id)).filter((x): x is EnemyDef => !!x);
  let landRows = 0;
  for (const l of lanes) if (!l.water) landRows++;
  const total = Number.isFinite(w.totalWaves) ? w.totalWaves : Math.max(20, w.waveIndex + 10);
  return {
    time: w.time,
    lumen: w.lumen,
    rows: w.rows,
    cols: w.cols,
    cards,
    lanes,
    enemies,
    units,
    orbs: w.orbs.map((o) => ({ id: o.id, value: o.value })),
    wave: w.waveIndex,
    totalWaves: total,
    progress: total > 0 ? w.waveIndex / total : 0,
    producers,
    attackers,
    totalDps,
    maxPressure,
    dark: w.isDark(),
    fog: !!w.weather.fog,
    weather: w.weather.id,
    skyDrops: w.weather.skyMul > 0 && !w.rules?.c.noSkyDrops && w.level.skyDrops !== false && w.level.time !== 'night',
    bossAlive: w.bossAlive,
    intermission: w.status === 'intermission',
    expectedWaveHp,
    landRows,
    levelPool,
  };
}

function toObs(e: Enemy, speed: number): EnemyObs {
  const dir = e.dir;
  return {
    id: e.id,
    def: e.def,
    row: e.row,
    x: e.x,
    hp: e.hp,
    armor: e.armor,
    effHp: e.hp + e.armor,
    speed,
    eta: dir < 0 ? Math.max(0, e.x) / Math.max(0.05, speed) : 999,
    flying: !!e.def.flying,
    burrowed: e.burrowed,
    shielded: e.armorKind === 'shield' && e.armor > 0,
    metal: e.metal && e.armor > 0,
    eating: e.state === 'eat',
    boss: !!e.def.boss,
    behind: e.dir > 0 || e.state === 'emerge',
  };
}

export function isPlaceableTerrain(w: World, row: number, col: number): boolean {
  return TERRAIN[w.grid[row][col].terrain].placeable;
}
