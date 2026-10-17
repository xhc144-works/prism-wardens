import type { LevelDef, RuleSet } from '../core/types';
import { CONTENT } from '../core/content/registry';
import { analyzeGame, applyAdjustments, type FailureReport } from './analyzer';
import { getStrategy, type StrategyParams } from './strategies';
import { ALL_CARDS, makeAIGameConfig, runGame, type GameSummary } from './runner';

/** 一关的学习状态：参数 + 卡组偏好。可序列化保存为 AI 经验库。 */
export interface LevelKnowledge {
  params: StrategyParams;
  include: string[];
  exclude: string[];
  attempts: number;
  wins: number;
  bestTime?: number;
  bestSpent?: number;
  history: { attempt: number; won: boolean; cause: string; changes: string[] }[];
}

export class CoachState {
  knowledge: Record<string, LevelKnowledge> = {};
  constructor(public baseStrategy: StrategyParams, public available: string[] = ALL_CARDS()) {}

  get(levelId: string): LevelKnowledge {
    if (!this.knowledge[levelId]) this.knowledge[levelId] = { params: { ...this.baseStrategy }, include: [], exclude: [], attempts: 0, wins: 0, history: [] };
    return this.knowledge[levelId];
  }

  /** 记录一局结果，失败时根据分析报告调整策略 */
  record(levelId: string, summary: GameSummary, report: FailureReport): string[] {
    const k = this.get(levelId);
    k.attempts++;
    let changes: string[] = [];
    if (summary.won) {
      k.wins++;
      if (k.bestTime == null || summary.time < k.bestTime) k.bestTime = summary.time;
      if (k.bestSpent == null || summary.spent < k.bestSpent) k.bestSpent = summary.spent;
    } else {
      changes = applyAdjustments(k.params, report.adjustments, k.include, k.exclude, this.available);
      k.params.name = `${this.baseStrategy.name}·调整${k.attempts}`;
    }
    k.history.push({ attempt: k.attempts, won: summary.won, cause: report.cause, changes });
    return changes;
  }
}

export interface CoachRequest {
  levels: (string | LevelDef)[];
  strategy: string | StrategyParams;
  maxAttempts: number;
  seedBase?: number;
  available?: string[];
  rules?: RuleSet | null;
  difficulty?: number;
  deckSize?: number;
  skills?: string[];
  state?: CoachState;
}

export type CoachEvent =
  | { type: 'attempt'; level: string; attempt: number; summary: GameSummary }
  | { type: 'analysis'; level: string; report: FailureReport & { applied: string[] } }
  | { type: 'levelDone'; level: string; won: boolean; attempts: number };

export interface CoachResult {
  cleared: number;
  attempts: number;
  perLevel: { level: string; won: boolean; attempts: number }[];
  knowledge: Record<string, LevelKnowledge>;
}

/** 自动连续挑战：失败后复盘、调整策略并重试 */
export function runCoach(req: CoachRequest, onEvent?: (e: CoachEvent) => void): CoachResult {
  const base = typeof req.strategy === 'string' ? getStrategy(req.strategy) : req.strategy;
  const state = req.state ?? new CoachState(base, req.available ?? ALL_CARDS());
  const perLevel: CoachResult['perLevel'] = [];
  let attempts = 0;
  let cleared = 0;
  for (const lv of req.levels) {
    const level = typeof lv === 'string' ? CONTENT.level(lv)! : lv;
    if (!level) continue;
    let won = false;
    let n = 0;
    for (; n < req.maxAttempts && !won; ) {
      n++;
      attempts++;
      const k = state.get(level.id);
      const ai = { strategy: k.params, available: state.available, include: k.include, exclude: k.exclude, deckSize: req.deckSize ?? 8, skills: req.skills ?? ['lumen_rain', 'time_warp'] };
      const seed = ((req.seedBase ?? 500) + attempts * 104729) >>> 0;
      const cfg = makeAIGameConfig(level, ai, seed, { rules: req.rules ?? null, difficulty: req.difficulty });
      const { world, summary } = runGame(cfg, ai);
      onEvent?.({ type: 'attempt', level: level.id, attempt: n, summary });
      const report = analyzeGame(world);
      const applied = state.record(level.id, summary, report);
      if (!summary.won) onEvent?.({ type: 'analysis', level: level.id, report: { ...report, applied } });
      won = summary.won;
    }
    if (won) cleared++;
    perLevel.push({ level: level.id, won, attempts: n });
    onEvent?.({ type: 'levelDone', level: level.id, won, attempts: n });
  }
  return { cleared, attempts, perLevel, knowledge: state.knowledge };
}
