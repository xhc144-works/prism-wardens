import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Command, GameConfig, UnitDef } from '../../core/types';
import type { World } from '../../core/sim/world';
import { CONTENT } from '../../core/content/registry';
import { SKILLS, ITEMS } from '../../core/content/abilities';
import { WEATHER, EVENTS } from '../../core/content/environment';
import { nextLevelId } from '../../core/content/levels';
import { randomSeed } from '../../core/rng';
import { recordGame } from '../../core/meta/achievements';
import { buildReport } from '../../core/report/report';
import { makeReplay } from '../../core/replay/replay';
import { RANK_COST_MUL } from '../../core/constants';
import { analyzeGame, applyAdjustments } from '../../ai/analyzer';
import { buildDeck } from '../../ai/deckBuilder';
import { STRATEGIES, getStrategy } from '../../ai/strategies';
import { CoachState } from '../../ai/coach';
import { GameController, CONTROL_NAMES, SPEEDS, useClassicSkin, type ControlMode } from '../../app/game';
import type { ClassicRenderer } from '../../render/classic/classicRenderer';
import { PVZ } from '../../pvz/assets';
import { PLANT_SKINS } from '../../render/classic/skins';
import { navigate, back, home, type BattleSetup } from '../../app/nav';
import { store } from '../../app/store';
import { audio } from '../../audio/audio';
import { Btn, CardTile, Modal, Select, Toggle, UnitTooltip, fmtTime, toast, useTooltip } from '../components/ui';
import { CheatEditor } from './Cheats';

type Tool = { kind: 'card'; id: string } | { kind: 'remove' } | { kind: 'upgrade' } | { kind: 'skill'; id: string } | { kind: 'item'; id: string } | null;

const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function buildConfig(setup: BattleSetup): GameConfig {
  const p = store.profile;
  const s = store.settings;
  const strat = getStrategy(setup.strategy ?? 'balanced');
  const available = p.unlockedCards;
  const deck =
    setup.deck && setup.deck.length
      ? setup.deck
      : buildDeck({ level: setup.level, available, size: setup.level.deckSize ?? p.deckSlots, strategy: strat, rules: null }).deck;
  const cheatsOn = s.cheatsEnabled && !setup.rules;
  return {
    mode: setup.mode,
    level: setup.level,
    deck,
    skills: setup.skills ?? [],
    items: setup.items ?? {},
    seed: setup.seed ?? randomSeed(),
    rules: setup.rules ?? null,
    cheats: cheatsOn ? s.cheats : null,
    upgrades: { ...p.upgrades },
    difficulty: setup.difficulty ?? s.difficulty,
    options: { autoCollect: s.autoCollect && !setup.rules?.constraints.countCollectAsOp },
  };
}

export function BattleScreen(props: { setup: BattleSetup }) {
  const { setup } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lumenRef = useRef<HTMLDivElement>(null);
  const [ctrl] = useState(() => {
    const c = new GameController(buildConfig(setup));
    c.setControl(setup.control ?? 'human', setup.strategy ?? 'balanced');
    return c;
  });
  const [, setTick] = useState(0);
  const [tool, setTool] = useState<Tool>(null);
  const [panel, setPanel] = useState<'none' | 'ai' | 'cheat'>(setup.control && setup.control !== 'human' ? 'ai' : 'none');
  const [menu, setMenu] = useState(false);
  const [result, setResult] = useState<ResultInfo | null>(null);
  const [tip, onTip] = useTooltip();
  const [pulse, setPulse] = useState(false);
  const draggingCollect = useRef(false);
  const w = ctrl.world;

  useEffect(() => {
    const c = canvasRef.current!;
    ctrl.attach(c);
    const unsub = ctrl.subscribe(() => setTick((t) => t + 1));
    ctrl.onEnd = (world) => setResult(finishGame(world, ctrl, setup));
    if (ctrl.renderer) {
      ctrl.renderer.onCollectArrive = () => {
        setPulse(true);
        setTimeout(() => setPulse(false), 300);
      };
    }
    audio.music(w.bossIds.length ? 'boss' : (w.level.time === 'night' && w.map.theme === 'day' ? 'night' : w.map.theme) as never);
    if (useClassicSkin()) audio.sfx('ready');
    const upd = () => {
      if (!lumenRef.current || !ctrl.renderer) return;
      const a = lumenRef.current.getBoundingClientRect();
      const b = c.getBoundingClientRect();
      ctrl.renderer.collectTarget = { x: a.left + a.width / 2 - b.left, y: a.top + a.height / 2 - b.top };
    };
    upd();
    window.addEventListener('resize', upd);
    return () => {
      unsub();
      ctrl.detach();
      window.removeEventListener('resize', upd);
      audio.music('menu');
    };
  }, []);

  // 首领出现时切换音乐
  const bossNow = w.bossIds.length > 0;
  useEffect(() => {
    if (bossNow) audio.music('boss');
  }, [bossNow]);

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const i = HOTKEYS.indexOf(e.key);
      if (i >= 0 && w.deck[i]) {
        setTool({ kind: 'card', id: w.deck[i].id });
        return;
      }
      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          ctrl.togglePause();
          break;
        case 'escape':
          if (tool) setTool(null);
          else setMenu((m) => !m);
          break;
        case 'q':
          setTool({ kind: 'remove' });
          break;
        case 'w':
          setTool({ kind: 'upgrade' });
          break;
        case 'f':
          if (ctrl.paused) ctrl.stepFrame();
          break;
        case '=':
        case '+':
          ctrl.setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(ctrl.speed) + 1)] ?? 1);
          break;
        case '-':
          ctrl.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(ctrl.speed) - 1)] ?? 1);
          break;
        case 'tab':
          e.preventDefault();
          ctrl.setControl(ctrl.control === 'human' ? 'ai' : 'human');
          toast(ctrl.control === 'human' ? '你接管了控制权' : 'AI 接管了控制权', 'gold');
          break;
        case 'a':
          store.update(['settings'], (d) => {
            d.settings.aiOverlay = !d.settings.aiOverlay;
          });
          ctrl.applySettings();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  const toolCommand = (row: number, col: number): Command | null => {
    if (!tool) return null;
    switch (tool.kind) {
      case 'card':
        return { type: 'place', card: tool.id, row, col };
      case 'remove':
        return { type: 'remove', row, col };
      case 'upgrade':
        return { type: 'upgrade', row, col };
      case 'skill':
        return { type: 'skill', skill: tool.id, row, col };
      case 'item':
        return { type: 'item', item: tool.id, row, col };
    }
  };

  const onMove = (e: MouseEvent) => {
    const r = ctrl.renderer;
    if (!r) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (r.kind === 'classic') {
      const cr = r as ClassicRenderer;
      cr.hudState.mouse = { x: px, y: py };
      const hit = cr.hudAt(px, py, w);
      if (hit?.kind === 'card') onTip(w.deck[hit.index].def, e);
      else onTip(null, e);
    }
    if (draggingCollect.current) {
      // 鼠标划过光球即可收集
      for (const id of r.orbsNear(px, py, w, 34)) ctrl.issue({ type: 'collect', orb: id });
    }
    const cell = r.cellAt(px, py, w);
    if (!cell || !tool) {
      r.hover = null;
      return;
    }
    const cmd = toolCommand(cell.row, cell.col)!;
    const valid = w.validate(cmd, 'human').ok;
    let area: 'cell' | 'row' | '3x3' = 'cell';
    if (tool.kind === 'skill' && SKILLS.find((s) => s.id === tool.id)?.target === 'cell') area = '3x3';
    if (tool.kind === 'item') {
      const t = ITEMS.find((x) => x.id === tool.id)?.target;
      area = t === 'row' ? 'row' : t === 'cell' ? '3x3' : 'cell';
    }
    r.hover = { row: cell.row, col: cell.col, valid, def: tool.kind === 'card' ? CONTENT.units.get(tool.id) : undefined, mode: tool.kind === 'card' ? 'place' : (tool.kind as never), area };
  };

  const onClick = (e: MouseEvent) => {
    const r = ctrl.renderer;
    if (!r) return;
    audio.ensure();
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (r.kind === 'classic') {
      const hit = (r as ClassicRenderer).hudAt(px, py, w);
      if (hit) {
        if (hit.kind === 'card') {
          const c = w.deck[hit.index];
          activateTool(tool?.kind === 'card' && tool.id === c.id ? null : { kind: 'card', id: c.id });
        } else if (hit.kind === 'shovel') activateTool(tool?.kind === 'remove' ? null : { kind: 'remove' });
        else activateTool(tool?.kind === 'upgrade' ? null : { kind: 'upgrade' });
        audio.sfx('click');
        return;
      }
    }
    const orb = r.orbAt(px, py, w);
    if (orb != null) {
      ctrl.issue({ type: 'collect', orb });
      return;
    }
    const cell = r.cellAt(px, py, w);
    if (!cell || !tool) return;
    const cmd = toolCommand(cell.row, cell.col)!;
    const res = ctrl.issue(cmd);
    if (res.ok && !e.shiftKey) {
      if (tool.kind === 'card' || tool.kind === 'skill' || tool.kind === 'item') setTool(null);
    }
    if (!res.ok) toast(res.reason ?? '无法执行', 'bad', 1600);
  };

  const activateTool = (t: Tool) => {
    if (!t) return setTool(null);
    if (t.kind === 'skill') {
      const def = SKILLS.find((s) => s.id === t.id)!;
      if (def.target === 'none') {
        const r = ctrl.issue({ type: 'skill', skill: t.id });
        if (!r.ok) toast(r.reason ?? '', 'bad', 1500);
        return;
      }
    }
    if (t.kind === 'item') {
      const def = ITEMS.find((s) => s.id === t.id)!;
      if (def.target === 'none') {
        const r = ctrl.issue({ type: 'item', item: t.id });
        if (!r.ok) toast(r.reason ?? '', 'bad', 1500);
        return;
      }
    }
    setTool(t);
  };

  const classic = useClassicSkin();
  if (ctrl.renderer?.kind === 'classic') (ctrl.renderer as ClassicRenderer).hudState.selected = tool;
  const prof = store.profile;
  const deny = performance.now() - ctrl.lastDeniedAt < 1500 ? ctrl.lastDenied : '';
  const totalW = Number.isFinite(w.totalWaves) ? w.totalWaves : 0;
  const flags = useMemo(() => (totalW ? w.waves.map((wv, i) => (wv.flag ? i + 1 : 0)).filter(Boolean) : []), [totalW]);
  const upgradeTip = tool?.kind === 'upgrade' ? '点击单位强化（★2: 费用×0.75，★3: 费用×1.25）' : '';

  return (
    <div class={`screen battle ${classic ? 'classic-battle' : ''}`}>
      {!classic && <div class="battle-top">
        <div class={`lumen-box ${pulse ? 'pulse' : ''}`} ref={lumenRef} title="光能">
          <div class="orb" />
          <div class="num">{w.cheats?.infiniteLumen ? '∞' : Math.floor(w.lumen)}</div>
        </div>
        <div class="cardbar">
          {w.deck.map((c, i) => {
            const cost = w.cardCost(c.def);
            const max = w.cardCooldown(c.def);
            const ready = c.cooldown <= 0;
            const afford = w.lumen >= cost || !!w.cheats?.infiniteLumen;
            return (
              <CardTile
                def={c.def}
                cost={cost}
                cooldown={c.cooldown}
                maxCooldown={max}
                hotkey={HOTKEYS[i]}
                selected={tool?.kind === 'card' && tool.id === c.id}
                disabled={!ready || !afford}
                onClick={() => activateTool(tool?.kind === 'card' && tool.id === c.id ? null : { kind: 'card', id: c.id })}
                onHover={(d, e) => onTip(d, e)}
              />
            );
          })}
        </div>
        <div class="tools">
          <div class={`skill-btn ${tool?.kind === 'remove' ? 'selected' : ''}`} title="回收（Q）：移除一个单位" onClick={() => activateTool(tool?.kind === 'remove' ? null : { kind: 'remove' })}>
            🗑
          </div>
          <div class={`skill-btn ${tool?.kind === 'upgrade' ? 'selected' : ''}`} title="强化（W）：提升单位星级" onClick={() => activateTool(tool?.kind === 'upgrade' ? null : { kind: 'upgrade' })}>
            ★
          </div>
        </div>
        <div class="row" style={{ gap: 6, alignContent: 'center' }}>
          {w.skills.map((s) => {
            const def = SKILLS.find((x) => x.id === s.id)!;
            return (
              <div class={`skill-btn ${tool?.kind === 'skill' && tool.id === s.id ? 'selected' : ''}`} title={`${def.name}：${def.desc}`} onClick={() => activateTool({ kind: 'skill', id: s.id })} style={{ color: def.color }}>
                {def.icon}
                {s.cooldown > 0 && <div class="cd" style={{ height: `${(s.cooldown / def.cooldown) * 100}%` }} />}
              </div>
            );
          })}
          {Object.entries(w.items)
            .filter(([, n]) => n > 0)
            .map(([id, n]) => {
              const def = ITEMS.find((x) => x.id === id)!;
              return (
                <div class={`skill-btn ${tool?.kind === 'item' && tool.id === id ? 'selected' : ''}`} title={`${def.name}：${def.desc}`} onClick={() => activateTool({ kind: 'item', id })} style={{ color: def.color }}>
                  {def.icon}
                  <span class="count">{n}</span>
                </div>
              );
            })}
        </div>
        <div style={{ flex: 1 }} />
        <div class="col" style={{ justifyContent: 'center', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontWeight: 800 }}>{w.level.name}</div>
          <div class="muted" style={{ fontSize: 12 }}>
            {setup.rules ? `挑战：${setup.rules.name}` : setup.mode === 'endless' ? '无尽模式' : setup.mode === 'survival' ? '生存挑战' : setup.mode === 'custom' ? '自定义关卡' : '冒险模式'}
            {w.stats.cheatsUsed ? ' · 已使用修改器' : ''}
          </div>
          <div class="row" style={{ gap: 6 }}>
            <Btn small onClick={() => setMenu(true)}>☰ 菜单</Btn>
          </div>
        </div>
      </div>}

      <div class="battle-main">
        <div class="battle-canvas-wrap">
          <canvas
            ref={canvasRef}
            onMouseMove={onMove as never}
            onMouseDown={(e) => {
              if ((e as MouseEvent).button === 2) {
                setTool(null);
                return;
              }
              draggingCollect.current = true;
            }}
            onMouseUp={() => (draggingCollect.current = false)}
            onMouseLeave={() => {
              draggingCollect.current = false;
              if (ctrl.renderer) ctrl.renderer.hover = null;
            }}
            onClick={onClick as never}
            onContextMenu={(e) => {
              e.preventDefault();
              setTool(null);
            }}
            style={{ cursor: classic ? (tool ? 'none' : 'default') : tool ? 'crosshair' : 'default' }}
          />
          {classic && (
            <div class="pvz-topright">
              <div class="pvz-level-name">{w.level.name}</div>
              <button class="pvz-btn" onClick={() => setMenu(true)}>
                {PVZ.str('MENU', '菜单')}
              </button>
            </div>
          )}
          {classic && (w.skills.length > 0 || Object.values(w.items).some((n) => n > 0)) && (
            <div class="pvz-skills">
              {w.skills.map((s) => {
                const def = SKILLS.find((x) => x.id === s.id)!;
                return (
                  <div class={`skill-btn ${tool?.kind === 'skill' && tool.id === s.id ? 'selected' : ''}`} title={`${def.name}：${def.desc}`} onClick={() => activateTool({ kind: 'skill', id: s.id })} style={{ color: def.color }}>
                    {def.icon}
                    {s.cooldown > 0 && <div class="cd" style={{ height: `${(s.cooldown / def.cooldown) * 100}%` }} />}
                  </div>
                );
              })}
              {Object.entries(w.items)
                .filter(([, n]) => n > 0)
                .map(([id, n]) => {
                  const def = ITEMS.find((x) => x.id === id)!;
                  return (
                    <div class={`skill-btn ${tool?.kind === 'item' && tool.id === id ? 'selected' : ''}`} title={`${def.name}：${def.desc}`} onClick={() => activateTool({ kind: 'item', id })} style={{ color: def.color }}>
                      {def.icon}
                      <span class="count">{n}</span>
                    </div>
                  );
                })}
            </div>
          )}
          {store.settings.showFps && <div class="fps">{ctrl.fps} FPS · tick {w.tick}</div>}
          {deny && <div class="deny-msg">{deny}</div>}
          {upgradeTip && <div class="deny-msg" style={{ background: 'rgba(40,60,120,.85)', borderColor: 'var(--accent)' }}>{upgradeTip}</div>}
          {w.level.tutorial && w.time < 45 && ctrl.control === 'human' && (
            <div class="panel" style={{ position: 'absolute', left: 12, bottom: 12, maxWidth: 380, fontSize: 13 }}>
              <b class="gold-text">提示</b>
              {w.level.tutorial.map((t) => (
                <div>· {t}</div>
              ))}
              <div class="dim" style={{ marginTop: 4 }}>快捷键：1-9 选卡，Q 回收，W 强化，空格 暂停，Tab 切换 AI，F 逐帧</div>
            </div>
          )}
          {w.status === 'intermission' && <Intermission ctrl={ctrl} />}
        </div>
        {panel === 'ai' && <AiPanel ctrl={ctrl} />}
        {panel === 'cheat' && (
          <div class="side-panel">
            {w.cheatsAllowed ? (
              <CheatEditor
                compact
                value={w.cheats ?? store.settings.cheats}
                onChange={(cfg) => {
                  ctrl.setCheats(cfg);
                  store.update(['settings'], (d) => {
                    d.settings.cheats = cfg;
                    d.settings.cheatsEnabled = true;
                  });
                }}
                onAction={(a) => {
                  if (a.type === 'setLumen') ctrl.world.issue({ type: 'setLumen', value: a.value }, 'cheat');
                  if (a.type === 'killAll') ctrl.world.issue({ type: 'killAll' }, 'cheat');
                  if (a.type === 'spawn') ctrl.world.issue({ type: 'spawn', enemy: a.enemy, row: a.row }, 'cheat');
                }}
              />
            ) : (
              <div class="panel">
                <h3>修改器已锁定</h3>
                <div class="muted">挑战模式下修改器被强制禁用，人类与 AI 都无法使用，保证挑战结果有效。</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div class="battle-bottom">
        <span>波次 {w.waveIndex}{totalW ? `/${totalW}` : ''}</span>
        {totalW > 0 && (
          <div class="wavebar" title="波次进度">
            <div class="fill" style={{ width: `${(w.waveIndex / totalW) * 100}%` }} />
            {flags.map((f) => (
              <span class="flag" style={{ left: `${(f / totalW) * 100}%` }}>⚑</span>
            ))}
          </div>
        )}
        <span title={WEATHER[w.weather.id].desc}>
          {WEATHER[w.weather.id].icon} {WEATHER[w.weather.id].name}
        </span>
        {w.activeEvents.map((e) => (
          <span class="tag gold">{EVENTS.find((x) => x.id === e.id)?.name} {Math.ceil(e.left)}s</span>
        ))}
        <span class="muted">⏱ {fmtTime(w.time)}</span>
        <span class="muted">击败 {w.stats.killsTotal}</span>
        {w.rules?.c.maxOperations != null && <span class="tag">操作 {w.stats.ops}/{w.rules.c.maxOperations}</span>}
        {w.rules?.c.maxTotalSpend != null && <span class="tag">消耗 {w.stats.lumenSpent}/{w.rules.c.maxTotalSpend}</span>}
        {w.rules?.c.timeLimit != null && <span class="tag">限时 {Math.max(0, Math.ceil(w.rules.c.timeLimit - w.time))}s</span>}
        <div style={{ flex: 1 }} />
        <Select
          value={ctrl.control}
          options={(Object.keys(CONTROL_NAMES) as ControlMode[]).map((k) => ({ value: k, label: CONTROL_NAMES[k] }))}
          onChange={(v) => {
            ctrl.setControl(v);
            if (v !== 'human') setPanel('ai');
          }}
        />
        <Btn small active={panel === 'ai'} onClick={() => setPanel(panel === 'ai' ? 'none' : 'ai')} title="AI 控制台">🤖 AI</Btn>
        <Btn small active={panel === 'cheat'} onClick={() => setPanel(panel === 'cheat' ? 'none' : 'cheat')} title="修改器">🛠 修改器</Btn>
        <Btn small onClick={() => ctrl.togglePause()} active={ctrl.paused}>{ctrl.paused ? '▶ 继续' : '⏸ 暂停'}</Btn>
        <Btn small disabled={!ctrl.paused} onClick={() => ctrl.stepFrame()} title="逐帧（F）">⏭ 帧</Btn>
        <Btn small disabled={!ctrl.paused} onClick={() => ctrl.stepFrame(30)} title="前进 1 秒">+1s</Btn>
        <div class="row" style={{ gap: 2 }}>
          {SPEEDS.map((s) => (
            <Btn small active={ctrl.speed === s} onClick={() => ctrl.setSpeed(s)}>
              {s}×
            </Btn>
          ))}
        </div>
      </div>

      {tip && <UnitTooltip def={tip.def} x={tip.x} y={tip.y} level={prof.upgrades[tip.def.id]} />}
      {menu && !result && (
        <Modal title="暂停" onClose={() => setMenu(false)}>
          <div class="col">
            <Btn kind="primary" onClick={() => setMenu(false)}>继续游戏</Btn>
            <Btn onClick={() => navigate({ name: 'battle', setup: { ...setup, seed: undefined } }, true)}>重新开始</Btn>
            <Btn onClick={() => navigate({ name: 'deck', setup }, true)}>重新选卡</Btn>
            <Btn onClick={() => navigate({ name: 'settings' })}>设置</Btn>
            <Btn kind="danger" onClick={() => back()}>放弃并返回</Btn>
          </div>
        </Modal>
      )}
      {result && <ResultModal info={result} setup={setup} ctrl={ctrl} />}
    </div>
  );
}

/* ============================ AI 面板 ============================ */

function AiPanel(props: { ctrl: GameController }) {
  const { ctrl } = props;
  const agent = ctrl.agent;
  const tr = agent?.lastTrace;
  return (
    <div class="side-panel">
      <div class="panel" style={{ marginBottom: 8 }}>
        <h3>AI 控制</h3>
        <Select label="控制模式" value={ctrl.control} options={(Object.keys(CONTROL_NAMES) as ControlMode[]).map((k) => ({ value: k, label: CONTROL_NAMES[k] }))} onChange={(v) => ctrl.setControl(v)} />
        <Select label="策略" value={ctrl.strategy.id} options={STRATEGIES.map((s) => ({ value: s.id, label: s.name }))} onChange={(v) => ctrl.setControl(ctrl.control === 'human' ? 'ai' : ctrl.control, v)} />
        <div class="dim" style={{ fontSize: 12 }}>{ctrl.strategy.desc}</div>
        <Toggle label="战场上显示 AI 决策可视化" value={store.settings.aiOverlay} onChange={(v) => {
          store.update(['settings'], (d) => {
            d.settings.aiOverlay = v;
          });
          ctrl.applySettings();
        }} />
        <div class="dim" style={{ fontSize: 12 }}>按 Tab 随时在人类/AI 之间切换，实时接管。</div>
      </div>
      {!agent && <div class="muted">当前为人类操作。选择 AI 模式后，这里会实时显示 AI 的目标、依据与各行压力。</div>}
      {agent && tr && (
        <>
          <div class="panel" style={{ marginBottom: 8 }}>
            <h3>当前目标</h3>
            <div style={{ fontSize: 15, fontWeight: 700 }} class={tr.goal.startsWith('紧急') ? 'bad' : ''}>{tr.goal}</div>
            <div class="muted">策略：{tr.strategy} · 光能 {tr.lumen} · 生产 {tr.econ.producers}/{tr.econ.target}</div>
            <div class="muted">思考 {agent.thinkCount} 次 · 行动 {agent.actionsIssued} 次 · 规则拒绝 {agent.rejected} 次</div>
            {tr.chosen.map((c) => (
              <div class="trace-item" style={{ marginTop: 6 }}>
                <b>{c.label}</b> <span class="dim">（评分 {c.score}）</span>
                {c.reasons.map((r) => (
                  <div class="muted">· {r}</div>
                ))}
              </div>
            ))}
            {tr.alternatives.length > 0 && (
              <>
                <h4>候选方案</h4>
                {tr.alternatives.map((a) => (
                  <div class="row" style={{ justifyContent: 'space-between' }}>
                    <span class="muted" style={{ fontSize: 12 }}>{a.label}</span>
                    <span>{a.score}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div class="panel" style={{ marginBottom: 8 }}>
            <h3>各行态势</h3>
            {tr.lanes.map((l) => (
              <div style={{ marginBottom: 6 }}>
                <div class="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                  <span>第 {l.row + 1} 行 {l.emergency && <span class="tag bad">告急</span>}</span>
                  <span class="muted">火力 {l.dps}/{l.need} · 威胁 {l.threat}</span>
                </div>
                <div class="lane-bar">
                  <div style={{ width: `${Math.min(100, (l.pressure / 1.5) * 100)}%`, background: l.emergency ? 'var(--bad)' : l.pressure > 1 ? 'var(--warn)' : 'var(--good)' }} />
                </div>
              </div>
            ))}
          </div>
          {agent.strategyLog.length > 0 && (
            <div class="panel" style={{ marginBottom: 8 }}>
              <h3>策略变化</h3>
              {agent.strategyLog.slice(-8).map((s) => (
                <div class="muted" style={{ fontSize: 12 }}>
                  {s.t}s：{s.from} → <b>{s.to}</b>（{s.why}）
                </div>
              ))}
            </div>
          )}
          <div class="panel">
            <h3>决策日志</h3>
            {agent.traces
              .filter((t) => t.chosen.length)
              .slice(-12)
              .reverse()
              .map((t) => (
                <div class={`trace-item ${t.goal.startsWith('紧急') ? 'em' : ''}`}>
                  <span class="dim">{t.t}s</span> {t.chosen.map((c) => c.label).join('；')}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================ 轮间休整（生存） ============================ */

function Intermission(props: { ctrl: GameController }) {
  const { ctrl } = props;
  const w = ctrl.world;
  const p = store.profile;
  const [deck, setDeck] = useState(w.deck.map((d) => d.id));
  const pool = p.unlockedCards.filter((id) => CONTENT.units.get(id));
  if (ctrl.control === 'ai') return null;
  return (
    <div class="overlay">
      <div class="modal">
        <h2>轮间休整</h2>
        <div class="muted">阵地会保留。重新挑选卡组（最多 {p.deckSlots} 张），所有卡牌冷却重置。</div>
        <div class="row" style={{ margin: '12px 0' }}>
          {pool.map((id) => {
            const d = CONTENT.unit(id);
            const sel = deck.includes(id);
            return <CardTile small def={d} selected={sel} onClick={() => setDeck(sel ? deck.filter((x) => x !== id) : deck.length < p.deckSlots ? [...deck, id] : deck)} />;
          })}
        </div>
        <Btn kind="primary" onClick={() => ctrl.issue({ type: 'reselect', deck })}>开始下一轮（{deck.length} 张）</Btn>
      </div>
    </div>
  );
}

/* ============================ 结算 ============================ */

interface ResultInfo {
  won: boolean;
  reason: string;
  coins: number;
  unlocked: string[];
  achievements: string[];
  stars: number;
  reportId: string;
  report: ReturnType<typeof buildReport>;
  coachNote?: string;
  next?: BattleSetup;
}

function finishGame(w: World, ctrl: GameController, setup: BattleSetup): ResultInfo {
  const p = store.profile;
  const aiPlayed = ctrl.aiOps > ctrl.humanOps;
  const player = ctrl.control === 'human' && !aiPlayed ? p.name : ctrl.humanOps > 0 && ctrl.aiOps > 0 ? `${p.name}+AI·${ctrl.strategy.name}` : `AI·${ctrl.strategy.name}`;
  const report = buildReport(w, player, ctrl.agent ?? undefined);
  store.addReport(report);
  void store.saveReplay(makeReplay(w, player));
  const unlocked: string[] = [];
  let stars = 0;
  let coinsReward = 0;
  const won = w.status === 'won';
  store.update(['profiles', 'leaderboard'], () => {
    const L = w.level;
    if (setup.mode === 'adventure' || setup.mode === 'custom') {
      const pr = (p.progress[L.id] ??= { stars: 0, bestTime: 0, wins: 0, attempts: 0 });
      pr.attempts++;
      if (won) {
        const first = pr.wins === 0;
        pr.wins++;
        stars = 1 + (w.stats.sentinelsUsed === 0 ? 1 : 0) + (w.stats.unitsLostTotal <= 3 ? 1 : 0);
        pr.stars = Math.max(pr.stars, stars);
        pr.bestTime = pr.bestTime ? Math.min(pr.bestTime, w.time) : w.time;
        const rw = L.rewards;
        if (rw?.card && !p.unlockedCards.includes(rw.card)) {
          p.unlockedCards.push(rw.card);
          unlocked.push(CONTENT.units.get(rw.card)?.name ?? rw.card);
        }
        if (rw?.skill && !p.unlockedSkills.includes(rw.skill)) {
          p.unlockedSkills.push(rw.skill);
          unlocked.push(`技能：${SKILLS.find((s) => s.id === rw.skill)?.name}`);
        }
        coinsReward = Math.round((rw?.coins ?? 30) * (first ? 1 : 0.25));
        p.coins += coinsReward;
      }
    }
    // 消耗道具
    for (const [id, n] of Object.entries(w.config.items)) {
      const used = n - (w.items[id] ?? 0);
      if (used > 0) p.items[id] = Math.max(0, (p.items[id] ?? 0) - used);
    }
    if (setup.rules || setup.mode === 'adventure') {
      store.data.leaderboard.push({
        board: setup.challengeId ?? L.id,
        who: player,
        won,
        time: Math.round(w.time * 10) / 10,
        spent: w.stats.lumenSpent,
        ops: w.stats.ops,
        units: w.stats.peakUnits,
        date: Date.now(),
        verified: !w.stats.cheatsUsed,
      });
    }
  });
  const rec = recordGame(p, w, { ai: aiPlayed, endlessArena: setup.endlessArena, survivalId: setup.survivalId, challengeId: won ? setup.challengeId : undefined });
  store.saveProfile();
  for (const a of rec.newAchievements) toast(`🏆 成就解锁：${a.name}`, 'gold', 4000);

  // 自动连续闯关（AI 教练）
  let next: BattleSetup | undefined;
  let coachNote: string | undefined;
  if (setup.coach) {
    const c = { ...setup.coach, log: [...setup.coach.log] };
    const levelId = c.levels[c.index];
    const k = (store.data.aiKnowledge[levelId] ??= new CoachState(getStrategy(c.strategy)).get(levelId));
    if (won) {
      c.log.push(`✔ ${levelId} 第 ${c.attempt} 次尝试通关（${Math.round(w.time)} 秒）`);
      k.wins++;
      if (c.index + 1 < c.levels.length) {
        c.index++;
        c.attempt = 1;
        const lv = CONTENT.level(c.levels[c.index])!;
        const k2 = store.data.aiKnowledge[lv.id];
        next = { ...setup, level: lv, deck: undefined, seed: undefined, coach: c, strategy: c.strategy, ...(k2 ? {} : {}) };
      } else coachNote = `自动闯关结束：${c.log.filter((l) => l.startsWith('✔')).length}/${c.levels.length} 关通关`;
    } else {
      const analysis = analyzeGame(w);
      const applied = applyAdjustments(k.params, analysis.adjustments, k.include, k.exclude, p.unlockedCards);
      k.attempts++;
      k.history.push({ attempt: c.attempt, won: false, cause: analysis.cause, changes: applied });
      c.log.push(`✘ ${levelId} 第 ${c.attempt} 次失败：${analysis.cause} → ${applied.join('；') || '无调整'}`);
      coachNote = `失败分析：${analysis.cause}\n调整：${applied.join('；') || '无'}`;
      if (c.attempt < c.maxAttempts) {
        c.attempt++;
        next = { ...setup, deck: undefined, seed: undefined, coach: c };
      } else coachNote += '\n已达到最大尝试次数，自动闯关停止。';
    }
    store.update(['aiKnowledge'], () => {});
    if (next) {
      const lv = next.level;
      const kk = store.data.aiKnowledge[lv.id];
      const strat = kk?.params ?? getStrategy(c.strategy);
      next.deck = buildDeck({ level: lv, available: p.unlockedCards, size: lv.deckSize ?? p.deckSlots, strategy: strat, include: kk?.include, exclude: kk?.exclude }).deck;
      next.strategy = c.strategy;
    }
  }
  return { won, reason: w.endReason, coins: rec.coins + coinsReward, unlocked, achievements: rec.newAchievements.map((a) => a.name), stars, reportId: report.id, report, coachNote, next };
}

function ResultModal(props: { info: ResultInfo; setup: BattleSetup; ctrl: GameController }) {
  const { info, setup, ctrl } = props;
  const w = ctrl.world;
  const [count, setCount] = useState(info.next ? 4 : -1);
  useEffect(() => {
    if (!info.next) return;
    const t = setInterval(() => setCount((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (count === 0 && info.next) navigate({ name: 'battle', setup: info.next }, true);
  }, [count]);
  const nextId = setup.mode === 'adventure' ? nextLevelId(w.level.id) : undefined;
  const r = info.report;
  return (
    <Modal>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: info.won ? 'var(--good)' : 'var(--bad)' }}>{info.won ? '胜利！' : '防线失守'}</div>
        <div class="muted">{info.reason}</div>
        {info.won && info.stars > 0 && <div style={{ fontSize: 28, color: 'var(--gold)', margin: '6px 0' }}>{'★'.repeat(info.stars)}{'☆'.repeat(3 - info.stars)}</div>}
      </div>
      <div class="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', margin: '14px 0' }}>
        <div class="panel"><div class="muted">用时</div><b>{fmtTime(r.time)}</b></div>
        <div class="panel"><div class="muted">波次</div><b>{r.waves}{r.totalWaves > 0 ? `/${r.totalWaves}` : ''}</b></div>
        <div class="panel"><div class="muted">消耗光能</div><b>{r.economy.spent}</b></div>
        <div class="panel"><div class="muted">操作次数</div><b>{r.operations.total}</b></div>
      </div>
      {info.coins > 0 && <div class="gold-text">获得金币 +{info.coins}</div>}
      {info.unlocked.map((u) => (
        <div class="good">🎁 解锁：{u}</div>
      ))}
      {info.achievements.map((a) => (
        <div class="gold-text">🏆 成就：{a}</div>
      ))}
      {!info.won && (
        <div class="panel" style={{ marginTop: 10 }}>
          <b>复盘：</b>{r.analysis.cause}
          {r.analysis.details.map((d) => (
            <div class="muted">· {d}</div>
          ))}
          {r.analysis.adjustments.length > 0 && <div class="muted">建议：{r.analysis.adjustments.map((a) => a.text).join('；')}</div>}
        </div>
      )}
      {info.coachNote && <div class="log" style={{ marginTop: 10 }}>{info.coachNote}{setup.coach ? `\n\n${setup.coach.log.slice(-6).join('\n')}` : ''}</div>}
      {info.next && count > 0 && <div class="gold-text" style={{ marginTop: 8 }}>{count} 秒后自动开始下一次尝试…</div>}
      <div class="row" style={{ justifyContent: 'center', marginTop: 16 }}>
        {info.next && <Btn kind="primary" onClick={() => navigate({ name: 'battle', setup: info.next! }, true)}>立即继续</Btn>}
        {info.next && <Btn onClick={() => setCount(-1)}>停止自动</Btn>}
        {info.won && nextId && !setup.coach && (
          <Btn kind="primary" onClick={() => navigate({ name: 'deck', setup: { ...setup, level: CONTENT.level(nextId)!, deck: undefined, seed: undefined } }, true)}>下一关</Btn>
        )}
        <Btn onClick={() => navigate({ name: 'battle', setup: { ...setup, seed: undefined, coach: undefined } }, true)}>再来一次</Btn>
        <Btn onClick={() => navigate({ name: 'report', report: info.report })}>查看战报</Btn>
        <Btn kind="ghost" onClick={() => (setup.testMode ? back() : setup.mode === 'adventure' ? navigate({ name: 'levels' }, true) : home())}>返回</Btn>
      </div>
    </Modal>
  );
}

export { RANK_COST_MUL };
