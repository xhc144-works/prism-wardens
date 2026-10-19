import type { LevelDef, RuleSet } from '../core/types';
import { CONTENT } from '../core/content/registry';
import { RuleEngine } from '../core/rules/ruleEngine';
import { Rng } from '../core/rng';
import { buildDeck, levelFeatures } from './deckBuilder';
import { getStrategy, STRATEGIES, TUNABLE, type StrategyParams } from './strategies';
import { ALL_CARDS, runBatch, type BatchStats } from './runner';

export type ResearchObjective = 'winrate' | 'min-spend' | 'min-ops' | 'fastest';

export const OBJECTIVE_NAMES: Record<ResearchObjective, string> = {
  winrate: '最高胜率',
  'min-spend': '最低资源消耗',
  'min-ops': '最少操作次数',
  fastest: '最快通关',
};

export interface Genome {
  deck: string[];
  params: StrategyParams;
}

export interface Evaluated {
  genome: Genome;
  fitness: number;
  stats: BatchStats;
}

export interface ResearchRequest {
  level: LevelDef;
  rules?: RuleSet | null;
  available?: string[];
  deckSize?: number;
  generations: number;
  population: number;
  runsPerEval: number;
  objective: ResearchObjective;
  seedBase?: number;
  difficulty?: number;
  skills?: string[];
}

export interface ResearchProgress {
  generation: number;
  evaluated: number;
  totalEvals: number;
  best: Evaluated;
  generationBest: Evaluated;
  history: { generation: number; best: number; avg: number; winRate: number }[];
}

export function fitnessOf(stats: BatchStats, obj: ResearchObjective): number {
  const base = stats.winRate * 1000;
  const wins = stats.summaries.filter((s) => s.won);
  const avgW = (f: (s: (typeof wins)[number]) => number) => (wins.length ? wins.reduce((a, s) => a + f(s), 0) / wins.length : 0);
  switch (obj) {
    case 'min-spend':
      return base - (wins.length ? avgW((s) => s.spent) : stats.avgSpent + 3000) * 0.12;
    case 'min-ops':
      return base - (wins.length ? avgW((s) => s.ops) : stats.avgOps + 300) * 2.5;
    case 'fastest':
      return base - (wins.length ? avgW((s) => s.time) : stats.avgTime + 600) * 1.2;
    default:
      return base + stats.avgWaves * 2 - stats.avgUnitsLost * 0.5 - stats.avgTime * 0.05;
  }
}

/**
 * 阵容研究：遗传算法同时搜索卡组组合与策略参数。
 * 每一代所有个体使用相同的随机种子集合评估（公共随机数），比较公平。
 * 以生成器形式实现，可在 Worker 中逐步执行并汇报进度。
 */
export class ResearchRun {
  req: ResearchRequest;
  rng: Rng;
  pool: string[];
  rules: RuleEngine | null;
  best?: Evaluated;
  history: ResearchProgress['history'] = [];

  constructor(req: ResearchRequest) {
    this.req = req;
    this.rng = new Rng((req.seedBase ?? 1) * 2654435761);
    this.rules = req.rules ? new RuleEngine(req.rules) : null;
    this.pool = (req.available ?? ALL_CARDS()).filter((id) => {
      const d = CONTENT.units.get(id);
      return d && (!this.rules || this.rules.isCardAllowed(d).ok) && !req.level.bannedCards?.includes(id);
    });
  }

  private deckSize(): number {
    return Math.min(this.req.deckSize ?? 8, this.rules?.c.maxDeckSize ?? 99, this.pool.length);
  }

  private repair(deck: string[]): string[] {
    const size = this.deckSize();
    const out = [...new Set(deck.filter((d) => this.pool.includes(d)))];
    for (const f of this.req.level.forcedCards ?? []) if (this.pool.includes(f) && !out.includes(f)) out.unshift(f);
    const feats = levelFeatures(this.req.level);
    if (feats.water) {
      const plate = this.pool.find((id) => CONTENT.unit(id).behavior === 'plate');
      if (plate && !out.includes(plate)) out.unshift(plate);
    }
    while (out.length > size) {
      const removable = out.filter((d) => !(this.req.level.forcedCards ?? []).includes(d) && CONTENT.unit(d).behavior !== 'plate');
      out.splice(out.indexOf(removable[this.rng.int(removable.length)] ?? out[out.length - 1]), 1);
    }
    let guard = 0;
    while (out.length < size && guard++ < 50) {
      const c = this.rng.pick(this.pool);
      if (!out.includes(c)) out.push(c);
    }
    return out;
  }

  private initial(): Genome[] {
    const out: Genome[] = [];
    const bases = ['balanced', 'economy', 'defense', 'rush', 'conservative', 'aggressive', 'frugal'];
    const preferred = this.req.objective === 'min-spend' ? ['frugal', 'balanced', 'economy'] : this.req.objective === 'fastest' ? ['rush', 'aggressive', 'balanced'] : bases;
    for (const id of [...preferred, ...bases]) {
      if (out.length >= this.req.population) break;
      if (out.some((g) => g.params.id === id)) continue;
      const params = getStrategy(id);
      const deck = buildDeck({ level: this.req.level, available: this.pool, size: this.deckSize(), strategy: params, rules: this.rules }).deck;
      out.push({ deck: this.repair(deck), params });
    }
    while (out.length < this.req.population) out.push(this.mutate(out[this.rng.int(out.length)], 3));
    return out;
  }

  mutate(g: Genome, strength = 1): Genome {
    const params = { ...g.params };
    const deck = [...g.deck];
    const n = 1 + this.rng.int(2 + strength);
    for (let i = 0; i < n; i++) {
      const t = this.rng.pick(TUNABLE);
      const cur = params[t.key] as number;
      const delta = (this.rng.next() * 2 - 1) * t.step * (2 + strength * 2);
      (params as unknown as Record<string, number>)[t.key] = Math.round(Math.max(t.min, Math.min(t.max, cur + delta)) * 100) / 100;
    }
    if (this.rng.chance(0.6) && this.pool.length > deck.length) {
      const out = this.pool.filter((p) => !deck.includes(p));
      const idx = this.rng.int(deck.length);
      const d = CONTENT.unit(deck[idx]);
      if (d.behavior !== 'plate' && !(this.req.level.forcedCards ?? []).includes(d.id)) deck[idx] = this.rng.pick(out);
    }
    params.id = 'research';
    params.name = '研究个体';
    return { deck: this.repair(deck), params };
  }

  crossover(a: Genome, b: Genome): Genome {
    const params = { ...a.params };
    for (const t of TUNABLE) if (this.rng.chance(0.5)) (params as unknown as Record<string, number>)[t.key] = b.params[t.key] as number;
    const union = [...new Set([...a.deck, ...b.deck])];
    this.rng.shuffle(union);
    const both = a.deck.filter((d) => b.deck.includes(d));
    params.id = 'research';
    params.name = '研究个体';
    return { deck: this.repair([...both, ...union]), params };
  }

  evaluate(g: Genome, gen: number): Evaluated {
    const stats = runBatch({
      level: this.req.level,
      ai: { strategy: g.params, deck: g.deck, skills: this.req.skills ?? ['lumen_rain', 'time_warp'] },
      runs: this.req.runsPerEval,
      seedBase: (this.req.seedBase ?? 1) * 1000 + gen * 17,
      rules: this.req.rules ?? null,
      difficulty: this.req.difficulty,
      mode: this.req.rules ? 'challenge' : 'research',
    });
    return { genome: g, fitness: fitnessOf(stats, this.req.objective), stats };
  }

  *iterate(): Generator<ResearchProgress, Evaluated, void> {
    let pop = this.initial();
    const total = this.req.generations * this.req.population;
    let evaluated = 0;
    for (let gen = 1; gen <= this.req.generations; gen++) {
      const scored: Evaluated[] = [];
      for (const g of pop) {
        const ev = this.evaluate(g, gen);
        scored.push(ev);
        evaluated++;
        if (!this.best || ev.fitness > this.best.fitness) this.best = ev;
        yield { generation: gen, evaluated, totalEvals: total, best: this.best, generationBest: scored.reduce((a, b) => (b.fitness > a.fitness ? b : a)), history: this.history };
      }
      scored.sort((a, b) => b.fitness - a.fitness);
      this.history.push({
        generation: gen,
        best: scored[0].fitness,
        avg: scored.reduce((a, s) => a + s.fitness, 0) / scored.length,
        winRate: scored[0].stats.winRate,
      });
      // 下一代：精英保留 + 锦标赛选择 + 交叉 + 变异
      const next: Genome[] = scored.slice(0, 2).map((s) => s.genome);
      const pick = () => {
        const a = scored[this.rng.int(scored.length)];
        const b = scored[this.rng.int(scored.length)];
        return (a.fitness > b.fitness ? a : b).genome;
      };
      while (next.length < this.req.population) {
        const child = this.rng.chance(0.6) ? this.crossover(pick(), pick()) : pick();
        next.push(this.mutate(child, 1));
      }
      pop = next;
    }
    return this.best!;
  }
}

export function runResearch(req: ResearchRequest, onProgress?: (p: ResearchProgress) => void): { best: Evaluated; history: ResearchProgress['history'] } {
  const run = new ResearchRun(req);
  const it = run.iterate();
  let r = it.next();
  let lastGen = 0;
  while (!r.done) {
    if (r.value.generation !== lastGen && lastGen !== 0) onProgress?.({ ...r.value, generation: lastGen });
    lastGen = r.value.generation;
    r = it.next();
  }
  const best = r.value;
  onProgress?.({ generation: lastGen, evaluated: 0, totalEvals: 0, best, generationBest: best, history: run.history });
  return { best, history: run.history };
}

export function strategyFromGenome(g: Genome, name = '研究成果'): StrategyParams {
  return { ...g.params, id: 'research', name, desc: '由阵容研究自动搜索得到的策略参数' };
}

export { STRATEGIES };
