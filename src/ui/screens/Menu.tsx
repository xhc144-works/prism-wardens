import { useEffect, useRef } from 'preact/hooks';
import { World } from '../../core/sim/world';
import { CONTENT } from '../../core/content/registry';
import { DT, GAME_VERSION } from '../../core/constants';
import { AIAgent } from '../../ai/agent';
import { makeAIGameConfig } from '../../ai/runner';
import { Renderer } from '../../render/renderer';
import { navigate } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { audio } from '../../audio/audio';
import { native } from '../../platform/native';
import { PVZ } from '../../pvz/assets';
import { Btn } from '../components/ui';

/** 主菜单背景：一局真实运行的 AI 对战 */
function DemoBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const r = new Renderer(canvas);
    r.settings = { particles: 'low', damageNumbers: false, showHp: false, screenShake: false, showGrid: false };
    const levels = ['1-6', '3-3', '5-4', '2-3', '4-3'];
    let li = 0;
    let world: World;
    let agent: AIAgent;
    const start = () => {
      const level = CONTENT.level(levels[li++ % levels.length])!;
      const ai = { strategy: 'balanced', skills: ['lumen_rain'] };
      world = new World(makeAIGameConfig(level, ai, Math.floor(Math.random() * 1e9)));
      world.config.options = { fullVision: true };
      agent = new AIAgent({ strategy: 'balanced' });
    };
    start();
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (ts: number) => {
      const dt = Math.min(0.1, (ts - last) / 1000);
      last = ts;
      acc += dt * 1.5;
      while (acc >= DT) {
        agent.update(world);
        world.step();
        acc -= DT;
      }
      r.consume(world, world.drainFx());
      r.render(world, 0, dt);
      if (world.finished || world.time > 240) start();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas class="menu-bg" ref={ref} style={{ width: '100%', height: '100%' }} />;
}

export function MenuScreen() {
  const data = useStore();
  const p = store.profile;
  const done = Object.values(p.progress).filter((x) => x.wins).length;
  useEffect(() => {
    audio.music('menu');
  }, []);
  const tiles: { ic: string; t: string; d: string; go: () => void }[] = [
    { ic: '🛠', t: '修改器', d: '无限资源、数值调整、自动部署', go: () => navigate({ name: 'cheats' }) },
    { ic: '🤖', t: 'AI 控制台', d: '观战、批量模拟、策略对比、阵容研究', go: () => navigate({ name: 'ai' }) },
    { ic: '📜', t: '挑战编辑器', d: '组合规则限制，验证与排行', go: () => navigate({ name: 'ruleEditor' }) },
    { ic: '🗺', t: '关卡编辑器', d: '地形、路线、资源、波次、事件', go: () => navigate({ name: 'editor' }) },
    { ic: '🧬', t: '单位编辑器', d: '自定义守卫与敌人', go: () => navigate({ name: 'unitEditor' }) },
    { ic: '🎞', t: '录像与战报', d: '回放、逐帧分析、导出战报', go: () => navigate({ name: 'replays' }) },
    { ic: '📖', t: '图鉴', d: '单位、敌人、组合技、天气', go: () => navigate({ name: 'almanac' }) },
    { ic: '🏪', t: '商店', d: '升级、卡槽、技能、道具', go: () => navigate({ name: 'shop' }) },
    { ic: '🏆', t: '成就', d: `${Object.keys(p.achievements).length} 个已解锁`, go: () => navigate({ name: 'achievements' }) },
    { ic: '💾', t: '存档', d: '多存档、备份与恢复', go: () => navigate({ name: 'saves' }) },
    { ic: '⚙', t: '设置', d: '画面、声音、分辨率、更新', go: () => navigate({ name: 'settings' }) },
  ];
  if (native) tiles.push({ ic: '⏻', t: '退出游戏', d: '自动保存后退出', go: () => void store.flush().then(() => native!.window.quit()) });
  return (
    <div class="screen" style={{ overflow: 'hidden' }}>
      <DemoBackground />
      <div class="menu-veil" />
      <div class="menu">
        <div class="col" style={{ gap: 26, flex: '0 0 auto' }}>
          <div>
            <div class="logo">棱镜守卫</div>
            <div class="logo-sub">PRISM · WARDENS</div>
          </div>
          <div class="menu-main">
            <Btn kind="primary" onClick={() => navigate({ name: 'levels' })} style={{ fontSize: 18, padding: '14px 22px', justifyContent: 'space-between' }}>
              冒险模式 <small style={{ color: '#04112b' }}>{done}/30 关</small>
            </Btn>
            <button class="btn menu-btn" onClick={() => navigate({ name: 'modes', mode: 'endless' })}>
              无尽模式 <small>最佳 {p.stats.bestEndless} 波</small>
            </button>
            <button class="btn menu-btn" onClick={() => navigate({ name: 'modes', mode: 'survival' })}>
              生存挑战 <small>{Object.values(p.survival).filter(Boolean).length} 项完成</small>
            </button>
            <button class="btn menu-btn" onClick={() => navigate({ name: 'challenges' })}>
              挑战模式 <small>规则限制 · 排行榜</small>
            </button>
            <button class="btn menu-btn" onClick={() => navigate({ name: 'custom' })}>
              自定义关卡 <small>{data.customPack.levels?.length ?? 0} 个</small>
            </button>
          </div>
          <div class="muted" style={{ fontSize: 12 }}>
            档案：<b style={{ color: 'var(--text)' }}>{p.name}</b> · 金币 <span class="gold-text">{p.coins}</span> · v{GAME_VERSION}
            {store.saving ? ' · 保存中…' : store.lastSaved ? ' · 已自动保存' : ''}
          </div>
          {native?.assets && !PVZ.available && (
            <div class="menu-import">
              <b>想要原版的角色、动画与音乐？</b>
              <span>导入你自己合法持有的《植物大战僵尸》安装包或游戏目录，即可切换到经典画面。素材只在本机转换与保存。</span>
              <Btn small kind="primary" onClick={() => navigate({ name: 'settings' })}>
                去导入
              </Btn>
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div class="menu-grid">
          {tiles.map((t) => (
            <div class="menu-tile" onClick={() => { audio.ensure(); audio.sfx('click'); t.go(); }}>
              <span class="ic">{t.ic}</span>
              <span class="t">{t.t}</span>
              <span class="d">{t.d}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
