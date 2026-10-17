import type { World } from '../sim/world';
import { CONTENT } from '../content/registry';
import { analyzeGame, type FailureReport } from '../../ai/analyzer';

export interface BattleReport {
  id: string;
  created: number;
  title: string;
  level: string;
  levelName: string;
  mode: string;
  player: string;
  won: boolean;
  reason: string;
  time: number;
  waves: number;
  totalWaves: number;
  seed: number;
  deck: string[];
  economy: {
    generated: number;
    collected: number;
    spent: number;
    expired: number;
    sky: number;
    producers: number;
    utilization: number;
    collectionRate: number;
    avgLumen: number;
  };
  operations: { total: number; byType: Record<string, number>; apm: number; rejected: number; rejectedRule: number; reasons: Record<string, number> };
  units: { placed: Record<string, number>; lost: Record<string, number>; damage: Record<string, number>; kills: Record<string, number>; peak: number };
  enemies: { spawned: Record<string, number>; killed: Record<string, number>; total: number };
  deployments: { t: number; unit: string; row: number; col: number; cost: number; wave: number; src: string }[];
  timeline: { t: number; lumen: number; enemies: number; units: number; threat: number; spent: number }[];
  combos: Record<string, number>;
  weather: string[];
  events: string[];
  sentinelsUsed: number;
  cheatsUsed: boolean;
  rules?: { name: string; rules: string[]; ruleViolation: boolean };
  analysis: FailureReport;
  ai?: { strategy: string; decisions: number; strategyChanges: { t: number; from: string; to: string; why: string }[]; topDecisions: { t: number; goal: string; label: string; reasons: string[] }[] };
}

export interface AgentLike {
  base: { name: string };
  thinkCount: number;
  strategyLog: { t: number; from: string; to: string; why: string }[];
  traces: { t: number; goal: string; chosen: { label: string; reasons: string[] }[] }[];
}

export function buildReport(w: World, player: string, agent?: AgentLike): BattleReport {
  const s = w.stats;
  const analysis = analyzeGame(w);
  const opsTypes: Record<string, number> = { ...s.opsByType };
  const minutes = Math.max(1 / 60, w.time / 60);
  return {
    id: `rep_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e5).toString(36)}`,
    created: Date.now(),
    title: `${w.level.name} · ${w.status === 'won' ? '胜利' : '失败'}`,
    level: w.level.id,
    levelName: w.level.name,
    mode: w.config.mode,
    player,
    won: w.status === 'won',
    reason: w.endReason,
    time: Math.round(w.time * 10) / 10,
    waves: w.waveIndex,
    totalWaves: Number.isFinite(w.totalWaves) ? w.totalWaves : -1,
    seed: w.config.seed,
    deck: w.deck.map((d) => d.id),
    economy: {
      generated: s.lumenGenerated,
      collected: s.lumenCollected,
      spent: s.lumenSpent,
      expired: s.lumenExpired,
      sky: s.skyLumen,
      producers: s.producerLumen,
      utilization: s.lumenGenerated > 0 ? round2(s.lumenSpent / (s.lumenGenerated + w.level.startLumen)) : 0,
      collectionRate: s.lumenGenerated > 0 ? round2(s.lumenCollected / s.lumenGenerated) : 0,
      avgLumen: w.time > 0 ? Math.round(s.lumenHeld / w.time) : 0,
    },
    operations: { total: s.ops, byType: opsTypes, apm: Math.round((s.ops / minutes) * 10) / 10, rejected: s.rejected, rejectedRule: s.rejectedRule, reasons: { ...s.rejectedReasons } },
    units: { placed: { ...s.placements }, lost: { ...s.unitsLost }, damage: roundRec(s.damageBy), kills: { ...s.killsBy }, peak: s.peakUnits },
    enemies: { spawned: { ...s.enemiesSpawned }, killed: { ...s.enemiesKilled }, total: Object.values(s.enemiesSpawned).reduce((a, b) => a + b, 0) },
    deployments: s.deployLog.slice(0, 400),
    timeline: s.timeline,
    combos: { ...s.combos },
    weather: [...s.weatherSeen],
    events: [...s.eventsSeen],
    sentinelsUsed: s.sentinelsUsed,
    cheatsUsed: s.cheatsUsed,
    rules: w.rules ? { name: w.rules.set.name, rules: w.rules.describe(), ruleViolation: w.endReason.startsWith('违反挑战规则') } : undefined,
    analysis,
    ai: agent
      ? {
          strategy: agent.base.name,
          decisions: agent.thinkCount,
          strategyChanges: agent.strategyLog,
          topDecisions: agent.traces
            .filter((t) => t.chosen.length)
            .slice(-25)
            .map((t) => ({ t: t.t, goal: t.goal, label: t.chosen[0].label, reasons: t.chosen[0].reasons })),
        }
      : undefined,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function roundRec(r: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, v] of Object.entries(r)) o[k] = Math.round(v);
  return o;
}

export function nameOf(id: string): string {
  if (id.startsWith('__')) {
    return ({ __sentinel: '符文哨卫', __skill: '技能', __item: '道具', __weather: '天气', __event: '随机事件', __cheat: '修改器', __boss: '首领倒下', __self: '自爆', __terrain: '地形', __crush: '碾压损耗' } as Record<string, string>)[id] ?? id;
  }
  return CONTENT.units.get(id)?.name ?? CONTENT.enemies.get(id)?.name ?? id;
}

/** 导出为 Markdown 战报 */
export function reportToMarkdown(r: BattleReport): string {
  const lines: string[] = [];
  const top = (rec: Record<string, number>, n = 8) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `| ${nameOf(k)} | ${v} |`)
      .join('\n');
  lines.push(`# 战报：${r.title}`);
  lines.push('');
  lines.push(`- 关卡：${r.levelName}（${r.level}） 模式：${r.mode} 玩家：${r.player}`);
  lines.push(`- 结果：**${r.won ? '胜利' : '失败'}** — ${r.reason}`);
  lines.push(`- 用时：${r.time} 秒，波次 ${r.waves}${r.totalWaves > 0 ? `/${r.totalWaves}` : ''}，随机种子 ${r.seed}`);
  lines.push(`- 卡组：${r.deck.map(nameOf).join('、')}`);
  if (r.cheatsUsed) lines.push('- ⚠ 本局使用了修改器');
  if (r.rules) lines.push(`- 挑战规则「${r.rules.name}」：${r.rules.rules.join('；')}${r.rules.ruleViolation ? '（违规）' : ''}`);
  lines.push('');
  lines.push('## 经济');
  lines.push(`| 指标 | 数值 |\n|---|---|\n| 产出光能 | ${r.economy.generated} |\n| 收集光能 | ${r.economy.collected}（收集率 ${(r.economy.collectionRate * 100).toFixed(0)}%） |\n| 消耗光能 | ${r.economy.spent} |\n| 过期浪费 | ${r.economy.expired} |\n| 资源利用率 | ${(r.economy.utilization * 100).toFixed(0)}% |\n| 平均闲置光能 | ${r.economy.avgLumen} |`);
  lines.push('');
  lines.push('## 操作');
  lines.push(`总操作 ${r.operations.total} 次（APM ${r.operations.apm}），被拒绝 ${r.operations.rejected} 次（规则拒绝 ${r.operations.rejectedRule} 次）。`);
  lines.push('');
  lines.push('## 伤害贡献');
  lines.push(`| 来源 | 伤害 |\n|---|---|\n${top(r.units.damage)}`);
  lines.push('');
  lines.push('## 部署时机（前 30 次）');
  lines.push('| 时间(s) | 波次 | 单位 | 位置 | 花费 |\n|---|---|---|---|---|');
  for (const d of r.deployments.slice(0, 30)) lines.push(`| ${d.t} | ${d.wave} | ${nameOf(d.unit)} | 第${d.row + 1}行第${d.col + 1}列 | ${d.cost} |`);
  lines.push('');
  lines.push('## 复盘分析');
  lines.push(`**${r.analysis.cause}**`);
  for (const d of r.analysis.details) lines.push(`- ${d}`);
  if (r.analysis.adjustments.length) {
    lines.push('');
    lines.push('建议调整：');
    for (const a of r.analysis.adjustments) lines.push(`- ${a.text}`);
  }
  if (r.ai) {
    lines.push('');
    lines.push(`## AI 决策（策略：${r.ai.strategy}，思考 ${r.ai.decisions} 次）`);
    for (const c of r.ai.strategyChanges) lines.push(`- ${c.t}s：${c.from} → ${c.to}（${c.why}）`);
    for (const d of r.ai.topDecisions.slice(-12)) lines.push(`- ${d.t}s [${d.goal}] ${d.label} — ${d.reasons.join('；')}`);
  }
  return lines.join('\n');
}
