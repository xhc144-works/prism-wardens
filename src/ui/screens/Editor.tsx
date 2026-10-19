import { useMemo, useState } from 'preact/hooks';
import type { LevelDef, MapDef, Objective, TerrainCode, Theme, WaveDef, WaveGen, WeatherId, WeatherPlan } from '../../core/types';
import { CONTENT } from '../../core/content/registry';
import { LEVELS } from '../../core/content/levels';
import { MAPS, makeBlankMap } from '../../core/content/maps';
import { TERRAIN, WEATHER, EVENTS } from '../../core/content/environment';
import { generateWave } from '../../core/sim/waveSystem';
import { Rng } from '../../core/rng';
import type { BatchStats } from '../../ai/runner';
import { navigate, back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { parallelBatch } from '../../app/workers';
import { exportFile, importFile } from '../../platform/storage';
import { unitIcon } from '../../render/icons';
import { Btn, NumberField, Progress, Select, Tabs, Toggle, TopBar, toast } from '../components/ui';
import { BarChart, SERIES } from '../components/charts';
import { SCREENS } from './registry';

type Brush = { kind: 'terrain'; code: TerrainCode } | { kind: 'arrow'; dir: -1 | 1 } | { kind: 'node' } | { kind: 'tomb' } | { kind: 'unit'; unit: string } | { kind: 'erase' };

const THEMES: { value: Theme; label: string }[] = [
  { value: 'day', label: '白昼' },
  { value: 'night', label: '月夜' },
  { value: 'lake', label: '湖畔' },
  { value: 'fog', label: '迷雾' },
  { value: 'sky', label: '天空' },
];

function cloneMap(m: MapDef, id: string): MapDef {
  return { ...JSON.parse(JSON.stringify(m)), id, custom: true, arrows: m.arrows ?? [], nodes: m.nodes ?? [], tombs: m.tombs ?? [], preplaced: m.preplaced ?? [] };
}

export function newCustomLevel(base?: LevelDef): LevelDef {
  const id = `custom_${Date.now().toString(36)}`;
  if (base) {
    const map = cloneMap(CONTENT.resolveMap(base.map), `${id}_map`);
    return { ...JSON.parse(JSON.stringify(base)), id, name: `${base.name}（自定义）`, map, chapter: undefined, index: undefined, rewards: undefined, custom: true };
  }
  return {
    id,
    name: '新关卡',
    desc: '我的自定义关卡',
    map: makeBlankMap(`${id}_map`),
    time: 'day',
    startLumen: 100,
    gen: { count: 10, flagEvery: 5, base: 2, growth: 1, pool: ['husk', 'shard_husk', 'leaper'], flagMul: 1.8 },
    enemyPool: ['husk', 'shard_husk', 'leaper'],
    custom: true,
  };
}

function terrainColor(code: string): string {
  return TERRAIN[code as TerrainCode]?.color ?? '#5fae5a';
}

function MapTab(props: { level: LevelDef; setLevel: (l: LevelDef) => void }) {
  const L = props.level;
  const map = L.map as MapDef;
  const [brush, setBrush] = useState<Brush>({ kind: 'terrain', code: 'w' });
  const [unit, setUnit] = useState('stone_warden');
  const [painting, setPainting] = useState(false);
  const setMap = (m: MapDef) => props.setLevel({ ...L, map: m });
  const resize = (rows: number, cols: number) => {
    rows = Math.max(3, Math.min(7, rows));
    cols = Math.max(6, Math.min(12, cols));
    const terrain = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => map.terrain[r]?.[c] ?? 'g').join(''));
    const inb = (p: { row: number; col: number }) => p.row < rows && p.col < cols;
    setMap({ ...map, rows, cols, terrain, arrows: (map.arrows ?? []).filter(inb), nodes: (map.nodes ?? []).filter(inb), tombs: (map.tombs ?? []).filter(inb), preplaced: (map.preplaced ?? []).filter(inb), spawnRows: map.spawnRows?.filter((r) => r < rows) });
  };
  const apply = (row: number, col: number) => {
    const m: MapDef = { ...map, arrows: [...(map.arrows ?? [])], nodes: [...(map.nodes ?? [])], tombs: [...(map.tombs ?? [])], preplaced: [...(map.preplaced ?? [])], terrain: [...map.terrain] };
    const at = <T extends { row: number; col: number }>(arr: T[]) => arr.filter((p) => !(p.row === row && p.col === col));
    switch (brush.kind) {
      case 'terrain': {
        const line = m.terrain[row].split('');
        line[col] = brush.code;
        m.terrain[row] = line.join('');
        break;
      }
      case 'arrow':
        m.arrows = [...at(m.arrows!), { row, col, dir: brush.dir }];
        break;
      case 'node':
        m.nodes = [...at(m.nodes!), { row, col }];
        break;
      case 'tomb':
        m.tombs = [...at(m.tombs!), { row, col }];
        break;
      case 'unit':
        m.preplaced = [...at(m.preplaced!), { row, col, unit }];
        break;
      case 'erase':
        m.arrows = at(m.arrows!);
        m.nodes = at(m.nodes!);
        m.tombs = at(m.tombs!);
        m.preplaced = at(m.preplaced!);
        break;
    }
    setMap(m);
  };
  const B = (b: Brush, label: string, color?: string) => {
    const active = JSON.stringify(b) === JSON.stringify(brush);
    return (
      <Btn small active={active} onClick={() => setBrush(b)} style={color ? { borderLeft: `6px solid ${color}` } : undefined}>
        {label}
      </Btn>
    );
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 14 }}>
      <div class="panel" onMouseUp={() => setPainting(false)} onMouseLeave={() => setPainting(false)}>
        <h3>地图：{map.name}（{map.rows}×{map.cols}）</h3>
        <div class="mini-grid" style={{ gridTemplateColumns: `repeat(${map.cols}, 52px)` }}>
          {Array.from({ length: map.rows * map.cols }, (_, i) => {
            const row = Math.floor(i / map.cols);
            const col = i % map.cols;
            const code = map.terrain[row]?.[col] ?? 'g';
            const arrow = map.arrows?.find((a) => a.row === row && a.col === col);
            const node = map.nodes?.some((a) => a.row === row && a.col === col);
            const tomb = map.tombs?.some((a) => a.row === row && a.col === col);
            const pre = map.preplaced?.find((a) => a.row === row && a.col === col);
            const preDef = pre ? CONTENT.units.get(pre.unit) : undefined;
            return (
              <div
                class="mini-cell"
                style={{ width: 52, height: 52, background: terrainColor(code), fontSize: 20 }}
                onMouseDown={() => {
                  setPainting(true);
                  apply(row, col);
                }}
                onMouseEnter={() => painting && apply(row, col)}
                title={`${TERRAIN[code as TerrainCode]?.name} (${row + 1},${col + 1})`}
              >
                {arrow ? (arrow.dir > 0 ? '⬇' : '⬆') : node ? '💠' : tomb ? '🪦' : preDef ? <img src={unitIcon(preDef, 48)} style={{ width: 46, height: 46 }} /> : ''}
              </div>
            );
          })}
        </div>
        <div class="row" style={{ marginTop: 8 }}>
          <span class="muted">出生行（敌人从哪些行出现，不选 = 全部）：</span>
          {Array.from({ length: map.rows }, (_, r) => (
            <Btn small active={map.spawnRows?.includes(r)} onClick={() => {
              const cur = map.spawnRows ?? [];
              const next = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r].sort();
              setMap({ ...map, spawnRows: next.length ? next : undefined });
            }}>第{r + 1}行</Btn>
          ))}
        </div>
      </div>
      <div class="col" style={{ gap: 12 }}>
        <div class="panel">
          <h3>地图属性</h3>
          <div class="field"><span class="label">地图名</span><input type="text" value={map.name} onInput={(e) => setMap({ ...map, name: (e.target as HTMLInputElement).value })} /></div>
          <NumberField label="行数（3-7）" value={map.rows} min={3} max={7} onChange={(v) => resize(v ?? 5, map.cols)} />
          <NumberField label="列数（6-12）" value={map.cols} min={6} max={12} onChange={(v) => resize(map.rows, v ?? 9)} />
          <Select label="场景主题" value={map.theme} options={THEMES} onChange={(v) => setMap({ ...map, theme: v })} />
          <Toggle label="启用符文哨卫" value={map.sentinels !== false} onChange={(v) => setMap({ ...map, sentinels: v })} />
          <Select label="从现有地图复制" value="" options={[{ value: '', label: '选择…' }, ...MAPS.map((m) => ({ value: m.id, label: m.name }))]} onChange={(id) => id && setMap(cloneMap(CONTENT.map(id), map.id))} />
        </div>
        <div class="panel">
          <h3>地形笔刷</h3>
          <div class="row" style={{ gap: 4 }}>
            {(Object.keys(TERRAIN) as TerrainCode[]).map((k) => B({ kind: 'terrain', code: k }, TERRAIN[k].name, TERRAIN[k].color))}
          </div>
          <h4>路线与资源</h4>
          <div class="row" style={{ gap: 4 }}>
            {B({ kind: 'arrow', dir: 1 }, '⬇ 向下转向')}
            {B({ kind: 'arrow', dir: -1 }, '⬆ 向上转向')}
            {B({ kind: 'node' }, '💠 光晶矿')}
            {B({ kind: 'tomb' }, '🪦 蚀晶碑')}
            {B({ kind: 'erase' }, '🧽 清除标记')}
          </div>
          <h4>预置单位</h4>
          <div class="row" style={{ gap: 4 }}>
            <Select value={unit} options={CONTENT.allUnits().filter((u) => !u.instant).map((u) => ({ value: u.id, label: u.name }))} onChange={(v) => { setUnit(v); setBrush({ kind: 'unit', unit: v }); }} />
            {B({ kind: 'unit', unit }, '放置')}
          </div>
          <div class="dim" style={{ fontSize: 12, marginTop: 6 }}>按住鼠标拖动可连续绘制。路线箭头会让敌人经过该格时转入相邻行；光晶矿每 15 秒产出光能；蚀晶碑会在波次中冒出敌人。</div>
        </div>
      </div>
    </div>
  );
}

function wavePreview(L: LevelDef): WaveDef[] {
  if (L.waves?.length) return L.waves;
  if (!L.gen) return [];
  const rng = new Rng(12345);
  const map = L.map as MapDef;
  const water = map.terrain.some((row) => [...row].filter((c) => c === 'w').length > map.cols / 2);
  return Array.from({ length: Math.min(L.gen.count, 60) }, (_, i) => generateWave(i, L.gen!, rng, water, false));
}

function WavesTab(props: { level: LevelDef; setLevel: (l: LevelDef) => void }) {
  const L = props.level;
  const manual = !!L.waves?.length;
  const enemies = CONTENT.allEnemies().filter((e) => !e.noSpawn || e.boss);
  const gen: WaveGen = L.gen ?? { count: 10, flagEvery: 5, base: 2, growth: 1, pool: ['husk'], flagMul: 1.8 };
  const setGen = (g: Partial<WaveGen>) => {
    const ng = { ...gen, ...g };
    props.setLevel({ ...L, gen: ng, waves: undefined, enemyPool: [...new Set([...ng.pool, ...(ng.bossAtEnd ? [ng.bossAtEnd] : [])])] });
  };
  const preview = useMemo(() => wavePreview(L), [JSON.stringify(L.gen), JSON.stringify(L.waves), JSON.stringify((L.map as MapDef).terrain)]);
  const hpOf = (w: WaveDef) => w.spawns.reduce((a, s) => a + ((CONTENT.enemies.get(s.enemy)?.hp ?? 0) + (CONTENT.enemies.get(s.enemy)?.armor?.hp ?? 0)) * s.count, 0);
  const setWaves = (waves: WaveDef[]) => {
    const pool = [...new Set(waves.flatMap((w) => w.spawns.map((s) => s.enemy)))];
    props.setLevel({ ...L, waves, enemyPool: pool });
  };
  return (
    <div class="col" style={{ gap: 14 }}>
      <div class="panel">
        <div class="row">
          <Btn active={!manual} onClick={() => setGen(gen)}>自动生成波次</Btn>
          <Btn active={manual} onClick={() => setWaves(preview.length ? JSON.parse(JSON.stringify(preview)) : [{ spawns: [{ enemy: 'husk', count: 2 }] }])}>手动编辑每一波</Btn>
          <span class="muted" style={{ fontSize: 12 }}>切换到手动会把当前生成结果转换为可编辑的波次列表</span>
        </div>
      </div>
      {!manual && (
        <div class="panel">
          <h3>波次生成器</h3>
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 0 }}>
            <NumberField label="总波数" value={gen.count} min={1} max={60} onChange={(v) => setGen({ count: v ?? 10 })} />
            <NumberField label="每几波一面旗帜" value={gen.flagEvery} min={0} max={20} onChange={(v) => setGen({ flagEvery: v ?? 5 })} />
            <NumberField label="初始强度" value={gen.base} min={0.5} step={0.5} onChange={(v) => setGen({ base: v ?? 2 })} />
            <NumberField label="每波增长" value={gen.growth} min={0} step={0.1} onChange={(v) => setGen({ growth: v ?? 1 })} />
            <NumberField label="旗帜波倍率" value={gen.flagMul} min={1} step={0.1} onChange={(v) => setGen({ flagMul: v ?? 1.8 })} />
          </div>
          <Select label="最终首领" value={gen.bossAtEnd ?? ''} options={[{ value: '', label: '无' }, ...enemies.filter((e) => e.boss).map((e) => ({ value: e.id, label: e.name }))]} onChange={(v) => setGen({ bossAtEnd: v || undefined })} />
          <h4>敌人池</h4>
          <div class="row" style={{ gap: 4 }}>
            {enemies.filter((e) => !e.boss).map((e) => (
              <Btn small active={gen.pool.includes(e.id)} onClick={() => setGen({ pool: gen.pool.includes(e.id) ? gen.pool.filter((x) => x !== e.id) : [...gen.pool, e.id] })}>{e.name}</Btn>
            ))}
          </div>
        </div>
      )}
      {manual && (
        <div class="panel">
          <h3>波次列表（{L.waves!.length} 波）</h3>
          {L.waves!.map((w, i) => (
            <div class="panel" style={{ marginBottom: 8, background: 'rgba(0,0,0,0.15)' }}>
              <div class="row">
                <b>第 {i + 1} 波</b>
                <Toggle label="旗帜大波" value={!!w.flag} onChange={(v) => { const ws = [...L.waves!]; ws[i] = { ...w, flag: v }; setWaves(ws); }} />
                <Btn small onClick={() => { const ws = [...L.waves!]; ws.splice(i + 1, 0, JSON.parse(JSON.stringify(w))); setWaves(ws); }}>复制</Btn>
                <Btn small kind="danger" onClick={() => setWaves(L.waves!.filter((_, j) => j !== i))}>删除</Btn>
              </div>
              {w.spawns.map((s, j) => (
                <div class="row">
                  <Select value={s.enemy} options={enemies.map((e) => ({ value: e.id, label: e.name }))} onChange={(v) => { const ws = [...L.waves!]; const sp = [...w.spawns]; sp[j] = { ...s, enemy: v }; ws[i] = { ...w, spawns: sp }; setWaves(ws); }} />
                  <NumberField label="数量" value={s.count} min={1} max={50} onChange={(v) => { const ws = [...L.waves!]; const sp = [...w.spawns]; sp[j] = { ...s, count: v ?? 1 }; ws[i] = { ...w, spawns: sp }; setWaves(ws); }} />
                  <Select value={s.row ?? -1} options={[{ value: -1, label: '随机行' }, ...Array.from({ length: (L.map as MapDef).rows }, (_, r) => ({ value: r, label: `第${r + 1}行` }))]} onChange={(v) => { const ws = [...L.waves!]; const sp = [...w.spawns]; sp[j] = { ...s, row: v < 0 ? undefined : v }; ws[i] = { ...w, spawns: sp }; setWaves(ws); }} />
                  <NumberField label="延迟(秒)" value={s.delay ?? 0} min={0} step={0.5} onChange={(v) => { const ws = [...L.waves!]; const sp = [...w.spawns]; sp[j] = { ...s, delay: v || undefined }; ws[i] = { ...w, spawns: sp }; setWaves(ws); }} />
                  <Btn small kind="ghost" onClick={() => { const ws = [...L.waves!]; ws[i] = { ...w, spawns: w.spawns.filter((_, k) => k !== j) }; setWaves(ws); }}>✕</Btn>
                </div>
              ))}
              <Btn small onClick={() => { const ws = [...L.waves!]; ws[i] = { ...w, spawns: [...w.spawns, { enemy: 'husk', count: 1 }] }; setWaves(ws); }}>＋ 敌人</Btn>
            </div>
          ))}
          <Btn onClick={() => setWaves([...L.waves!, { spawns: [{ enemy: 'husk', count: 3 }] }])}>＋ 添加一波</Btn>
        </div>
      )}
      <div class="panel">
        <h3>波次强度预览（总生命值）</h3>
        <BarChart height={300} items={preview.map((w, i) => ({ label: `第${i + 1}波${w.flag ? ' ⚑' : ''}`, value: Math.round(hpOf(w)), color: w.flag ? SERIES[1] : SERIES[0], note: w.spawns.map((s) => `${CONTENT.enemies.get(s.enemy)?.name}×${s.count}`).join('、') }))} />
      </div>
    </div>
  );
}

function weatherPlanEditor(plan: WeatherPlan | undefined, set: (p: WeatherPlan | undefined) => void) {
  const mode = plan?.mode ?? 'none';
  const ids = Object.keys(WEATHER) as WeatherId[];
  return (
    <div class="col">
      <Select label="天气模式" value={mode} options={[{ value: 'none', label: '始终晴朗' }, { value: 'fixed', label: '固定天气' }, { value: 'cycle', label: '轮换序列' }, { value: 'random', label: '随机变化' }]} onChange={(m) => set(m === 'none' ? undefined : m === 'fixed' ? { mode: 'fixed', id: 'rain' } : m === 'cycle' ? { mode: 'cycle', list: [{ id: 'clear', duration: 60 }, { id: 'rain', duration: 40 }] } : { mode: 'random', pool: ['clear', 'sunny', 'rain'], min: 30, max: 60 })} />
      {plan?.mode === 'fixed' && <Select label="天气" value={plan.id} options={ids.map((i) => ({ value: i, label: WEATHER[i].name }))} onChange={(id) => set({ mode: 'fixed', id })} />}
      {plan?.mode === 'cycle' && (
        <>
          {plan.list.map((x, i) => (
            <div class="row">
              <Select value={x.id} options={ids.map((id) => ({ value: id, label: WEATHER[id].name }))} onChange={(id) => { const l = [...plan.list]; l[i] = { ...x, id }; set({ mode: 'cycle', list: l }); }} />
              <NumberField label="持续(秒)" value={x.duration} min={5} onChange={(v) => { const l = [...plan.list]; l[i] = { ...x, duration: v ?? 30 }; set({ mode: 'cycle', list: l }); }} />
              <Btn small kind="ghost" onClick={() => set({ mode: 'cycle', list: plan.list.filter((_, j) => j !== i) })}>✕</Btn>
            </div>
          ))}
          <Btn small onClick={() => set({ mode: 'cycle', list: [...plan.list, { id: 'clear', duration: 30 }] })}>＋ 天气</Btn>
        </>
      )}
      {plan?.mode === 'random' && (
        <>
          <div class="row" style={{ gap: 4 }}>
            {ids.map((id) => (
              <Btn small active={plan.pool.includes(id)} onClick={() => set({ ...plan, pool: plan.pool.includes(id) ? plan.pool.filter((x) => x !== id) : [...plan.pool, id] })}>{WEATHER[id].name}</Btn>
            ))}
          </div>
          <NumberField label="最短持续" value={plan.min} min={5} onChange={(v) => set({ ...plan, min: v ?? 30 })} />
          <NumberField label="最长持续" value={plan.max} min={5} onChange={(v) => set({ ...plan, max: v ?? 60 })} />
        </>
      )}
    </div>
  );
}

function SettingsTab(props: { level: LevelDef; setLevel: (l: LevelDef) => void }) {
  const L = props.level;
  const set = (p: Partial<LevelDef>) => props.setLevel({ ...L, ...p });
  const obj: Objective = L.objective ?? { type: 'waves' };
  return (
    <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', alignContent: 'start' }}>
      <div class="panel">
        <h3>基本</h3>
        <div class="field"><span class="label">关卡名称</span><input type="text" value={L.name} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} /></div>
        <div class="field"><span class="label">描述</span><input type="text" style={{ flex: 1 }} value={L.desc} onInput={(e) => set({ desc: (e.target as HTMLInputElement).value })} /></div>
        <Select label="时间" value={L.time} options={[{ value: 'day', label: '白天（天降光能）' }, { value: 'night', label: '夜晚（月华光能）' }]} onChange={(v) => set({ time: v })} />
        <NumberField label="初始光能" value={L.startLumen} min={0} step={25} onChange={(v) => set({ startLumen: v ?? 100 })} />
        <Toggle label="天降光能" value={L.skyDrops !== false} onChange={(v) => set({ skyDrops: v ? undefined : false })} />
        <NumberField label="首波延迟（秒）" value={L.firstWaveDelay ?? 25} min={0} onChange={(v) => set({ firstWaveDelay: v })} />
        <NumberField label="敌人生命倍率" value={L.hpMul ?? 1} min={0.1} step={0.1} onChange={(v) => set({ hpMul: v })} />
        <NumberField label="卡槽数（空 = 档案默认）" value={L.deckSize} allowEmpty min={1} max={10} onChange={(v) => set({ deckSize: v })} />
      </div>
      <div class="panel">
        <h3>胜利条件</h3>
        <Select label="类型" value={obj.type} options={[{ value: 'waves', label: '击退所有波次' }, { value: 'survive', label: '坚持指定时间' }, { value: 'kills', label: '击败指定数量敌人' }]} onChange={(t) => set({ objective: t === 'waves' ? undefined : t === 'survive' ? { type: 'survive', seconds: 180 } : { type: 'kills', count: 50 } })} />
        {obj.type === 'survive' && <NumberField label="坚持秒数" value={obj.seconds} min={10} onChange={(v) => set({ objective: { type: 'survive', seconds: v ?? 180 } })} />}
        {obj.type === 'kills' && <NumberField label="击败数量" value={obj.count} min={1} onChange={(v) => set({ objective: { type: 'kills', count: v ?? 50 } })} />}
        <h4>保护圣物（格子坐标从 1 开始）</h4>
        {(L.relics ?? []).map((r, i) => (
          <div class="row">
            <NumberField label="行" value={r.row + 1} min={1} onChange={(v) => { const rs = [...L.relics!]; rs[i] = { ...r, row: (v ?? 1) - 1 }; set({ relics: rs }); }} />
            <NumberField label="列" value={r.col + 1} min={1} onChange={(v) => { const rs = [...L.relics!]; rs[i] = { ...r, col: (v ?? 1) - 1 }; set({ relics: rs }); }} />
            <NumberField label="生命" value={r.hp} min={100} step={100} onChange={(v) => { const rs = [...L.relics!]; rs[i] = { ...r, hp: v ?? 1500 }; set({ relics: rs }); }} />
            <Btn small kind="ghost" onClick={() => set({ relics: L.relics!.filter((_, j) => j !== i) })}>✕</Btn>
          </div>
        ))}
        <Btn small onClick={() => set({ relics: [...(L.relics ?? []), { row: 2, col: 2, hp: 1500 }] })}>＋ 圣物</Btn>
      </div>
      <div class="panel">
        <h3>天气</h3>
        {weatherPlanEditor(L.weather, (p) => set({ weather: p }))}
      </div>
      <div class="panel">
        <h3>随机事件</h3>
        <Toggle label="启用随机事件" value={!!L.events?.enabled} onChange={(v) => set({ events: v ? { enabled: true, interval: [40, 70] } : undefined })} />
        {L.events?.enabled && (
          <>
            <NumberField label="最短间隔" value={L.events.interval[0]} min={5} onChange={(v) => set({ events: { ...L.events!, interval: [v ?? 40, L.events!.interval[1]] } })} />
            <NumberField label="最长间隔" value={L.events.interval[1]} min={5} onChange={(v) => set({ events: { ...L.events!, interval: [L.events!.interval[0], v ?? 70] } })} />
            <div class="row" style={{ gap: 4 }}>
              {EVENTS.map((e) => {
                const pool = L.events!.pool ?? EVENTS.map((x) => x.id);
                const on = pool.includes(e.id);
                return <Btn small active={on} onClick={() => set({ events: { ...L.events!, pool: on ? pool.filter((x) => x !== e.id) : [...pool, e.id] } })}>{e.name}</Btn>;
              })}
            </div>
          </>
        )}
      </div>
      <div class="panel">
        <h3>卡牌限制</h3>
        <h4>指定携带（强制）</h4>
        <div class="row" style={{ gap: 4 }}>
          {CONTENT.allUnits().map((u) => (
            <Btn small active={L.forcedCards?.includes(u.id)} onClick={() => set({ forcedCards: L.forcedCards?.includes(u.id) ? L.forcedCards.filter((x) => x !== u.id) : [...(L.forcedCards ?? []), u.id] })}>{u.name}</Btn>
          ))}
        </div>
        <h4>禁用</h4>
        <div class="row" style={{ gap: 4 }}>
          {CONTENT.allUnits().map((u) => (
            <Btn small active={L.bannedCards?.includes(u.id)} onClick={() => set({ bannedCards: L.bannedCards?.includes(u.id) ? L.bannedCards.filter((x) => x !== u.id) : [...(L.bannedCards ?? []), u.id] })}>{u.name}</Btn>
          ))}
        </div>
      </div>
    </div>
  );
}

function TestTab(props: { level: LevelDef; save: () => void }) {
  const [stats, setStats] = useState<BatchStats | null>(null);
  const [prog, setProg] = useState({ d: 0, t: 0 });
  const [running, setRunning] = useState(false);
  const L = props.level;
  return (
    <div class="col" style={{ gap: 14 }}>
      <div class="panel">
        <h3>测试关卡</h3>
        <div class="row">
          <Btn kind="primary" onClick={() => { props.save(); navigate({ name: 'deck', setup: { mode: 'custom', level: L, testMode: true } }); }}>试玩（人类）</Btn>
          <Btn onClick={() => { props.save(); navigate({ name: 'deck', setup: { mode: 'custom', level: L, control: 'ai', testMode: true } }); }}>👁 AI 试玩</Btn>
          <Btn disabled={running} onClick={async () => {
            props.save();
            setRunning(true);
            const job = parallelBatch({ level: L, ai: { strategy: 'balanced', skills: ['lumen_rain'] }, runs: 12, seedBase: 5, mode: 'custom' }, (d, t) => setProg({ d, t }));
            try {
              setStats(await job.promise);
            } catch (e) {
              toast((e as Error).message, 'bad');
            }
            setRunning(false);
          }}>📊 AI 难度评估（12 局）</Btn>
        </div>
        {running && <Progress value={prog.d} max={prog.t} />}
      </div>
      {stats && (
        <div class="panel">
          <h3>评估结果</h3>
          <div>AI（均衡策略、全部卡牌）胜率 <b>{(stats.winRate * 100).toFixed(0)}%</b>，平均 {stats.avgTime.toFixed(0)} 秒，平均消耗 {stats.avgSpent.toFixed(0)}。</div>
          <div class="muted">{stats.winRate > 0.85 ? '难度：简单' : stats.winRate > 0.5 ? '难度：适中' : stats.winRate > 0.15 ? '难度：困难' : '难度：极难（或无法通关）'}</div>
          <h4>突破的敌人</h4>
          <BarChart items={Object.entries(stats.breachEnemies).map(([k, v]) => ({ label: CONTENT.enemies.get(k)?.name ?? k, value: v }))} unit="局" />
        </div>
      )}
    </div>
  );
}

function EditorScreen(props: { levelId?: string }) {
  const data = useStore();
  const [level, setLevel] = useState<LevelDef>(() => {
    const existing = props.levelId ? data.customPack.levels?.find((l) => l.id === props.levelId) : undefined;
    const l = existing ? JSON.parse(JSON.stringify(existing)) : newCustomLevel();
    if (typeof l.map === 'string') l.map = cloneMap(CONTENT.map(l.map), `${l.id}_map`);
    return l;
  });
  const [tab, setTab] = useState<'map' | 'waves' | 'settings' | 'test'>('map');
  const save = () => {
    store.update(['customPack', 'profiles'], (d) => {
      const levels = d.customPack.levels ?? (d.customPack.levels = []);
      const i = levels.findIndex((x) => x.id === level.id);
      const item = { ...level, custom: true };
      if (i >= 0) levels[i] = item;
      else {
        levels.push(item);
        store.profile.stats.customLevelsMade++;
      }
    });
    toast('关卡已保存', 'good');
  };
  return (
    <div class="screen">
      <TopBar title={`关卡编辑器 · ${level.name}`} onBack={() => back()}>
        <Select value="" options={[{ value: '', label: '以冒险关卡为模板…' }, ...LEVELS.map((l) => ({ value: l.id, label: `${l.id} ${l.name}` }))]} onChange={(id) => id && setLevel({ ...newCustomLevel(CONTENT.level(id)), id: level.id, map: cloneMap(CONTENT.resolveMap(CONTENT.level(id)!.map), `${level.id}_map`) })} />
        <Btn onClick={async () => {
          const f = await importFile('.json');
          if (!f) return;
          try {
            const o = JSON.parse(f.content);
            const l = (o.format === 'prism-wardens-level' ? o.level : o) as LevelDef;
            if (!l.map || !l.name) throw new Error('不是关卡文件');
            setLevel({ ...l, id: level.id, custom: true });
            toast('关卡已载入，记得保存', 'good');
          } catch (e) {
            toast(`导入失败：${(e as Error).message}`, 'bad');
          }
        }}>导入</Btn>
        <Btn onClick={() => void exportFile(`关卡-${level.name}.json`, JSON.stringify({ format: 'prism-wardens-level', level }, null, 2))}>导出</Btn>
        <Btn kind="primary" onClick={save}>保存</Btn>
      </TopBar>
      <div class="content">
        <Tabs tabs={[{ id: 'map', label: '🗺 地图与地形' }, { id: 'waves', label: '🌊 敌人波次' }, { id: 'settings', label: '⚙ 规则 / 天气 / 事件 / 胜利条件' }, { id: 'test', label: '▶ 测试' }]} value={tab} onChange={setTab} />
        {tab === 'map' && <MapTab level={level} setLevel={setLevel} />}
        {tab === 'waves' && <WavesTab level={level} setLevel={setLevel} />}
        {tab === 'settings' && <SettingsTab level={level} setLevel={setLevel} />}
        {tab === 'test' && <TestTab level={level} save={save} />}
      </div>
    </div>
  );
}

function CustomLevelsScreen() {
  const data = useStore();
  const levels = data.customPack.levels ?? [];
  return (
    <div class="screen">
      <TopBar title="自定义关卡" onBack={() => back()}>
        <Btn onClick={async () => {
          const f = await importFile('.json');
          if (!f) return;
          try {
            const o = JSON.parse(f.content);
            const l = (o.format === 'prism-wardens-level' ? o.level : o) as LevelDef;
            if (!l.map || !l.name) throw new Error('不是关卡文件');
            const id = `custom_${Date.now().toString(36)}`;
            store.update(['customPack'], (d) => (d.customPack.levels ??= []).push({ ...l, id, custom: true }));
            toast(`已导入关卡：${l.name}`, 'good');
          } catch (e) {
            toast(`导入失败：${(e as Error).message}`, 'bad');
          }
        }}>导入关卡</Btn>
        <Btn kind="primary" onClick={() => navigate({ name: 'editor' })}>＋ 新建关卡</Btn>
      </TopBar>
      <div class="content grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', alignContent: 'start' }}>
        {!levels.length && <div class="panel muted">还没有自定义关卡。点击右上角「新建关卡」打开关卡编辑器，或导入他人分享的关卡文件。</div>}
        {levels.map((l) => {
          const m = CONTENT.resolveMap(l.map);
          return (
            <div class="level-node">
              <div style={{ fontWeight: 800, fontSize: 16 }}>{l.name}</div>
              <div class="muted" style={{ fontSize: 12 }}>{l.desc}</div>
              <div class="row" style={{ fontSize: 12, gap: 6, margin: '6px 0' }}>
                <span class="tag">{m.rows}×{m.cols}</span>
                <span class="tag">{l.waves?.length ?? l.gen?.count ?? 0} 波</span>
                <span class="tag">{l.time === 'night' ? '夜晚' : '白天'}</span>
              </div>
              <div class="row" style={{ gap: 4 }}>
                <Btn small kind="primary" onClick={() => navigate({ name: 'deck', setup: { mode: 'custom', level: l, customLevelId: l.id } })}>开始</Btn>
                <Btn small onClick={() => navigate({ name: 'deck', setup: { mode: 'custom', level: l, control: 'ai' } })}>🤖 AI</Btn>
                <Btn small onClick={() => navigate({ name: 'editor', levelId: l.id })}>编辑</Btn>
                <Btn small onClick={() => void exportFile(`关卡-${l.name}.json`, JSON.stringify({ format: 'prism-wardens-level', level: l }, null, 2))}>导出</Btn>
                <Btn small kind="danger" onClick={() => confirm(`删除关卡「${l.name}」？`) && store.update(['customPack'], (d) => (d.customPack.levels = (d.customPack.levels ?? []).filter((x) => x.id !== l.id)))}>删除</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

SCREENS.editor = (r) => <EditorScreen levelId={(r as { levelId?: string }).levelId} />;
SCREENS.custom = () => <CustomLevelsScreen />;
