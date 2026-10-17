import type { Command, UnitDef } from '../core/types';
import type { World } from '../core/sim/world';
import { RANK_MUL } from '../core/constants';
import { SKILLS, ITEMS } from '../core/content/abilities';
import { CONTENT } from '../core/content/registry';
import { observe, unitDps, type LaneInfo, type Observation, type EnemyObs } from './observe';
import { getStrategy, type StrategyParams } from './strategies';
import { buildDeck } from './deckBuilder';

export type AIRole = 'full' | 'economy' | 'defense' | 'assist' | 'collect' | 'hint';

export const ROLE_NAMES: Record<AIRole, string> = {
  full: '完全托管',
  economy: '只管经济（收集+生产）',
  defense: '只管防御（不种生产单位）',
  assist: '辅助（收集 + 紧急救场）',
  collect: '只收集光能',
  hint: '仅提示（不操作）',
};

export interface AIOptions {
  strategy: StrategyParams | string;
  role?: AIRole;
  bias?: Record<string, number>;
  available?: string[]; // 生存模式重选卡组时可用的卡
  deckSize?: number;
}

export interface Candidate {
  cmd: Command;
  score: number;
  kind: 'econ' | 'attack' | 'wall' | 'bomb' | 'trap' | 'support' | 'utility' | 'upgrade' | 'skill' | 'item' | 'plate' | 'melee';
  label: string;
  reasons: string[];
  cost: number;
  emergency?: boolean;
  then?: { card: string; row: number; col: number };
}

export interface LaneTrace {
  row: number;
  pressure: number;
  dps: number;
  need: number;
  threat: number;
  nearest: number;
  emergency: boolean;
}

export interface DecisionTrace {
  t: number;
  strategy: string;
  goal: string;
  chosen: { label: string; score: number; reasons: string[]; cmd: Command }[];
  alternatives: { label: string; score: number }[];
  lanes: LaneTrace[];
  econ: { producers: number; target: number };
  lumen: number;
  saving?: string;
}

const PROD = new Set(['producer', 'upgradeProducer']);
const DEFAULT_THRESHOLD = 28;
/** 规划时只检查合法性（含挑战规则），不检查当前光能是否足够 */
const LEGAL = { ignoreCost: true };

/**
 * AI 玩家：读取内部状态 -> 生成候选行动 -> 效用评分 -> 通过与人类相同的指令接口执行。
 * 所有指令都会经过挑战规则校验；AI 不持有任何修改器接口。
 */
export class AIAgent {
  base: StrategyParams;
  params: StrategyParams;
  role: AIRole;
  bias: Record<string, number>;
  nextThink = 0;
  traces: DecisionTrace[] = [];
  strategyLog: { t: number; from: string; to: string; why: string }[] = [];
  lastTrace?: DecisionTrace;
  suggestion?: Candidate;
  plan?: { card: string; row: number; col: number; until: number };
  thinkCount = 0;
  actionsIssued = 0;
  rejected = 0;
  private lastAdapt = 0;
  private available?: string[];
  private deckSize: number;

  constructor(opts: AIOptions) {
    this.base = typeof opts.strategy === 'string' ? getStrategy(opts.strategy) : { ...opts.strategy };
    this.params = { ...this.base };
    this.role = opts.role ?? 'full';
    this.bias = opts.bias ?? {};
    this.available = opts.available;
    this.deckSize = opts.deckSize ?? 8;
  }

  setRole(role: AIRole): void {
    this.role = role;
  }

  /** 每个逻辑帧调用；到达决策间隔时进行一次思考 */
  update(w: World): void {
    if (w.finished) return;
    if (w.status === 'intermission') {
      this.handleIntermission(w);
      return;
    }
    if (w.time + 1e-9 < this.nextThink) return;
    this.nextThink = w.time + this.params.thinkInterval;
    this.think(w);
  }

  private handleIntermission(w: World): void {
    if (this.role === 'hint' || this.role === 'collect') return;
    const pool = this.available ?? w.deck.map((d) => d.id);
    const r = buildDeck({ level: w.level, available: pool, size: Math.max(w.deck.length, this.deckSize), strategy: this.params, rules: w.rules, bias: this.bias });
    const res = w.issue({ type: 'reselect', deck: r.deck }, 'ai');
    if (!res.ok) w.issue({ type: 'reselect', deck: w.deck.map((d) => d.id) }, 'ai');
  }

  think(w: World): void {
    this.thinkCount++;
    let obs = observe(w);
    if (this.base.adaptive) this.adapt(w, obs);

    // 收集光能
    if (this.role !== 'defense' && this.role !== 'hint' && !w.autoCollect && !w.cheats?.autoCollect) this.collect(w, obs);

    const chosen: Candidate[] = [];
    let alternatives: Candidate[] = [];
    let saving: string | undefined;
    const maxActions = this.role === 'hint' ? 1 : this.params.maxActions;
    for (let i = 0; i < maxActions; i++) {
      const cands = this.candidates(w, obs).sort((a, b) => b.score - a.score);
      if (i === 0) alternatives = cands.slice(0, 8);
      const threshold = this.threshold(w, obs);
      const affordable = cands.filter((c) => c.cost <= w.lumen || w.cheats?.infiniteLumen);
      const best = affordable[0];
      const bestAny = cands[0];
      if (bestAny && bestAny !== best && bestAny.score > (best?.score ?? 0) + 22 && bestAny.score >= threshold && !bestAny.emergency) {
        saving = bestAny.label;
        // 仍允许执行便宜且非常紧急的行动
        if (!best || !best.emergency) break;
      }
      if (!best || best.score < threshold) break;
      if (this.role === 'hint') {
        this.suggestion = best;
        chosen.push(best);
        break;
      }
      const res = w.issue(best.cmd, 'ai');
      if (!res.ok) {
        this.rejected++;
        break;
      }
      this.actionsIssued++;
      chosen.push(best);
      if (best.then) this.plan = { ...best.then, until: w.time + 6 };
      obs = observe(w);
    }
    if (this.role !== 'hint') this.suggestion = undefined;

    const target = this.econTarget(w, obs);
    const trace: DecisionTrace = {
      t: Math.round(w.time * 10) / 10,
      strategy: this.params.name,
      goal: this.goalText(chosen[0], obs, saving),
      chosen: chosen.map((c) => ({ label: c.label, score: Math.round(c.score), reasons: c.reasons, cmd: c.cmd })),
      alternatives: alternatives.slice(0, 6).map((c) => ({ label: c.label, score: Math.round(c.score) })),
      lanes: obs.lanes.map((l) => ({
        row: l.row,
        pressure: Math.round(l.pressure * 100) / 100,
        dps: Math.round(l.dps),
        need: Math.round(this.laneNeed(w, obs, l)),
        threat: Math.round(l.groundHp + l.airHp),
        nearest: Math.round(l.nearestX * 10) / 10,
        emergency: this.isEmergency(l),
      })),
      econ: { producers: obs.producers, target: Math.round(target * 10) / 10 },
      lumen: Math.round(w.lumen),
      saving,
    };
    this.lastTrace = trace;
    if (chosen.length || this.thinkCount % 10 === 0) {
      this.traces.push(trace);
      if (this.traces.length > 300) this.traces.splice(0, this.traces.length - 300);
    }
  }

  private goalText(c: Candidate | undefined, obs: Observation, saving?: string): string {
    if (c) {
      if (c.emergency) return `紧急应对：${c.label}`;
      switch (c.kind) {
        case 'econ':
          return '发展经济';
        case 'attack':
          return '补强火力';
        case 'wall':
          return '建立屏障';
        case 'bomb':
          return '爆破清场';
        case 'upgrade':
          return '强化主力';
        case 'skill':
        case 'item':
          return '使用技能/道具';
        case 'plate':
          return '铺设水上平台';
        default:
          return '完善阵型';
      }
    }
    if (saving) return `攒光能：${saving}`;
    if (obs.maxPressure > 1) return '等待冷却/光能';
    return '观察战场';
  }

  /** 行动阈值：受规则限制（操作数/消耗上限）时更加谨慎 */
  private threshold(w: World, obs: Observation): number {
    let t = DEFAULT_THRESHOLD;
    const c = w.rules?.c;
    if (c?.maxOperations != null) {
      const left = c.maxOperations - w.stats.ops;
      const wavesLeft = Math.max(1, obs.totalWaves - obs.wave);
      if (left < wavesLeft * 2) t += 25;
      else if (left < wavesLeft * 4) t += 12;
    }
    if (c?.maxTotalSpend != null) {
      const left = c.maxTotalSpend - w.stats.lumenSpent;
      if (left < c.maxTotalSpend * 0.3) t += 15;
    }
    return t;
  }

  private collect(w: World, obs: Observation): void {
    const c = w.rules?.c;
    if (c?.countCollectAsOp) {
      // 收集也计入操作次数：只在需要光能时收集，优先大光球
      const left = (c.maxOperations ?? Infinity) - w.stats.ops;
      const want = Math.min(...obs.cards.filter((x) => x.ready).map((x) => x.cost), 200);
      if (w.lumen >= want || left <= 3) return;
      const orb = [...w.orbs].sort((a, b) => b.value - a.value)[0];
      if (orb) w.issue({ type: 'collect', orb: orb.id }, 'ai');
      return;
    }
    for (const o of [...w.orbs]) w.issue({ type: 'collect', orb: o.id }, 'ai');
  }

  private adapt(w: World, obs: Observation): void {
    if (w.time - this.lastAdapt < 5) return;
    this.lastAdapt = w.time;
    let to = 'balanced';
    let why = '局势平稳';
    const target = this.econTarget(w, obs);
    const needTotal = obs.lanes.reduce((s, l) => s + this.laneNeed(w, obs, l), 0);
    if (obs.maxPressure > 1.15 || obs.lanes.some((l) => this.isEmergency(l))) {
      to = 'defense';
      why = `最大行压力 ${obs.maxPressure.toFixed(2)}，转入防御`;
    } else if (obs.progress < this.base.econStop - 0.1 && obs.maxPressure < 0.5 && obs.producers < target) {
      to = 'economy';
      why = '前期压力低，扩张经济';
    } else if (obs.progress > 0.45 && obs.totalDps > needTotal * 1.6) {
      to = 'rush';
      why = `火力富余（${Math.round(obs.totalDps)}/${Math.round(needTotal)} dps），加速清场`;
    }
    if (to !== this.params.id) {
      const next = getStrategy(to);
      this.strategyLog.push({ t: Math.round(w.time), from: this.params.name, to: next.name, why });
      this.params = { ...next, name: `自适应·${next.name}`, thinkInterval: this.base.thinkInterval };
    }
  }

  /* ============================ 估算 ============================ */

  econTarget(w: World, obs: Observation): number {
    const activeRows = Math.max(1, obs.landRows);
    let t = this.params.econPerRow * activeRows;
    if (!obs.skyDrops) t *= 1.15;
    if (Number.isFinite(w.totalWaves) && w.totalWaves <= 6) t *= 0.75;
    if (obs.progress > this.params.econStop) {
      // 扩张期结束：不再扩张，但被吃掉的生产单位要补回一部分
      return obs.progress < 0.85 ? Math.max(obs.producers, t * 0.5) : obs.producers;
    }
    return t;
  }

  private laneActive(w: World, obs: Observation, lane: LaneInfo): boolean {
    if (!lane.water) return true;
    return obs.levelPool.some((e) => e.swim || e.flying) || lane.enemies.length > 0;
  }

  /** 按敌人池权重估算：一条陆路/水路分别承受整波生命的多少比例 */
  private laneShare(obs: Observation, water: boolean): number {
    let land = 0;
    let swim = 0;
    let fly = 0;
    for (const e of obs.levelPool) {
      if (e.noSpawn || e.boss) continue;
      const wgt = e.weight * e.cost;
      if (e.swim) swim += wgt;
      else if (e.flying) fly += wgt;
      else land += wgt;
    }
    const total = land + swim + fly || 1;
    const waterRows = obs.rows - obs.landRows;
    const flyShare = fly / total / Math.max(1, obs.rows);
    if (water) return waterRows > 0 ? swim / total / waterRows + flyShare : 0;
    return land / total / Math.max(1, obs.landRows) + flyShare;
  }

  laneNeed(w: World, obs: Observation, lane: LaneInfo): number {
    if (!this.laneActive(w, obs, lane)) return 0;
    const nextFlag = w.waves[w.waveIndex]?.flag || w.waves[w.waveIndex + 1]?.flag;
    const waveHp = obs.expectedWaveHp * (nextFlag ? 2.0 : 1) * (1 + this.params.lookahead * 0.35);
    const crossTime = Math.max(12, (w.cols - 2) / 0.24);
    const ramp = obs.wave === 0 ? 0.3 : obs.wave === 1 ? 0.55 : obs.wave === 2 ? 0.8 : 1;
    const share = Math.max(0.05, this.laneShare(obs, lane.water));
    const base = ((waveHp * share) / crossTime) * this.params.safety * ramp;
    let current = 0;
    for (const e of lane.enemies) {
      if (e.burrowed) continue;
      const window = Math.max(5, (e.x - Math.max(0, lane.frontAttackCol + 0.5)) / Math.max(0.08, e.speed));
      current += e.effHp / window;
    }
    current *= this.params.safety;
    // 失去符文哨卫的行没有容错，需要更多火力
    const noSentinel = !lane.sentinel && !w.rules?.c.noSentinels ? 1.3 : 1;
    return Math.max(base, current) * noSentinel;
  }

  private isEmergency(l: LaneInfo): boolean {
    if (!l.enemies.length) return false;
    if (l.nearestX < 1.6 && !l.sentinel) return true;
    return l.timeToBreach < 9 && l.killTime > l.timeToBreach * 1.1;
  }

  private cellsFor(w: World, def: UnitDef): [number, number][] {
    const out: [number, number][] = [];
    for (let r = 0; r < w.rows; r++)
      for (let c = 0; c < w.cols; c++) if (w.validate({ type: 'place', card: def.id, row: r, col: c }, 'ai', LEGAL).ok) out.push([r, c]);
    return out;
  }

  private safeCol(lane: LaneInfo, col: number, margin = 0.6): boolean {
    // 敌人到达该格之前需要有足够距离
    return col + 1.2 + margin < lane.nearestX;
  }

  /* ============================ 候选行动 ============================ */

  candidates(w: World, obs: Observation): Candidate[] {
    const out: Candidate[] = [];
    const role = this.role;
    const allowEcon = role === 'full' || role === 'economy' || role === 'hint';
    const allowDef = role === 'full' || role === 'defense' || role === 'hint' || role === 'assist';
    if (role === 'collect') return out;
    const emergencyLanes = obs.lanes.filter((l) => this.isEmergency(l));
    const assistOnly = role === 'assist';

    // 执行上一步的计划（例如先放浮台再放射手）
    if (this.plan && w.time < this.plan.until) {
      const p = this.plan;
      const cmd: Command = { type: 'place', card: p.card, row: p.row, col: p.col };
      if (w.validate(cmd, 'ai', LEGAL).ok) {
        const def = CONTENT.unit(p.card);
        out.push({ cmd, score: 95, kind: 'attack', label: `${def.name} → 第${p.row + 1}行第${p.col + 1}列`, reasons: ['完成上一步计划（浮台已铺设）'], cost: w.cardCost(def) });
      }
    } else this.plan = undefined;

    for (const card of obs.cards) {
      if (!card.ready) continue;
      const d = card.def;
      if (assistOnly && !(d.category === 'bomb' || d.category === 'wall') ) continue;
      if (PROD.has(d.behavior)) {
        if (allowEcon) this.econCandidates(w, obs, card.def, card.cost, out);
        continue;
      }
      if (!allowDef) continue;
      switch (d.behavior) {
        case 'shooter':
        case 'lobber':
        case 'chain':
          if (!assistOnly) this.attackCandidates(w, obs, d, card.cost, out);
          break;
        case 'wall':
          this.wallCandidates(w, obs, d, card.cost, out, assistOnly);
          break;
        case 'instantBomb':
        case 'laneBomb':
        case 'freezeAll':
        case 'gale':
          this.bombCandidates(w, obs, d, card.cost, out, emergencyLanes);
          break;
        case 'mine':
        case 'spike':
          if (!assistOnly) this.trapCandidates(w, obs, d, card.cost, out);
          break;
        case 'devourer':
        case 'lurker':
          if (!assistOnly) this.meleeCandidates(w, obs, d, card.cost, out);
          break;
        case 'bell':
        case 'totem':
        case 'mender':
          if (!assistOnly) this.supportCandidates(w, obs, d, card.cost, out);
          break;
        case 'lantern':
        case 'magnet':
        case 'gravity':
          if (!assistOnly) this.utilityCandidates(w, obs, d, card.cost, out);
          break;
        default:
          break;
      }
    }
    if (allowDef && !assistOnly) this.upgradeCandidates(w, obs, out);
    if (allowDef) {
      this.skillCandidates(w, obs, out, emergencyLanes);
      this.itemCandidates(w, obs, out, emergencyLanes);
    }
    // 限制：规则下的有效性最终由 issue() 再次校验
    for (const c of out) {
      const bias = c.cmd.type === 'place' ? this.bias[c.cmd.card] ?? 0 : 0;
      c.score += bias;
      // 光能储备：非紧急行动不动用应急储备
      if (!c.emergency && c.cost > 0 && w.lumen - c.cost < this.params.reserve && !w.cheats?.infiniteLumen && c.kind !== 'econ') c.score -= 15;
    }
    return out;
  }

  private econCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[]): void {
    const target = this.econTarget(w, obs);
    const emergencies = obs.lanes.filter((l) => this.isEmergency(l)).length;
    const danger = emergencies * 30 + Math.max(0, Math.min(1.5, obs.maxPressure) - 0.8) * 20;
    if (d.behavior === 'upgradeProducer') {
      if (obs.producers < target * 0.7 || w.lumen < cost + 75) return;
      if (obs.progress > this.params.econStop + 0.1) return;
      for (const u of obs.units) {
        if (u.def.id !== d.upgradeOf) continue;
        const cmd: Command = { type: 'place', card: d.id, row: u.row, col: u.col };
        if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
        out.push({ cmd, score: 52 + this.params.econPerRow * 8 - danger, kind: 'econ', label: `${d.name} 升级第${u.row + 1}行光苔`, reasons: ['双倍产量，提升经济上限', `当前生产单位 ${obs.producers}/${target.toFixed(1)}`], cost });
        break;
      }
      return;
    }
    if (obs.producers >= target) return;
    const lack = 1 - obs.producers / Math.max(1, target);
    let score = 50 + 45 * lack - danger;
    if (obs.wave === 0) score += 15;
    // 开局：在第一个敌人出现前优先经济，但第一个射手不能拖
    const anyEnemies = obs.enemies.length > 0;
    const shooters = obs.attackers;
    if (anyEnemies && shooters < this.params.earlyDefense) score -= 30;
    let best: Candidate | undefined;
    for (const [r, c] of this.cellsFor(w, d)) {
      const lane = obs.lanes[r];
      if (lane.water) continue;
      if (lane.frontAttackCol >= 0 && c > lane.frontAttackCol) continue;
      if (!this.safeCol(lane, c, 2)) continue;
      let s = score - c * 9 - lane.producers * 4 - lane.pressure * 6;
      const t = w.grid[r][c].terrain;
      if (t === 'v') s += 14;
      if (t === 'b') s -= 30;
      if (!best || s > best.score)
        best = {
          cmd: { type: 'place', card: d.id, row: r, col: c },
          score: s,
          kind: 'econ',
          label: `${d.name} → 第${r + 1}行第${c + 1}列`,
          reasons: [`生产单位 ${obs.producers}/${target.toFixed(1)}（${this.params.name}策略目标）`, t === 'v' ? '晶脉格产量 +50%' : '靠后安全位置', danger > 0 ? `战场压力扣分 -${danger.toFixed(0)}` : '战场压力低'],
          cost,
        };
    }
    if (best) out.push(best);
  }

  private attackValue(w: World, obs: Observation, d: UnitDef, row: number): { value: number; reasons: string[] } {
    const lanes = d.behavior === 'shooter' ? (d.lanes ?? [0]).map((l) => obs.lanes[row + l]).filter(Boolean) : [obs.lanes[row]];
    if (d.behavior === 'chain') {
      for (const l of [obs.lanes[row - 1], obs.lanes[row + 1]]) if (l) lanes.push(l);
    }
    let total = 0;
    const reasons: string[] = [];
    const per = this.estimateDps(w, d) / (d.behavior === 'shooter' ? d.lanes?.length ?? 1 : 1);
    for (const lane of lanes) {
      const need = this.laneNeed(w, obs, lane);
      const deficit = Math.max(0, need - lane.dps);
      let fit = 1;
      const hasFly = lane.flyers > 0 || (obs.levelPool.some((e) => e.flying) && lane.airDps < 1 && obs.wave >= 2);
      if (hasFly && (d.antiAir || d.behavior === 'chain')) fit += lane.airDps < 1 ? 1.6 : 0.3;
      if (lane.shields > 0 && d.behavior === 'lobber') fit += 0.6;
      if (lane.shields > 0 && d.behavior === 'shooter' && !d.pierce) fit -= 0.2;
      if (d.slow && lane.enemies.length >= 2) fit += 0.15;
      if (d.back && (lane.burrowers > 0 || lane.behind > 0)) fit += 2.5;
      else if (d.back && obs.levelPool.some((e) => e.burrow) && !obs.units.some((u) => u.row === lane.row && u.def.back)) fit += 0.8;
      const weight = d.behavior === 'chain' && lane.row !== row ? 0.4 : 1;
      let contrib = Math.min(per, deficit + per * 0.25) * fit * weight;
      // 对空缺口单独计算
      if ((d.antiAir || d.behavior === 'chain') && lane.airHp > 0) {
        const flyEta = Math.max(5, Math.min(...lane.enemies.filter((e) => e.flying).map((e) => e.eta)));
        const airDeficit = Math.max(0, (lane.airHp / flyEta) * this.params.safety - lane.airDps);
        if (airDeficit > 0) {
          contrib += Math.min(per, airDeficit + per * 0.3) * 1.5 * weight;
          if (lane.row === row) reasons.push(`第${lane.row + 1}行对空缺口 ${Math.round(airDeficit)} dps`);
        }
      }
      total += contrib;
      if (deficit > 0 && lane.row === row) reasons.push(`第${lane.row + 1}行火力缺口 ${Math.round(deficit)} dps（需求 ${Math.round(need)}，现有 ${Math.round(lane.dps)}）`);
      if (fit > 1.3 && lane.row === row) reasons.push(hasFly && (d.antiAir || d.behavior === 'chain') ? '该行需要对空火力' : '克制该行敌人');
    }
    return { value: total, reasons };
  }

  private estimateDps(w: World, d: UnitDef): number {
    const dmg = (d.damage ?? 0) * w.metaMul(d) * (d.lunar || d.solar ? (w.isDark() ? d.lunar ?? 1 : d.solar ?? 1) : 1);
    if (d.behavior === 'shooter') return (dmg * (d.shots ?? 1) * (d.lanes?.length ?? 1)) / (d.interval ?? 1.4);
    if (d.behavior === 'lobber') return (dmg / (d.interval ?? 2.4)) * (d.splash ? 1.3 : 1);
    if (d.behavior === 'chain') return (dmg * (1 + (d.chains ?? 3) * 0.5)) / (d.interval ?? 2);
    return 0;
  }

  private attackCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[]): void {
    const cells = this.cellsFor(w, d);
    const plate = obs.cards.find((c) => c.def.behavior === 'plate' && c.ready);
    const plateCells: [number, number][] = [];
    if (plate) for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) if (w.validate({ type: 'place', card: plate.id, row: r, col: c }, 'ai', LEGAL).ok) plateCells.push([r, c]);
    const ideal = (lane: LaneInfo) => {
      const base = d.behavior === 'lobber' ? 0.5 : d.behavior === 'chain' ? 2.5 : 1.2;
      return base + this.params.frontBias * (w.cols * 0.45) + Math.max(0, lane.producers - 1) * 0.6;
    };
    const rowBest = new Map<number, Candidate>();
    const consider = (r: number, c: number, viaPlate: boolean) => {
      const lane = obs.lanes[r];
      if (!this.laneActive(w, obs, lane)) return;
      const emergency = this.isEmergency(lane);
      if (!this.safeCol(lane, c, emergency ? 0.2 : 0.8)) return;
      if (lane.wallCol >= 0 && c >= lane.wallCol) return;
      const { value, reasons } = this.attackValue(w, obs, d, r);
      if (value <= 0.5) return;
      const eff = value / Math.max(25, cost);
      let s = 30 + value * 1.6 + eff * 120 - Math.abs(c - ideal(lane)) * 5;
      if (w.grid[r][c].terrain === 'h') s += 8;
      if (w.grid[r][c].terrain === 'b') s -= 15;
      // 熔火图腾：放在图腾后方
      const totem = obs.units.find((u) => u.row === r && u.def.behavior === 'totem');
      if (totem && d.behavior === 'shooter' && !d.pierce && c < totem.col) s += 10;
      if (emergency) s += 25;
      if (viaPlate) s -= 8;
      const label = `${d.name} → 第${r + 1}行第${c + 1}列`;
      const cand: Candidate = viaPlate
        ? {
            cmd: { type: 'place', card: plate!.id, row: r, col: c },
            score: s,
            kind: 'plate',
            label: `${plate!.def.name}（为${d.name}铺路）→ 第${r + 1}行第${c + 1}列`,
            reasons: [...reasons, '水面需要先放浮晶台'],
            cost: plate!.cost,
            then: { card: d.id, row: r, col: c },
          }
        : {
            cmd: { type: 'place', card: d.id, row: r, col: c },
            score: s,
            kind: 'attack',
            label,
            reasons: [...reasons, `性价比 ${(this.estimateDps(w, d) / Math.max(1, cost)).toFixed(3)} dps/光能`, `位置：第${c + 1}列（理想 ${ideal(lane).toFixed(1)}）`],
            cost,
            emergency,
          };
      const prev = rowBest.get(r);
      if (!prev || cand.score > prev.score) rowBest.set(r, cand);
    };
    for (const [r, c] of cells) consider(r, c, false);
    if (plate && w.lumen >= plate.cost + cost * 0.6) for (const [r, c] of plateCells) if (!w.unitAt(r, c)) consider(r, c, true);
    for (const c of rowBest.values()) out.push(c);
  }

  private wallCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[], assist: boolean): void {
    for (const lane of obs.lanes) {
      if (!this.laneActive(w, obs, lane)) continue;
      const emergency = this.isEmergency(lane);
      if (assist && !emergency) continue;
      const hasWall = lane.wallCol >= 0 && lane.wallHp > lane.wallMaxHp * 0.35;
      // 跳跃者会越过最前面的单位：如果最前面就是射手，需要一个“垫脚”屏障
      const jumperNear = lane.enemies.some((e) => e.def.jumper && !e.burrowed && e.x - lane.frontAttackCol < 6) && !obs.units.some((u) => u.row === lane.row && u.col > lane.frontAttackCol);
      if (hasWall && !emergency && !jumperNear) continue;
      const threat = lane.groundHp;
      const expected = obs.wave >= 1 || threat > 0;
      if (!expected) continue;
      if (lane.shooters === 0 && !emergency) continue;
      let s = 26 + this.params.wallBias * 16 + Math.min(40, threat / 90) + (lane.wallCol >= 0 ? 6 : 0);
      if (obs.wave <= 1 && threat === 0) s -= 20;
      const jumpers = lane.enemies.some((e) => e.def.jumper) || obs.levelPool.some((e) => e.jumper);
      if (d.tall && jumpers) s += 10;
      if (emergency) s += 35;
      if (jumperNear) s += 40;
      // 位置：最前射手之前
      const desired = emergency ? Math.floor(lane.nearestX - 1.3) : Math.max(lane.frontAttackCol + 1, Math.round(w.cols * 0.6) - (this.params.frontBias > 0.5 ? 0 : 1));
      let best: [number, number] | undefined;
      for (let c = Math.min(w.cols - 1, desired); c >= Math.max(0, lane.frontAttackCol + 1); c--) {
        if (!this.safeCol(lane, c, emergency ? -0.1 : 0.4)) continue;
        if (w.validate({ type: 'place', card: d.id, row: lane.row, col: c }, 'ai', LEGAL).ok) {
          best = [lane.row, c];
          break;
        }
      }
      if (!best) continue;
      out.push({
        cmd: { type: 'place', card: d.id, row: best[0], col: best[1] },
        score: s,
        kind: 'wall',
        label: `${d.name} → 第${best[0] + 1}行第${best[1] + 1}列`,
        reasons: [emergency ? `第${lane.row + 1}行即将被突破，紧急堵截` : jumperNear ? `第${lane.row + 1}行有跃影接近：放置垫脚屏障防止射手被越过` : `为第${lane.row + 1}行射手争取输出时间`, `该行威胁 ${Math.round(threat)} 生命`],
        cost,
        emergency,
      });
    }
  }

  private bombCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[], emerg: LaneInfo[]): void {
    const urg = (e: EnemyObs) => {
      if (e.behind) return 3.5;
      if (e.def.id === 'blight_orb') return 4;
      const lane = obs.lanes[e.row];
      const front = Math.max(0, lane.frontAttackCol + 1);
      return 1 + 1.6 * Math.max(0, 1 - (e.x - front) / 3.5) + (lane.sentinel ? 0 : 0.4);
    };
    const visible = obs.enemies.filter((e) => !e.burrowed && e.x < w.cols + 0.3);
    if (!visible.length) return;
    const thr = this.params.bombThreshold;
    if (d.behavior === 'instantBomb') {
      let best: { r: number; c: number; v: number; n: number } | undefined;
      for (const e of visible) {
        const r = Math.max(0, Math.min(w.rows - 1, e.row));
        const c = Math.max(0, Math.min(w.cols - 1, Math.floor(e.x)));
        for (const rr of [r - 1, r, r + 1]) {
          if (rr < 0 || rr >= w.rows) continue;
          let v = 0;
          let n = 0;
          for (const o of visible) {
            if (Math.abs(o.row - rr) <= 1 && Math.abs(o.x - (c + 0.5)) <= 1.5) {
              v += Math.min(o.effHp, 1800) * urg(o) * (o.boss ? 1.4 : 1);
              n++;
            }
          }
          if (!best || v > best.v) best = { r: rr, c, v, n };
        }
      }
      if (!best) return;
      const em = emerg.some((l) => Math.abs(l.row - best!.r) <= 1);
      if (best.v < thr * 0.75 && !em) return;
      const cmd: Command = { type: 'place', card: d.id, row: best.r, col: best.c };
      if (!w.validate(cmd, 'ai', LEGAL).ok) return;
      out.push({ cmd, score: 40 + (best.v / thr) * 35 + (em ? 40 : 0), kind: 'bomb', label: `${d.name} → 第${best.r + 1}行第${best.c + 1}列`, reasons: [`3×3 范围内 ${best.n} 个敌人，价值 ${Math.round(best.v)}`, em ? '附近行即将被突破' : `超过爆破阈值 ${thr}`], cost, emergency: em });
      return;
    }
    if (d.behavior === 'laneBomb') {
      let best: { r: number; v: number; n: number } | undefined;
      for (const lane of obs.lanes) {
        let v = 0;
        let n = 0;
        for (const e of lane.enemies) if (!e.burrowed && e.x < w.cols + 0.3) {
          v += Math.min(e.effHp, 1800) * urg(e);
          n++;
        }
        if (!best || v > best.v) best = { r: lane.row, v, n };
      }
      if (!best || best.n === 0) return;
      const em = emerg.some((l) => l.row === best!.r);
      if (best.v < thr * 0.8 && !em) return;
      for (let c = 0; c < w.cols; c++) {
        const cmd: Command = { type: 'place', card: d.id, row: best.r, col: c };
        if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
        out.push({ cmd, score: 38 + (best.v / thr) * 33 + (em ? 40 : 0), kind: 'bomb', label: `${d.name} → 第${best.r + 1}行`, reasons: [`该行 ${best.n} 个敌人，价值 ${Math.round(best.v)}`], cost, emergency: em });
        break;
      }
      return;
    }
    if (d.behavior === 'freezeAll') {
      const urgent = obs.lanes.reduce((s, l) => s + l.urgentHp, 0);
      const pressured = obs.lanes.filter((l) => l.pressure > 1).length;
      const em = emerg.length >= 2 || (emerg.length >= 1 && obs.bossAlive);
      if (!em && urgent < thr * 1.5 && pressured < 3) return;
      const cmd = this.anyCell(w, d);
      if (!cmd) return;
      out.push({ cmd, score: 45 + urgent / thr * 15 + (em ? 35 : 0), kind: 'bomb', label: `${d.name}（全场冻结）`, reasons: [`${pressured} 行处于高压`, `前线敌人总生命 ${Math.round(urgent)}`], cost, emergency: em });
      return;
    }
    if (d.behavior === 'gale') {
      const flyers = visible.filter((e) => e.flying);
      if (!flyers.length) return;
      const close = flyers.some((e) => e.x < 3.5 && obs.lanes[e.row].airDps < 15);
      const airDps = obs.lanes.reduce((s, l) => s + l.airDps, 0);
      if (!close && flyers.length < 2 && airDps > 20) return;
      const cmd = this.anyCell(w, d);
      if (!cmd) return;
      out.push({ cmd, score: 50 + flyers.length * 10 + (close ? 40 : 0), kind: 'bomb', label: `${d.name}（吹走 ${flyers.length} 个飞行敌人）`, reasons: ['飞行敌人威胁', close ? '飞行敌人接近防线' : '对空火力不足'], cost, emergency: close });
    }
  }

  private anyCell(w: World, d: UnitDef): Command | undefined {
    for (let c = 0; c < w.cols; c++)
      for (let r = 0; r < w.rows; r++) {
        const cmd: Command = { type: 'place', card: d.id, row: r, col: c };
        if (w.validate(cmd, 'ai', LEGAL).ok) return cmd;
      }
    return undefined;
  }

  private trapCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[]): void {
    if (d.behavior === 'mine') {
      // 跳跃者诱饵：在最前射手之前放一个便宜的晶石让跃影跳过
      for (const lane of obs.lanes) {
        const jumper = lane.enemies.find((e) => e.def.jumper && !e.burrowed && e.x - lane.frontAttackCol < 7);
        if (!jumper || lane.frontAttackCol < 0) continue;
        if (obs.units.some((u) => u.row === lane.row && u.col > lane.frontAttackCol)) continue;
        for (let c = Math.min(w.cols - 1, lane.frontAttackCol + 2); c > lane.frontAttackCol; c--) {
          if (!this.safeCol(lane, c, 0.3)) continue;
          const cmd: Command = { type: 'place', card: d.id, row: lane.row, col: c };
          if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
          out.push({ cmd, score: 78, kind: 'trap', label: `${d.name}（诱饵）→ 第${lane.row + 1}行第${c + 1}列`, reasons: ['跃影会越过最前面的单位：放置廉价诱饵保护射手'], cost });
          break;
        }
      }
      for (const lane of obs.lanes) {
        const ground = lane.enemies.filter((e) => !e.flying && !e.burrowed && !e.def.vehicle);
        if (!ground.length) continue;
        const lead = ground.reduce((a, b) => (a.x < b.x ? a : b));
        const need = this.laneNeed(w, obs, lane);
        const deficit = need - lane.dps;
        if (deficit <= 0 && lane.pressure < 0.8) continue;
        const arm = (d.armTime ?? 14) + 1.5;
        const maxCol = Math.floor(lead.x - 0.6 - lead.speed * arm);
        for (let c = Math.min(maxCol, w.cols - 1); c >= Math.max(0, lane.frontAttackCol + 1); c--) {
          const cmd: Command = { type: 'place', card: d.id, row: lane.row, col: c };
          if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
          out.push({ cmd, score: 40 + this.params.trapBias * 12 + Math.min(30, lead.effHp / 40) + (w.lumen < 100 ? 10 : 0), kind: 'trap', label: `${d.name} → 第${lane.row + 1}行第${c + 1}列`, reasons: [`拦截 ${lead.def.name}（预计 ${((lead.x - c) / lead.speed).toFixed(0)} 秒后到达，充能 ${d.armTime} 秒）`, '低成本消灭高威胁目标'], cost });
          break;
        }
      }
      return;
    }
    // 地刺
    const vehiclesInPool = obs.levelPool.some((e) => e.vehicle);
    for (const lane of obs.lanes) {
      if (lane.water) continue;
      const hasSpike = obs.units.some((u) => u.row === lane.row && u.def.behavior === 'spike');
      let s = 0;
      if (lane.vehicles > 0) s = 75;
      else if (vehiclesInPool && !hasSpike && obs.wave >= 2) s = 45;
      else if (!hasSpike && lane.burrowers > 0) s = 40;
      else if (!hasSpike && this.params.trapBias > 1 && lane.pressure > 0.6) s = 30;
      if (!s) continue;
      const desired = lane.wallCol >= 0 ? lane.wallCol + 1 : w.cols - 2;
      for (let c = Math.min(w.cols - 1, desired); c >= Math.max(0, lane.frontAttackCol + 1); c--) {
        if (!this.safeCol(lane, c, -0.4)) continue;
        const cmd: Command = { type: 'place', card: d.id, row: lane.row, col: c };
        if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
        out.push({ cmd, score: s, kind: 'trap', label: `${d.name} → 第${lane.row + 1}行第${c + 1}列`, reasons: [lane.vehicles ? '该行出现载具，地刺可刺破' : '预防载具/掘地者'], cost, emergency: lane.vehicles > 0 && lane.nearestX < 5 });
        break;
      }
    }
  }

  private meleeCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[]): void {
    for (const lane of obs.lanes) {
      const ground = lane.enemies.filter((e) => !e.flying && !e.burrowed && !e.boss);
      if (!ground.length) continue;
      if (d.behavior === 'lurker' && !lane.water) continue;
      if (d.behavior === 'devourer' && lane.water && !w.plateAt(lane.row, 0)) {
        /* 水路需要浮台，交给攻击候选 */
      }
      const lead = ground.reduce((a, b) => (a.x < b.x ? a : b));
      if (d.behavior === 'devourer' && lead.effHp < 450 && !this.isEmergency(lane)) continue;
      const col = Math.floor(lead.x - (d.behavior === 'lurker' ? 1.6 : 1.9) - lead.speed * 0.8);
      for (let c = Math.min(col, w.cols - 1); c >= Math.max(0, lane.frontAttackCol + 1); c--) {
        const cmd: Command = { type: 'place', card: d.id, row: lane.row, col: c };
        if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
        const em = this.isEmergency(lane);
        out.push({ cmd, score: 38 + Math.min(45, lead.effHp / 35) + (em ? 30 : 0), kind: 'melee', label: `${d.name} → 第${lane.row + 1}行第${c + 1}列`, reasons: [`吞掉 ${lead.def.name}（有效生命 ${Math.round(lead.effHp)}）`], cost, emergency: em });
        break;
      }
    }
  }

  private supportCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[]): void {
    if (this.params.supportBias <= 0) return;
    if (obs.producers < this.econTarget(w, obs) * 0.7 && obs.progress < this.params.econStop) return;
    let best: Candidate | undefined;
    const attackers = obs.units.filter((u) => unitDps(w, u) > 0);
    for (const [r, c] of this.cellsFor(w, d)) {
      const lane = obs.lanes[r];
      if (!this.safeCol(lane, c, 1.2)) continue;
      if (lane.wallCol >= 0 && c >= lane.wallCol) continue;
      let v = 0;
      const why: string[] = [];
      if (d.behavior === 'bell') {
        for (const u of attackers) if (Math.abs(u.row - r) <= 1 && Math.abs(u.col - c) <= 1) v += unitDps(w, u) * 0.3;
        why.push(`周围攻击单位加速，预计 +${v.toFixed(0)} dps`);
      } else if (d.behavior === 'totem') {
        if (obs.units.some((u) => u.row === r && u.def.behavior === 'totem')) continue;
        for (const u of attackers) if (u.row === r && u.col < c && u.def.behavior === 'shooter' && !u.def.pierce) v += unitDps(w, u) / (u.def.lanes?.length ?? 1);
        if (attackers.some((u) => u.row === r && u.col > c && u.def.behavior === 'shooter')) v *= 0.5;
        why.push(`后方射手火焰化，预计 +${v.toFixed(0)} dps`);
      } else if (d.behavior === 'mender') {
        for (const u of obs.units) if (Math.abs(u.row - r) <= 1 && Math.abs(u.col - c) <= 1 && u.def.category === 'wall') v += 12;
        why.push('相邻屏障持续回复');
      }
      if (v < 8) continue;
      const s = 18 + this.params.supportBias * Math.min(55, v * 1.1);
      if (!best || s > best.score) best = { cmd: { type: 'place', card: d.id, row: r, col: c }, score: s, kind: 'support', label: `${d.name} → 第${r + 1}行第${c + 1}列`, reasons: why, cost };
    }
    if (best) out.push(best);
  }

  private utilityCandidates(w: World, obs: Observation, d: UnitDef, cost: number, out: Candidate[]): void {
    const count = obs.units.filter((u) => u.def.behavior === d.behavior).length;
    if (d.behavior === 'lantern') {
      const stealth = obs.levelPool.some((e) => e.stealth);
      if (!obs.fog && !stealth) return;
      const target = Math.ceil(w.rows / 3);
      if (count >= target) return;
      const rows = w.rows <= 3 ? [1] : [1, w.rows - 2, Math.floor(w.rows / 2)];
      const row = rows[count] ?? 1;
      const desired = Math.max(2, w.cols - 5);
      for (const c of [desired, desired - 1, desired + 1, desired - 2]) {
        const cmd: Command = { type: 'place', card: d.id, row, col: c };
        if (c < 0 || !w.validate(cmd, 'ai', LEGAL).ok || !this.safeCol(obs.lanes[row], c, 1)) continue;
        out.push({ cmd, score: 48, kind: 'utility', label: `${d.name} → 第${row + 1}行第${c + 1}列`, reasons: [obs.fog ? '照亮迷雾，获得视野' : '显形隐身刺客'], cost });
        return;
      }
      return;
    }
    if (d.behavior === 'magnet') {
      const metalNow = obs.enemies.filter((e) => e.metal).length;
      const metalPool = obs.levelPool.some((e) => e.armor?.metal);
      if (!metalNow && !metalPool) return;
      if (count >= Math.ceil(w.rows / 2.5)) return;
      const row = [1, w.rows - 2, Math.floor(w.rows / 2)][count] ?? 1;
      for (const c of [3, 4, 2, 5]) {
        const cmd: Command = { type: 'place', card: d.id, row, col: c };
        if (!w.validate(cmd, 'ai', LEGAL).ok || !this.safeCol(obs.lanes[row], c, 1)) continue;
        out.push({ cmd, score: 30 + metalNow * 6, kind: 'utility', label: `${d.name} → 第${row + 1}行第${c + 1}列`, reasons: [`金属护甲敌人 ${metalNow} 个`], cost });
        return;
      }
      return;
    }
    if (d.behavior === 'gravity') {
      for (const lane of obs.lanes) {
        if (lane.pressure < 0.9 || obs.units.some((u) => u.row === lane.row && u.def.behavior === 'gravity')) continue;
        for (let c = Math.max(0, lane.frontAttackCol + 1); c < w.cols; c++) {
          if (!this.safeCol(lane, c, 1.5)) break;
          const cmd: Command = { type: 'place', card: d.id, row: lane.row, col: c };
          if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
          out.push({ cmd, score: 26 + lane.pressure * 18, kind: 'utility', label: `${d.name} → 第${lane.row + 1}行第${c + 1}列`, reasons: [`第${lane.row + 1}行压力 ${lane.pressure.toFixed(2)}，推回敌人争取时间`], cost });
          break;
        }
      }
    }
  }

  private upgradeCandidates(w: World, obs: Observation, out: Candidate[]): void {
    if (this.params.upgradeBias <= 0) return;
    if (w.rules?.c.noUpgrades) return;
    const econDone = obs.producers >= this.econTarget(w, obs) * 0.9 || obs.progress > this.params.econStop;
    if (!econDone) return;
    let best: Candidate | undefined;
    for (const u of obs.units) {
      if (u.rank >= 3) continue;
      const dps = unitDps(w, u);
      const isWall = u.def.category === 'wall';
      if (dps <= 0 && !isWall) continue;
      const cost = w.upgradeCost(u);
      const cmd: Command = { type: 'upgrade', row: u.row, col: u.col };
      const lane = obs.lanes[u.row];
      const gain = dps * (RANK_MUL[u.rank + 1] / RANK_MUL[u.rank] - 1);
      const need = this.laneNeed(w, obs, lane);
      const deficit = Math.max(0, need - lane.dps);
      let s = 14 + this.params.upgradeBias * (Math.min(gain, deficit + gain * 0.3) * 1.4 + (gain / Math.max(1, cost)) * 80);
      if (isWall) s = lane.enemies.some((e) => e.eating) && u.hp < u.maxHp * 0.5 ? 30 + this.params.upgradeBias * 10 : 0;
      if (s <= 0) continue;
      if (!w.validate(cmd, 'ai', LEGAL).ok) continue;
      if (!best || s > best.score) best = { cmd, score: s, kind: 'upgrade', label: `强化 ${u.def.name}（第${u.row + 1}行第${u.col + 1}列 → ${u.rank + 1}星）`, reasons: [isWall ? '屏障濒危，强化恢复生命' : `火力 +${gain.toFixed(1)} dps，花费 ${cost}`], cost };
    }
    if (best) out.push(best);
  }

  private skillCandidates(w: World, obs: Observation, out: Candidate[], emerg: LaneInfo[]): void {
    const ag = this.params.skillAggression;
    for (const s of w.skills) {
      if (s.cooldown > 0) continue;
      const def = SKILLS.find((x) => x.id === s.id)!;
      let score = 0;
      let cmd: Command = { type: 'skill', skill: s.id };
      let why = '';
      const visible = obs.enemies.filter((e) => !e.burrowed);
      switch (s.id) {
        case 'lumen_rain':
          if (w.lumen < 500) {
            score = 62;
            why = '立即获得 150 光能';
          }
          break;
        case 'time_warp':
          if (emerg.length || obs.maxPressure > 1.3) {
            score = 55 + 35 * ag + emerg.length * 10;
            why = '高压局面，减速争取时间';
          }
          break;
        case 'meteor_strike': {
          let best: { r: number; c: number; v: number } | undefined;
          for (const e of visible) {
            const c = Math.max(0, Math.min(w.cols - 1, Math.floor(e.x)));
            let v = 0;
            for (const o of visible) if (Math.abs(o.row - e.row) <= 1 && Math.abs(o.x - (c + 0.5)) <= 1.5) v += Math.min(o.effHp, 700);
            if (!best || v > best.v) best = { r: e.row, c, v };
          }
          if (best && (best.v >= 1100 || emerg.length)) {
            score = 45 + best.v / 60 * ag;
            cmd = { type: 'skill', skill: s.id, row: best.r, col: best.c };
            why = `陨星覆盖价值 ${Math.round(best.v)}`;
          }
          break;
        }
        case 'aegis': {
          const eating = visible.filter((e) => e.eating).length;
          if (eating >= 4 || (obs.bossAlive && eating >= 2)) {
            score = 45 + eating * 6 * ag;
            why = `${eating} 个敌人正在啃咬守卫`;
          }
          break;
        }
        case 'thunderclap':
          if (visible.length >= 8 || (emerg.length && visible.length >= 3)) {
            score = 45 + visible.length * 3 * ag;
            why = `场上 ${visible.length} 个敌人`;
          }
          break;
        case 'restoration': {
          const hurt = obs.units.filter((u) => u.hp < u.maxHp * 0.5).length;
          if (hurt >= 3) {
            score = 40 + hurt * 5 * ag;
            why = `${hurt} 个守卫生命低于一半`;
          }
          break;
        }
      }
      if (score > 0 && w.validate(cmd, 'ai', LEGAL).ok) out.push({ cmd, score, kind: 'skill', label: `技能：${def.name}`, reasons: [why], cost: 0, emergency: emerg.length > 0 && s.id !== 'lumen_rain' });
    }
  }

  private itemCandidates(w: World, obs: Observation, out: Candidate[], emerg: LaneInfo[]): void {
    const ag = this.params.skillAggression;
    for (const [id, n] of Object.entries(w.items)) {
      if (!n) continue;
      const def = ITEMS.find((x) => x.id === id);
      if (!def) continue;
      let cmd: Command | undefined;
      let score = 0;
      let why = '';
      switch (id) {
        case 'fire_flask': {
          const lane = [...emerg].sort((a, b) => b.groundHp - a.groundHp)[0];
          if (lane) {
            cmd = { type: 'item', item: id, row: lane.row };
            score = 60 + 30 * ag;
            why = `第${lane.row + 1}行告急`;
          }
          break;
        }
        case 'frost_grenade': {
          const lane = emerg[0];
          if (lane) {
            cmd = { type: 'item', item: id, row: lane.row, col: Math.max(0, Math.min(w.cols - 1, Math.floor(lane.nearestX))) };
            score = 55 + 30 * ag;
            why = `冻结第${lane.row + 1}行前线`;
          }
          break;
        }
        case 'repair_kit': {
          const u = obs.units.find((x) => x.def.category === 'wall' && x.hp < x.maxHp * 0.3 && obs.lanes[x.row].enemies.some((e) => e.eating));
          if (u) {
            cmd = { type: 'item', item: id, row: u.row, col: u.col };
            score = 50 + 20 * ag;
            why = '屏障濒临破碎';
          }
          break;
        }
        case 'overcharge': {
          const lane = emerg[0] ?? (obs.maxPressure > 1.2 ? obs.lanes.find((l) => l.pressure === obs.maxPressure) : undefined);
          if (lane) {
            const u = obs.units.filter((x) => x.row === lane.row && unitDps(w, x) > 0).sort((a, b) => unitDps(w, b) - unitDps(w, a))[0];
            if (u) {
              cmd = { type: 'item', item: id, row: u.row, col: u.col };
              score = 50 + 25 * ag;
              why = `第${lane.row + 1}行火力三倍`;
            }
          }
          break;
        }
        case 'rune_restore': {
          const lane = obs.lanes.find((l) => !l.sentinel && (l.pressure > 0.9 || l.nearestX < 3));
          if (lane && !w.rules?.c.noSentinels) {
            cmd = { type: 'item', item: id, row: lane.row };
            score = 55;
            why = `恢复第${lane.row + 1}行哨卫`;
          }
          break;
        }
        case 'lumen_crystal':
          if (w.lumen < 60 && obs.wave >= 1) {
            cmd = { type: 'item', item: id };
            score = 40;
            why = '光能告急';
          }
          break;
      }
      if (cmd && w.validate(cmd, 'ai', LEGAL).ok) out.push({ cmd, score, kind: 'item', label: `道具：${def.name}`, reasons: [why], cost: 0, emergency: emerg.length > 0 });
    }
  }
}
