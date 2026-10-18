/**
 * 经典皮肤的选卡界面：仿原版种子选择器——镜头停在街道上展示本关僵尸，
 * 左侧木质卡板选择种子包，上方卡槽显示已选植物，“一起摇滚吧！”开战。
 * 本作新增的操作方式、AI 策略、难度、技能道具放在右下角的石板面板中。
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CONTENT } from '../../core/content/registry';
import { SKILLS, ITEMS } from '../../core/content/abilities';
import { STRATEGIES } from '../../ai/strategies';
import { back, type BattleSetup } from '../../app/nav';
import { CONTROL_NAMES, type ControlMode } from '../../app/game';
import { useStore } from '../../app/store';
import { audio } from '../../audio/audio';
import { PVZ, PVZ_IMAGES } from '../../pvz/assets';
import { type Mat, translate } from '../../pvz/reanim';
import { ZOMBIE_SKINS } from '../../render/classic/skins';
import { ZombieActor } from '../../render/classic/actors';
import { makeLayout } from '../../render/classic/layout';
import { World } from '../../core/sim/world';
import { useDeckModel } from '../screens/Deck';
import { weatherText } from '../screens/Levels';
import { toast } from '../components/ui';
import { Stage } from './Stage';
import { PvzImage, SeedPacket } from './thumbs';

function themeBg(setup: BattleSetup): string {
  const w = new World({ mode: setup.mode, level: setup.level, deck: [], skills: [], items: {}, seed: 1 });
  return makeLayout(w).bg;
}

/** 街道上待命的僵尸（原版选卡时的镜头） */
function StreetBackdrop(props: { setup: BattleSetup }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const L = props.setup.level;
    const ids = [...new Set(L.enemyPool)].filter((id) => ZOMBIE_SKINS[id] && !CONTENT.enemies.get(id)?.boss);
    let raf = 0;
    let alive = true;
    const bgId = themeBg(props.setup);
    void (async () => {
      await PVZ.loadImage(bgId);
      await PVZ.loadReanimsWithImages([...new Set(ids.map((id) => ZOMBIE_SKINS[id].reanim)), 'Zombie_flagpole']);
      if (!alive) return;
      // 按出场权重摆放 8~12 只僵尸
      const n = Math.min(12, 6 + ids.length * 2);
      const zs: { a: ZombieActor; x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) {
        const id = ids[i % ids.length] ?? 'husk';
        const skin = ZOMBIE_SKINS[id];
        const def = PVZ.reanim(skin.reanim);
        if (!def) continue;
        const a = new ZombieActor(i, id, def, skin, PVZ.reanim('Zombie_flagpole'));
        const idle = skin.idle && a.body.has(skin.idle) ? skin.idle : a.body.has('anim_idle') ? 'anim_idle' : a.walkAnim;
        a.body.play(idle);
        a.body.t = Math.random();
        a.body.rate = a.body.def.fps * (0.7 + Math.random() * 0.4);
        zs.push({ a, x: 470 + Math.random() * 230, y: 40 + Math.random() * 400 });
      }
      zs.sort((p, q) => p.y - q.y);
      let last = performance.now();
      const loop = (now: number) => {
        const c = ref.current;
        if (!c) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = c.clientWidth;
        const H = c.clientHeight;
        if (c.width !== Math.round(W * dpr)) {
          c.width = Math.round(W * dpr);
          c.height = Math.round(H * dpr);
        }
        const ctx = c.getContext('2d')!;
        const k = (W / 800) * dpr;
        const base: Mat = [k, 0, 0, k, 0, 0];
        ctx.setTransform(...base);
        const bg = PVZ.image(bgId);
        if (bg) ctx.drawImage(bg.img, -600, 0);
        for (const z of zs) {
          z.a.body.update(dt);
          const sh = PVZ.image('IMAGE_PLANTSHADOW');
          ctx.setTransform(...base);
          if (sh) ctx.drawImage(sh.img, z.x + 25, z.y + 112, sh.w * 1.1, sh.h * 1.1);
          z.a.body.draw(ctx, translate(base, z.x, z.y), PVZ_IMAGES);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    void PVZ.loadImage('IMAGE_PLANTSHADOW');
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [props.setup.level.id]);
  return <canvas ref={ref} style={{ position: 'absolute', left: 0, top: 0, width: '800px', height: '600px' }} />;
}

export function ClassicDeck(props: { setup: BattleSetup }) {
  useStore();
  const m = useDeckModel(props.setup);
  const { p, L, rules, slots, pool, allowed, deck, skills, items } = m;
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [more, setMore] = useState(false);
  const spacing = slots <= 7 ? 59 : slots === 8 ? 54 : slots === 9 ? 52 : 51;
  const bankW = Math.max(446, 85 + slots * spacing + 10);
  const all = CONTENT.allUnits();
  const showTip = (e: MouseEvent, id: string) => {
    const d = CONTENT.unit(id);
    setTip({ text: `${d.name}（${d.cost} 阳光）\n${d.desc}`, x: e.clientX, y: e.clientY });
  };
  useEffect(() => {
    audio.music('choose');
  }, []);
  return (
    <Stage class="pvz-deck">
      <StreetBackdrop setup={props.setup} />
      {/* 顶部卡槽 */}
      <div class="pvz-bank" style={{ left: 10, top: 0, width: bankW }}>
        <PvzImage id="IMAGE_SEEDBANK" crop={[0, 0, 430, 87]} w={430} h={87} style={{ position: 'absolute', left: 0, top: 0 }} />
        {bankW > 446 && <PvzImage id="IMAGE_SEEDBANK" crop={[380, 0, 50, 87]} w={bankW - 446} h={87} style={{ position: 'absolute', left: 430, top: 0 }} />}
        <PvzImage id="IMAGE_SEEDBANK" crop={[430, 0, 16, 87]} w={16} h={87} style={{ position: 'absolute', left: bankW - 16, top: 0 }} />
        <div class="pvz-sun-count">{rules?.c.startLumen ?? L.startLumen}</div>
        {Array.from({ length: slots }).map((_, i) => {
          const id = deck[i];
          return (
            <div class="pvz-bank-slot" style={{ left: 85 + i * spacing - 4, top: 8 }} onClick={() => id && (audio.sfx('pick'), m.toggle(id))} onMouseMove={(e) => id && showTip(e as unknown as MouseEvent, id)} onMouseLeave={() => setTip(null)}>
              {id && <SeedPacket id={id} cost={CONTENT.unit(id).cost} scale={0.5} />}
            </div>
          );
        })}
      </div>
      {/* 种子选择器 */}
      <div class="pvz-chooser" style={{ left: 0, top: 87 }}>
        <PvzImage id="IMAGE_SEEDCHOOSER_BACKGROUND" style={{ position: 'absolute', left: 0, top: 0 }} />
        <div class="pvz-chooser-title">选择你的植物！</div>
        <div class="pvz-chooser-grid">
          {all.map((d) => {
            const unlocked = pool.includes(d.id);
            const ok = unlocked && allowed(d.id) && !L.bannedCards?.includes(d.id);
            const chosen = deck.includes(d.id);
            return (
              <div
                class={`pvz-chooser-cell ${ok ? '' : 'disabled'} ${chosen ? 'chosen' : ''}`}
                onClick={() => {
                  if (!unlocked) return;
                  if (!ok) return toast(rules?.isCardAllowed(d).reason ?? '该卡牌在本关不可用', 'bad');
                  if (chosen) return;
                  audio.sfx('pick');
                  m.toggle(d.id);
                }}
                onMouseMove={(e) => unlocked && showTip(e as unknown as MouseEvent, d.id)}
                onMouseLeave={() => setTip(null)}
              >
                {unlocked ? <SeedPacket id={d.id} cost={d.cost} scale={0.5} dim={!ok} /> : <PvzImage id="IMAGE_SEEDPACKETSILHOUETTE" />}
              </div>
            );
          })}
        </div>
        <div class="pvz-chooser-extra">
          {SKILLS.filter((s) => p.unlockedSkills.includes(s.id)).map((s) => {
            const sel = skills.includes(s.id);
            const okS = !rules || rules.isSkillAllowed(s.id);
            return (
              <button class={`pvz-chip ${sel ? 'on' : ''}`} disabled={!okS} title={s.desc} onClick={() => m.setSkills(sel ? skills.filter((x) => x !== s.id) : skills.length < 2 ? [...skills, s.id] : skills)}>
                {s.icon} {s.name}
              </button>
            );
          })}
          {ITEMS.filter((it) => (p.items[it.id] ?? 0) > 0).map((it) => {
            const have = p.items[it.id] ?? 0;
            const n = items[it.id] ?? 0;
            return (
              <button class={`pvz-chip ${n > 0 ? 'on' : ''}`} title={it.desc} onClick={() => m.setItems({ ...items, [it.id]: n >= have ? 0 : n + 1 })}>
                {it.icon} {it.name} {n}/{have}
              </button>
            );
          })}
        </div>
        <button class={`pvz-rock ${deck.length ? '' : 'disabled'}`} onClick={() => (audio.sfx('gravebutton'), m.start())}>
          一起摇滚吧！
        </button>
      </div>
      {/* 本作新增：操作方式与 AI */}
      <div class="pvz-deck-side">
        <div class="pvz-side-title">{L.id} · {L.name}</div>
        <div class="pvz-side-info">
          {L.time === 'night' ? '夜晚' : '白天'} · {weatherText(L)} · {L.gen?.count ?? L.waves?.length ?? 0} 波
        </div>
        {props.setup.rules && <div class="pvz-side-info">挑战：{props.setup.rules.name}</div>}
        <label class="pvz-field">
          <span>操作</span>
          <select value={m.control} onChange={(e) => m.setControl((e.target as HTMLSelectElement).value as ControlMode)}>
            {(Object.keys(CONTROL_NAMES) as ControlMode[]).map((k) => (
              <option value={k}>{CONTROL_NAMES[k]}</option>
            ))}
          </select>
        </label>
        {more && (
          <>
            <label class="pvz-field">
              <span>AI 策略</span>
              <select value={m.strategy} onChange={(e) => m.setStrategy((e.target as HTMLSelectElement).value)}>
                {STRATEGIES.map((s) => (
                  <option value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label class="pvz-field">
              <span>难度</span>
              <select value={m.difficulty} onChange={(e) => m.setDifficulty(Number((e.target as HTMLSelectElement).value))}>
                <option value={0.7}>简单</option>
                <option value={1}>普通</option>
                <option value={1.35}>困难</option>
                <option value={1.8}>噩梦</option>
              </select>
            </label>
          </>
        )}
        <div class="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button class="pvz-btn small" onClick={m.recommend} title="根据关卡敌人、地形、天气与 AI 经验推荐卡组">
            AI 推荐
          </button>
          <button class="pvz-btn small" onClick={m.autoCoach} title="AI 从本关开始连续挑战，失败后自动调整并重试">
            AI 闯关
          </button>
          <button class="pvz-btn small" onClick={() => setMore(!more)}>
            {more ? '收起' : '更多'}
          </button>
        </div>
        {m.reasons.length > 0 && <div class="pvz-side-info" style={{ fontSize: 11 }}>AI 选卡：{m.reasons.slice(0, 3).join('；')}</div>}
      </div>
      <button class="pvz-btn small" style={{ position: 'absolute', right: 12, top: 8 }} onClick={() => back()}>
        返回
      </button>
      {tip && (
        <div class="pvz-tooltip" style={{ position: 'fixed', left: tip.x + 14, top: tip.y + 16, whiteSpace: 'pre-line' }}>
          {tip.text}
        </div>
      )}
    </Stage>
  );
}
