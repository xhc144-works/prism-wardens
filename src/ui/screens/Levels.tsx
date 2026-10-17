import { useState } from 'preact/hooks';
import type { LevelDef } from '../../core/types';
import { CONTENT } from '../../core/content/registry';
import { CHAPTERS, LEVELS, ARENAS, makeEndlessLevel, makeSurvivalLevel } from '../../core/content/levels';
import { WEATHER } from '../../core/content/environment';
import { isLevelUnlocked } from '../../core/meta/profile';
import { navigate, back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { enemyIcon } from '../../render/icons';
import { Btn, Tabs, TopBar } from '../components/ui';

export function weatherText(l: LevelDef): string {
  const p = l.weather;
  if (!p) return '晴朗';
  if (p.mode === 'fixed') return WEATHER[p.id].name;
  if (p.mode === 'cycle') return p.list.map((x) => WEATHER[x.id].name).join(' → ');
  return `随机（${p.pool.map((x) => WEATHER[x].name).join('/')}）`;
}

export function EnemyPreview(props: { ids: string[] }) {
  return (
    <div class="chip-list">
      {props.ids.map((id) => {
        const d = CONTENT.enemies.get(id);
        if (!d) return null;
        return (
          <div class="enemy-chip" title={`${d.name}：${d.desc}`}>
            <img src={enemyIcon(d, 54)} />
          </div>
        );
      })}
    </div>
  );
}

export function LevelsScreen() {
  useStore();
  const p = store.profile;
  const firstLocked = LEVELS.find((l) => !isLevelUnlocked(p, l.id));
  const defaultCh = String(Math.max(1, (firstLocked ? (LEVELS[LEVELS.indexOf(firstLocked) - 1]?.chapter ?? 1) : 5)));
  const [ch, setCh] = useState(defaultCh);
  const chapter = CHAPTERS.find((c) => String(c.id) === ch)!;
  const levels = LEVELS.filter((l) => String(l.chapter) === ch);
  return (
    <div class="screen">
      <TopBar title="冒险模式" onBack={() => back()}>
        <span class="muted">已通关 {LEVELS.filter((l) => p.progress[l.id]?.wins).length}/{LEVELS.length}</span>
      </TopBar>
      <div class="content">
        <Tabs tabs={CHAPTERS.map((c) => ({ id: String(c.id), label: `第${c.id}章 · ${c.name}` }))} value={ch} onChange={setCh} />
        <div class="panel" style={{ marginBottom: 14, borderColor: chapter.color + '66' }}>
          <h3 style={{ color: chapter.color }}>第 {chapter.id} 章 · {chapter.name}</h3>
          <div class="muted">{chapter.desc}</div>
        </div>
        <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {levels.map((l) => {
            const unlocked = isLevelUnlocked(p, l.id);
            const pr = p.progress[l.id];
            const reward = l.rewards?.card ? CONTENT.units.get(l.rewards.card)?.name : undefined;
            return (
              <div
                class={`level-node ${unlocked ? '' : 'locked'} ${pr?.wins ? 'cleared' : ''} ${l.bossLevel ? 'boss' : ''}`}
                onClick={() => unlocked && navigate({ name: 'deck', setup: { mode: 'adventure', level: l } })}
              >
                <div class="row" style={{ justifyContent: 'space-between' }}>
                  <span class="id">{l.id}</span>
                  <span style={{ color: 'var(--gold)' }}>{pr?.wins ? '★'.repeat(pr.stars) + '☆'.repeat(3 - pr.stars) : unlocked ? '' : '🔒'}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {l.name} {l.bossLevel && <span class="tag bad">首领</span>}
                </div>
                <div class="muted" style={{ fontSize: 12, minHeight: 34 }}>{l.desc}</div>
                <div class="row" style={{ fontSize: 12, gap: 6, marginTop: 6 }}>
                  <span class="tag">{l.time === 'night' ? '🌙 夜晚' : '☀ 白天'}</span>
                  <span class="tag">{weatherText(l)}</span>
                  <span class="tag">{l.gen?.count ?? l.waves?.length ?? 0} 波</span>
                  {reward && <span class="tag gold">奖励：{reward}</span>}
                </div>
                {pr?.wins ? <div class="dim" style={{ fontSize: 11, marginTop: 4 }}>最佳 {Math.round(pr.bestTime)} 秒 · 尝试 {pr.attempts} 次</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ModesScreen(props: { mode: 'endless' | 'survival' }) {
  useStore();
  const p = store.profile;
  const endless = props.mode === 'endless';
  return (
    <div class="screen">
      <TopBar title={endless ? '无尽模式' : '生存挑战'} onBack={() => back()} />
      <div class="content">
        <div class="panel" style={{ marginBottom: 14 }}>
          <div class="muted">
            {endless
              ? '波次无穷无尽，强度不断提升，每 20 波出现首领。天气与随机事件全程开启。看看你（或 AI）能坚持多少波！'
              : '连续撑过多轮大波攻势，每轮结束可以重新挑选卡组，阵地保留。普通 5 轮，困难 10 轮。'}
          </div>
        </div>
        <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {ARENAS.map((a) => {
            const lv = endless ? makeEndlessLevel(a.id) : makeSurvivalLevel(a.id);
            const lvH = makeSurvivalLevel(a.id, true);
            return (
              <div class="level-node">
                <div style={{ fontWeight: 800, fontSize: 17 }}>{a.name}</div>
                <div class="muted" style={{ fontSize: 12 }}>{CONTENT.map(a.map).name} · {a.time === 'night' ? '夜晚' : '白天'}</div>
                {endless ? (
                  <div style={{ margin: '8px 0' }}>最佳记录：<b class="gold-text">{p.endlessBest[a.id] ?? 0}</b> 波</div>
                ) : (
                  <div style={{ margin: '8px 0' }}>
                    普通 {p.survival[lv.id] ? '✔' : '—'} · 困难 {p.survival[lvH.id] ? '✔' : '—'}
                  </div>
                )}
                <div class="row">
                  <Btn kind="primary" small onClick={() => navigate({ name: 'deck', setup: { mode: props.mode, level: lv, endlessArena: endless ? a.id : undefined, survivalId: endless ? undefined : lv.id } })}>
                    {endless ? '开始' : '普通'}
                  </Btn>
                  {!endless && (
                    <Btn small kind="danger" onClick={() => navigate({ name: 'deck', setup: { mode: 'survival', level: lvH, survivalId: lvH.id } })}>
                      困难
                    </Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
