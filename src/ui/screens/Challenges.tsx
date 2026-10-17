import { useState } from 'preact/hooks';
import type { AttackKind, RuleConstraints, RuleSet, ScoringMetric, UnitCategory, WeatherId } from '../../core/types';
import { CONTENT } from '../../core/content/registry';
import { LEVELS } from '../../core/content/levels';
import { BUILTIN_CHALLENGES } from '../../core/content/challenges';
import { SKILLS, ITEMS } from '../../core/content/abilities';
import { WEATHER } from '../../core/content/environment';
import { RuleEngine, compileRuleScript, categoryName, attackName } from '../../core/rules/ruleEngine';
import type { BatchStats } from '../../ai/runner';
import { navigate, back } from '../../app/nav';
import { store, useStore, type LeaderEntry } from '../../app/store';
import { parallelBatch } from '../../app/workers';
import { exportFile, importFile } from '../../platform/storage';
import { Btn, CardTile, Modal, NumberField, Progress, Select, Toggle, TopBar, fmtDate, toast } from '../components/ui';
import { SCREENS } from './registry';

const METRIC_NAMES: Record<ScoringMetric, string> = {
  clear: '通关即可',
  'min-spend': '最低资源消耗',
  'min-ops': '最少操作次数',
  fastest: '最快通关',
  'min-units': '最少同时单位',
  'max-lumen': '最多剩余光能',
};

const CATEGORIES: UnitCategory[] = ['producer', 'shooter', 'lobber', 'wall', 'trap', 'bomb', 'melee', 'support', 'aquatic', 'utility'];
const ATTACKS: AttackKind[] = ['projectile', 'lob', 'chain', 'melee', 'instant', 'aura', 'none'];

const SCRIPT_TEMPLATE = `// 规则脚本：返回一个包含钩子函数的对象。
// onCommand(cmd, s)：每条指令执行前调用，返回 true 允许，返回字符串表示拒绝原因。
// onTick(s)：每 0.5 秒调用，返回 { fail: '原因' } 判负，或 { win: true } 判胜。
// onDeck(deck)：开局校验卡组。
// s 提供：time, wave, lumen, spent, ops, placements, enemiesAlive, weather,
//        units(), enemies(), unitsInRow(row), unitsInCol(col), countUnit(id)
return {
  describe: '每行最多 4 个单位，且 300 秒后光能不得超过 800',
  onCommand(cmd, s) {
    if (cmd.type === 'place' && s.unitsInRow(cmd.row) >= 4) return '第 ' + (cmd.row + 1) + ' 行已满 4 个单位';
    return true;
  },
  onTick(s) {
    if (s.time > 300 && s.lumen > 800) return { fail: '囤积光能超过 800' };
  },
};`;

export function sortLeaders(entries: LeaderEntry[], metric: ScoringMetric): LeaderEntry[] {
  const wins = entries.filter((e) => e.won && e.verified);
  const key = (e: LeaderEntry) => (metric === 'min-spend' ? e.spent : metric === 'min-ops' ? e.ops : metric === 'min-units' ? e.units : e.time);
  return wins.sort((a, b) => key(a) - key(b));
}

function Leaderboard(props: { board: string; metric: ScoringMetric; onClose: () => void }) {
  const data = useStore();
  const list = sortLeaders(data.leaderboard.filter((e) => e.board === props.board), props.metric).slice(0, 20);
  return (
    <Modal title={`排行榜 · ${METRIC_NAMES[props.metric]}`} onClose={props.onClose} width={720}>
      <table class="table">
        <thead><tr><th>#</th><th>玩家/策略</th><th>用时</th><th>消耗</th><th>操作</th><th>峰值单位</th><th>日期</th></tr></thead>
        <tbody>
          {list.map((e, i) => (
            <tr>
              <td>{i + 1}</td>
              <td>{e.who}</td>
              <td>{e.time}s</td>
              <td>{e.spent}</td>
              <td>{e.ops}</td>
              <td>{e.units}</td>
              <td class="dim">{fmtDate(e.date)}</td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={7} class="muted">还没有有效的通关记录（使用修改器的对局不计入）</td></tr>}
        </tbody>
      </table>
      <div class="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <Btn onClick={props.onClose}>关闭</Btn>
      </div>
    </Modal>
  );
}

/** 用 AI 批量运行挑战，检验规则是否可完成、AI 是否严格遵守 */
function VerifyModal(props: { rule: RuleSet; onClose: () => void }) {
  const [prog, setProg] = useState({ d: 0, t: 0, label: '' });
  const [rows, setRows] = useState<{ name: string; stats: BatchStats }[]>([]);
  const [running, setRunning] = useState(false);
  const run = async () => {
    const lv = CONTENT.level(props.rule.level ?? '1-6');
    if (!lv) return toast('挑战关卡不存在', 'bad');
    setRunning(true);
    const out: { name: string; stats: BatchStats }[] = [];
    for (const sid of ['balanced', 'defense', 'frugal']) {
      const job = parallelBatch({ level: lv, ai: { strategy: sid, skills: ['lumen_rain', 'time_warp'] }, runs: 8, seedBase: 77, rules: props.rule, mode: 'challenge' }, (d, t) => setProg({ d, t, label: sid }));
      const stats = await job.promise;
      out.push({ name: { balanced: '均衡', defense: '防御优先', frugal: '节俭' }[sid] as string, stats });
      setRows([...out]);
    }
    setRunning(false);
  };
  const totalViol = rows.reduce((a, r) => a + r.stats.summaries.filter((s) => s.ruleViolation).length, 0);
  const totalRej = rows.reduce((a, r) => a + r.stats.summaries.reduce((b, s) => b + s.rejectedRule, 0), 0);
  const cheat = rows.some((r) => r.stats.summaries.some((s) => s.cheatsUsed));
  return (
    <Modal title={`AI 验证：${props.rule.name}`} onClose={props.onClose} width={760}>
      <div class="muted" style={{ fontSize: 12 }}>使用 3 种策略各 8 局（相同种子）运行挑战。AI 的每条指令都经过规则引擎校验；挑战中修改器被强制禁用。</div>
      <div class="row" style={{ margin: '10px 0' }}>
        <Btn kind="primary" disabled={running} onClick={run}>开始验证</Btn>
        {running && <span class="muted">{prog.label} {prog.d}/{prog.t}</span>}
      </div>
      {running && <Progress value={prog.d} max={prog.t} />}
      {rows.length > 0 && (
        <>
          <table class="table">
            <thead><tr><th>策略</th><th>胜率</th><th>平均用时</th><th>平均消耗</th><th>平均操作</th><th>主要失败原因</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td>{r.name}</td>
                  <td>{(r.stats.winRate * 100).toFixed(0)}%</td>
                  <td>{r.stats.avgTime.toFixed(0)}s</td>
                  <td>{r.stats.avgSpent.toFixed(0)}</td>
                  <td>{r.stats.avgOps.toFixed(0)}</td>
                  <td class="muted" style={{ fontSize: 12 }}>{Object.entries(r.stats.failReasons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <div class={rows.some((r) => r.stats.wins > 0) ? 'good' : 'bad'}>{rows.some((r) => r.stats.wins > 0) ? '✔ 挑战可以完成（AI 至少赢下一局）' : '✘ AI 未能完成，挑战可能过难或规则互相冲突'}</div>
            <div class="muted">规则引擎拦截 AI 的违规尝试 {totalRej} 次（被拒绝的指令不会执行）；因违反规则判负 {totalViol} 局；修改器使用：{cheat ? '有（异常）' : '无'}</div>
          </div>
        </>
      )}
    </Modal>
  );
}

function ChallengesScreen() {
  const data = useStore();
  const [lb, setLb] = useState<RuleSet | null>(null);
  const [verify, setVerify] = useState<RuleSet | null>(null);
  const all = [...BUILTIN_CHALLENGES, ...data.customRules];
  const p = store.profile;
  return (
    <div class="screen">
      <TopBar title="挑战模式" onBack={() => back()}>
        <Btn onClick={async () => {
          const f = await importFile('.json');
          if (!f) return;
          try {
            const r = JSON.parse(f.content) as RuleSet & { format?: string };
            if (!r.constraints || !r.name) throw new Error('不是挑战规则文件');
            if (r.script && !confirm('该挑战包含脚本规则。脚本会在本机运行，请确认来源可信。继续导入？')) return;
            const v = RuleEngine.validateRuleSet(r);
            if (v.errors.length) throw new Error(v.errors[0]);
            store.update(['customRules'], (d) => d.customRules.push({ ...r, id: `cr_${Date.now()}`, builtin: false }));
            toast(`已导入挑战：${r.name}`, 'good');
          } catch (e) {
            toast(`导入失败：${(e as Error).message}`, 'bad');
          }
        }}>导入挑战</Btn>
        <Btn kind="primary" onClick={() => navigate({ name: 'ruleEditor' })}>＋ 新建挑战</Btn>
      </TopBar>
      <div class="content grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', alignContent: 'start' }}>
        {all.map((r) => {
          const eng = new RuleEngine(r);
          const lv = CONTENT.level(r.level ?? '1-6');
          const done = p.challengeWins.includes(r.id);
          const best = sortLeaders(data.leaderboard.filter((e) => e.board === r.id), r.scoring ?? 'clear')[0];
          return (
            <div class="panel">
              <div class="row" style={{ justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0 }}>{r.name}</h3>
                <div class="row" style={{ gap: 4 }}>
                  {r.builtin ? <span class="tag">内置</span> : <span class="tag gold">自定义</span>}
                  {r.script && <span class="tag">脚本</span>}
                  {done && <span class="tag good">已完成</span>}
                </div>
              </div>
              <div class="muted" style={{ margin: '6px 0' }}>{r.desc}</div>
              <div class="dim" style={{ fontSize: 12 }}>关卡：{lv ? `${lv.id} ${lv.name}` : '未知'} · 评分：{METRIC_NAMES[r.scoring ?? 'clear']}</div>
              <div style={{ fontSize: 12, margin: '6px 0' }}>
                {eng.describe().map((d) => (
                  <div>· {d}</div>
                ))}
              </div>
              {best && <div class="gold-text" style={{ fontSize: 12 }}>最佳：{best.who} · {best.time}s · 消耗 {best.spent} · 操作 {best.ops}</div>}
              <div class="row" style={{ marginTop: 8, gap: 6 }}>
                <Btn small kind="primary" disabled={!lv} onClick={() => navigate({ name: 'deck', setup: { mode: 'challenge', level: lv!, rules: r, challengeId: r.id } })}>挑战</Btn>
                <Btn small disabled={!lv} onClick={() => navigate({ name: 'deck', setup: { mode: 'challenge', level: lv!, rules: r, challengeId: r.id, control: 'ai' } })}>🤖 AI 挑战</Btn>
                <Btn small onClick={() => setVerify(r)}>验证</Btn>
                <Btn small onClick={() => setLb(r)}>排行榜</Btn>
                <Btn small onClick={() => navigate({ name: 'ai', tab: 'research', target: `rule:${r.id}` })} title="用阵容研究寻找最低消耗/最少操作等最优通关方案">🧬 寻找最优解</Btn>
                <Btn small onClick={() => navigate({ name: 'ruleEditor', rule: r.builtin ? { ...JSON.parse(JSON.stringify(r)), id: `cr_${Date.now()}`, name: `${r.name}（副本）`, builtin: false } : r })}>{r.builtin ? '复制' : '编辑'}</Btn>
                <Btn small onClick={() => void exportFile(`挑战-${r.name}.json`, JSON.stringify({ ...r, format: 'prism-wardens-rules' }, null, 2))}>导出</Btn>
                {!r.builtin && <Btn small kind="danger" onClick={() => confirm(`删除挑战「${r.name}」？`) && store.update(['customRules'], (d) => (d.customRules = d.customRules.filter((x) => x.id !== r.id)))}>删除</Btn>}
              </div>
            </div>
          );
        })}
      </div>
      {lb && <Leaderboard board={lb.id} metric={lb.scoring ?? 'clear'} onClose={() => setLb(null)} />}
      {verify && <VerifyModal rule={verify} onClose={() => setVerify(null)} />}
    </div>
  );
}

/* ============================ 规则编辑器 ============================ */

function CardMultiPicker(props: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div class="row" style={{ gap: 4 }}>
      {CONTENT.allUnits().map((d) => (
        <CardTile small def={d} showName selected={props.value.includes(d.id)} onClick={() => props.onChange(props.value.includes(d.id) ? props.value.filter((x) => x !== d.id) : [...props.value, d.id])} />
      ))}
    </div>
  );
}

function Chips<T extends string>(props: { all: T[]; value: T[]; label: (t: T) => string; onChange: (v: T[]) => void }) {
  return (
    <div class="row" style={{ gap: 4 }}>
      {props.all.map((t) => (
        <Btn small active={props.value.includes(t)} onClick={() => props.onChange(props.value.includes(t) ? props.value.filter((x) => x !== t) : [...props.value, t])}>
          {props.label(t)}
        </Btn>
      ))}
    </div>
  );
}

function RuleEditorScreen(props: { rule?: RuleSet }) {
  const [r, setR] = useState<RuleSet>(() =>
    props.rule ? JSON.parse(JSON.stringify(props.rule)) : { id: `cr_${Date.now()}`, name: '我的挑战', desc: '自定义规则挑战', level: '1-4', constraints: {}, scoring: 'clear' },
  );
  const [verify, setVerify] = useState(false);
  const c = r.constraints;
  const setC = (patch: Partial<RuleConstraints>) => {
    const next = { ...c, ...patch };
    for (const k of Object.keys(next) as (keyof RuleConstraints)[]) {
      const v = next[k];
      if (v === undefined || v === false || (Array.isArray(v) && v.length === 0)) delete next[k];
    }
    setR({ ...r, constraints: next });
  };
  const lv = CONTENT.level(r.level ?? '1-6');
  const map = lv ? CONTENT.resolveMap(lv.map) : null;
  const check = RuleEngine.validateRuleSet(r);
  const save = () => {
    if (check.errors.length) return toast(check.errors[0], 'bad');
    store.update(['customRules', 'profiles'], (d) => {
      const i = d.customRules.findIndex((x) => x.id === r.id);
      const item = { ...r, builtin: false, created: r.created ?? Date.now(), author: store.profile.name };
      if (i >= 0) d.customRules[i] = item;
      else {
        d.customRules.push(item);
        store.profile.stats.challengesMade++;
      }
    });
    toast('挑战已保存', 'good');
  };
  return (
    <div class="screen">
      <TopBar title="挑战规则编辑器" onBack={() => back()}>
        <Btn onClick={async () => {
          const f = await importFile('.json');
          if (!f) return;
          try {
            const o = JSON.parse(f.content);
            if (!o.constraints) throw new Error('不是挑战规则文件');
            setR({ ...o, id: r.id });
            toast('已载入', 'good');
          } catch (e) {
            toast((e as Error).message, 'bad');
          }
        }}>导入</Btn>
        <Btn onClick={() => void exportFile(`挑战-${r.name}.json`, JSON.stringify({ ...r, format: 'prism-wardens-rules' }, null, 2))}>导出</Btn>
        <Btn onClick={() => setVerify(true)} disabled={check.errors.length > 0}>🤖 AI 验证</Btn>
        <Btn onClick={() => lv && navigate({ name: 'deck', setup: { mode: 'challenge', level: lv, rules: r, challengeId: r.id, testMode: true } })} disabled={!lv || check.errors.length > 0}>试玩</Btn>
        <Btn kind="primary" onClick={save}>保存</Btn>
      </TopBar>
      <div class="content" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 14 }}>
        <div class="col" style={{ gap: 14 }}>
          <div class="panel">
            <h3>基本信息</h3>
            <div class="field"><span class="label">名称</span><input type="text" value={r.name} onInput={(e) => setR({ ...r, name: (e.target as HTMLInputElement).value })} /></div>
            <div class="field"><span class="label">描述</span><input type="text" style={{ flex: 1 }} value={r.desc} onInput={(e) => setR({ ...r, desc: (e.target as HTMLInputElement).value })} /></div>
            <Select label="关卡" value={r.level ?? '1-6'} options={[...LEVELS, ...(store.data.customPack.levels ?? [])].map((l) => ({ value: l.id, label: `${l.id} ${l.name}` }))} onChange={(v) => setR({ ...r, level: v })} />
            <Select label="评分方式（排行榜）" value={r.scoring ?? 'clear'} options={(Object.keys(METRIC_NAMES) as ScoringMetric[]).map((k) => ({ value: k, label: METRIC_NAMES[k] }))} onChange={(v) => setR({ ...r, scoring: v })} />
          </div>
          <div class="panel">
            <h3>卡牌与单位类型</h3>
            <h4>只允许使用这些卡牌（不选 = 不限制）</h4>
            <CardMultiPicker value={c.allowedCards ?? []} onChange={(v) => setC({ allowedCards: v })} />
            <h4>只允许这些类型</h4>
            <Chips all={CATEGORIES} value={c.allowedCategories ?? []} label={categoryName} onChange={(v) => setC({ allowedCategories: v })} />
            <h4>只允许这些攻击方式</h4>
            <Chips all={ATTACKS} value={c.allowedAttackKinds ?? []} label={attackName} onChange={(v) => setC({ allowedAttackKinds: v })} />
            <h4>禁用卡牌</h4>
            <CardMultiPicker value={c.bannedCards ?? []} onChange={(v) => setC({ bannedCards: v })} />
            <h4>禁用类型</h4>
            <Chips all={CATEGORIES} value={c.bannedCategories ?? []} label={categoryName} onChange={(v) => setC({ bannedCategories: v })} />
            <h4>禁用技能 / 道具</h4>
            <Chips all={SKILLS.map((s) => s.id)} value={c.bannedSkills ?? []} label={(id) => SKILLS.find((s) => s.id === id)!.name} onChange={(v) => setC({ bannedSkills: v })} />
            <div style={{ height: 6 }} />
            <Chips all={ITEMS.map((s) => s.id)} value={c.bannedItems ?? []} label={(id) => ITEMS.find((s) => s.id === id)!.name} onChange={(v) => setC({ bannedItems: v })} />
            <div class="row" style={{ marginTop: 8 }}>
              <Toggle label="禁止使用任何技能" value={!!c.noSkills} onChange={(v) => setC({ noSkills: v })} />
              <Toggle label="禁止使用任何道具" value={!!c.noItems} onChange={(v) => setC({ noItems: v })} />
            </div>
          </div>
          <div class="panel">
            <h3>数量、资源与操作限制</h3>
            <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 0 }}>
              <NumberField label="卡组上限" value={c.maxDeckSize} allowEmpty placeholder="不限" min={1} max={10} onChange={(v) => setC({ maxDeckSize: v })} />
              <NumberField label="总光能消耗上限" value={c.maxTotalSpend} allowEmpty placeholder="不限" min={0} step={50} onChange={(v) => setC({ maxTotalSpend: v })} />
              <NumberField label="场上单位上限" value={c.maxUnitsAlive} allowEmpty placeholder="不限" min={1} onChange={(v) => setC({ maxUnitsAlive: v })} />
              <NumberField label="总部署次数上限" value={c.maxPlacements} allowEmpty placeholder="不限" min={1} onChange={(v) => setC({ maxPlacements: v })} />
              <NumberField label="操作次数上限" value={c.maxOperations} allowEmpty placeholder="不限" min={1} onChange={(v) => setC({ maxOperations: v })} />
              <NumberField label="初始光能" value={c.startLumen} allowEmpty placeholder="关卡默认" min={0} step={25} onChange={(v) => setC({ startLumen: v })} />
              <NumberField label="冷却倍率" value={c.cooldownMul} allowEmpty placeholder="1" min={0.1} step={0.1} onChange={(v) => setC({ cooldownMul: v })} />
              <NumberField label="费用倍率" value={c.costMul} allowEmpty placeholder="1" min={0} step={0.1} onChange={(v) => setC({ costMul: v })} />
              <NumberField label="最多损失单位" value={c.maxUnitLosses} allowEmpty placeholder="不限" min={0} onChange={(v) => setC({ maxUnitLosses: v })} />
            </div>
            <div class="row">
              <Toggle label="收集光能也计入操作次数" value={!!c.countCollectAsOp} onChange={(v) => setC({ countCollectAsOp: v })} />
              <Toggle label="没有天降光能" value={!!c.noSkyDrops} onChange={(v) => setC({ noSkyDrops: v })} />
              <Toggle label="禁止强化" value={!!c.noUpgrades} onChange={(v) => setC({ noUpgrades: v })} />
              <Toggle label="禁止移除单位" value={!!c.noRemove} onChange={(v) => setC({ noRemove: v })} />
            </div>
            <NumberField label="最高星级" value={c.maxRank} allowEmpty placeholder="3" min={1} max={3} onChange={(v) => setC({ maxRank: v })} />
            <h4>单卡部署次数上限</h4>
            <div class="row">
              {Object.entries(c.maxPerCard ?? {}).map(([id, n]) => (
                <span class="tag">
                  {CONTENT.units.get(id)?.name ?? id} ≤ {n}{' '}
                  <a style={{ cursor: 'pointer' }} onClick={() => { const m = { ...(c.maxPerCard ?? {}) }; delete m[id]; setC({ maxPerCard: Object.keys(m).length ? m : undefined }); }}>✕</a>
                </span>
              ))}
              <Select value="" options={[{ value: '', label: '＋ 添加单卡上限…' }, ...CONTENT.allUnits().map((u) => ({ value: u.id, label: u.name }))]} onChange={(id) => id && setC({ maxPerCard: { ...(c.maxPerCard ?? {}), [id]: 3 } })} />
              {Object.keys(c.maxPerCard ?? {}).map((id) => (
                <NumberField label={CONTENT.units.get(id)?.name ?? id} value={c.maxPerCard![id]} min={0} onChange={(v) => setC({ maxPerCard: { ...c.maxPerCard!, [id]: v ?? 0 } })} />
              ))}
            </div>
          </div>
          <div class="panel">
            <h3>部署区域与时间</h3>
            <div class="row">
              <Toggle label="限制部署列" value={!!c.placementCols} onChange={(v) => setC({ placementCols: v ? [0, 4] : undefined })} />
              {c.placementCols && (
                <>
                  <Select value={c.placementCols[0]} options={Array.from({ length: map?.cols ?? 9 }, (_, i) => ({ value: i, label: `第${i + 1}列` }))} onChange={(v) => setC({ placementCols: [v, Math.max(v, c.placementCols![1])] })} />
                  至
                  <Select value={c.placementCols[1]} options={Array.from({ length: map?.cols ?? 9 }, (_, i) => ({ value: i, label: `第${i + 1}列` }))} onChange={(v) => setC({ placementCols: [Math.min(v, c.placementCols![0]), v] })} />
                </>
              )}
            </div>
            <h4>只能部署在这些行（不选 = 不限）</h4>
            <Chips all={Array.from({ length: map?.rows ?? 5 }, (_, i) => String(i))} value={(c.placementRows ?? []).map(String)} label={(x) => `第${Number(x) + 1}行`} onChange={(v) => setC({ placementRows: v.map(Number) })} />
            <h4>允许部署的时间段（秒）</h4>
            {(c.placementWindows ?? []).map((w, i) => (
              <div class="row">
                <NumberField label={`时段 ${i + 1} 开始`} value={w.from} min={0} onChange={(v) => { const ws = [...c.placementWindows!]; ws[i] = { ...w, from: v ?? 0 }; setC({ placementWindows: ws }); }} />
                <NumberField label="结束" value={w.to} min={0} onChange={(v) => { const ws = [...c.placementWindows!]; ws[i] = { ...w, to: v ?? 0 }; setC({ placementWindows: ws }); }} />
                <Btn small kind="danger" onClick={() => setC({ placementWindows: c.placementWindows!.filter((_, j) => j !== i) })}>删除</Btn>
              </div>
            ))}
            <div class="row">
              <Btn small onClick={() => setC({ placementWindows: [...(c.placementWindows ?? []), { from: 0, to: 90 }] })}>＋ 添加时间段</Btn>
              <Toggle label="只能在场上没有敌人时部署" value={!!c.placeOnlyBetweenWaves} onChange={(v) => setC({ placeOnlyBetweenWaves: v })} />
            </div>
          </div>
          <div class="panel">
            <h3>目标与环境</h3>
            <NumberField label="限时通关（秒）" value={c.timeLimit} allowEmpty placeholder="不限" min={30} step={10} onChange={(v) => setC({ timeLimit: v })} />
            <Toggle label="没有符文哨卫（任何突破即失败）" value={!!c.noSentinels} onChange={(v) => setC({ noSentinels: v })} />
            <Select
              label="天气覆盖"
              value={c.weather?.mode === 'fixed' ? c.weather.id : ''}
              options={[{ value: '', label: '关卡默认' }, ...Object.values(WEATHER).map((w) => ({ value: w.id, label: `固定：${w.name}` }))]}
              onChange={(v) => setC({ weather: v ? { mode: 'fixed', id: v as WeatherId } : undefined })}
            />
            <h4>保护圣物（点击格子放置/移除，圣物被摧毁即失败）</h4>
            {map && (
              <div class="mini-grid" style={{ gridTemplateColumns: `repeat(${map.cols}, 30px)` }}>
                {Array.from({ length: map.rows * map.cols }, (_, i) => {
                  const row = Math.floor(i / map.cols);
                  const col = i % map.cols;
                  const has = c.protect?.find((p) => p.row === row && p.col === col);
                  const t = map.terrain[row]?.[col] ?? 'g';
                  return (
                    <div
                      class="mini-cell"
                      style={{ background: t === 'w' ? '#3a8fc2' : t === 'r' ? '#7d7468' : '#5fae5a' }}
                      onClick={() => setC({ protect: has ? c.protect!.filter((p) => p !== has) : [...(c.protect ?? []), { row, col, hp: 1500 }] })}
                    >
                      {has ? '💎' : ''}
                    </div>
                  );
                })}
              </div>
            )}
            {(c.protect ?? []).map((p, i) => (
              <NumberField label={`圣物 (${p.row + 1},${p.col + 1}) 生命`} value={p.hp} min={100} step={100} onChange={(v) => { const ps = [...c.protect!]; ps[i] = { ...p, hp: v ?? 1500 }; setC({ protect: ps }); }} />
            ))}
          </div>
          <div class="panel">
            <h3>脚本规则（高级）</h3>
            <div class="muted" style={{ fontSize: 12, marginBottom: 6 }}>用 JavaScript 编写更复杂的规则。脚本在受限作用域中执行（屏蔽 window/document/fetch 等），但请只运行可信来源的脚本。</div>
            <div class="row" style={{ marginBottom: 6 }}>
              <Toggle label="启用脚本" value={!!r.script} onChange={(v) => setR({ ...r, script: v ? r.script || SCRIPT_TEMPLATE : undefined })} />
              {r.script && <Btn small onClick={() => {
                const res = compileRuleScript(r.script!);
                toast(res.error ?? `脚本编译通过${res.hooks?.describe ? `：${res.hooks.describe}` : ''}`, res.error ? 'bad' : 'good');
              }}>检查脚本</Btn>}
            </div>
            {r.script !== undefined && <textarea rows={14} value={r.script} onInput={(e) => setR({ ...r, script: (e.target as HTMLTextAreaElement).value })} />}
          </div>
        </div>
        <div class="col" style={{ gap: 14 }}>
          <div class="panel" style={{ position: 'sticky', top: 0 }}>
            <h3>规则预览</h3>
            {new RuleEngine(r).describe().map((d) => (
              <div>· {d}</div>
            ))}
            <h4>自动校验</h4>
            {check.errors.map((e) => (
              <div class="bad">✘ {e}</div>
            ))}
            {check.warnings.map((e) => (
              <div class="gold-text">⚠ {e}</div>
            ))}
            {!check.errors.length && !check.warnings.length && <div class="good">✔ 规则自洽</div>}
            <div class="dim" style={{ fontSize: 12, marginTop: 8 }}>点击「AI 验证」可用多种 AI 策略实际运行挑战，检查是否可完成以及 AI 是否严格遵守规则。</div>
          </div>
        </div>
      </div>
      {verify && <VerifyModal rule={r} onClose={() => setVerify(false)} />}
    </div>
  );
}

SCREENS.challenges = () => <ChallengesScreen />;
SCREENS.ruleEditor = (r) => <RuleEditorScreen rule={(r as { rule?: RuleSet }).rule} />;
