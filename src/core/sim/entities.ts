import type { ArmorKind, EnemyDef, ProjKind, TerrainCode, UnitDef } from '../types';

export interface UnitBuff {
  dmg: number;
  rate: number; // 攻速加成（加法）
  prod: number; // 生产速度倍率
  heal: number; // 受治疗倍率
  chain: number; // 额外连锁
  maxHpMul: number;
  steam: boolean;
  superconduct: boolean;
  lunarAlways: boolean;
  gravityTrap: boolean;
}

export const emptyBuff = (): UnitBuff => ({
  dmg: 1,
  rate: 0,
  prod: 1,
  heal: 1,
  chain: 0,
  maxHpMul: 1,
  steam: false,
  superconduct: false,
  lunarAlways: false,
  gravityTrap: false,
});

export interface Unit {
  id: number;
  def: UnitDef;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  rank: number;
  timer: number;
  armTimer: number;
  armed: boolean;
  digest: number;
  fuse: number;
  shield: number;
  overcharge: number;
  burst: number;
  burstTimer: number;
  chomp: number;
  chompTarget: number;
  layer: 'main' | 'plate' | 'instant';
  buff: UnitBuff;
  placedTick: number;
  dead: boolean;
  relic?: boolean;
  dmgDealt: number;
  kills: number;
  // 表现层用
  flash: number;
  anim: number;
}

export type EnemyState = 'walk' | 'eat' | 'jump' | 'burrow' | 'emerge' | 'cast' | 'smash' | 'throw' | 'dive' | 'fly' | 'boss';

export interface BossState {
  phase: number;
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  mode: string;
  modeT: number;
  span: number; // 蚀之王占据的行跨度（中心行±span）
  targetRow: number;
  hits: number;
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  row: number;
  y: number; // 表现用：行坐标（换行时插值）
  x: number;
  hp: number;
  maxHp: number;
  armor: number;
  armorMax: number;
  armorKind?: ArmorKind;
  metal: boolean;
  speedMul: number;
  dmgMul: number;
  slow: number;
  slowMul: number;
  freeze: number;
  stun: number;
  state: EnemyState;
  stateT: number;
  target: number;
  timer: number;
  timer2: number;
  dir: -1 | 1;
  jumped: boolean;
  jumpFrom: number;
  jumpTo: number;
  berserk: boolean;
  submerged: boolean;
  burrowed: boolean;
  hidden: boolean;
  ammo: number;
  thrown: boolean;
  wave: number;
  spawnTick: number;
  lastHit: string;
  dead: boolean;
  escaped?: boolean;
  boss?: BossState;
  rowSpan?: [number, number];
  // 表现层
  flash: number;
  anim: number;
}

export interface Projectile {
  id: number;
  kind: ProjKind;
  row: number;
  fromRow: number;
  x: number;
  vx: number;
  dmg: number;
  slow?: { mul: number; dur: number };
  pierce: boolean;
  antiAir: boolean;
  splash: number;
  splashMul: number;
  src: string;
  srcId: number;
  hits: number[];
  totems: number[];
  miss: boolean;
  age: number;
  lob?: { target: number; sx: number; tx: number; t: number; dur: number; h: number; trow: number };
  enemyShot?: { targetUnit: number; dmg: number };
  dead: boolean;
}

export interface Orb {
  id: number;
  value: number;
  x: number;
  y: number;
  fromY: number;
  t: number;
  fall: number;
  life: number;
  src: 'sky' | 'unit' | 'node' | 'event';
  autoT: number;
}

export interface Cell {
  terrain: TerrainCode;
  main: number; // unit id，0 = 空
  plate: number;
  crack: number; // 剩余秒数，>0 不可部署
  iceTrail: number;
  tomb: boolean;
  node: boolean;
  nodeTimer: number;
  arrow: 0 | -1 | 1;
}

export interface Sentinel {
  row: number;
  x: number;
  hitBoss: number[];
}

export interface Stats {
  lumenCollected: number;
  lumenGenerated: number;
  lumenSpent: number;
  lumenExpired: number;
  skyLumen: number;
  producerLumen: number;
  placements: Record<string, number>;
  placementsTotal: number;
  unitsLost: Record<string, number>;
  unitsLostTotal: number;
  damageBy: Record<string, number>;
  killsBy: Record<string, number>;
  enemiesSpawned: Record<string, number>;
  enemiesKilled: Record<string, number>;
  killsTotal: number;
  ops: number;
  opsByType: Record<string, number>;
  rejected: number;
  rejectedRule: number;
  rejectedReasons: Record<string, number>;
  timeline: { t: number; lumen: number; enemies: number; units: number; threat: number; spent: number }[];
  deployLog: { t: number; unit: string; row: number; col: number; cost: number; wave: number; src: string }[];
  breach?: { row: number; enemy: string; t: number; wave: number; x: number };
  sentinelsUsed: number;
  combos: Record<string, number>;
  skillsUsed: number;
  itemsUsed: number;
  upgrades: number;
  cheatsUsed: boolean;
  peakUnits: number;
  peakEnemies: number;
  coinsEarned: number;
  bossDefeated: string[];
  eventsSeen: string[];
  weatherSeen: string[];
  lumenHeld: number; // 时间积分，用于计算平均闲置光能
}

export const newStats = (): Stats => ({
  lumenCollected: 0,
  lumenGenerated: 0,
  lumenSpent: 0,
  lumenExpired: 0,
  skyLumen: 0,
  producerLumen: 0,
  placements: {},
  placementsTotal: 0,
  unitsLost: {},
  unitsLostTotal: 0,
  damageBy: {},
  killsBy: {},
  enemiesSpawned: {},
  enemiesKilled: {},
  killsTotal: 0,
  ops: 0,
  opsByType: {},
  rejected: 0,
  rejectedRule: 0,
  rejectedReasons: {},
  timeline: [],
  deployLog: [],
  sentinelsUsed: 0,
  combos: {},
  skillsUsed: 0,
  itemsUsed: 0,
  upgrades: 0,
  cheatsUsed: false,
  peakUnits: 0,
  peakEnemies: 0,
  coinsEarned: 0,
  bossDefeated: [],
  eventsSeen: [],
  weatherSeen: [],
  lumenHeld: 0,
});

export const inc = (rec: Record<string, number>, k: string, v = 1): void => {
  rec[k] = (rec[k] ?? 0) + v;
};
