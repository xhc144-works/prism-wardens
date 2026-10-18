/**
 * 经典皮肤的生存模式 / 无尽模式选择：原版小游戏选择界面样式，使用原版生存模式缩略图。
 */
import { CONTENT } from '../../core/content/registry';
import { ARENAS, makeEndlessLevel, makeSurvivalLevel } from '../../core/content/levels';
import { navigate, back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { audio } from '../../audio/audio';
import { Stage } from './Stage';
import { PvzImage } from './thumbs';

const THEME_THUMB: Record<string, number> = { day: 0, night: 1, lake: 2, fog: 3, sky: 4 };

export function ClassicModes(props: { mode: 'endless' | 'survival' }) {
  useStore();
  const p = store.profile;
  const endless = props.mode === 'endless';
  const items: { key: string; title: string; sub: string; thumb: number; done: boolean; go: () => void }[] = [];
  for (const a of ARENAS) {
    const map = CONTENT.map(a.map);
    const theme = a.time === 'night' && map.theme === 'day' ? 'night' : map.theme;
    const t = THEME_THUMB[theme] ?? 0;
    if (endless) {
      const lv = makeEndlessLevel(a.id);
      items.push({ key: a.id, title: `${a.name}（无尽）`, sub: `最佳 ${p.endlessBest[a.id] ?? 0} 波`, thumb: 10, done: (p.endlessBest[a.id] ?? 0) > 0, go: () => navigate({ name: 'deck', setup: { mode: 'endless', level: lv, endlessArena: a.id } }) });
    } else {
      const lv = makeSurvivalLevel(a.id);
      const lvH = makeSurvivalLevel(a.id, true);
      items.push({ key: lv.id, title: a.name, sub: '普通 · 5 轮', thumb: t, done: !!p.survival[lv.id], go: () => navigate({ name: 'deck', setup: { mode: 'survival', level: lv, survivalId: lv.id } }) });
      items.push({ key: lvH.id, title: `${a.name}（困难）`, sub: '困难 · 10 轮', thumb: t + 5, done: !!p.survival[lvH.id], go: () => navigate({ name: 'deck', setup: { mode: 'survival', level: lvH, survivalId: lvH.id } }) });
    }
  }
  return (
    <Stage bg="IMAGE_CHALLENGE_BACKGROUND">
      <div class="pvz-title" style={{ left: 0, top: 26, width: 800 }}>
        {endless ? '迷你游戏 · 无尽模式' : '生存模式'}
      </div>
      <div class="pvz-mode-grid" style={{ left: 50, top: 100, width: 700 }}>
        {items.map((it) => (
          <div
            class="pvz-level-win"
            onClick={() => {
              audio.sfx('gravebutton');
              it.go();
            }}
            title={it.sub}
          >
            <PvzImage id="IMAGE_CHALLENGE_WINDOW_HIGHLIGHT" style={{ position: 'absolute', left: 0, top: 0 }} />
            <div class="thumb">
              <PvzImage id="IMAGE_SURVIVAL_THUMBNAILS" col={it.thumb} w={80} h={65} />
            </div>
            <div class="lv-name">
              <b>{it.title}</b>
              <br />
              {it.sub}
            </div>
            {it.done && <PvzImage id="IMAGE_MINIGAME_TROPHY" style={{ position: 'absolute', left: 0, top: 0 }} />}
          </div>
        ))}
      </div>
      <div class="pvz-progress" style={{ left: 200, top: 520, width: 400 }}>
        {endless ? '波次无穷无尽，每 20 波出现首领。看看你（或 AI）能坚持多少波！' : '连续撑过多轮大波攻势，每轮结束可重新选卡，阵地保留。'}
      </div>
      <button class="pvz-btn" style={{ position: 'absolute', left: 40, top: 548 }} onClick={() => back()}>
        返回菜单
      </button>
    </Stage>
  );
}
