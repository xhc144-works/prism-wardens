import { describe, expect, it } from 'vitest';
import { World } from '../src/core/sim/world';
import { CONTENT } from '../src/core/content/registry';
import { BUILTIN_CHALLENGES } from '../src/core/content/challenges';
import { RuleEngine, compileRuleScript } from '../src/core/rules/ruleEngine';
import { ReplayPlayer, makeReplay } from '../src/core/replay/replay';
import { buildReport, reportToMarkdown } from '../src/core/report/report';
import { newProfile, buy, shopEntries } from '../src/core/meta/profile';
import { recordGame } from '../src/core/meta/achievements';
import { makeAIGameConfig, runBatch, runGame } from '../src/ai/runner';
import { buildDeck } from '../src/ai/deckBuilder';
import { getStrategy } from '../src/ai/strategies';
import { analyzeGame } from '../src/ai/analyzer';
import { runCoach } from '../src/ai/coach';
import { ResearchRun } from '../src/ai/research';
import type { RuleSet } from '../src/core/types';

const lvl = (id: string) => CONTENT.level(id)!;
const challenge = (id: string) => BUILTIN_CHALLENGES.find((c) => c.id === id)!;

describe('规则引擎', () => {
  it('只允许指定类型时拒绝其他卡牌（人类与 AI 一样）', () => {
    const rules = challenge('pure_shooters');
    const w = new World({ mode: 'challenge', level: lvl('1-6'), deck: ['lumen_moss', 'prism_shooter', 'pebble_lobber'], skills: [], items: {}, seed: 1, rules });
    w.lumen = 1000;
    const r = w.issue({ type: 'place', card: 'pebble_lobber', row: 0, col: 4 }, 'ai');
    expect(r.ok).toBe(false);
    expect(r.rule).toBe(true);
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 0, col: 1 }, 'ai').ok).toBe(true);
  });
  it('操作次数、消耗上限、部署列与时间窗限制', () => {
    const rules: RuleSet = { id: 't', name: 't', desc: '', constraints: { maxOperations: 2, maxTotalSpend: 120, placementCols: [0, 2] } };
    const w = new World({ mode: 'challenge', level: lvl('1-1'), deck: ['lumen_moss', 'prism_shooter'], skills: [], items: {}, seed: 1, rules });
    w.lumen = 1000;
    expect(w.issue({ type: 'place', card: 'lumen_moss', row: 0, col: 3 }).reason).toContain('列');
    expect(w.issue({ type: 'place', card: 'lumen_moss', row: 0, col: 0 }).ok).toBe(true);
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 1, col: 1 }).reason).toContain('总消耗');
    const w2 = new World({ mode: 'challenge', level: lvl('1-1'), deck: ['lumen_moss'], skills: [], items: {}, seed: 1, rules: { id: 'w', name: 'w', desc: '', constraints: { placementWindows: [{ from: 10, to: 20 }] } } });
    w2.lumen = 1000;
    expect(w2.issue({ type: 'place', card: 'lumen_moss', row: 0, col: 0 }).ok).toBe(false);
  });
  it('脚本规则可以拒绝指令与判负', () => {
    const rules = challenge('row_cap_script');
    const w = new World({ mode: 'challenge', level: lvl('1-5'), deck: ['lumen_moss', 'prism_shooter', 'stone_warden'], skills: [], items: {}, seed: 1, rules: { ...rules, constraints: { cooldownMul: 0.0001 } } });
    w.lumen = 5000;
    for (let c = 0; c < 3; c++) {
      w.deck.forEach((d) => (d.cooldown = 0));
      expect(w.issue({ type: 'place', card: 'prism_shooter', row: 0, col: c }).ok).toBe(true);
    }
    w.deck.forEach((d) => (d.cooldown = 0));
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 0, col: 4 }).reason).toContain('3 个单位');
    const hoard = new World({ mode: 'challenge', level: lvl('1-4'), deck: ['lumen_moss'], skills: [], items: {}, seed: 1, rules: challenge('hoarder_ban') });
    hoard.lumen = 700;
    for (let i = 0; i < 20; i++) hoard.step();
    expect(hoard.status).toBe('lost');
    expect(hoard.endReason).toContain('违反挑战规则');
  });
  it('脚本沙箱屏蔽全局对象，语法错误会被报告', () => {
    const r = compileRuleScript('return { onTick() { return { fail: typeof window + typeof fetch } } };');
    expect(r.hooks).toBeTruthy();
    expect((r.hooks!.onTick as () => { fail: string })().fail).toBe('undefinedundefined');
    expect(compileRuleScript('return {').error).toBeTruthy();
  });
  it('静态校验发现冲突规则', () => {
    const bad: RuleSet = { id: 'b', name: 'b', desc: '', constraints: { allowedCategories: ['producer'], bannedCategories: ['producer'] } };
    expect(RuleEngine.validateRuleSet(bad).errors.length).toBeGreaterThan(0);
    for (const c of BUILTIN_CHALLENGES) expect(RuleEngine.validateRuleSet(c).errors, c.id).toEqual([]);
  });
});

describe('AI', () => {
  it('AI 能稳定通关第一章前几关', () => {
    for (const id of ['1-1', '1-2', '1-3']) {
      const s = runBatch({ level: lvl(id), ai: { strategy: 'balanced' }, runs: 3, seedBase: 11 });
      expect(s.winRate, id).toBeGreaterThanOrEqual(0.66);
    }
  });
  it('AI 在挑战中严格遵守规则（没有违规判负，部署的都是允许的卡牌）', () => {
    const rules = challenge('pure_shooters');
    const cfg = makeAIGameConfig(lvl('1-6'), { strategy: 'balanced' }, 3, { rules });
    for (const id of cfg.deck) expect(['producer', 'shooter']).toContain(CONTENT.unit(id).category);
    const { world } = runGame(cfg, { strategy: 'balanced' });
    for (const id of Object.keys(world.stats.placements)) expect(['producer', 'shooter']).toContain(CONTENT.unit(id).category);
    expect(world.endReason.startsWith('违反挑战规则')).toBe(false);
    expect(world.stats.cheatsUsed).toBe(false);
  });
  it('AI 不超过操作次数上限', () => {
    const rules = challenge('forty_moves');
    const { world } = runGame(makeAIGameConfig(lvl('1-4'), { strategy: 'balanced' }, 5, { rules }), { strategy: 'balanced' });
    expect(world.stats.ops).toBeLessThanOrEqual(60);
  });
  it('选卡器：水路地图必带浮晶台，飞行敌人必带对空', () => {
    const all = CONTENT.allUnits().map((u) => u.id);
    const lake = buildDeck({ level: lvl('3-6'), available: all, size: 8, strategy: getStrategy('balanced') }).deck;
    expect(lake).toContain('drift_plate');
    expect(lake.some((id) => CONTENT.unit(id).antiAir || CONTENT.unit(id).behavior === 'gale')).toBe(true);
  });
  it('失败复盘给出调整，教练会重试', () => {
    const { world } = runGame(makeAIGameConfig(lvl('1-6'), { strategy: 'balanced', deck: ['lumen_moss'] }, 1), { strategy: 'balanced' });
    expect(world.status).toBe('lost');
    const rep = analyzeGame(world);
    expect(rep.won).toBe(false);
    expect(rep.adjustments.length).toBeGreaterThan(0);
    const r = runCoach({ levels: ['1-1'], strategy: 'balanced', maxAttempts: 2 });
    expect(r.cleared).toBe(1);
  });
  it('阵容研究可以迭代并给出最佳个体', () => {
    const run = new ResearchRun({ level: lvl('1-2'), generations: 1, population: 3, runsPerEval: 1, objective: 'min-spend', seedBase: 3 });
    const it = run.iterate();
    let r = it.next();
    while (!r.done) r = it.next();
    expect(r.value.genome.deck.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.value.fitness)).toBe(true);
  });
});

describe('回放与战报', () => {
  it('AI 对局的录像可以完全一致地重放', () => {
    const { world, agent } = runGame(makeAIGameConfig(lvl('1-2'), { strategy: 'balanced' }, 99), { strategy: 'balanced' });
    const rep = makeReplay(world, 'AI');
    const v = ReplayPlayer.verify(JSON.parse(JSON.stringify(rep)));
    expect(v.ok, v.detail).toBe(true);
    const report = buildReport(world, 'AI', agent);
    expect(report.deployments.length).toBeGreaterThan(0);
    expect(reportToMarkdown(report)).toContain('# 战报');
  });
});

describe('档案、商店与成就', () => {
  it('记录对局、解锁成就、购买卡槽', () => {
    const p = newProfile('测试');
    const { world } = runGame(makeAIGameConfig(lvl('1-1'), { strategy: 'balanced' }, 5), { strategy: 'balanced' });
    const r = recordGame(p, world, { ai: true });
    expect(p.stats.games).toBe(1);
    if (world.status === 'won') expect(r.newAchievements.map((a) => a.id)).toContain('first_win');
    p.coins = 10000;
    const slot = shopEntries(p).find((e) => e.kind === 'slot')!;
    expect(buy(p, slot)).toBeNull();
    expect(p.deckSlots).toBe(7);
  });
});
