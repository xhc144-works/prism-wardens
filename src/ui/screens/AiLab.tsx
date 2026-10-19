import { useEffect, useRef, useState } from 'preact/hooks';
import type { LevelDef, RuleSet } from '../../core/types';
import { CONTENT } from '../../core/content/registry';
import { LEVELS, ARENAS, makeEndlessLevel } from '../../core/content/levels';
import { BUILTIN_CHALLENGES } from '../../core/content/challenges';
import { World } from '../../core/sim/world';
import { DT } from '../../core/constants';
import { STRATEGIES, getStrategy, TUNABLE } from '../../ai/strategies';
import { AIAgent } from '../../ai/agent';
import { makeAIGameConfig, type BatchStats } from '../../ai/runner';
import { OBJECTIVE_NAMES, strategyFromGenome, type ResearchObjective, type Genome } from '../../ai/research';
import type { CoachEvent, CoachResult } from '../../ai/coach';
import { Renderer } from '../../render/renderer';
import { navigate, back, type Route } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { parallelBatch, researchInWorker, coachInWorker } from '../../app/workers';
import { Btn, NumberField, Progress, Select, Tabs, Toggle, TopBar, toast } from '../components/ui';
import { BarChart, LineChart, SERIES, Stat } from '../components/charts';
import { SCREENS } from './registry';

type Tab = 'watch' | 'batch' | 'coach' | 'research' | 'knowledge';

export interface Target {
  key: string;
  label: string;
  level: LevelDef;
  rules: RuleSet | null;
}

export function allTargets(): Target[] {
  const out: Target[] = [];
  for (const l of LEVELS) out.push({ key: `level:${l.id}`, label: `冒险 ${l.id} ${l.name}`, level: l, rules: null });
  for (const l of store.data.customPack.levels ?? []) out.push({ key: `level:${l.id}`, label: `自定义 · ${l.name}`, level: l, rules: null });
  for (const c of [...BUILTIN_CHALLENGES, ...store.data.customRules]) {
    const lv = CONTENT.level(c.level ?? '1-6');
    if (lv) out.push({ key: `rule:${c.id}`, label: `挑战 · ${c.name}`, level: lv, rules: c });
  }
  for (const a of ARENAS) out.push({ key: `endless:${a.id}`, label: `无尽 · ${a.name}（前 30 波）`, level: makeEndlessLevel(a.id), rules: null });
  return out;
}

function TargetSelect(props: { value: string; onChange: (k: string) => void }) {
  const t = allTargets();
  return <Select label="对象" value={props.value} options={t.map((x) => ({ value: x.key, label: x.label }))} onChange={props.onChange} />;
}

const findTarget = (k: string) => allTargets().find((t) => t.key === k) ?? allTargets()[0];

/* ============================ 批量模拟 / 策略对比 ============================ */

interface BatchRow {
  strategy: string;
  name: string;
  stats: BatchStats;
}

function BatchTab(props: { target?: string }) {
  const [target, setTarget] = useState(props.target ?? 'level:1-6');
  const [chosen, setChosen] = useState<string[]>(['balanced', 'economy', 'defense']);
  const [runs, setRuns] = useState(20);
  const [difficulty, setDifficulty] = useState(1);
  const [useAll, setUseAll] = useState(true);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const cancel = useRef<(() => void) | null>(null);
  const [running, setRunning] = useState(false);
  const run = async () => {
    const t = findTarget(target);
    setRows([]);
    setRunning(true);
    const out: BatchRow[] = [];
    const t0 = performance.now();
    for (const sid of chosen) {
      const name = STRATEGIES.find((s) => s.id === sid)?.name ?? sid;
      setProgress({ done: 0, total: runs, label: name });
      const job = parallelBatch(
        {
          level: t.level,
          ai: { strategy: sid, available: useAll ? undefined : store.profile.unlockedCards, skills: ['lumen_rain', 'time_warp'] },
          runs,
          seedBase: 1000,
          rules: t.rules,
          difficulty,
          mode: t.rules ? 'challenge' : t.key.startsWith('endless') ? 'endless' : 'adventure',
          maxWaves: t.key.startsWith('endless') ? 30 : undefined,
          maxTime: t.key.startsWith('endless') ? 2500 : undefined,
        },
        (d, total) => setProgress({ done: d, total, label: name }),
      );
      cancel.current = job.cancel;
      try {
        const stats = await job.promise;
        out.push({ strategy: sid, name, stats });
        setRows([...out]);
      } catch (e) {
        toast(`模拟中止：${(e as Error).message}`, 'bad');
        break;
      }
    }
    setRunning(false);
    const total = out.reduce((a, r) => a + r.stats.runs, 0);
    store.update(['profiles'], () => {
      store.profile.stats.simulations += total;
    });
    if (out.length) toast(`完成 ${total} 局模拟，用时 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`, 'good');
  };
  const t = findTarget(target);
  return (
    <div class="col" style={{ gap: 14 }}>
      <div class="panel">
        <h3>批量模拟与策略对比</h3>
        <div class="muted" style={{ fontSize: 12, marginBottom: 8 }}>不渲染画面，在多个后台线程中高速运行。所有策略使用同一组随机种子，条件完全相同。</div>
        <TargetSelect value={target} onChange={setTarget} />
        <div class="field">
          <span class="label">参与策略</span>
          <div class="row">
            {STRATEGIES.map((s) => (
              <Btn small active={chosen.includes(s.id)} onClick={() => setChosen(chosen.includes(s.id) ? chosen.filter((x) => x !== s.id) : [...chosen, s.id])}>
                {s.name}
              </Btn>
            ))}
          </div>
        </div>
        <NumberField label="每个策略局数" value={runs} min={1} max={500} onChange={(v) => setRuns(Math.max(1, Math.min(500, v ?? 20)))} />
        <Select label="难度" value={difficulty} options={[{ value: 0.7, label: '简单' }, { value: 1, label: '普通' }, { value: 1.35, label: '困难' }, { value: 1.8, label: '噩梦' }]} onChange={setDifficulty} />
        <Toggle label="AI 可使用全部卡牌（关闭则只用当前存档已解锁的卡）" value={useAll} onChange={setUseAll} />
        <div class="row" style={{ marginTop: 10 }}>
          <Btn kind="primary" disabled={running || !chosen.length} onClick={run}>开始模拟（共 {runs * chosen.length} 局）</Btn>
          {running && <Btn kind="danger" onClick={() => { cancel.current?.(); setRunning(false); }}>取消</Btn>}
          {chosen.length >= 2 && (
            <Btn onClick={() => navigate({ name: 'versus', level: t.level, rules: t.rules, strategies: [chosen[0], chosen[1]], seed: 1000 })} title="同一种子下两个策略实时并排对局">
              ⚔ 可视化对决：{STRATEGIES.find((s) => s.id === chosen[0])?.name} vs {STRATEGIES.find((s) => s.id === chosen[1])?.name}
            </Btn>
          )}
        </div>
        {running && (
          <div style={{ marginTop: 10 }}>
            <div class="muted">{progress.label}：{progress.done}/{progress.total}</div>
            <Progress value={progress.done} max={progress.total} />
          </div>
        )}
      </div>
      {rows.length > 0 && <BatchResults rows={rows} />}
    </div>
  );
}

export function BatchResults(props: { rows: BatchRow[] }) {
  const { rows } = props;
  const best = [...rows].sort((a, b) => b.stats.winRate - a.stats.winRate || a.stats.avgTime - b.stats.avgTime)[0];
  return (
    <>
      <div class="panel">
        <h3>结果对比</h3>
        <table class="table">
          <thead>
            <tr>
              <th>策略</th><th>局数</th><th>胜率</th><th>平均用时</th><th>胜局平均用时</th><th>平均消耗</th><th>最低消耗通关</th><th>平均操作</th><th>最少操作通关</th><th>资源利用率</th><th>平均损失</th><th>平均波次</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td><b>{r.name}</b> {r === best && <span class="tag good">最佳</span>}</td>
                <td>{r.stats.runs}</td>
                <td class={r.stats.winRate >= 0.7 ? 'good' : r.stats.winRate < 0.3 ? 'bad' : ''}>{(r.stats.winRate * 100).toFixed(0)}%</td>
                <td>{r.stats.avgTime.toFixed(0)}s</td>
                <td>{r.stats.avgWinTime ? `${r.stats.avgWinTime.toFixed(0)}s` : '—'}</td>
                <td>{r.stats.avgSpent.toFixed(0)}</td>
                <td>{r.stats.minSpentWin || '—'}</td>
                <td>{r.stats.avgOps.toFixed(0)}</td>
                <td>{r.stats.minOpsWin || '—'}</td>
                <td>{(r.stats.utilization * 100).toFixed(0)}%</td>
                <td>{r.stats.avgUnitsLost.toFixed(1)}</td>
                <td>{r.stats.avgWaves.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <div class="panel">
          <h3>胜率</h3>
          <BarChart items={rows.map((r, i) => ({ label: r.name, value: Math.round(r.stats.winRate * 100), color: SERIES[i % SERIES.length] }))} max={100} unit="%" />
        </div>
        <div class="panel">
          <h3>平均用时（秒）</h3>
          <BarChart items={rows.map((r, i) => ({ label: r.name, value: Math.round(r.stats.avgTime), color: SERIES[i % SERIES.length] }))} />
        </div>
        <div class="panel">
          <h3>平均光能消耗</h3>
          <BarChart items={rows.map((r, i) => ({ label: r.name, value: Math.round(r.stats.avgSpent), color: SERIES[i % SERIES.length] }))} />
        </div>
        <div class="panel">
          <h3>失败原因（突破的敌人）</h3>
          {rows.map((r) => {
            const items = Object.entries(r.stats.breachEnemies)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([k, v]) => ({ label: CONTENT.enemies.get(k)?.name ?? k, value: v }));
            return items.length ? (
              <div style={{ marginBottom: 8 }}>
                <div class="muted" style={{ fontSize: 12 }}>{r.name}</div>
                <BarChart items={items} unit="局" />
              </div>
            ) : null;
          })}
        </div>
      </div>
    </>
  );
}

/* ============================ 后台自动闯关 ============================ */

function CoachTab() {
  const [from, setFrom] = useState('1-1');
  const [to, setTo] = useState('2-6');
  const [strategy, setStrategy] = useState('balanced');
  const [attempts, setAttempts] = useState(5);
  const [log, setLog] = useState<string[]>([]);
  const [prog, setProg] = useState({ d: 0, t: 0 });
  const [result, setResult] = useState<CoachResult | null>(null);
  const [running, setRunning] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  const ids = LEVELS.map((l) => l.id);
  const start = async () => {
    const list = ids.slice(ids.indexOf(from), ids.indexOf(to) + 1);
    setLog([]);
    setResult(null);
    setRunning(true);
    const lines: string[] = [];
    const job = coachInWorker({ levels: list, strategy, maxAttempts: attempts, seedBase: Math.floor(Math.random() * 10000) }, (d, t, info) => {
      setProg({ d, t });
      const e = info as CoachEvent;
      if (e.type === 'attempt') lines.push(`[${e.level}] 第 ${e.attempt} 次：${e.summary.won ? '✔ 胜利' : '✘ 失败'}  ${e.summary.reason}（${e.summary.time}s，消耗 ${e.summary.spent}）`);
      if (e.type === 'analysis') lines.push(`    ↳ 复盘：${e.report.cause}\n    ↳ 调整：${e.report.applied.join('；') || '无'}`);
      if (e.type === 'levelDone') lines.push(`== ${e.level} ${e.won ? '通关' : '未能通关'}（${e.attempts} 次）==`);
      setLog([...lines]);
    });
    cancel.current = job.cancel;
    try {
      const r = (await job.promise) as CoachResult;
      setResult(r);
      store.update(['aiKnowledge', 'profiles'], (d) => {
        Object.assign(d.aiKnowledge, r.knowledge);
        store.profile.stats.simulations += r.attempts;
      });
      toast(`自动闯关完成：${r.cleared}/${list.length}，经验已保存到 AI 经验库`, 'good');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    setRunning(false);
  };
  return (
    <div class="col" style={{ gap: 14 }}>
      <div class="panel">
        <h3>自动连续挑战（后台高速）</h3>
        <div class="muted" style={{ fontSize: 12, marginBottom: 8 }}>AI 按顺序挑战关卡；失败后自动复盘（突破位置、敌人类型、经济、闲置光能等），调整策略参数与卡组后重试。学到的经验写入经验库，观战与“AI 推荐卡组”都会使用。</div>
        <div class="row">
          <Select label="从" value={from} options={ids.map((i) => ({ value: i, label: i }))} onChange={setFrom} />
          <Select label="到" value={to} options={ids.map((i) => ({ value: i, label: i }))} onChange={setTo} />
        </div>
        <Select label="初始策略" value={strategy} options={STRATEGIES.map((s) => ({ value: s.id, label: s.name }))} onChange={setStrategy} />
        <NumberField label="每关最多尝试" value={attempts} min={1} max={20} onChange={(v) => setAttempts(v ?? 5)} />
        <div class="row" style={{ marginTop: 8 }}>
          <Btn kind="primary" disabled={running} onClick={start}>开始自动闯关</Btn>
          {running && <Btn kind="danger" onClick={() => { cancel.current?.(); setRunning(false); }}>停止</Btn>}
          <Btn onClick={() => {
            const lv = CONTENT.level(from)!;
            const list = ids.slice(ids.indexOf(from), ids.indexOf(to) + 1);
            navigate({ name: 'battle', setup: { mode: 'adventure', level: lv, control: 'ai', strategy, coach: { levels: list, index: 0, attempt: 1, maxAttempts: attempts, strategy, log: [] } } });
          }}>👁 观看实时自动闯关</Btn>
        </div>
        {running && <Progress value={prog.d} max={prog.t} />}
      </div>
      {result && (
        <div class="row">
          <Stat label="通关" value={`${result.cleared}/${result.perLevel.length}`} tone={result.cleared === result.perLevel.length ? 'good' : undefined} />
          <Stat label="总尝试" value={result.attempts} />
          <Stat label="一次通过" value={result.perLevel.filter((x) => x.won && x.attempts === 1).length} />
        </div>
      )}
      <div class="log">{log.join('\n') || '等待开始…'}</div>
    </div>
  );
}

/* ============================ 阵容研究 ============================ */

interface ResearchProgressInfo {
  generation: number;
  best: { fitness: number; genome: Genome; stats: BatchStats };
  history: { generation: number; best: number; avg: number; winRate: number }[];
}

function ResearchTab(props: { target?: string }) {
  const [target, setTarget] = useState(props.target ?? 'level:1-6');
  const [objective, setObjective] = useState<ResearchObjective>('winrate');
  const [pop, setPop] = useState(8);
  const [gens, setGens] = useState(5);
  const [runs, setRuns] = useState(4);
  const [useAll, setUseAll] = useState(true);
  const [prog, setProg] = useState({ d: 0, t: 0 });
  const [info, setInfo] = useState<ResearchProgressInfo | null>(null);
  const [running, setRunning] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  const start = async () => {
    const t = findTarget(target);
    setRunning(true);
    setInfo(null);
    const job = researchInWorker(
      { level: t.level, rules: t.rules, available: useAll ? undefined : store.profile.unlockedCards, generations: gens, population: pop, runsPerEval: runs, objective, seedBase: Math.floor(Math.random() * 1000) + 1 },
      (d, total, i) => {
        setProg({ d, t: total });
        setInfo(i as ResearchProgressInfo);
      },
    );
    cancel.current = job.cancel;
    try {
      const r = await job.promise;
      const best = r.best as ResearchProgressInfo['best'];
      setInfo({ generation: gens, best, history: r.history as ResearchProgressInfo['history'] });
      store.update(['research', 'profiles'], (d) => {
        d.research.unshift({
          id: `rs_${Date.now()}`,
          created: Date.now(),
          level: t.level.id,
          rules: t.rules?.id,
          objective,
          deck: best.genome.deck,
          params: best.genome.params as unknown as Record<string, unknown>,
          fitness: best.fitness,
          winRate: best.stats.winRate,
          avgSpent: best.stats.avgSpent,
          avgOps: best.stats.avgOps,
          avgTime: best.stats.avgTime,
        });
        store.profile.stats.simulations += gens * pop * runs;
      });
      toast('研究完成，结果已记录', 'good');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    setRunning(false);
  };
  const t = findTarget(target);
  const best = info?.best;
  return (
    <div class="col" style={{ gap: 14 }}>
      <div class="panel">
        <h3>阵容研究（遗传算法）</h3>
        <div class="muted" style={{ fontSize: 12, marginBottom: 8 }}>同时搜索卡组组合与 {TUNABLE.length} 个策略参数：精英保留 + 锦标赛选择 + 交叉 + 变异；每代所有个体在相同种子下评估。可指定最高胜率、最低资源消耗、最少操作或最快通关为目标。挑战规则同样被严格遵守。</div>
        <TargetSelect value={target} onChange={setTarget} />
        <Select label="优化目标" value={objective} options={(Object.keys(OBJECTIVE_NAMES) as ResearchObjective[]).map((k) => ({ value: k, label: OBJECTIVE_NAMES[k] }))} onChange={setObjective} />
        <div class="row">
          <NumberField label="种群大小" value={pop} min={4} max={30} onChange={(v) => setPop(v ?? 8)} />
          <NumberField label="代数" value={gens} min={1} max={30} onChange={(v) => setGens(v ?? 5)} />
          <NumberField label="每个体评估局数" value={runs} min={1} max={20} onChange={(v) => setRuns(v ?? 4)} />
        </div>
        <Toggle label="使用全部卡牌（关闭则只用已解锁卡）" value={useAll} onChange={setUseAll} />
        <div class="row" style={{ marginTop: 8 }}>
          <Btn kind="primary" disabled={running} onClick={start}>开始研究（约 {pop * gens * runs} 局）</Btn>
          {running && <Btn kind="danger" onClick={() => { cancel.current?.(); setRunning(false); }}>停止</Btn>}
        </div>
        {running && (
          <div style={{ marginTop: 8 }}>
            <div class="muted">第 {info?.generation ?? 1} 代 · 已评估 {prog.d}/{prog.t}</div>
            <Progress value={prog.d} max={prog.t} />
          </div>
        )}
      </div>
      {info && info.history.length > 0 && (
        <div class="panel">
          <h3>进化曲线（适应度）</h3>
          <LineChart xLabel="代" series={[{ name: '最佳', values: info.history.map((h) => ({ x: h.generation, y: Math.round(h.best) })) }, { name: '平均', values: info.history.map((h) => ({ x: h.generation, y: Math.round(h.avg) })) }]} />
        </div>
      )}
      {best && (
        <div class="panel">
          <h3>当前最佳方案</h3>
          <div class="row">
            <Stat label="胜率" value={`${(best.stats.winRate * 100).toFixed(0)}%`} tone="good" />
            <Stat label="平均消耗" value={Math.round(best.stats.avgSpent)} />
            <Stat label="平均操作" value={Math.round(best.stats.avgOps)} />
            <Stat label="平均用时" value={`${Math.round(best.stats.avgTime)}s`} />
            <Stat label="适应度" value={best.fitness.toFixed(0)} />
          </div>
          <h4>卡组</h4>
          <div>{best.genome.deck.map((d) => CONTENT.units.get(d)?.name ?? d).join('、')}</div>
          <h4>参数</h4>
          <div class="kv" style={{ gridTemplateColumns: 'repeat(4, auto 1fr)' }}>
            {TUNABLE.map((k) => [<span>{k.key}</span>, <span>{String(best.genome.params[k.key])}</span>])}
          </div>
          <div class="row" style={{ marginTop: 10 }}>
            <Btn
              kind="gold"
              onClick={() => {
                store.update(['aiKnowledge'], (d) => {
                  d.aiKnowledge[t.level.id] = { params: strategyFromGenome(best.genome), include: best.genome.deck, exclude: [], attempts: 0, wins: 0, history: [] };
                });
                toast('已写入 AI 经验库：之后的 AI 推荐卡组/自动闯关会使用该方案', 'good');
              }}
            >
              应用到 AI 经验库
            </Btn>
            <Btn onClick={() => navigate({ name: 'battle', setup: { mode: t.rules ? 'challenge' : 'adventure', level: t.level, rules: t.rules, deck: best.genome.deck, control: 'ai', strategy: 'balanced', challengeId: t.rules?.id } })}>👁 用该方案观战</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ 观战 ============================ */

function WatchTab(props: { target?: string }) {
  const [target, setTarget] = useState(props.target ?? 'level:1-1');
  const [strategy, setStrategy] = useState('balanced');
  const [useAll, setUseAll] = useState(false);
  const t = findTarget(target);
  const go = () => {
    const kk = store.data.aiKnowledge[t.level.id];
    const available = useAll ? CONTENT.allUnits().map((u) => u.id) : store.profile.unlockedCards;
    const cfg = makeAIGameConfig(t.level, { strategy: kk?.params ?? getStrategy(strategy), available, include: kk?.include, exclude: kk?.exclude, deckSize: store.profile.deckSlots }, 1, { rules: t.rules });
    navigate({ name: 'battle', setup: { mode: t.rules ? 'challenge' : t.key.startsWith('endless') ? 'endless' : 'adventure', level: t.level, rules: t.rules, deck: cfg.deck, control: 'ai', strategy, challengeId: t.rules?.id, endlessArena: t.key.startsWith('endless') ? t.key.split(':')[1] : undefined, skills: store.profile.unlockedSkills.slice(0, 2) } });
  };
  return (
    <div class="panel">
      <h3>实时观看 AI 游玩</h3>
      <div class="muted" style={{ fontSize: 12, marginBottom: 8 }}>AI 读取游戏内部状态（地图、资源、卡牌冷却、敌人、波次、天气）实时决策。观战时右侧面板显示当前目标、选择依据、候选方案、各行压力与策略变化；可随时按 Tab 接管。</div>
      <TargetSelect value={target} onChange={setTarget} />
      <Select label="策略" value={strategy} options={STRATEGIES.map((s) => ({ value: s.id, label: `${s.name} — ${s.desc}` }))} onChange={setStrategy} />
      <Toggle label="使用全部卡牌（否则只用当前存档已解锁的卡）" value={useAll} onChange={setUseAll} />
      {store.data.aiKnowledge[t.level.id] && <div class="gold-text" style={{ fontSize: 12 }}>该关卡在经验库中有学习记录，AI 会使用调整后的参数与卡组偏好。</div>}
      <Btn kind="primary" onClick={go} style={{ marginTop: 10 }}>开始观战</Btn>
    </div>
  );
}

/* ============================ 经验库 ============================ */

function KnowledgeTab() {
  const data = useStore();
  const entries = Object.entries(data.aiKnowledge);
  return (
    <div class="col" style={{ gap: 12 }}>
      <div class="row">
        <Btn kind="danger" small disabled={!entries.length} onClick={() => confirm('清空 AI 经验库？') && store.update(['aiKnowledge'], (d) => (d.aiKnowledge = {}))}>清空经验库</Btn>
        <span class="muted">{entries.length} 个关卡有学习记录 · {data.research.length} 条研究记录</span>
      </div>
      {entries.map(([lv, k]) => (
        <div class="panel">
          <h3>{lv} {CONTENT.level(lv)?.name ?? ''}</h3>
          <div class="muted">尝试 {k.attempts} 次 · 胜利 {k.wins} 次 · 参数：{k.params.name}</div>
          <div class="muted">偏好卡牌：{k.include.map((i) => CONTENT.units.get(i)?.name ?? i).join('、') || '—'}</div>
          <div class="kv" style={{ gridTemplateColumns: 'repeat(4, auto 1fr)', marginTop: 6 }}>
            {TUNABLE.map((t) => [<span>{t.key}</span>, <span>{String(k.params[t.key])}</span>])}
          </div>
          {k.history.length > 0 && (
            <div class="log" style={{ marginTop: 8, maxHeight: 160 }}>
              {k.history.map((h) => `#${h.attempt} ${h.won ? '胜利' : '失败'}：${h.cause}${h.changes.length ? ` → ${h.changes.join('；')}` : ''}`).join('\n')}
            </div>
          )}
        </div>
      ))}
      {data.research.length > 0 && (
        <div class="panel">
          <h3>研究记录</h3>
          <table class="table">
            <thead><tr><th>关卡/挑战</th><th>目标</th><th>胜率</th><th>消耗</th><th>操作</th><th>用时</th><th>卡组</th></tr></thead>
            <tbody>
              {data.research.slice(0, 30).map((r) => (
                <tr>
                  <td>{r.rules ?? r.level}</td>
                  <td>{OBJECTIVE_NAMES[r.objective as ResearchObjective] ?? r.objective}</td>
                  <td>{(r.winRate * 100).toFixed(0)}%</td>
                  <td>{Math.round(r.avgSpent)}</td>
                  <td>{Math.round(r.avgOps)}</td>
                  <td>{Math.round(r.avgTime)}s</td>
                  <td class="muted" style={{ fontSize: 12 }}>{r.deck.map((d) => CONTENT.units.get(d)?.name ?? d).join('、')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AiLabScreen(props: { tab?: string; target?: string }) {
  useStore();
  const [tab, setTab] = useState<Tab>((props.tab as Tab) ?? 'watch');
  return (
    <div class="screen">
      <TopBar title="AI 控制台" onBack={() => back()} />
      <div class="content">
        <Tabs
          tabs={[
            { id: 'watch', label: '👁 观战' },
            { id: 'batch', label: '📊 批量模拟 / 策略对比' },
            { id: 'coach', label: '🔁 自动连续闯关' },
            { id: 'research', label: '🧬 阵容研究' },
            { id: 'knowledge', label: '🧠 经验库' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'watch' && <WatchTab target={props.target} />}
        {tab === 'batch' && <BatchTab target={props.target} />}
        {tab === 'coach' && <CoachTab />}
        {tab === 'research' && <ResearchTab target={props.target} />}
        {tab === 'knowledge' && <KnowledgeTab />}
      </div>
    </div>
  );
}

/* ============================ 可视化对决 ============================ */

function VersusScreen(props: { level: LevelDef; strategies: [string, string]; seed: number; rules?: RuleSet | null }) {
  const refs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const [speed, setSpeed] = useState(2);
  const speedRef = useRef(2);
  speedRef.current = speed;
  const [, setV] = useState(0);
  const sim = useRef<{ worlds: World[]; agents: AIAgent[] } | null>(null);
  useEffect(() => {
    const worlds: World[] = [];
    const agents: AIAgent[] = [];
    const renderers: Renderer[] = [];
    props.strategies.forEach((sid, i) => {
      const ai = { strategy: sid, skills: ['lumen_rain', 'time_warp'] };
      const w = new World(makeAIGameConfig(props.level, ai, props.seed, { rules: props.rules ?? null }));
      worlds.push(w);
      agents.push(new AIAgent({ strategy: sid }));
      const r = new Renderer(refs[i].current!);
      r.settings = { particles: 'low', damageNumbers: false, showHp: true, screenShake: false, showGrid: false };
      r.showAiOverlay = true;
      renderers.push(r);
    });
    sim.current = { worlds, agents };
    let last = performance.now();
    let acc = 0;
    let raf = 0;
    let ui = 0;
    const loop = (ts: number) => {
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      acc += dt * speedRef.current;
      let steps = 0;
      while (acc >= DT && steps < 64) {
        for (let i = 0; i < 2; i++) {
          if (worlds[i].finished) continue;
          agents[i].update(worlds[i]);
          worlds[i].step();
        }
        acc -= DT;
        steps++;
      }
      for (let i = 0; i < 2; i++) {
        renderers[i].aiTrace = agents[i].lastTrace;
        renderers[i].consume(worlds[i], worlds[i].drainFx());
        renderers[i].render(worlds[i], 0, dt);
      }
      if (ts - ui > 200) {
        ui = ts;
        setV((v) => v + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const s = sim.current;
  return (
    <div class="screen">
      <TopBar title={`可视化对决 · ${props.level.name}`} onBack={() => back()}>
        <span class="muted">相同种子 {props.seed}</span>
        {[1, 2, 4, 8, 16].map((x) => (
          <Btn small active={speed === x} onClick={() => setSpeed(x)}>{x}×</Btn>
        ))}
      </TopBar>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 8, minHeight: 0 }}>
        {props.strategies.map((sid, i) => {
          const w = s?.worlds[i];
          const name = getStrategy(sid).name;
          return (
            <div class="col" style={{ minHeight: 0 }}>
              <div class="row" style={{ justifyContent: 'space-between' }}>
                <b style={{ color: SERIES[i] }}>{name}</b>
                {w && (
                  <span class="muted" style={{ fontSize: 12 }}>
                    {w.finished ? (w.status === 'won' ? '✔ 胜利' : '✘ 失败') : '进行中'} · {Math.round(w.time)}s · 波次 {w.waveIndex} · 消耗 {w.stats.lumenSpent} · 操作 {w.stats.ops} · 光能 {Math.round(w.lumen)}
                  </span>
                )}
              </div>
              <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <canvas ref={refs[i]} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
              </div>
              {w && s && <div class="muted" style={{ fontSize: 12 }}>AI：{s.agents[i].lastTrace?.goal ?? ''}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

SCREENS.ai = (r: Route) => <AiLabScreen tab={(r as { tab?: string }).tab} target={(r as { target?: string }).target} />;
SCREENS.versus = (r: Route) => {
  const v = r as Extract<Route, { name: 'versus' }>;
  return <VersusScreen level={v.level} strategies={v.strategies} seed={v.seed} rules={v.rules} />;
};
