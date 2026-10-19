/**
 * 经典皮肤的冒险关卡选择：原版小游戏选择界面的石框与羊皮纸背景，
 * 每章 6 个关卡窗口（场景缩略图、关卡号、奖杯/锁），下方为关卡详情与开始按钮。
 */
import { useState } from 'preact/hooks';
import { CONTENT } from '../../core/content/registry';
import { CHAPTERS, LEVELS } from '../../core/content/levels';
import { isLevelUnlocked } from '../../core/meta/profile';
import { navigate, back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { audio } from '../../audio/audio';
import { weatherText } from '../screens/Levels';
import { Stage } from './Stage';
import { PvzImage, SeedPacket, ZombieThumb } from './thumbs';

const THEME_THUMB: Record<string, number> = { day: 0, night: 1, lake: 2, fog: 3, sky: 4 };

export function ClassicLevels() {
  useStore();
  const p = store.profile;
  const firstLocked = LEVELS.find((l) => !isLevelUnlocked(p, l.id));
  const current = firstLocked ? LEVELS[Math.max(0, LEVELS.indexOf(firstLocked) - 1)] : LEVELS[LEVELS.length - 1];
  const [ch, setCh] = useState(current.chapter ?? 1);
  const [sel, setSel] = useState(current.id);
  const levels = LEVELS.filter((l) => l.chapter === ch);
  const lv = CONTENT.level(sel) ?? levels[0];
  const unlocked = isLevelUnlocked(p, lv.id);
  const pr = p.progress[lv.id];
  const reward = lv.rewards?.card ? CONTENT.units.get(lv.rewards.card) : undefined;
  const start = () => {
    if (!unlocked) return;
    audio.sfx('gravebutton');
    navigate({ name: 'deck', setup: { mode: 'adventure', level: lv } });
  };
  return (
    <Stage bg="IMAGE_CHALLENGE_BACKGROUND" class="pvz-levels">
      <div class="pvz-title" style={{ left: 0, top: 26, width: 800 }}>
        冒险模式
      </div>
      <div class="pvz-tabs" style={{ left: 40, top: 92, width: 720 }}>
        {CHAPTERS.map((c) => (
          <button
            class={`pvz-tab ${c.id === ch ? 'active' : ''}`}
            onClick={() => {
              audio.sfx('click');
              setCh(c.id);
              const first = LEVELS.find((l) => l.chapter === c.id);
              if (first) setSel(first.id);
            }}
          >
            第 {c.id} 章 · {c.name}
          </button>
        ))}
      </div>
      <div class="pvz-level-row" style={{ left: 34, top: 128 }}>
        {levels.map((l) => {
          const un = isLevelUnlocked(p, l.id);
          const won = !!p.progress[l.id]?.wins;
          const m = CONTENT.resolveMap(l.map);
          const th = l.time === 'night' && m.theme === 'day' ? 'night' : m.theme;
          return (
            <div
              class={`pvz-level-win ${sel === l.id ? 'sel' : ''} ${un ? '' : 'locked'}`}
              onClick={() => {
                audio.sfx('click');
                setSel(l.id);
              }}
              onDblClick={() => un && navigate({ name: 'deck', setup: { mode: 'adventure', level: l } })}
            >
              <PvzImage id={sel === l.id ? 'IMAGE_CHALLENGE_WINDOW' : 'IMAGE_CHALLENGE_WINDOW_HIGHLIGHT'} style={{ position: 'absolute', left: 0, top: 0 }} />
              <div class="thumb">
                <PvzImage id="IMAGE_SURVIVAL_THUMBNAILS" col={THEME_THUMB[th] ?? 0} w={80} h={65} />
              </div>
              <div class="lv-name">
                <b>{l.id}</b> {l.name}
              </div>
              {won && <PvzImage id="IMAGE_MINIGAME_TROPHY" style={{ position: 'absolute', left: 0, top: 0 }} />}
              {!un && <PvzImage id="IMAGE_LOCK" scale={0.7} style={{ position: 'absolute', left: 30, top: 11 }} />}
              {l.bossLevel && <div class="lv-boss">首领</div>}
            </div>
          );
        })}
      </div>
      <div class="pvz-level-detail" style={{ left: 46, top: 268, width: 708, height: 266 }}>
        <div class="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div class="lv-title">
              {lv.id} · {lv.name} {lv.bossLevel && <span class="pvz-tag red">首领关</span>}
            </div>
            <div class="lv-desc">{lv.desc}</div>
            <div class="lv-info">
              <span>{lv.time === 'night' ? '夜晚（无天降阳光）' : '白天'}</span>
              <span>天气：{weatherText(lv)}</span>
              <span>{lv.gen?.count ?? lv.waves?.length ?? 0} 波</span>
              <span>初始阳光 {lv.startLumen}</span>
              {pr?.wins ? <span>最佳 {Math.round(pr.bestTime)} 秒 · {'★'.repeat(pr.stars)}{'☆'.repeat(3 - pr.stars)}</span> : null}
            </div>
            <div class="lv-sub">本关出现的僵尸</div>
            <div class="row" style={{ gap: 2, flexWrap: 'wrap' }}>
              {lv.enemyPool.slice(0, 9).map((id) => (
                <div class="lv-zombie" title={CONTENT.enemies.get(id)?.name}>
                  <ZombieThumb id={id} size={58} />
                </div>
              ))}
            </div>
          </div>
          <div class="col" style={{ alignItems: 'center', gap: 8, width: 150 }}>
            {reward ? (
              <>
                <div class="lv-sub">通关奖励</div>
                <SeedPacket id={reward.id} cost={reward.cost} scale={0.8} />
                <div style={{ fontWeight: 800 }}>{reward.name}</div>
              </>
            ) : (
              <div class="lv-sub">通关奖励：{lv.rewards?.coins ?? 0} 金币</div>
            )}
          </div>
        </div>
      </div>
      <button class="pvz-btn" style={{ position: 'absolute', left: 40, top: 548 }} onClick={() => back()}>
        返回菜单
      </button>
      <button class={`pvz-btn ${unlocked ? '' : 'disabled'}`} style={{ position: 'absolute', right: 40, top: 548, minWidth: 180 }} onClick={start}>
        {unlocked ? '选择植物，开始！' : '尚未解锁'}
      </button>
      <div class="pvz-progress" style={{ left: 300, top: 560, width: 200 }}>
        已通关 {LEVELS.filter((l) => p.progress[l.id]?.wins).length} / {LEVELS.length}
      </div>
    </Stage>
  );
}
