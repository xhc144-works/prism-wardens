import type { Profile } from './profile';
import type { World } from '../sim/world';
import { LEVELS } from '../content/levels';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (p: Profile) => boolean;
}

const cleared = (p: Profile, id: string) => !!p.progress[id]?.wins;
const chapter = (p: Profile, c: number) => LEVELS.filter((l) => l.chapter === c).every((l) => cleared(p, l.id));

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_win', name: '初次守护', desc: '赢得第一场战斗', icon: '🌱', check: (p) => p.stats.wins >= 1 },
  { id: 'ch1', name: '平原之光', desc: '通关第一章', icon: '🌿', check: (p) => chapter(p, 1) },
  { id: 'ch2', name: '月夜守望', desc: '通关第二章', icon: '🌙', check: (p) => chapter(p, 2) },
  { id: 'ch3', name: '湖畔卫士', desc: '通关第三章', icon: '💧', check: (p) => chapter(p, 3) },
  { id: 'ch4', name: '拨云见日', desc: '通关第四章', icon: '🌫', check: (p) => chapter(p, 4) },
  { id: 'ch5', name: '棱镜传说', desc: '通关第五章，击败蚀之王', icon: '👑', check: (p) => chapter(p, 5) },
  { id: 'boss_wyrm', name: '屠蠕者', desc: '击败深渊巨蠕', icon: '🐛', check: (p) => cleared(p, '2-6') },
  { id: 'boss_tempest', name: '风暴止息', desc: '击败风暴巨兽', icon: '⛈', check: (p) => cleared(p, '4-6') },
  { id: 'kills_100', name: '百战', desc: '累计击败 100 个敌人', icon: '⚔', check: (p) => p.stats.kills >= 100 },
  { id: 'kills_1000', name: '千军', desc: '累计击败 1000 个敌人', icon: '🗡', check: (p) => p.stats.kills >= 1000 },
  { id: 'kills_10000', name: '万夫莫敌', desc: '累计击败 10000 个敌人', icon: '🛡', check: (p) => p.stats.kills >= 10000 },
  { id: 'place_500', name: '筑城者', desc: '累计部署 500 个单位', icon: '🏗', check: (p) => p.stats.placements >= 500 },
  { id: 'lumen_10000', name: '光能富翁', desc: '累计收集 10000 光能', icon: '☀', check: (p) => p.stats.lumenCollected >= 10000 },
  { id: 'perfect', name: '完美防线', desc: '不触发任何符文哨卫赢得一关', icon: '💎', check: (p) => p.stats.perfectWins >= 1 },
  { id: 'perfect_10', name: '铜墙铁壁', desc: '完美通关 10 次', icon: '🏰', check: (p) => p.stats.perfectWins >= 10 },
  { id: 'combo_20', name: '组合大师', desc: '累计触发 20 次组合技', icon: '✨', check: (p) => p.stats.combos >= 20 },
  { id: 'endless_20', name: '无尽行者', desc: '无尽模式坚持到第 20 波', icon: '♾', check: (p) => p.stats.bestEndless >= 20 },
  { id: 'endless_50', name: '永恒守望', desc: '无尽模式坚持到第 50 波', icon: '🌌', check: (p) => p.stats.bestEndless >= 50 },
  { id: 'survival', name: '生存专家', desc: '完成任意一个生存挑战', icon: '🔥', check: (p) => Object.values(p.survival).some(Boolean) },
  { id: 'challenge_1', name: '挑战者', desc: '完成 1 个挑战', icon: '🎯', check: (p) => p.stats.challengeWins >= 1 },
  { id: 'challenge_5', name: '规则破解者', desc: '完成 5 个不同的挑战', icon: '🧩', check: (p) => p.challengeWins.length >= 5 },
  { id: 'weather_all', name: '风雨无阻', desc: '在 5 种不同天气下获胜', icon: '🌈', check: (p) => p.stats.weathersWon.length >= 5 },
  { id: 'ai_first', name: '人工智慧', desc: '让 AI 自动赢得一关', icon: '🤖', check: (p) => p.stats.aiWins >= 1 },
  { id: 'ai_10', name: 'AI 指挥官', desc: 'AI 累计赢得 10 关', icon: '🧠', check: (p) => p.stats.aiWins >= 10 },
  { id: 'sim_100', name: '数据科学家', desc: '运行 100 局批量模拟', icon: '📊', check: (p) => p.stats.simulations >= 100 },
  { id: 'creator', name: '造物主', desc: '在编辑器中创建一个自定义关卡', icon: '🗺', check: (p) => p.stats.customLevelsMade >= 1 },
  { id: 'rulemaker', name: '立法者', desc: '创建一个自定义挑战', icon: '📜', check: (p) => p.stats.challengesMade >= 1 },
  { id: 'no_producer', name: '无根之木', desc: '不使用生产单位赢得一关', icon: '🍂', check: (p) => p.stats.noProducerWins >= 1 },
  { id: 'minimal', name: '以少胜多', desc: '场上单位从未超过 8 个的情况下获胜', icon: '🎖', check: (p) => p.stats.lowUnitWins >= 1 },
  { id: 'rich', name: '腰缠万贯', desc: '同时持有 3000 金币', icon: '💰', check: (p) => p.coins >= 3000 },
];

/** 把一局结果计入档案统计（修改器局不计入成就相关统计） */
export function recordGame(p: Profile, w: World, opts: { ai: boolean; endlessArena?: string; survivalId?: string; challengeId?: string }): { newAchievements: AchievementDef[]; coins: number } {
  const s = w.stats;
  const won = w.status === 'won';
  const tainted = s.cheatsUsed;
  p.stats.games++;
  p.stats.playTime += w.time;
  let coins = 0;
  if (!tainted) {
    p.stats.kills += s.killsTotal;
    p.stats.placements += s.placementsTotal;
    p.stats.lumenCollected += s.lumenCollected;
    p.stats.combos += Object.values(s.combos).reduce((a, b) => a + b, 0);
    p.stats.bossKills += s.bossDefeated.length;
    coins += s.coinsEarned;
    if (opts.ai) p.stats.aiGames++;
    if (won) {
      p.stats.wins++;
      if (opts.ai) p.stats.aiWins++;
      if (s.sentinelsUsed === 0) p.stats.perfectWins++;
      for (const wid of s.weatherSeen) if (!p.stats.weathersWon.includes(wid)) p.stats.weathersWon.push(wid);
      if (!Object.keys(s.placements).some((id) => id === 'lumen_moss' || id === 'twin_moss')) p.stats.noProducerWins++;
      if (s.peakUnits <= 8) p.stats.lowUnitWins++;
      if (opts.challengeId) {
        p.stats.challengeWins++;
        if (!p.challengeWins.includes(opts.challengeId)) p.challengeWins.push(opts.challengeId);
      }
      if (opts.survivalId) p.survival[opts.survivalId] = true;
    }
    if (opts.endlessArena) {
      const best = p.endlessBest[opts.endlessArena] ?? 0;
      p.endlessBest[opts.endlessArena] = Math.max(best, w.waveIndex);
      p.stats.bestEndless = Math.max(p.stats.bestEndless, w.waveIndex);
      coins += w.waveIndex * 10;
    }
  }
  p.coins += coins;
  p.updated = Date.now();
  return { newAchievements: checkAchievements(p), coins };
}

export function checkAchievements(p: Profile): AchievementDef[] {
  const out: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    if (a.check(p)) {
      p.achievements[a.id] = Date.now();
      out.push(a);
    }
  }
  return out;
}
