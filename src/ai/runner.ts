import type { GameConfig, LevelDef, RuleSet } from '../core/types';
import { World } from '../core/sim/world';
import { TICK_RATE } from '../core/constants';
import { CONTENT } from '../core/content/registry';
import { RuleEngine } from '../core/rules/ruleEngine';
import { AIAgent, type AIRole } from './agent';
import { buildDeck } from './deckBuilder';
import { getStrategy, type StrategyParams } from './strategies';

export interface AIConfig {
  strategy: StrategyParams | string;
  deck?: string[];
  available?: string[];
  deckSize?: number;
  skills?: string[];
  items?: Record<string, number>;
  bias?: Record<string, number>;
  include?: string[];
  exclude?: string[];
  role?: AIRole;
}

export interface GameSummary {
  won: boolean;
  reason: string;
  seed: number;
  level: string;
  strategy: string;
  deck: string[];
  time: number;
  waves: number;
  totalWaves: number;
  kills: number;
  spent: number;
  collected: number;
  generated: number;
  expired: number;
  ops: number;
  rejected: number;
  rejectedRule: number;
  unitsLost: number;
  sentinelsUsed: number;
  cheatsUsed: boolean;
  breach?: { row: number; enemy: string; t: number; wave: number };
  peakUnits: number;
  avgLumen: number;
  coins: number;
  ruleViolation: boolean;
}

export const ALL_CARDS = (): string[] => CONTENT.allUnits().map((u) => u.id);

/** 为 AI 准备对局配置（自动选卡） */
export function makeAIGameConfig(level: LevelDef, ai: AIConfig, seed: number, extra: Partial<GameConfig> = {}): GameConfig {
  const strat = typeof ai.strategy === 'string' ? getStrategy(ai.strategy) : ai.strategy;
  const rules = extra.rules ? new RuleEngine(extra.rules) : null;
  const deck =
    ai.deck ??
    buildDeck({
      level,
      available: ai.available ?? ALL_CARDS(),
      size: ai.deckSize ?? level.deckSize ?? 8,
      strategy: strat,
      rules,
      include: ai.include,
      exclude: ai.exclude,
      bias: ai.bias,
    }).deck;
  const skills = (ai.skills ?? []).filter((s) => !rules || rules.isSkillAllowed(s));
  const items: Record<string, number> = {};
  for (const [k, v] of Object.entries(ai.items ?? {})) if (!rules || rules.isItemAllowed(k)) items[k] = v;
  return {
    mode: extra.mode ?? (extra.rules ? 'challenge' : 'adventure'),
    level,
    deck,
    skills,
    items,
    seed,
    ...extra,
  };
}

export interface RunOptions {
  maxTime?: number; // 游戏内秒数上限
  maxWaves?: number; // 无尽模式波数上限
  onStep?: (w: World, agent: AIAgent) => void;
}

/** 无渲染运行一整局（同步，适合 Node / Worker） */
export function runGame(config: GameConfig, ai: AIConfig, opts: RunOptions = {}): { world: World; agent: AIAgent; summary: GameSummary } {
  const world = new World(config);
  world.fxEnabled = false;
  const agent = new AIAgent({ strategy: ai.strategy, role: ai.role, bias: ai.bias, available: ai.available, deckSize: ai.deckSize });
  const maxTicks = (opts.maxTime ?? 1500) * TICK_RATE;
  while (!world.finished && world.tick < maxTicks) {
    agent.update(world);
    world.step();
    opts.onStep?.(world, agent);
    if (opts.maxWaves && world.waveIndex >= opts.maxWaves && world.enemiesAlive === 0) break;
  }
  if (!world.finished && config.level.objective?.type !== 'endless') {
    world.lose('超时');
  }
  return { world, agent, summary: summarize(world, agent) };
}

export function summarize(w: World, agent?: AIAgent): GameSummary {
  const s = w.stats;
  return {
    won: w.status === 'won',
    reason: w.endReason,
    seed: w.config.seed,
    level: w.level.id,
    strategy: agent?.base.name ?? 'human',
    deck: w.deck.map((d) => d.id),
    time: Math.round(w.time * 10) / 10,
    waves: w.waveIndex,
    totalWaves: Number.isFinite(w.totalWaves) ? w.totalWaves : -1,
    kills: s.killsTotal,
    spent: s.lumenSpent,
    collected: s.lumenCollected,
    generated: s.lumenGenerated,
    expired: s.lumenExpired,
    ops: s.ops,
    rejected: s.rejected,
    rejectedRule: s.rejectedRule,
    unitsLost: s.unitsLostTotal,
    sentinelsUsed: s.sentinelsUsed,
    cheatsUsed: s.cheatsUsed,
    breach: s.breach,
    peakUnits: s.peakUnits,
    avgLumen: w.time > 0 ? Math.round(s.lumenHeld / w.time) : 0,
    coins: s.coinsEarned,
    ruleViolation: w.endReason.startsWith('违反挑战规则'),
  };
}

export interface BatchStats {
  runs: number;
  wins: number;
  winRate: number;
  avgTime: number;
  avgWinTime: number;
  avgSpent: number;
  minSpentWin: number;
  avgOps: number;
  minOpsWin: number;
  avgWaves: number;
  avgUnitsLost: number;
  avgExpired: number;
  utilization: number; // 花费 / 产出
  breachEnemies: Record<string, number>;
  breachRows: Record<string, number>;
  failReasons: Record<string, number>;
  summaries: GameSummary[];
}

export function aggregate(summaries: GameSummary[]): BatchStats {
  const n = Math.max(1, summaries.length);
  const wins = summaries.filter((s) => s.won);
  const avg = (f: (s: GameSummary) => number, arr = summaries) => (arr.length ? arr.reduce((a, s) => a + f(s), 0) / arr.length : 0);
  const breachEnemies: Record<string, number> = {};
  const breachRows: Record<string, number> = {};
  const failReasons: Record<string, number> = {};
  for (const s of summaries) {
    if (s.won) continue;
    if (s.breach) {
      breachEnemies[s.breach.enemy] = (breachEnemies[s.breach.enemy] ?? 0) + 1;
      breachRows[s.breach.row + 1] = (breachRows[s.breach.row + 1] ?? 0) + 1;
    }
    failReasons[s.reason] = (failReasons[s.reason] ?? 0) + 1;
  }
  const gen = summaries.reduce((a, s) => a + s.generated, 0);
  return {
    runs: summaries.length,
    wins: wins.length,
    winRate: wins.length / n,
    avgTime: avg((s) => s.time),
    avgWinTime: avg((s) => s.time, wins),
    avgSpent: avg((s) => s.spent),
    minSpentWin: wins.length ? Math.min(...wins.map((s) => s.spent)) : 0,
    avgOps: avg((s) => s.ops),
    minOpsWin: wins.length ? Math.min(...wins.map((s) => s.ops)) : 0,
    avgWaves: avg((s) => s.waves),
    avgUnitsLost: avg((s) => s.unitsLost),
    avgExpired: avg((s) => s.expired),
    utilization: gen > 0 ? summaries.reduce((a, s) => a + s.spent, 0) / gen : 0,
    breachEnemies,
    breachRows,
    failReasons,
    summaries,
  };
}

export interface BatchRequest {
  level: LevelDef;
  ai: AIConfig;
  runs: number;
  seedBase?: number;
  rules?: RuleSet | null;
  difficulty?: number;
  mode?: GameConfig['mode'];
  maxTime?: number;
  maxWaves?: number;
}

/** 批量模拟（同步版本）。seed = seedBase + i，保证不同策略在相同条件下比较。 */
export function runBatch(req: BatchRequest, onProgress?: (done: number, last: GameSummary) => void): BatchStats {
  const out: GameSummary[] = [];
  for (let i = 0; i < req.runs; i++) {
    const seed = ((req.seedBase ?? 1000) + i * 7919) >>> 0;
    const cfg = makeAIGameConfig(req.level, req.ai, seed, { rules: req.rules ?? null, difficulty: req.difficulty, mode: req.mode });
    const { summary } = runGame(cfg, req.ai, { maxTime: req.maxTime, maxWaves: req.maxWaves });
    out.push(summary);
    onProgress?.(i + 1, summary);
  }
  return aggregate(out);
}
