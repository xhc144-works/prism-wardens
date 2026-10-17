import { useState } from 'preact/hooks';
import type { AutoDeploy, CheatConfig, EnemyMul, StatMul } from '../../core/types';
import { CONTENT } from '../../core/content/registry';
import { cloneCheats, DEFAULT_CHEATS } from '../../core/cheats/presets';
import { unlockEverything } from '../../core/meta/profile';
import { back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { Btn, NumberField, Select, Slider, Toggle, TopBar, toast } from '../components/ui';

export type CheatAction = { type: 'setLumen'; value: number } | { type: 'killAll' } | { type: 'spawn'; enemy: string; row: number };

const mulFmt = (v: number) => `×${v.toFixed(2)}`;

function MulSliders<T extends StatMul | EnemyMul>(props: { value: T; keys: { k: keyof T; label: string; max?: number }[]; onChange: (v: T) => void }) {
  return (
    <div class="col" style={{ gap: 2 }}>
      {props.keys.map(({ k, label, max }) => (
        <Slider
          label={label}
          value={(props.value[k] as unknown as number) ?? 1}
          min={0}
          max={max ?? 10}
          step={0.05}
          format={mulFmt}
          onChange={(v) => props.onChange({ ...props.value, [k]: v })}
        />
      ))}
    </div>
  );
}

const UNIT_KEYS: { k: keyof StatMul; label: string; max?: number }[] = [
  { k: 'damage', label: '攻击力' },
  { k: 'rate', label: '攻速/产速' },
  { k: 'hp', label: '生命值' },
  { k: 'cost', label: '费用', max: 3 },
  { k: 'cooldown', label: '冷却时间', max: 3 },
];
const ENEMY_KEYS: { k: keyof EnemyMul; label: string; max?: number }[] = [
  { k: 'hp', label: '生命值' },
  { k: 'speed', label: '移动速度', max: 5 },
  { k: 'count', label: '数量', max: 10 },
  { k: 'spawnRate', label: '生成频率', max: 10 },
  { k: 'damage', label: '攻击力', max: 5 },
];

/** 修改器编辑器（独立页面与战斗内面板共用） */
export function CheatEditor(props: { value: CheatConfig; onChange: (c: CheatConfig) => void; compact?: boolean; onAction?: (a: CheatAction) => void }) {
  const c = cloneCheats(props.value);
  const set = (patch: Partial<CheatConfig>) => props.onChange({ ...c, ...patch });
  const [perUnit, setPerUnit] = useState(CONTENT.allUnits()[0].id);
  const [perEnemy, setPerEnemy] = useState('husk');
  const [lumen, setLumen] = useState(9999);
  const [spawn, setSpawn] = useState({ enemy: 'husk', row: 0 });
  const [presetName, setPresetName] = useState('');
  const data = useStore();
  const ad: AutoDeploy = c.autoDeploy ?? { unit: 'prism_shooter', interval: 5, mode: 'threat' };
  const units = CONTENT.allUnits();
  const enemies = CONTENT.allEnemies();
  const grid = props.compact ? '1fr' : 'repeat(auto-fit, minmax(340px, 1fr))';
  return (
    <div class="grid" style={{ gridTemplateColumns: grid }}>
      <div class="panel">
        <h3>资源</h3>
        <div class="col">
          <Toggle label="无限光能" value={!!c.infiniteLumen} onChange={(v) => set({ infiniteLumen: v })} />
          <Toggle label="取消资源消耗（卡牌免费）" value={!!c.freeCards} onChange={(v) => set({ freeCards: v })} />
          <Toggle label="取消卡牌冷却" value={!!c.noCooldown} onChange={(v) => set({ noCooldown: v })} />
          <Toggle label="自动收集光能" value={!!c.autoCollect} onChange={(v) => set({ autoCollect: v })} />
          {props.onAction && (
            <div class="row">
              <input type="number" value={lumen} onChange={(e) => setLumen(Number((e.target as HTMLInputElement).value))} />
              <Btn small onClick={() => props.onAction!({ type: 'setLumen', value: lumen })}>设置光能</Btn>
            </div>
          )}
        </div>
      </div>
      <div class="panel">
        <h3>防御单位（全局倍率）</h3>
        <MulSliders value={c.unit ?? {}} keys={UNIT_KEYS} onChange={(v) => set({ unit: v })} />
        <h4>单独调整某个单位</h4>
        <Select value={perUnit} options={units.map((u) => ({ value: u.id, label: u.name }))} onChange={setPerUnit} />
        <MulSliders value={c.perUnit?.[perUnit] ?? {}} keys={UNIT_KEYS} onChange={(v) => set({ perUnit: { ...(c.perUnit ?? {}), [perUnit]: v } })} />
        {c.perUnit && Object.keys(c.perUnit).length > 0 && (
          <div class="dim" style={{ fontSize: 12 }}>
            已单独调整：{Object.keys(c.perUnit).map((k) => CONTENT.units.get(k)?.name ?? k).join('、')}{' '}
            <a style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => set({ perUnit: {} })}>清除</a>
          </div>
        )}
      </div>
      <div class="panel">
        <h3>敌人（全局倍率）</h3>
        <MulSliders value={c.enemy ?? {}} keys={ENEMY_KEYS} onChange={(v) => set({ enemy: v })} />
        <h4>单独调整某种敌人</h4>
        <Select value={perEnemy} options={enemies.map((u) => ({ value: u.id, label: u.name }))} onChange={setPerEnemy} />
        <MulSliders value={c.perEnemy?.[perEnemy] ?? {}} keys={ENEMY_KEYS.filter((k) => k.k !== 'spawnRate' && k.k !== 'damage')} onChange={(v) => set({ perEnemy: { ...(c.perEnemy ?? {}), [perEnemy]: v } })} />
        {props.onAction && (
          <>
            <h4>即时操作</h4>
            <div class="row">
              <Select value={spawn.enemy} options={enemies.map((u) => ({ value: u.id, label: u.name }))} onChange={(v) => setSpawn({ ...spawn, enemy: v })} />
              <Select value={spawn.row} options={[0, 1, 2, 3, 4, 5].map((r) => ({ value: r, label: `第${r + 1}行` }))} onChange={(v) => setSpawn({ ...spawn, row: v })} />
              <Btn small onClick={() => props.onAction!({ type: 'spawn', ...spawn })}>生成敌人</Btn>
              <Btn small kind="danger" onClick={() => props.onAction!({ type: 'killAll' })}>消灭全部敌人</Btn>
            </div>
          </>
        )}
      </div>
      <div class="panel">
        <h3>自动化与保护</h3>
        <div class="col">
          <Toggle label="自动部署指定单位" value={!!c.autoDeploy} onChange={(v) => set({ autoDeploy: v ? ad : null })} />
          {c.autoDeploy && (
            <div class="col" style={{ paddingLeft: 20 }}>
              <Select label="单位" value={ad.unit} options={units.map((u) => ({ value: u.id, label: u.name }))} onChange={(v) => set({ autoDeploy: { ...ad, unit: v } })} />
              <NumberField label="间隔（秒）" value={ad.interval} min={0.5} step={0.5} onChange={(v) => set({ autoDeploy: { ...ad, interval: v ?? 5 } })} />
              <Select
                label="部署位置"
                value={ad.mode}
                options={[
                  { value: 'threat', label: '威胁最大的行' },
                  { value: 'front', label: '最前线' },
                  { value: 'back', label: '后排优先' },
                  { value: 'fill', label: '依次填满' },
                ]}
                onChange={(v) => set({ autoDeploy: { ...ad, mode: v } })}
              />
            </div>
          )}
          <Toggle label="守卫无敌" value={!!c.invincibleUnits} onChange={(v) => set({ invincibleUnits: v })} />
          <Toggle label="无限符文哨卫" value={!!c.infiniteSentinels} onChange={(v) => set({ infiniteSentinels: v })} />
          <Toggle label="一击必杀" value={!!c.oneHitKill} onChange={(v) => set({ oneHitKill: v })} />
          <Toggle label="永不失败（突破不判负）" value={!!c.noLose} onChange={(v) => set({ noLose: v })} />
        </div>
      </div>
      <div class="panel">
        <h3>预设</h3>
        <div class="col">
          {store.allCheatPresets().map((p) => (
            <div class="row" style={{ justifyContent: 'space-between' }}>
              <span>{p.name}</span>
              <div class="row" style={{ gap: 4 }}>
                <Btn
                  small
                  onClick={() => {
                    props.onChange(cloneCheats(p.config));
                    store.update(['settings'], (d) => {
                      d.settings.activePreset = p.id;
                    });
                    toast(`已应用预设：${p.name}`, 'good');
                  }}
                >
                  应用
                </Btn>
                {!p.builtin && (
                  <Btn small kind="danger" onClick={() => store.update(['cheatPresets'], (d) => (d.cheatPresets = d.cheatPresets.filter((x) => x.id !== p.id)))}>
                    删除
                  </Btn>
                )}
              </div>
            </div>
          ))}
          <div class="row">
            <input type="text" placeholder="预设名称" value={presetName} onInput={(e) => setPresetName((e.target as HTMLInputElement).value)} />
            <Btn
              small
              kind="primary"
              disabled={!presetName.trim()}
              onClick={() => {
                store.update(['cheatPresets'], (d) => d.cheatPresets.push({ id: `cp_${Date.now()}`, name: presetName.trim(), config: cloneCheats(c) }));
                setPresetName('');
                toast('预设已保存', 'good');
              }}
            >
              保存当前为预设
            </Btn>
          </div>
          <Btn kind="ghost" onClick={() => props.onChange(cloneCheats(DEFAULT_CHEATS))}>恢复默认（全部关闭）</Btn>
          <span class="dim" style={{ fontSize: 12 }}>共 {data.cheatPresets.length} 个自定义预设</span>
        </div>
      </div>
    </div>
  );
}

export function CheatsScreen() {
  const data = useStore();
  const s = data.settings;
  const p = store.profile;
  const [coins, setCoins] = useState(p.coins);
  return (
    <div class="screen">
      <TopBar title="游戏修改器" onBack={() => back()}>
        <Toggle
          label="在战斗中启用修改器"
          value={s.cheatsEnabled}
          onChange={(v) =>
            store.update(['settings'], (d) => {
              d.settings.cheatsEnabled = v;
            })
          }
        />
      </TopBar>
      <div class="content">
        <div class="panel" style={{ marginBottom: 12 }}>
          <h3>说明</h3>
          <div class="muted">
            修改器在游戏内部直接生效：开启后每场战斗开始时自动应用下方配置，战斗中也可以通过底部「🛠 修改器」按钮实时调整。游戏加速/减速/暂停/逐帧在战斗底部栏。
            使用修改器的对局会被标记，不计入成就；<b>挑战模式下修改器被强制禁用</b>，AI 同样无法使用。
          </div>
        </div>
        <div class="panel" style={{ marginBottom: 12 }}>
          <h3>存档修改（当前档案：{p.name}）</h3>
          <div class="row">
            <Btn
              kind="gold"
              onClick={() => {
                unlockEverything(p);
                store.saveProfile();
                toast('已解锁全部卡牌、关卡、技能与道具', 'gold');
              }}
            >
              一键解锁全部内容
            </Btn>
            <span class="muted">金币</span>
            <input type="number" value={coins} onChange={(e) => setCoins(Number((e.target as HTMLInputElement).value))} />
            <Btn
              onClick={() => {
                p.coins = Math.max(0, Math.round(coins));
                store.saveProfile();
                toast('金币已修改', 'good');
              }}
            >
              设置金币
            </Btn>
            <Btn
              onClick={() => {
                p.coins = 999999;
                setCoins(999999);
                store.saveProfile();
              }}
            >
              无限金币
            </Btn>
            <Btn
              onClick={() => {
                for (const id of p.unlockedCards) p.upgrades[id] = 5;
                store.saveProfile();
                toast('所有已解锁单位升到满级', 'good');
              }}
            >
              全部单位满级
            </Btn>
          </div>
        </div>
        <CheatEditor
          value={s.cheats}
          onChange={(cfg) =>
            store.update(['settings'], (d) => {
              d.settings.cheats = cfg;
            })
          }
        />
      </div>
    </div>
  );
}
