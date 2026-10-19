import { useState } from 'preact/hooks';
import type { EnemyDef, UnitDef, UnitBehavior, UnitCategory, AttackKind, ProjKind } from '../../core/types';
import { CONTENT, type ContentPack } from '../../core/content/registry';
import { UNITS } from '../../core/content/units';
import { ENEMIES } from '../../core/content/enemies';
import { categoryName, attackName } from '../../core/rules/ruleEngine';
import { back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { exportFile, importFile } from '../../platform/storage';
import { unitIcon, enemyIcon, clearIconCache } from '../../render/icons';
import { UNIT_ART_KEYS } from '../../render/art/units';
import { ENEMY_ART_KEYS } from '../../render/art/enemies';
import { Btn, NumberField, Select, Tabs, Toggle, TopBar, toast } from '../components/ui';
import { SCREENS } from './registry';

const BEHAVIORS: { v: UnitBehavior; l: string }[] = [
  { v: 'producer', l: '生产光能' },
  { v: 'shooter', l: '直线射击' },
  { v: 'lobber', l: '抛射' },
  { v: 'chain', l: '连锁闪电' },
  { v: 'wall', l: '屏障' },
  { v: 'spike', l: '地刺（可踩过）' },
  { v: 'mine', l: '地雷（充能后触发）' },
  { v: 'instantBomb', l: '范围爆炸（瞬发）' },
  { v: 'laneBomb', l: '整行爆炸（瞬发）' },
  { v: 'freezeAll', l: '全场冻结（瞬发）' },
  { v: 'gale', l: '吹走飞行（瞬发）' },
  { v: 'devourer', l: '吞噬' },
  { v: 'totem', l: '火焰图腾' },
  { v: 'bell', l: '攻速光环' },
  { v: 'mender', l: '治疗光环' },
  { v: 'plate', l: '水上平台' },
  { v: 'lurker', l: '水中拖拽' },
  { v: 'lantern', l: '照明' },
  { v: 'magnet', l: '吸取金属' },
  { v: 'gravity', l: '引力推回' },
  { v: 'upgradeProducer', l: '升级型生产' },
];
const CATS: UnitCategory[] = ['producer', 'shooter', 'lobber', 'wall', 'trap', 'bomb', 'melee', 'support', 'aquatic', 'utility'];
const ATKS: AttackKind[] = ['projectile', 'lob', 'chain', 'melee', 'instant', 'aura', 'none'];
const PROJ: ProjKind[] = ['bolt', 'frost', 'fire', 'steam', 'thorn', 'rock', 'meteor', 'moon', 'spark'];

function Color(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div class="field">
      <span class="label">{props.label}</span>
      <input type="color" value={props.value} onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />
      <span class="code">{props.value}</span>
    </div>
  );
}

function Text(props: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <div class="field">
      <span class="label">{props.label}</span>
      <input type="text" value={props.value} style={props.wide ? { flex: 1 } : undefined} onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />
    </div>
  );
}

function UnitForm(props: { def: UnitDef; set: (d: UnitDef) => void }) {
  const d = props.def;
  const s = (p: Partial<UnitDef>) => props.set({ ...d, ...p });
  const num = (label: string, k: keyof UnitDef, step = 1) => <NumberField label={label} value={d[k] as number | undefined} allowEmpty step={step} onChange={(v) => s({ [k]: v } as Partial<UnitDef>)} />;
  return (
    <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', alignContent: 'start' }}>
      <div class="panel">
        <h3>基本</h3>
        <Text label="名称" value={d.name} onChange={(v) => s({ name: v })} />
        <Text label="英文名" value={d.nameEn} onChange={(v) => s({ nameEn: v })} />
        <Text label="描述" value={d.desc} wide onChange={(v) => s({ desc: v })} />
        <Select label="类型" value={d.category} options={CATS.map((c) => ({ value: c, label: categoryName(c) }))} onChange={(v) => s({ category: v })} />
        <Select label="攻击方式" value={d.attack} options={ATKS.map((c) => ({ value: c, label: attackName(c) }))} onChange={(v) => s({ attack: v })} />
        <Select label="行为模板" value={d.behavior} options={BEHAVIORS.map((b) => ({ value: b.v, label: b.l }))} onChange={(v) => s({ behavior: v, instant: ['instantBomb', 'laneBomb', 'freezeAll', 'gale'].includes(v) || undefined })} />
        {num('费用', 'cost', 5)}
        {num('冷却（秒）', 'cooldown', 0.5)}
        {num('生命', 'hp', 50)}
      </div>
      <div class="panel">
        <h3>战斗属性</h3>
        {num('伤害', 'damage')}
        {num('间隔（秒）', 'interval', 0.1)}
        {num('每轮发射数', 'shots')}
        {num('向后发射数', 'back')}
        {num('射程/作用范围', 'range', 0.1)}
        {num('溅射半径', 'splash', 0.1)}
        {num('溅射伤害比例', 'splashMul', 0.05)}
        {num('弹速', 'projSpeed', 0.5)}
        <Select label="弹道外观" value={d.projKind ?? 'bolt'} options={PROJ.map((p) => ({ value: p, label: p }))} onChange={(v) => s({ projKind: v })} />
        <Toggle label="覆盖上下相邻三行" value={!!d.lanes && d.lanes.length > 1} onChange={(v) => s({ lanes: v ? [-1, 0, 1] : undefined })} />
        <Toggle label="穿透" value={!!d.pierce} onChange={(v) => s({ pierce: v || undefined })} />
        <Toggle label="可对空" value={!!d.antiAir} onChange={(v) => s({ antiAir: v || undefined })} />
        <Toggle label="减速" value={!!d.slow} onChange={(v) => s({ slow: v ? { mul: 0.5, dur: 8 } : undefined })} />
        {d.slow && (
          <>
            <NumberField label="减速后速度倍率" value={d.slow.mul} step={0.05} onChange={(v) => s({ slow: { ...d.slow!, mul: v ?? 0.5 } })} />
            <NumberField label="减速持续（秒）" value={d.slow.dur} step={0.5} onChange={(v) => s({ slow: { ...d.slow!, dur: v ?? 8 } })} />
          </>
        )}
      </div>
      <div class="panel">
        <h3>特殊属性</h3>
        {num('生产光能', 'produce', 5)}
        {num('充能时间', 'armTime', 0.5)}
        {num('引信（秒）', 'fuse', 0.1)}
        {num('爆炸/照明半径', 'radius', 0.1)}
        {num('连锁次数', 'chains')}
        {num('连锁范围', 'chainRange', 0.1)}
        {num('治疗/秒', 'heal', 5)}
        {num('攻速加成', 'buffRate', 0.05)}
        {num('消化时间', 'digest', 1)}
        {num('夜晚伤害倍率', 'lunar', 0.1)}
        {num('白天伤害倍率', 'solar', 0.1)}
        <Toggle label="水生（只能放水面）" value={!!d.aquatic} onChange={(v) => s({ aquatic: v || undefined })} />
        <Toggle label="高大（阻挡跳跃）" value={!!d.tall} onChange={(v) => s({ tall: v || undefined })} />
        <Toggle label="可被踩过（不阻挡）" value={!!d.noBite} onChange={(v) => s({ noBite: v || undefined })} />
      </div>
      <div class="panel">
        <h3>外观</h3>
        <Select label="造型" value={d.art} options={UNIT_ART_KEYS.map((k) => ({ value: k, label: k }))} onChange={(v) => s({ art: v })} />
        <Color label="主色" value={d.colors.a} onChange={(v) => s({ colors: { ...d.colors, a: v } })} />
        <Color label="副色" value={d.colors.b} onChange={(v) => s({ colors: { ...d.colors, b: v } })} />
        <Color label="发光" value={d.colors.glow} onChange={(v) => s({ colors: { ...d.colors, glow: v } })} />
      </div>
    </div>
  );
}

function EnemyForm(props: { def: EnemyDef; set: (d: EnemyDef) => void }) {
  const d = props.def;
  const s = (p: Partial<EnemyDef>) => props.set({ ...d, ...p });
  const flag = (label: string, k: keyof EnemyDef) => <Toggle label={label} value={!!d[k]} onChange={(v) => s({ [k]: v || undefined } as Partial<EnemyDef>)} />;
  return (
    <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', alignContent: 'start' }}>
      <div class="panel">
        <h3>基本</h3>
        <Text label="名称" value={d.name} onChange={(v) => s({ name: v })} />
        <Text label="英文名" value={d.nameEn} onChange={(v) => s({ nameEn: v })} />
        <Text label="描述" value={d.desc} wide onChange={(v) => s({ desc: v })} />
        <NumberField label="生命" value={d.hp} step={25} onChange={(v) => s({ hp: v ?? 200 })} />
        <NumberField label="速度（格/秒）" value={d.speed} step={0.01} onChange={(v) => s({ speed: v ?? 0.24 })} />
        <NumberField label="啃咬伤害/秒" value={d.dps} step={10} onChange={(v) => s({ dps: v ?? 100 })} />
        <NumberField label="波次预算点" value={d.cost} step={1} onChange={(v) => s({ cost: Math.max(1, v ?? 1) })} />
        <NumberField label="生成权重" value={d.weight} step={1} onChange={(v) => s({ weight: v ?? 1 })} />
        <NumberField label="最早出现波次" value={d.minWave} allowEmpty onChange={(v) => s({ minWave: v })} />
        <NumberField label="金币掉率" value={d.coin} step={0.01} onChange={(v) => s({ coin: v ?? 0.05 })} />
      </div>
      <div class="panel">
        <h3>护甲</h3>
        <Toggle label="有护甲" value={!!d.armor} onChange={(v) => s({ armor: v ? { kind: 'helm', hp: 400, metal: false } : undefined })} />
        {d.armor && (
          <>
            <Select label="护甲类型" value={d.armor.kind} options={[{ value: 'helm', label: '头盔' }, { value: 'shield', label: '塔盾（挡直射）' }, { value: 'mask', label: '面具' }]} onChange={(v) => s({ armor: { ...d.armor!, kind: v } })} />
            <NumberField label="护甲值" value={d.armor.hp} step={50} onChange={(v) => s({ armor: { ...d.armor!, hp: v ?? 400 } })} />
            <Toggle label="金属（可被磁晶吸走）" value={d.armor.metal} onChange={(v) => s({ armor: { ...d.armor!, metal: v } })} />
          </>
        )}
      </div>
      <div class="panel">
        <h3>能力</h3>
        <div class="row">
          {flag('飞行', 'flying')}
          {flag('掘地', 'burrow')}
          {flag('潜水', 'swim')}
          {flag('载具', 'vehicle')}
          {flag('跳跃', 'jumper')}
          {flag('召唤', 'summoner')}
          {flag('治疗', 'healer')}
          {flag('隐身', 'stealth')}
          {flag('碾压', 'crusher')}
          {flag('自爆', 'bomber')}
          {flag('投石', 'catapult')}
          {flag('狂暴', 'berserk')}
          {flag('投掷小魔', 'thrower')}
          {flag('破墙', 'ram')}
        </div>
      </div>
      <div class="panel">
        <h3>外观</h3>
        <Select label="造型" value={d.art} options={ENEMY_ART_KEYS.filter((k) => !['wyrm', 'tempest', 'king'].includes(k)).map((k) => ({ value: k, label: k }))} onChange={(v) => s({ art: v })} />
        <NumberField label="体型缩放" value={d.scale} step={0.05} onChange={(v) => s({ scale: v ?? 1 })} />
        <Color label="主色" value={d.colors.a} onChange={(v) => s({ colors: { ...d.colors, a: v } })} />
        <Color label="暗色" value={d.colors.b} onChange={(v) => s({ colors: { ...d.colors, b: v } })} />
        <Color label="眼睛" value={d.colors.eye} onChange={(v) => s({ colors: { ...d.colors, eye: v } })} />
      </div>
    </div>
  );
}

function UnitEditorScreen() {
  const data = useStore();
  const [tab, setTab] = useState<'units' | 'enemies'>('units');
  const pack = data.customPack;
  const [unit, setUnit] = useState<UnitDef | null>(null);
  const [enemy, setEnemy] = useState<EnemyDef | null>(null);
  const savePack = (fn: (p: ContentPack) => void) => {
    store.update(['customPack'], (d) => fn(d.customPack));
    clearIconCache();
  };
  const saveUnit = (u: UnitDef) => {
    savePack((p) => {
      const list = (p.units ??= []);
      const i = list.findIndex((x) => x.id === u.id);
      if (i >= 0) list[i] = u;
      else list.push(u);
    });
    toast(`已保存：${u.name}`, 'good');
  };
  const saveEnemy = (e: EnemyDef) => {
    savePack((p) => {
      const list = (p.enemies ??= []);
      const i = list.findIndex((x) => x.id === e.id);
      if (i >= 0) list[i] = e;
      else list.push(e);
    });
    toast(`已保存：${e.name}`, 'good');
  };
  return (
    <div class="screen">
      <TopBar title="单位编辑器" onBack={() => back()}>
        <Btn onClick={async () => {
          const f = await importFile('.json');
          if (!f) return;
          try {
            const o = JSON.parse(f.content) as ContentPack;
            if (o.format !== 'prism-wardens-pack') throw new Error('不是内容包文件');
            savePack((p) => {
              for (const u of o.units ?? []) if (!(p.units ??= []).some((x) => x.id === u.id)) p.units.push(u);
              for (const e of o.enemies ?? []) if (!(p.enemies ??= []).some((x) => x.id === e.id)) p.enemies.push(e);
              for (const l of o.levels ?? []) if (!(p.levels ??= []).some((x) => x.id === l.id)) p.levels.push(l);
            });
            toast('内容包已导入', 'good');
          } catch (e) {
            toast(`导入失败：${(e as Error).message}`, 'bad');
          }
        }}>导入内容包</Btn>
        <Btn onClick={() => void exportFile('棱镜守卫-自定义内容包.json', JSON.stringify(pack, null, 2))}>导出全部自定义内容</Btn>
      </TopBar>
      <div class="content">
        <Tabs tabs={[{ id: 'units', label: `守卫（自定义 ${pack.units?.length ?? 0}）` }, { id: 'enemies', label: `敌人（自定义 ${pack.enemies?.length ?? 0}）` }]} value={tab} onChange={setTab} />
        {tab === 'units' && (
          <div class="col" style={{ gap: 12 }}>
            <div class="panel">
              <div class="row">
                <span class="muted">以现有单位为模板新建：</span>
                <Select value="" options={[{ value: '', label: '选择模板…' }, ...UNITS.map((u) => ({ value: u.id, label: u.name }))]} onChange={(id) => {
                  if (!id) return;
                  const base = UNITS.find((u) => u.id === id)!;
                  setUnit({ ...JSON.parse(JSON.stringify(base)), id: `cu_${Date.now().toString(36)}`, name: `${base.name}·改`, custom: true });
                }} />
                <span class="muted">或修改内置单位（平衡性修改）：</span>
                <Select value="" options={[{ value: '', label: '选择内置单位…' }, ...UNITS.map((u) => ({ value: u.id, label: u.name }))]} onChange={(id) => id && setUnit(JSON.parse(JSON.stringify(CONTENT.unit(id))))} />
              </div>
              <div class="row" style={{ marginTop: 8 }}>
                {(pack.units ?? []).map((u) => (
                  <div class="row" style={{ gap: 4, border: '1px solid var(--line)', borderRadius: 10, padding: 4 }}>
                    <img src={unitIcon(u, 40)} style={{ width: 40, height: 40 }} />
                    <span>{u.name}{UNITS.some((b) => b.id === u.id) ? '（覆盖内置）' : ''}</span>
                    <Btn small onClick={() => setUnit(JSON.parse(JSON.stringify(u)))}>编辑</Btn>
                    <Btn small kind="danger" onClick={() => savePack((p) => (p.units = (p.units ?? []).filter((x) => x.id !== u.id)))}>删除</Btn>
                  </div>
                ))}
              </div>
            </div>
            {unit && (
              <>
                <div class="panel row">
                  <img src={unitIcon(unit, 120)} style={{ width: 120, height: 120 }} key={JSON.stringify(unit.colors) + unit.art} />
                  <div>
                    <h3>{unit.name}</h3>
                    <div class="muted">ID：{unit.id}</div>
                    <div class="dim" style={{ fontSize: 12 }}>保存后会出现在选卡界面（需在存档中解锁：冒险奖励之外的自定义单位默认对所有存档可用）。</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <Btn kind="primary" onClick={() => {
                    saveUnit(unit);
                    for (const p of store.data.profiles) if (!p.unlockedCards.includes(unit.id)) p.unlockedCards.push(unit.id);
                    store.update(['profiles'], () => {});
                  }}>保存单位</Btn>
                </div>
                <UnitForm def={unit} set={setUnit} />
              </>
            )}
          </div>
        )}
        {tab === 'enemies' && (
          <div class="col" style={{ gap: 12 }}>
            <div class="panel">
              <div class="row">
                <span class="muted">以现有敌人为模板新建：</span>
                <Select value="" options={[{ value: '', label: '选择模板…' }, ...ENEMIES.filter((e) => !e.boss).map((u) => ({ value: u.id, label: u.name }))]} onChange={(id) => {
                  if (!id) return;
                  const base = ENEMIES.find((u) => u.id === id)!;
                  setEnemy({ ...JSON.parse(JSON.stringify(base)), id: `ce_${Date.now().toString(36)}`, name: `${base.name}·变异`, noSpawn: false, custom: true });
                }} />
                <span class="muted">或修改内置敌人：</span>
                <Select value="" options={[{ value: '', label: '选择内置敌人…' }, ...ENEMIES.map((u) => ({ value: u.id, label: u.name }))]} onChange={(id) => id && setEnemy(JSON.parse(JSON.stringify(CONTENT.enemy(id))))} />
              </div>
              <div class="row" style={{ marginTop: 8 }}>
                {(pack.enemies ?? []).map((e) => (
                  <div class="row" style={{ gap: 4, border: '1px solid var(--line)', borderRadius: 10, padding: 4 }}>
                    <img src={enemyIcon(e, 40)} style={{ width: 40, height: 40 }} />
                    <span>{e.name}</span>
                    <Btn small onClick={() => setEnemy(JSON.parse(JSON.stringify(e)))}>编辑</Btn>
                    <Btn small kind="danger" onClick={() => savePack((p) => (p.enemies = (p.enemies ?? []).filter((x) => x.id !== e.id)))}>删除</Btn>
                  </div>
                ))}
              </div>
              <div class="dim" style={{ fontSize: 12, marginTop: 6 }}>自定义敌人可以在关卡编辑器的波次中使用。</div>
            </div>
            {enemy && (
              <>
                <div class="panel row">
                  <img src={enemyIcon(enemy, 120)} style={{ width: 120, height: 120 }} key={JSON.stringify(enemy.colors) + enemy.art + enemy.scale} />
                  <div>
                    <h3>{enemy.name}</h3>
                    <div class="muted">ID：{enemy.id}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <Btn kind="primary" onClick={() => saveEnemy(enemy)}>保存敌人</Btn>
                </div>
                <EnemyForm def={enemy} set={setEnemy} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

SCREENS.unitEditor = () => <UnitEditorScreen />;
