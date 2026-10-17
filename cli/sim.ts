/**
 * 无渲染批量模拟命令行工具。
 *
 * 用法示例：
 *   npm run sim -- --level 1-1 --strategy balanced --runs 50
 *   npm run sim -- --level all --strategy all --runs 10
 *   npm run sim -- --level 1-6 --compare balanced,economy,defense --runs 30
 *   npm run sim -- --challenge pure_shooters --runs 20
 *   npm run sim -- --coach --from 1-1 --to 2-6
 *   npm run sim -- --research 1-6 --generations 6 --population 10 --runs 4
 *   npm run sim -- --endless day --strategy economy --runs 3
 *   npm run sim -- --json out.json ...
 */
import { writeFileSync } from 'node:fs';
import { CONTENT } from '../src/core/content/registry';
import { LEVELS, makeEndlessLevel, makeSurvivalLevel } from '../src/core/content/levels';
import { BUILTIN_CHALLENGES } from '../src/core/content/challenges';
import { STRATEGIES } from '../src/ai/strategies';
import { runBatch, type BatchStats } from '../src/ai/runner';
import { runCoach } from '../src/ai/coach';
import { runResearch } from '../src/ai/research';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] ?? 'true' : d;
};
const flag = (k: string) => args.includes(`--${k}`);

const runs = Number(opt('runs', '10'));
const seed = Number(opt('seed', '1000'));
const difficulty = Number(opt('difficulty', '1'));
const json = opt('json');
const results: Record<string, unknown> = {};

function pct(x: number): string {
  return `${(x * 100).toFixed(0)}%`.padStart(5);
}

function row(label: string, s: BatchStats): string {
  const breach = Object.entries(s.breachEnemies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${CONTENT.enemies.get(k)?.name ?? k}×${v}`)
    .join(' ');
  return `${label.padEnd(26)} 胜率${pct(s.winRate)}  平均${s.avgTime.toFixed(0).padStart(4)}s  消耗${s.avgSpent.toFixed(0).padStart(6)}  操作${s.avgOps.toFixed(0).padStart(4)}  利用率${pct(s.utilization)}  损失${s.avgUnitsLost.toFixed(1).padStart(5)}  ${breach}`;
}

const t0 = Date.now();

if (flag('coach')) {
  const from = opt('from', '1-1')!;
  const to = opt('to', '1-6')!;
  const strategy = opt('strategy', 'balanced')!;
  const ids = LEVELS.map((l) => l.id);
  const list = ids.slice(ids.indexOf(from), ids.indexOf(to) + 1);
  const r = runCoach({ levels: list, strategy, maxAttempts: Number(opt('attempts', '5')), seedBase: seed }, (ev) => {
    if (ev.type === 'attempt') console.log(`[${ev.level}] 第${ev.attempt}次 ${ev.summary.won ? '✔ 胜利' : '✘ 失败'} ${ev.summary.reason}  用时${ev.summary.time}s`);
    if (ev.type === 'analysis') console.log(`    分析：${ev.report.cause} → 调整：${ev.report.adjustments.map((a) => a.text).join('；') || '无'}`);
  });
  console.log(`\n通关 ${r.cleared}/${list.length} 关，总尝试 ${r.attempts} 次`);
  results.coach = r;
} else if (opt('research')) {
  const level = CONTENT.level(opt('research')!)!;
  const r = runResearch(
    {
      level,
      generations: Number(opt('generations', '5')),
      population: Number(opt('population', '8')),
      runsPerEval: Number(opt('runs', '3')),
      objective: (opt('objective', 'winrate') as never),
      seedBase: seed,
    },
    (p) => console.log(`第${p.generation}代 最佳适应度 ${p.best.fitness.toFixed(1)} 胜率 ${pct(p.best.stats.winRate)} 消耗 ${p.best.stats.avgSpent.toFixed(0)} 卡组 ${p.best.genome.deck.map((d) => CONTENT.units.get(d)?.name).join('、')}`),
  );
  console.log('\n最佳阵容：', r.best.genome.deck.map((d) => CONTENT.units.get(d)?.name).join('、'));
  console.log('最佳参数：', JSON.stringify(r.best.genome.params));
  results.research = r;
} else {
  let levels = [] as typeof LEVELS;
  const lv = opt('level');
  const ch = opt('challenge');
  const endless = opt('endless');
  const survival = opt('survival');
  if (lv === 'all') levels = LEVELS;
  else if (lv) levels = lv.split(',').map((id) => CONTENT.level(id)!).filter(Boolean);
  if (endless) levels = [makeEndlessLevel(endless)];
  if (survival) levels = [makeSurvivalLevel(survival)];
  let rules = null;
  if (ch) {
    const c = BUILTIN_CHALLENGES.find((x) => x.id === ch);
    if (!c) throw new Error(`未知挑战 ${ch}`);
    rules = c;
    levels = [CONTENT.level(c.level ?? '1-6')!];
  }
  const sOpt = opt('compare') ?? opt('strategy', 'balanced')!;
  const strategies = sOpt === 'all' ? STRATEGIES.map((s) => s.id) : sOpt.split(',');
  for (const level of levels) {
    console.log(`\n=== ${level.id} ${level.name} ===`);
    for (const sid of strategies) {
      const stats = runBatch({
        level,
        ai: { strategy: sid, skills: ['lumen_rain', 'time_warp'], items: {} },
        runs,
        seedBase: seed,
        rules,
        difficulty,
        mode: endless ? 'endless' : survival ? 'survival' : rules ? 'challenge' : 'adventure',
        maxWaves: endless ? Number(opt('maxWaves', '60')) : undefined,
        maxTime: endless ? 4000 : undefined,
      });
      console.log(row(STRATEGIES.find((s) => s.id === sid)?.name ?? sid, stats));
      if (endless) console.log(`    平均波数 ${stats.avgWaves.toFixed(1)}`);
      if (rules) console.log(`    规则拒绝 ${stats.summaries.reduce((a, s) => a + s.rejectedRule, 0)} 次，违规判负 ${stats.summaries.filter((s) => s.ruleViolation).length} 局`);
      results[`${level.id}:${sid}`] = { ...stats, summaries: stats.summaries };
    }
  }
}

console.log(`\n耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (json) writeFileSync(json, JSON.stringify(results, null, 2));
