import type {
  CheatConfig,
  Command,
  CommandResult,
  CommandSource,
  EnemyDef,
  FxEvent,
  FxRecord,
  GameConfig,
  LevelDef,
  MapDef,
  RecordedCommand,
  TerrainCode,
  UnitDef,
  WaveDef,
} from '../types';
import { DT, META_LEVEL_BONUS, RANK_COST_MUL, RANK_MUL, sec } from '../constants';
import { Rng, hashString } from '../rng';
import { CONTENT } from '../content/registry';
import { TERRAIN, WEATHER, type WeatherDef } from '../content/environment';
import { SKILLS, ITEMS } from '../content/abilities';
import { RuleEngine } from '../rules/ruleEngine';
import { type Cell, type Enemy, type Orb, type Projectile, type Sentinel, type Unit, emptyBuff, inc, newStats, type Stats } from './entities';
import { updateUnits } from './unitSystem';
import { updateEnemies, breachCheck } from './enemySystem';
import { updateProjectiles } from './projectileSystem';
import { initWaves, updateWaves } from './waveSystem';
import { initEnvironment, updateEnvironment } from './environmentSystem';
import { updateCombos } from './comboSystem';
import { initBoss, updateBosses } from './bossSystem';
import { useSkill, useItem } from './abilitySystem';
import { updateCheats } from './cheatSystem';

export type WorldStatus = 'running' | 'intermission' | 'won' | 'lost';

export interface CardState {
  id: string;
  def: UnitDef;
  cooldown: number;
}

export interface SkillState {
  id: string;
  cooldown: number;
}

/** 内部使用的特殊单位定义：圣物（保护目标） */
export const RELIC_DEF: UnitDef = {
  id: '__relic',
  name: '圣物',
  nameEn: 'Relic',
  desc: '必须保护的古老圣物。',
  category: 'utility',
  attack: 'none',
  behavior: 'wall',
  cost: 0,
  cooldown: 0,
  hp: 2000,
  colors: { a: '#ffe8a3', b: '#b8860b', glow: '#fffbe0' },
  art: 'relic',
};

/**
 * 游戏世界：一局对局的完整状态与规则。
 * - 纯逻辑，不依赖渲染；可在 Node/Worker 中以任意速度运行。
 * - 所有随机性来自 rng，所有外部输入都通过 issue() 指令进入并被记录，保证可回放。
 */
export class World {
  readonly config: GameConfig;
  readonly level: LevelDef;
  readonly map: MapDef;
  readonly rows: number;
  readonly cols: number;
  rng: Rng;
  waveRng: Rng;

  tick = 0;
  time = 0;
  status: WorldStatus = 'running';
  endReason = '';

  grid: Cell[][] = [];
  units: Unit[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  orbs: Orb[] = [];
  sentinels: Sentinel[] = [];
  sentinelReady: boolean[] = [];
  byRow: Enemy[][] = [];

  lumen: number;
  deck: CardState[] = [];
  skills: SkillState[] = [];
  items: Record<string, number> = {};
  nextId = 1;

  // 波次
  waves: WaveDef[] = [];
  totalWaves = 0;
  waveIndex = 0;
  waveTimer = 0;
  waveElapsed = 0;
  waveHp = 1;
  pending: { tick: number; enemy: string; row: number; x?: number; wave: number }[] = [];
  flagWarnAt = -1;
  roundSize = 0;
  roundRested: number[] = [];
  spawnCounts: number[] = [];

  // 环境
  weather: WeatherDef = WEATHER.clear;
  weatherLeft = 0;
  weatherIdx = 0;
  activeEvents: { id: string; left: number }[] = [];
  eventTimer = 0;
  skyTimer = 0;
  lightningTimer = 0;
  meteorTimer = 0;
  fogClear = 0;
  fogStart = 99;
  aegis = 0;
  timeWarp = 0;

  // 修改器 / 规则
  cheats: CheatConfig | null = null;
  cheatsAllowed: boolean;
  autoCollect: boolean;
  autoDeployTimer = 0;
  rules: RuleEngine | null;

  stats: Stats = newStats();
  log: RecordedCommand[] = [];
  rejectedLog: (RecordedCommand & { reason: string })[] = [];
  fx: FxRecord[] = [];
  fxEnabled = true;

  activeCombos: { id: string; a: number; b: number }[] = [];
  comboKeys = new Set<string>();
  comboDirty = true;
  bossIds: number[] = [];
  hpMul: number;

  constructor(config: GameConfig) {
    this.config = config;
    this.level = config.level;
    this.map = CONTENT.resolveMap(config.level.map);
    this.rows = this.map.rows;
    this.cols = this.map.cols;
    this.rng = new Rng(config.seed);
    this.waveRng = new Rng((config.seed ^ hashString(config.level.id)) >>> 0);
    const rc = config.rules?.constraints;
    this.rules = config.rules ? new RuleEngine(config.rules) : null;
    this.cheatsAllowed = config.cheatsAllowed !== false && !config.rules;
    this.autoCollect = !!config.options?.autoCollect;
    this.lumen = rc?.startLumen ?? config.level.startLumen;
    this.hpMul = (config.difficulty ?? 1) * (config.level.hpMul ?? 1);

    // 地图
    for (let r = 0; r < this.rows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < this.cols; c++) {
        const t = (this.map.terrain[r]?.[c] ?? 'g') as TerrainCode;
        row.push({ terrain: TERRAIN[t] ? t : 'g', main: 0, plate: 0, crack: 0, iceTrail: 0, tomb: false, node: false, nodeTimer: 8, arrow: 0 });
      }
      this.grid.push(row);
      this.byRow.push([]);
      this.spawnCounts.push(0);
    }
    for (const t of this.map.tombs ?? []) if (this.inBounds(t.row, t.col)) this.grid[t.row][t.col].tomb = true;
    for (const n of this.map.nodes ?? []) if (this.inBounds(n.row, n.col)) this.grid[n.row][n.col].node = true;
    for (const a of this.map.arrows ?? []) if (this.inBounds(a.row, a.col)) this.grid[a.row][a.col].arrow = a.dir;
    const sentinels = this.map.sentinels !== false && !rc?.noSentinels;
    for (let r = 0; r < this.rows; r++) this.sentinelReady.push(sentinels);

    // 卡组
    for (const id of config.deck) {
      const def = CONTENT.units.get(id);
      if (!def) continue;
      if (this.deck.some((d) => d.id === id)) continue;
      const cd = this.cardCooldown(def);
      this.deck.push({ id, def, cooldown: def.cooldown >= 30 ? Math.min(cd, 20) : 0 });
    }
    for (const id of config.skills ?? []) {
      const s = SKILLS.find((x) => x.id === id);
      if (s) this.skills.push({ id, cooldown: s.initialCooldown });
    }
    for (const [k, v] of Object.entries(config.items ?? {})) if (v > 0 && ITEMS.some((i) => i.id === k)) this.items[k] = v;

    if (config.cheats && this.cheatsAllowed) this.setCheats(config.cheats);

    // 预置单位与圣物
    for (const p of this.map.preplaced ?? []) {
      const def = CONTENT.units.get(p.unit);
      if (def && this.inBounds(p.row, p.col)) this.createUnit(def, p.row, p.col);
    }
    for (const rel of [...(this.level.relics ?? []), ...(rc?.protect ?? [])]) {
      if (!this.inBounds(rel.row, rel.col) || this.grid[rel.row][rel.col].main) continue;
      const u = this.createUnit({ ...RELIC_DEF, hp: rel.hp }, rel.row, rel.col);
      u.relic = true;
    }

    initEnvironment(this);
    initWaves(this);
  }

  /* ============================ 查询 ============================ */

  inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }
  terrainAt(row: number, col: number): TerrainCode {
    if (!this.inBounds(row, col)) return 'g';
    return this.grid[row][col].terrain;
  }
  isWaterRow(row: number): boolean {
    let water = 0;
    for (let c = 0; c < this.cols; c++) if (TERRAIN[this.grid[row][c].terrain].water) water++;
    return water > this.cols / 2;
  }
  unitById(id: number): Unit | undefined {
    if (!id) return undefined;
    for (const u of this.units) if (u.id === id) return u.dead ? undefined : u;
    return undefined;
  }
  enemyById(id: number): Enemy | undefined {
    if (!id) return undefined;
    for (const e of this.enemies) if (e.id === id) return e.dead ? undefined : e;
    return undefined;
  }
  unitAt(row: number, col: number): Unit | undefined {
    if (!this.inBounds(row, col)) return undefined;
    return this.unitById(this.grid[row][col].main);
  }
  plateAt(row: number, col: number): Unit | undefined {
    if (!this.inBounds(row, col)) return undefined;
    return this.unitById(this.grid[row][col].plate);
  }
  aliveUnitCount(): number {
    let n = 0;
    for (const u of this.units) if (!u.dead && !u.relic && u.layer !== 'instant') n++;
    return n;
  }
  isDark(): boolean {
    return this.level.time === 'night' || !!this.weather.dark;
  }
  get bossAlive(): boolean {
    return this.bossIds.some((id) => this.enemyById(id));
  }
  get enemiesAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }

  metaMul(def: UnitDef): number {
    const lvl = this.config.upgrades?.[def.id] ?? 1;
    return 1 + META_LEVEL_BONUS * (Math.max(1, lvl) - 1);
  }

  cardCost(def: UnitDef): number {
    if (this.cheats?.freeCards) return 0;
    let c = def.cost * (this.rules?.c.costMul ?? 1);
    const cm = this.cheats?.perUnit?.[def.id]?.cost ?? this.cheats?.unit?.cost;
    if (cm != null) c *= cm;
    return Math.max(0, Math.round(c));
  }
  cardCooldown(def: UnitDef): number {
    if (this.cheats?.noCooldown) return 0;
    let c = def.cooldown * (this.rules?.c.cooldownMul ?? 1);
    const cm = this.cheats?.perUnit?.[def.id]?.cooldown ?? this.cheats?.unit?.cooldown;
    if (cm != null) c *= cm;
    return Math.max(0, c);
  }
  upgradeCost(u: Unit): number {
    if (u.rank >= 3) return Infinity;
    if (this.cheats?.freeCards) return 0;
    return Math.round(u.def.cost * RANK_COST_MUL[u.rank + 1] * (this.rules?.c.costMul ?? 1));
  }

  unitDamage(u: Unit): number {
    const d = u.def;
    let dmg = (d.damage ?? 0) * RANK_MUL[u.rank] * this.metaMul(d) * u.buff.dmg;
    dmg *= TERRAIN[this.grid[u.row]?.[u.col]?.terrain ?? 'g'].dmgMul ?? 1;
    if (d.lunar || d.solar) dmg *= this.isDark() || u.buff.lunarAlways ? d.lunar ?? 1 : d.solar ?? 1;
    if (this.activeEvents.some((e) => e.id === 'blessing')) dmg *= 1.4;
    const cm = this.cheats?.perUnit?.[d.id]?.damage ?? this.cheats?.unit?.damage;
    if (cm != null) dmg *= cm;
    return dmg;
  }
  unitRateMul(u: Unit): number {
    let r = (1 + Math.min(0.6, u.buff.rate)) * this.weather.unitRateMul;
    if (u.overcharge > 0) r *= 3;
    const cm = this.cheats?.perUnit?.[u.def.id]?.rate ?? this.cheats?.unit?.rate;
    if (cm != null) r *= cm;
    return r;
  }

  /** 敌人能否被某类攻击命中 */
  targetable(e: Enemy, opts: { antiAir?: boolean; lob?: boolean; ground?: boolean } = {}): boolean {
    if (e.dead || e.escaped) return false;
    if (e.burrowed || e.submerged || e.hidden) return false;
    if (e.def.flying && !opts.antiAir) return false;
    if (e.state === 'jump' && opts.lob) return false;
    return true;
  }

  /** 敌人是否在某行（蚀之王横跨多行） */
  inRow(e: Enemy, row: number): boolean {
    if (e.rowSpan) return row >= e.rowSpan[0] && row <= e.rowSpan[1];
    return e.row === row;
  }

  enemiesInRow(row: number): Enemy[] {
    return this.byRow[row] ?? [];
  }

  /** 迷雾中是否可见（仅影响观察，不影响战斗） */
  isVisible(e: Enemy): boolean {
    if (this.config.options?.fullVision) return true;
    if (!this.weather.fog || this.fogClear > 0) return true;
    if (e.x < this.fogStart) return true;
    for (const u of this.units) {
      if (u.dead || u.def.behavior !== 'lantern') continue;
      const r = u.def.radius ?? 2;
      if (Math.hypot(u.col + 0.5 - e.x, u.row - e.row) <= r + 0.5) return true;
    }
    return false;
  }

  /* ============================ 表现事件 ============================ */

  emit(e: FxEvent): void {
    if (this.fxEnabled) this.fx.push({ tick: this.tick, e });
  }
  drainFx(): FxRecord[] {
    const f = this.fx;
    this.fx = [];
    return f;
  }

  /* ============================ 指令 ============================ */

  /** 校验一条指令是否合法（不执行、不计入统计）。AI 用它规划合法行动。 */
  validate(cmd: Command, src: CommandSource = 'human', opts: { ignoreCost?: boolean } = {}): CommandResult {
    const r = this.validateGame(cmd, src, opts.ignoreCost);
    if (!r.ok) return r;
    if (this.rules && src !== 'system') {
      const rr = this.rules.validateCommand(cmd, this);
      if (!rr.ok) return { ok: false, reason: rr.reason, rule: true };
    }
    return { ok: true };
  }

  /** 发出指令：校验 -> 执行 -> 记录 */
  issue(cmd: Command, src: CommandSource = 'human'): CommandResult {
    const r = this.validate(cmd, src);
    if (!r.ok) {
      this.stats.rejected++;
      if (r.rule) this.stats.rejectedRule++;
      inc(this.stats.rejectedReasons, r.reason ?? '未知');
      if (this.rejectedLog.length < 500) this.rejectedLog.push({ tick: this.tick, cmd, src, reason: r.reason ?? '' });
      return r;
    }
    this.execute(cmd, src);
    this.log.push({ tick: this.tick, cmd, src });
    return { ok: true };
  }

  private isCheatCmd(cmd: Command): boolean {
    return cmd.type === 'cheats' || cmd.type === 'setLumen' || cmd.type === 'spawn' || cmd.type === 'killAll';
  }

  validateGame(cmd: Command, src: CommandSource, ignoreCost = false): CommandResult {
    if (this.status === 'won' || this.status === 'lost') return { ok: false, reason: '对局已结束' };
    if (this.isCheatCmd(cmd)) {
      if (!this.cheatsAllowed) return { ok: false, reason: '挑战模式下修改器已被禁用', rule: true };
      return { ok: true };
    }
    if (cmd.type === 'option') return { ok: true };
    if (this.status === 'intermission' && cmd.type !== 'reselect' && cmd.type !== 'collect') return { ok: false, reason: '轮间休整中，请先重新选择卡组' };
    switch (cmd.type) {
      case 'place':
        return this.canPlace(cmd.card, cmd.row, cmd.col, ignoreCost);
      case 'remove': {
        const u = this.unitAt(cmd.row, cmd.col) ?? this.plateAt(cmd.row, cmd.col);
        if (!u || u.relic) return { ok: false, reason: '这里没有可移除的单位' };
        return { ok: true };
      }
      case 'collect':
        return this.orbs.some((o) => o.id === cmd.orb) ? { ok: true } : { ok: false, reason: '光球已消失' };
      case 'upgrade': {
        const u = this.unitAt(cmd.row, cmd.col);
        if (!u || u.relic) return { ok: false, reason: '这里没有单位' };
        if (u.rank >= 3) return { ok: false, reason: '已达最高星级' };
        if (u.def.instant || u.def.behavior === 'plate') return { ok: false, reason: '该单位不能强化' };
        const cost = this.upgradeCost(u);
        if (this.lumen < cost && !this.cheats?.infiniteLumen && !ignoreCost) return { ok: false, reason: `光能不足（需要 ${cost}）` };
        return { ok: true };
      }
      case 'skill': {
        const s = this.skills.find((x) => x.id === cmd.skill);
        if (!s) return { ok: false, reason: '未携带该技能' };
        if (s.cooldown > 0) return { ok: false, reason: '技能冷却中' };
        const def = SKILLS.find((x) => x.id === cmd.skill)!;
        if (def.target === 'cell' && (cmd.row == null || cmd.col == null || !this.inBounds(cmd.row, cmd.col))) return { ok: false, reason: '需要指定目标格子' };
        return { ok: true };
      }
      case 'item': {
        if (!this.items[cmd.item]) return { ok: false, reason: '道具数量不足' };
        const def = ITEMS.find((x) => x.id === cmd.item)!;
        if (def.target === 'unit') {
          const u = cmd.row != null && cmd.col != null ? this.unitAt(cmd.row, cmd.col) : undefined;
          if (!u || u.relic) return { ok: false, reason: '需要指定一个守卫' };
        }
        if ((def.target === 'row' || def.target === 'cell') && (cmd.row == null || cmd.row < 0 || cmd.row >= this.rows)) return { ok: false, reason: '需要指定目标' };
        if (def.id === 'rune_restore' && this.sentinelReady[cmd.row!]) return { ok: false, reason: '该行符文哨卫完好' };
        if (def.id === 'rune_restore' && this.rules?.c.noSentinels) return { ok: false, reason: '本挑战没有符文哨卫' };
        return { ok: true };
      }
      case 'reselect':
        if (this.status !== 'intermission') return { ok: false, reason: '现在不能更换卡组' };
        return { ok: true };
      default:
        return { ok: false, reason: '未知指令' };
    }
  }

  canPlace(cardId: string, row: number, col: number, ignoreCost = false): CommandResult {
    const card = this.deck.find((d) => d.id === cardId);
    if (!card) return { ok: false, reason: '卡组中没有这张卡' };
    if (!this.inBounds(row, col)) return { ok: false, reason: '超出战场' };
    if (card.cooldown > 0) return { ok: false, reason: '卡牌冷却中' };
    const cost = this.cardCost(card.def);
    if (this.lumen < cost && !this.cheats?.infiniteLumen && !ignoreCost) return { ok: false, reason: '光能不足' };
    return this.canPlaceDef(card.def, row, col);
  }

  /** 仅检查地形/占位（不检查费用与冷却） */
  canPlaceDef(def: UnitDef, row: number, col: number): CommandResult {
    if (!this.inBounds(row, col)) return { ok: false, reason: '超出战场' };
    const cell = this.grid[row][col];
    const t = TERRAIN[cell.terrain];
    if (cell.terrain === 'x') return { ok: false, reason: '虚空无法部署' };
    if (cell.tomb) return { ok: false, reason: '蚀晶碑占据了这里' };
    if (cell.node) return { ok: false, reason: '光晶矿占据了这里' };
    if (cell.crack > 0) return { ok: false, reason: '地面开裂，暂时无法部署' };
    if (cell.iceTrail > 0 && !def.instant) return { ok: false, reason: '冰痕上无法部署' };
    const main = this.unitById(cell.main);
    if (main?.relic) return { ok: false, reason: '圣物占据了这里' };
    if (def.instant) {
      if (main && !main.relic) return { ok: true }; // 炸弹可以覆盖在单位上方释放
      return { ok: true };
    }
    if (def.upgradeOf) {
      if (!main || main.def.id !== def.upgradeOf) return { ok: false, reason: `只能放在${CONTENT.units.get(def.upgradeOf)?.name ?? def.upgradeOf}上` };
      return { ok: true };
    }
    if (def.aquatic) {
      if (!t.water) return { ok: false, reason: '只能部署在水面' };
      if (cell.plate || main) return { ok: false, reason: '这里已有单位' };
      return { ok: true };
    }
    if (main) return { ok: false, reason: '这里已有单位' };
    if (t.water) {
      if (!cell.plate) return { ok: false, reason: '水面需要先放置浮晶台' };
      return { ok: true };
    }
    if (!t.placeable) return { ok: false, reason: `${t.name}上无法部署` };
    return { ok: true };
  }

  private execute(cmd: Command, src: CommandSource): void {
    const countOp = (type: string) => {
      this.stats.ops++;
      inc(this.stats.opsByType, type);
    };
    switch (cmd.type) {
      case 'place': {
        const card = this.deck.find((d) => d.id === cmd.card)!;
        const cost = this.cardCost(card.def);
        if (!this.cheats?.infiniteLumen) this.lumen -= cost;
        this.stats.lumenSpent += cost;
        card.cooldown = this.cardCooldown(card.def);
        this.placeUnit(card.def, cmd.row, cmd.col, src, cost);
        countOp('place');
        break;
      }
      case 'remove': {
        const u = this.unitAt(cmd.row, cmd.col) ?? this.plateAt(cmd.row, cmd.col);
        if (u) {
          this.removeUnit(u);
          this.emit({ t: 'remove', row: cmd.row, col: cmd.col });
        }
        countOp('remove');
        break;
      }
      case 'collect': {
        const i = this.orbs.findIndex((o) => o.id === cmd.orb);
        if (i >= 0) this.collectOrb(i);
        if (this.rules?.c.countCollectAsOp) countOp('collect');
        else inc(this.stats.opsByType, 'collect');
        break;
      }
      case 'upgrade': {
        const u = this.unitAt(cmd.row, cmd.col)!;
        const cost = this.upgradeCost(u);
        if (!this.cheats?.infiniteLumen) this.lumen -= cost;
        this.stats.lumenSpent += cost;
        const ratio = u.hp / u.maxHp;
        u.rank++;
        u.baseMaxHp = Math.round(u.def.hp * RANK_MUL[u.rank] * this.metaMul(u.def) * this.cheatHpMul(u.def));
        u.maxHp = Math.round(u.baseMaxHp * u.buff.maxHpMul);
        u.hp = Math.max(u.hp, Math.round(u.maxHp * ratio));
        this.stats.upgrades++;
        this.emit({ t: 'upgrade', row: u.row, col: u.col, rank: u.rank });
        countOp('upgrade');
        break;
      }
      case 'skill':
        useSkill(this, cmd.skill, cmd.row, cmd.col);
        this.stats.skillsUsed++;
        countOp('skill');
        break;
      case 'item':
        this.items[cmd.item]--;
        useItem(this, cmd.item, cmd.row, cmd.col);
        this.stats.itemsUsed++;
        countOp('item');
        break;
      case 'cheats':
        this.setCheats(cmd.config);
        break;
      case 'setLumen':
        this.lumen = Math.max(0, Math.round(cmd.value));
        this.stats.cheatsUsed = true;
        break;
      case 'spawn':
        if (CONTENT.enemies.get(cmd.enemy) && cmd.row >= 0 && cmd.row < this.rows) {
          this.spawnEnemy(cmd.enemy, cmd.row, this.cols + 0.6, this.waveIndex);
          this.stats.cheatsUsed = true;
        }
        break;
      case 'killAll':
        for (const e of this.enemies) if (!e.dead && !e.def.boss) this.killEnemy(e, '__cheat');
        this.stats.cheatsUsed = true;
        break;
      case 'reselect': {
        const old = new Map(this.deck.map((d) => [d.id, d]));
        this.deck = [];
        for (const id of cmd.deck) {
          const def = CONTENT.units.get(id);
          if (def && !this.deck.some((d) => d.id === id)) this.deck.push({ id, def, cooldown: old.get(id)?.cooldown ?? 0 });
        }
        for (const d of this.deck) d.cooldown = 0;
        this.status = 'running';
        this.waveTimer = 8;
        this.waveElapsed = -6;
        break;
      }
      case 'option':
        this.autoCollect = cmd.autoCollect;
        break;
    }
  }

  setCheats(cfg: CheatConfig | null): void {
    if (!this.cheatsAllowed) return;
    const prevHp = (d: UnitDef) => this.cheatHpMul(d);
    const before = new Map(this.units.map((u) => [u.id, prevHp(u.def)]));
    this.cheats = cfg ? JSON.parse(JSON.stringify(cfg)) : null;
    if (cfg && isCheatActive(cfg)) this.stats.cheatsUsed = true;
    // 生命倍率变化时同步调整现有单位
    for (const u of this.units) {
      if (u.dead || u.relic) continue;
      const old = before.get(u.id) ?? 1;
      const now = this.cheatHpMul(u.def);
      if (old !== now) {
        const ratio = u.hp / u.maxHp;
        u.baseMaxHp = Math.round((u.baseMaxHp / old) * now);
        u.maxHp = Math.round(u.baseMaxHp * u.buff.maxHpMul);
        u.hp = Math.max(1, Math.round(u.maxHp * ratio));
      }
    }
    if (this.cheats?.infiniteLumen) this.lumen = Math.max(this.lumen, 9990);
  }

  cheatHpMul(def: UnitDef): number {
    return this.cheats?.perUnit?.[def.id]?.hp ?? this.cheats?.unit?.hp ?? 1;
  }

  /* ============================ 实体管理 ============================ */

  createUnit(def: UnitDef, row: number, col: number): Unit {
    const maxHp = Math.round(def.hp * this.metaMul(def) * this.cheatHpMul(def));
    const layer: Unit['layer'] = def.instant ? 'instant' : def.behavior === 'plate' ? 'plate' : 'main';
    const u: Unit = {
      id: this.nextId++,
      def,
      row,
      col,
      hp: maxHp,
      maxHp,
      baseMaxHp: maxHp,
      rank: 1,
      timer: def.firstDelay ? this.rng.range(def.firstDelay[0], def.firstDelay[1]) : def.behavior === 'shooter' || def.behavior === 'lobber' ? 0.3 : (def.interval ?? 1) * 0.5,
      armTimer: def.armTime ?? 0,
      armed: !def.armTime,
      digest: 0,
      fuse: def.fuse ?? 0,
      shield: 0,
      overcharge: 0,
      burst: 0,
      burstTimer: 0,
      chomp: 0,
      chompTarget: 0,
      layer,
      buff: emptyBuff(),
      placedTick: this.tick,
      dead: false,
      dmgDealt: 0,
      kills: 0,
      flash: 0,
      anim: 0,
    };
    if (def.behavior === 'magnet' || def.behavior === 'gravity') u.timer = 1;
    this.units.push(u);
    const cell = this.grid[row][col];
    if (layer === 'plate') cell.plate = u.id;
    else if (layer === 'main') cell.main = u.id;
    this.comboDirty = true;
    return u;
  }

  placeUnit(def: UnitDef, row: number, col: number, src: CommandSource | string, cost: number): Unit {
    let carryRatio = 1;
    if (def.upgradeOf) {
      const old = this.unitAt(row, col);
      if (old) {
        carryRatio = old.hp / old.maxHp;
        this.removeUnit(old);
      }
    }
    const u = this.createUnit(def, row, col);
    if (carryRatio < 1) u.hp = Math.max(1, Math.round(u.maxHp * carryRatio));
    inc(this.stats.placements, def.id);
    this.stats.placementsTotal++;
    this.stats.deployLog.push({ t: Math.round(this.time * 10) / 10, unit: def.id, row, col, cost, wave: this.waveIndex, src: String(src) });
    this.emit({ t: 'place', row, col, unit: def.id });
    const n = this.aliveUnitCount();
    if (n > this.stats.peakUnits) this.stats.peakUnits = n;
    return u;
  }

  removeUnit(u: Unit): void {
    if (u.dead) return;
    u.dead = true;
    const cell = this.grid[u.row]?.[u.col];
    if (cell) {
      if (cell.main === u.id) cell.main = 0;
      if (cell.plate === u.id) cell.plate = 0;
    }
    this.comboDirty = true;
  }

  killUnit(u: Unit, by = ''): void {
    if (u.dead) return;
    this.removeUnit(u);
    if (u.layer !== 'instant') {
      inc(this.stats.unitsLost, u.def.id);
      if (!u.relic) this.stats.unitsLostTotal++;
      this.emit({ t: 'unitDie', row: u.row, col: u.col, unit: u.def.id });
    }
    if (u.relic) this.lose(`圣物被摧毁${by ? `（${CONTENT.enemies.get(by)?.name ?? by}）` : ''}`);
    // 浮台被毁：上面的单位沉入水中
    if (u.layer === 'plate') {
      const top = this.unitAt(u.row, u.col);
      if (top && TERRAIN[this.grid[u.row][u.col].terrain].water) this.killUnit(top, by);
    }
  }

  damageUnit(u: Unit, amount: number, by = ''): void {
    if (u.dead || amount <= 0) return;
    if (this.aegis > 0 && !u.relic) return;
    if (this.cheats?.invincibleUnits && !u.relic) return;
    if (u.shield > 0) {
      const s = Math.min(u.shield, amount);
      u.shield -= s;
      amount -= s;
    }
    u.hp -= amount;
    u.flash = 4;
    if (u.hp <= 0) this.killUnit(u, by);
  }

  spawnEnemy(defId: string, row: number, x: number, wave: number): Enemy {
    const def: EnemyDef = CONTENT.enemy(defId);
    const ce = this.cheats?.enemy;
    const pe = this.cheats?.perEnemy?.[defId];
    const hpMul = this.hpMul * (pe?.hp ?? ce?.hp ?? 1);
    const e: Enemy = {
      id: this.nextId++,
      def,
      row,
      y: row,
      x,
      hp: def.hp * hpMul,
      maxHp: def.hp * hpMul,
      armor: (def.armor?.hp ?? 0) * hpMul,
      armorMax: (def.armor?.hp ?? 0) * hpMul,
      armorKind: def.armor?.kind,
      metal: !!def.armor?.metal,
      speedMul: pe?.speed ?? ce?.speed ?? 1,
      dmgMul: ce?.damage ?? 1,
      slow: 0,
      slowMul: 1,
      freeze: 0,
      stun: 0,
      state: def.flying ? 'fly' : def.burrow ? 'burrow' : def.swim ? 'dive' : def.boss ? 'boss' : 'walk',
      stateT: 0,
      target: 0,
      timer: 0,
      timer2: 0,
      dir: -1,
      jumped: false,
      jumpFrom: 0,
      jumpTo: 0,
      berserk: false,
      submerged: !!def.swim,
      burrowed: !!def.burrow,
      hidden: !!def.stealth,
      ammo: def.catapult ? 20 : 0,
      thrown: false,
      wave,
      spawnTick: this.tick,
      lastHit: '',
      dead: false,
      flash: 0,
      anim: this.rng.next() * 10,
    };
    if (def.summoner) e.timer = 2;
    if (def.boss) initBoss(this, e);
    this.enemies.push(e);
    inc(this.stats.enemiesSpawned, defId);
    return e;
  }

  /** 对敌人造成伤害。front=true 表示正面直射弹（会被塔盾阻挡）。 */
  damageEnemy(e: Enemy, amount: number, src: string, opts: { front?: boolean; dir?: number } = {}): number {
    if (e.dead || amount <= 0) return 0;
    if (this.cheats?.oneHitKill && src && !src.startsWith('__')) amount = Math.max(amount, e.hp + e.armor + 1);
    let dealt = 0;
    if (e.armor > 0) {
      const shieldBlocks = e.armorKind === 'shield' ? !!opts.front && (opts.dir ?? 1) !== e.dir : true;
      if (shieldBlocks) {
        const a = Math.min(e.armor, amount);
        e.armor -= a;
        amount -= a;
        dealt += a;
        if (e.armor <= 0) {
          e.armor = 0;
          this.emit({ t: 'armorBreak', x: e.x, row: e.row, kind: e.armorKind ?? 'helm' });
          if (e.def.berserk) e.berserk = true;
          if (e.armorKind === 'shield') amount = 0; // 盾牌破碎时不溢出
        }
      }
    }
    if (amount > 0) {
      const h = Math.min(e.hp, amount);
      e.hp -= amount;
      dealt += h;
    }
    e.flash = 3;
    e.lastHit = src;
    inc(this.stats.damageBy, src, dealt);
    if (e.hp <= 0) this.killEnemy(e, src);
    return dealt;
  }

  killEnemy(e: Enemy, src: string): void {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    this.stats.killsTotal++;
    inc(this.stats.enemiesKilled, e.def.id);
    inc(this.stats.killsBy, src || 'unknown');
    this.emit({ t: 'enemyDie', x: e.x, row: e.row, enemy: e.def.id, y: e.y });
    if (e.def.coin > 0 && this.rng.chance(e.def.coin)) {
      const v = e.def.boss ? 250 : e.def.coin >= 0.3 ? 25 : 10;
      this.stats.coinsEarned += v;
      this.emit({ t: 'coin', x: e.x, row: e.row });
    }
    if (e.def.splitter) {
      for (let i = 0; i < e.def.splitter.count; i++) {
        const s = this.spawnEnemy(e.def.splitter.into, e.row, e.x + (i === 0 ? -0.25 : 0.3), e.wave);
        s.dir = e.dir;
      }
    }
    if (e.def.boss) {
      this.stats.bossDefeated.push(e.def.id);
      this.emit({ t: 'boss', text: `${e.def.name} 被击败！` });
      // 首领倒下时，残余敌人溃散
      for (const o of this.enemies) if (!o.dead && o !== e) this.killEnemy(o, '__boss');
    }
  }

  spawnOrb(value: number, x: number, y: number, src: Orb['src'], fromY?: number): Orb {
    const o: Orb = {
      id: this.nextId++,
      value: Math.round(value),
      x,
      y,
      fromY: fromY ?? y - 0.35,
      t: 0,
      fall: src === 'sky' ? Math.max(1.5, (y - (fromY ?? -1)) / 1.15) : 0.6,
      life: 14,
      src,
      autoT: src === 'sky' ? 0.8 : 0.6,
    };
    this.orbs.push(o);
    this.stats.lumenGenerated += o.value;
    if (src === 'sky') this.stats.skyLumen += o.value;
    else if (src === 'unit') this.stats.producerLumen += o.value;
    this.emit({ t: 'orb', id: o.id });
    return o;
  }

  collectOrb(i: number): void {
    const o = this.orbs[i];
    this.orbs.splice(i, 1);
    this.lumen += o.value;
    this.stats.lumenCollected += o.value;
    const y = o.t < o.fall ? o.fromY + (o.y - o.fromY) * (o.t / o.fall) : o.y;
    this.emit({ t: 'collect', id: o.id, value: o.value, x: o.x, y });
  }

  /* ============================ 胜负 ============================ */

  lose(reason: string): void {
    if (this.status === 'won' || this.status === 'lost') return;
    if (this.cheats?.noLose && !reason.includes('规则')) return;
    this.status = 'lost';
    this.endReason = reason;
    this.emit({ t: 'end', won: false });
  }

  win(reason: string): void {
    if (this.status === 'won' || this.status === 'lost') return;
    this.status = 'won';
    this.endReason = reason;
    this.emit({ t: 'end', won: true });
  }

  get finished(): boolean {
    return this.status === 'won' || this.status === 'lost';
  }

  /* ============================ 主循环 ============================ */

  step(): void {
    if (this.finished) return;
    this.tick++;
    if (this.status === 'intermission') return;
    this.time += DT;

    for (let r = 0; r < this.rows; r++) this.byRow[r].length = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.rowSpan) {
        for (let r = e.rowSpan[0]; r <= e.rowSpan[1]; r++) if (this.byRow[r]) this.byRow[r].push(e);
      } else if (this.byRow[e.row]) this.byRow[e.row].push(e);
    }

    updateEnvironment(this);
    updateWaves(this);
    updateCombos(this);
    updateUnits(this);
    updateProjectiles(this);
    updateEnemies(this);
    updateBosses(this);
    breachCheck(this);
    this.updateSentinels();
    this.updateOrbs();
    updateCheats(this);

    for (const d of this.deck) if (d.cooldown > 0) d.cooldown = Math.max(0, d.cooldown - DT);
    for (const s of this.skills) if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - DT);
    if (this.cheats?.noCooldown) {
      for (const d of this.deck) d.cooldown = 0;
      for (const s of this.skills) s.cooldown = 0;
    }
    if (this.cheats?.infiniteLumen) this.lumen = Math.max(this.lumen, 9990);
    this.stats.lumenHeld += this.lumen * DT;

    // 清理
    if (this.tick % 15 === 0) {
      this.units = this.units.filter((u) => !u.dead);
      this.enemies = this.enemies.filter((e) => !e.dead);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    const alive = this.enemiesAlive;
    if (alive > this.stats.peakEnemies) this.stats.peakEnemies = alive;
    if (this.tick % sec(2) === 0) {
      let threat = 0;
      for (const e of this.enemies) if (!e.dead) threat += e.hp + e.armor;
      this.stats.timeline.push({
        t: Math.round(this.time),
        lumen: Math.round(this.lumen),
        enemies: alive,
        units: this.aliveUnitCount(),
        threat: Math.round(threat),
        spent: this.stats.lumenSpent,
      });
    }

    this.checkObjective();
    if (this.rules && !this.finished) {
      const r = this.rules.onTick(this);
      if (r?.fail) {
        this.status = 'lost';
        this.endReason = `违反挑战规则：${r.fail}`;
        this.emit({ t: 'end', won: false });
      } else if (r?.win) this.win('达成脚本胜利条件');
    }
  }

  private checkObjective(): void {
    if (this.finished) return;
    const obj = this.level.objective ?? { type: 'waves' };
    if (obj.type === 'survive') {
      if (this.time >= obj.seconds) this.win(`坚持了 ${obj.seconds} 秒`);
      return;
    }
    if (obj.type === 'kills') {
      if (this.stats.killsTotal >= obj.count) this.win(`击败了 ${obj.count} 个敌人`);
      return;
    }
    if (obj.type === 'endless') return;
    if (this.waveIndex >= this.totalWaves && this.pending.length === 0 && this.enemiesAlive === 0) this.win('击退了所有波次');
  }

  private updateSentinels(): void {
    for (const s of this.sentinels) {
      s.x += 4.5 * DT;
      for (const e of this.byRow[s.row]) {
        if (e.dead || e.burrowed) continue;
        if (Math.abs(e.x - s.x) < 0.45) {
          if (e.def.boss) {
            if (!s.hitBoss.includes(e.id)) {
              s.hitBoss.push(e.id);
              this.damageEnemy(e, 1500, '__sentinel');
              if (e.def.boss !== 'king') e.x = Math.min(this.cols - 0.5, e.x + 2);
            }
          } else this.killEnemy(e, '__sentinel');
        }
      }
    }
    this.sentinels = this.sentinels.filter((s) => s.x < this.cols + 1.5);
  }

  triggerSentinel(row: number): boolean {
    if (this.sentinelReady[row] || this.cheats?.infiniteSentinels) {
      if (!this.cheats?.infiniteSentinels) this.sentinelReady[row] = false;
      if (!this.sentinels.some((s) => s.row === row)) this.sentinels.push({ row, x: -0.4, hitBoss: [] });
      this.stats.sentinelsUsed++;
      this.emit({ t: 'sentinel', row });
      return true;
    }
    return false;
  }

  private updateOrbs(): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += DT;
      if (this.autoCollect || this.cheats?.autoCollect) {
        o.autoT -= DT;
        if (o.autoT <= 0) {
          this.collectOrb(i);
          continue;
        }
      }
      if (o.t > o.fall + o.life) {
        this.stats.lumenExpired += o.value;
        this.orbs.splice(i, 1);
      }
    }
  }

  /** 每行威胁值（剩余生命总和），供修改器自动部署等使用 */
  rowThreat(row: number): number {
    let t = 0;
    for (const e of this.byRow[row] ?? []) if (!e.dead) t += e.hp + e.armor;
    return t;
  }
}

export function isCheatActive(c: CheatConfig | null | undefined): boolean {
  if (!c) return false;
  const mulActive = (m?: Record<string, number | undefined>) => !!m && Object.values(m).some((v) => v != null && v !== 1);
  return !!(
    c.infiniteLumen ||
    c.noCooldown ||
    c.freeCards ||
    c.autoCollect ||
    c.autoDeploy ||
    c.invincibleUnits ||
    c.infiniteSentinels ||
    c.oneHitKill ||
    c.noLose ||
    mulActive(c.unit as Record<string, number | undefined>) ||
    mulActive(c.enemy as Record<string, number | undefined>) ||
    (c.perUnit && Object.values(c.perUnit).some((m) => mulActive(m as Record<string, number | undefined>))) ||
    (c.perEnemy && Object.values(c.perEnemy).some((m) => mulActive(m as Record<string, number | undefined>)))
  );
}
