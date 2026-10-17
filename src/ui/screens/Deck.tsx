import { useMemo, useState } from 'preact/hooks';
import { CONTENT } from '../../core/content/registry';
import { SKILLS, ITEMS } from '../../core/content/abilities';
import { RuleEngine } from '../../core/rules/ruleEngine';
import { buildDeck } from '../../ai/deckBuilder';
import { STRATEGIES, getStrategy } from '../../ai/strategies';
import { navigate, back, type BattleSetup } from '../../app/nav';
import { CONTROL_NAMES, type ControlMode } from '../../app/game';
import { store, useStore } from '../../app/store';
import { Btn, CardTile, Select, TopBar, UnitTooltip, toast, useTooltip } from '../components/ui';
import { EnemyPreview, weatherText } from './Levels';

export function DeckScreen(props: { setup: BattleSetup }) {
  useStore();
  const { setup } = props;
  const p = store.profile;
  const L = setup.level;
  const rules = useMemo(() => (setup.rules ? new RuleEngine(setup.rules) : null), [setup.rules]);
  const slots = Math.min(L.deckSize ?? p.deckSlots, rules?.c.maxDeckSize ?? 99);
  const pool = p.unlockedCards.filter((id) => CONTENT.units.get(id));
  const allowed = (id: string) => !rules || rules.isCardAllowed(CONTENT.unit(id)).ok;
  const forced = (L.forcedCards ?? []).filter((id) => pool.includes(id));
  const usable = (id: string) => pool.includes(id) && allowed(id) && !L.bannedCards?.includes(id);
  let initial = (setup.deck ?? p.lastDeck ?? []).filter(usable);
  // 新档案/卡牌较少时：自动带上所有可用卡牌
  if (!initial.length || pool.filter(usable).length <= slots) initial = [...new Set([...initial, ...pool.filter(usable)])];
  const [deck, setDeck] = useState<string[]>([...new Set([...forced, ...initial])].slice(0, slots));
  const [skills, setSkills] = useState<string[]>((setup.skills ?? p.lastSkills ?? []).filter((s) => p.unlockedSkills.includes(s) && (!rules || rules.isSkillAllowed(s))).slice(0, 2));
  const [items, setItems] = useState<Record<string, number>>({});
  const [control, setControl] = useState<ControlMode>(setup.control ?? 'human');
  const [strategy, setStrategy] = useState(setup.strategy ?? 'balanced');
  const [difficulty, setDifficulty] = useState(setup.difficulty ?? store.settings.difficulty);
  const [tip, onTip] = useTooltip();
  const [reasons, setReasons] = useState<string[]>([]);

  const toggle = (id: string) => {
    if (forced.includes(id)) return toast('关卡指定卡牌不能移除', 'bad');
    if (deck.includes(id)) setDeck(deck.filter((x) => x !== id));
    else if (deck.length < slots) setDeck([...deck, id]);
    else toast(`卡槽已满（${slots} 张）`, 'bad');
  };

  const recommend = () => {
    const kk = store.data.aiKnowledge[L.id];
    const r = buildDeck({ level: L, available: pool, size: slots, strategy: kk?.params ?? getStrategy(strategy), rules, include: kk?.include, exclude: kk?.exclude });
    setDeck(r.deck);
    setReasons(r.reasons);
  };

  const start = () => {
    const errs = rules ? rules.validateDeck(deck, skills, items) : [];
    if (errs.length) return toast(errs[0], 'bad');
    if (!deck.length) return toast('请至少选择一张卡牌', 'bad');
    store.update(['profiles'], () => {
      p.lastDeck = deck;
      p.lastSkills = skills;
    });
    navigate({ name: 'battle', setup: { ...setup, deck, skills, items, control, strategy, difficulty } }, true);
  };

  return (
    <div class="screen">
      <TopBar title={`准备战斗 · ${L.name}`} onBack={() => back()}>
        <Btn onClick={recommend} title="根据关卡敌人、地形、天气与 AI 经验推荐卡组">🤖 AI 推荐卡组</Btn>
        <Btn kind="primary" onClick={start}>开始战斗 ▶</Btn>
      </TopBar>
      <div class="content" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 14 }}>
        <div class="col" style={{ gap: 14 }}>
          <div class="panel">
            <h3>已选卡组（{deck.length}/{slots}）</h3>
            <div class="row" style={{ minHeight: 100 }}>
              {deck.map((id) => (
                <CardTile def={CONTENT.unit(id)} selected onClick={() => toggle(id)} onHover={onTip} />
              ))}
              {Array.from({ length: Math.max(0, slots - deck.length) }).map(() => (
                <div class="card" style={{ opacity: 0.25, cursor: 'default' }} />
              ))}
            </div>
            {reasons.length > 0 && <div class="muted" style={{ fontSize: 12, marginTop: 6 }}>AI 选卡依据：{reasons.join('；')}</div>}
          </div>
          <div class="panel">
            <h3>可用卡牌</h3>
            <div class="row">
              {CONTENT.allUnits().map((d) => {
                const unlocked = pool.includes(d.id);
                const ok = unlocked && allowed(d.id) && !L.bannedCards?.includes(d.id);
                return <CardTile def={d} locked={!unlocked} disabled={!ok} selected={deck.includes(d.id)} onClick={() => (ok ? toggle(d.id) : toast(rules?.isCardAllowed(d).reason ?? '该卡牌不可用', 'bad'))} onHover={unlocked ? onTip : undefined} />;
              })}
            </div>
          </div>
          <div class="panel">
            <h3>技能（最多 2 个）与道具</h3>
            <div class="row">
              {SKILLS.map((s) => {
                const un = p.unlockedSkills.includes(s.id);
                const ok = un && (!rules || rules.isSkillAllowed(s.id));
                const sel = skills.includes(s.id);
                return (
                  <Btn small active={sel} disabled={!ok} title={un ? s.desc : '在商店或冒险中解锁'} onClick={() => setSkills(sel ? skills.filter((x) => x !== s.id) : skills.length < 2 ? [...skills, s.id] : skills)}>
                    {s.icon} {s.name}
                  </Btn>
                );
              })}
            </div>
            <div class="row" style={{ marginTop: 10 }}>
              {ITEMS.map((it) => {
                const have = p.items[it.id] ?? 0;
                const n = items[it.id] ?? 0;
                const ok = have > 0 && (!rules || rules.isItemAllowed(it.id));
                return (
                  <Btn small disabled={!ok} active={n > 0} title={`${it.desc}（库存 ${have}）`} onClick={() => setItems({ ...items, [it.id]: n >= have ? 0 : n + 1 })}>
                    {it.icon} {it.name} {n}/{have}
                  </Btn>
                );
              })}
            </div>
          </div>
        </div>
        <div class="col" style={{ gap: 14 }}>
          <div class="panel">
            <h3>关卡情报</h3>
            <div class="muted" style={{ marginBottom: 8 }}>{L.desc}</div>
            <div class="kv">
              <span>地图</span>
              <span>{CONTENT.resolveMap(L.map).name}</span>
              <span>时间</span>
              <span>{L.time === 'night' ? '夜晚（只有月华光能）' : '白天'}</span>
              <span>天气</span>
              <span>{weatherText(L)}</span>
              <span>初始光能</span>
              <span>{rules?.c.startLumen ?? L.startLumen}</span>
              <span>随机事件</span>
              <span>{L.events?.enabled ? '开启' : '关闭'}</span>
            </div>
            <h4>出现的敌人</h4>
            <EnemyPreview ids={L.enemyPool} />
          </div>
          {setup.rules && (
            <div class="panel">
              <h3>挑战规则：{setup.rules.name}</h3>
              {rules!.describe().map((r) => (
                <div class="muted">· {r}</div>
              ))}
            </div>
          )}
          <div class="panel">
            <h3>操作方式</h3>
            <Select label="控制" value={control} options={(Object.keys(CONTROL_NAMES) as ControlMode[]).map((k) => ({ value: k, label: CONTROL_NAMES[k] }))} onChange={setControl} />
            <Select label="AI 策略" value={strategy} options={STRATEGIES.map((s) => ({ value: s.id, label: s.name }))} onChange={setStrategy} />
            <Select
              label="难度"
              value={difficulty}
              options={[
                { value: 0.7, label: '简单（敌人生命 ×0.7）' },
                { value: 1, label: '普通' },
                { value: 1.35, label: '困难（×1.35）' },
                { value: 1.8, label: '噩梦（×1.8）' },
              ]}
              onChange={setDifficulty}
            />
            <div class="dim" style={{ fontSize: 12 }}>战斗中按 Tab 可随时在人类与 AI 之间切换。</div>
            <div class="row" style={{ marginTop: 8 }}>
              <Btn
                small
                onClick={() => {
                  const ids = [...CONTENT.levels.keys()];
                  const from = ids.indexOf(L.id);
                  const list = from >= 0 && setup.mode === 'adventure' ? ids.slice(from, from + 6).filter((id) => CONTENT.level(id)?.chapter) : [L.id];
                  const kk = store.data.aiKnowledge[L.id];
                  const d = buildDeck({ level: L, available: pool, size: slots, strategy: kk?.params ?? getStrategy(strategy), include: kk?.include, exclude: kk?.exclude }).deck;
                  navigate({ name: 'battle', setup: { ...setup, deck: d, control: 'ai', strategy, difficulty, coach: { levels: list, index: 0, attempt: 1, maxAttempts: 4, strategy, log: [] } } }, true);
                }}
                title="AI 从本关开始连续挑战，失败后分析原因、调整策略并自动重试"
              >
                🤖 AI 自动连续闯关
              </Btn>
            </div>
          </div>
        </div>
      </div>
      {tip && <UnitTooltip def={tip.def} x={tip.x} y={tip.y} level={p.upgrades[tip.def.id]} />}
    </div>
  );
}
