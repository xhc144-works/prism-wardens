import { DEFAULT_DECK_SLOTS, MAX_DECK_SLOTS, META_MAX_LEVEL } from '../constants';
import { STARTER_CARDS } from '../content/units';
import { LEVELS } from '../content/levels';
import { SKILLS, ITEMS } from '../content/abilities';
import { CONTENT } from '../content/registry';

export interface LifetimeStats {
  games: number;
  wins: number;
  kills: number;
  placements: number;
  lumenCollected: number;
  playTime: number;
  combos: number;
  bossKills: number;
  aiWins: number;
  aiGames: number;
  simulations: number;
  challengeWins: number;
  perfectWins: number;
  bestEndless: number;
  weathersWon: string[];
  customLevelsMade: number;
  challengesMade: number;
  noProducerWins: number;
  lowUnitWins: number;
}

export interface LevelProgress {
  stars: number;
  bestTime: number;
  wins: number;
  attempts: number;
}

export interface Profile {
  id: string;
  name: string;
  created: number;
  updated: number;
  progress: Record<string, LevelProgress>;
  unlockedCards: string[];
  unlockedSkills: string[];
  items: Record<string, number>;
  coins: number;
  upgrades: Record<string, number>;
  deckSlots: number;
  endlessBest: Record<string, number>;
  survival: Record<string, boolean>;
  achievements: Record<string, number>;
  challengeWins: string[];
  stats: LifetimeStats;
  lastDeck?: string[];
  lastSkills?: string[];
  difficulty: number;
}

export function newProfile(name: string): Profile {
  return {
    id: `p_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    created: Date.now(),
    updated: Date.now(),
    progress: {},
    unlockedCards: [...STARTER_CARDS],
    unlockedSkills: [],
    items: { lumen_crystal: 1 },
    coins: 0,
    upgrades: {},
    deckSlots: DEFAULT_DECK_SLOTS,
    endlessBest: {},
    survival: {},
    achievements: {},
    challengeWins: [],
    stats: {
      games: 0,
      wins: 0,
      kills: 0,
      placements: 0,
      lumenCollected: 0,
      playTime: 0,
      combos: 0,
      bossKills: 0,
      aiWins: 0,
      aiGames: 0,
      simulations: 0,
      challengeWins: 0,
      perfectWins: 0,
      bestEndless: 0,
      weathersWon: [],
      customLevelsMade: 0,
      challengesMade: 0,
      noProducerWins: 0,
      lowUnitWins: 0,
    },
    difficulty: 1,
  };
}

/** 补全旧存档缺失字段（存档版本兼容） */
export function migrateProfile(p: Partial<Profile>): Profile {
  const base = newProfile(p.name ?? '玩家');
  return { ...base, ...p, stats: { ...base.stats, ...(p.stats ?? {}) }, items: { ...(p.items ?? base.items) } } as Profile;
}

export function isLevelUnlocked(p: Profile, levelId: string): boolean {
  const idx = LEVELS.findIndex((l) => l.id === levelId);
  if (idx <= 0) return true;
  return !!p.progress[LEVELS[idx - 1].id]?.wins;
}

export function chapterCleared(p: Profile, chapter: number): boolean {
  return LEVELS.filter((l) => l.chapter === chapter).every((l) => p.progress[l.id]?.wins);
}

export const UPGRADE_COST = (level: number) => 150 * level; // 升到 level+1 的价格
export const SLOT_COST = (slots: number) => [0, 0, 0, 0, 0, 0, 600, 1200, 2400, 4000][slots] ?? 99999;

export interface ShopEntry {
  kind: 'slot' | 'upgrade' | 'item' | 'skill';
  id: string;
  name: string;
  desc: string;
  price: number;
  available: boolean;
  reason?: string;
}

export function shopEntries(p: Profile): ShopEntry[] {
  const out: ShopEntry[] = [];
  if (p.deckSlots < MAX_DECK_SLOTS) out.push({ kind: 'slot', id: 'slot', name: `第 ${p.deckSlots + 1} 个卡槽`, desc: '战斗中可以多携带一张卡牌', price: SLOT_COST(p.deckSlots), available: true });
  for (const s of SKILLS) {
    if (p.unlockedSkills.includes(s.id)) continue;
    out.push({ kind: 'skill', id: s.id, name: `技能：${s.name}`, desc: s.desc, price: s.price, available: true });
  }
  for (const i of ITEMS) out.push({ kind: 'item', id: i.id, name: `道具：${i.name}`, desc: `${i.desc}（持有 ${p.items[i.id] ?? 0}/${i.maxStack}）`, price: i.price, available: (p.items[i.id] ?? 0) < i.maxStack, reason: '已达上限' });
  for (const id of p.unlockedCards) {
    const d = CONTENT.units.get(id);
    if (!d) continue;
    const lvl = p.upgrades[id] ?? 1;
    if (lvl >= META_MAX_LEVEL) continue;
    out.push({ kind: 'upgrade', id, name: `强化：${d.name} Lv.${lvl} → ${lvl + 1}`, desc: '永久提升 8% 伤害与生命', price: UPGRADE_COST(lvl), available: true });
  }
  return out;
}

export function buy(p: Profile, e: ShopEntry): string | null {
  if (!e.available) return e.reason ?? '不可购买';
  if (p.coins < e.price) return '金币不足';
  p.coins -= e.price;
  switch (e.kind) {
    case 'slot':
      p.deckSlots = Math.min(MAX_DECK_SLOTS, p.deckSlots + 1);
      break;
    case 'skill':
      if (!p.unlockedSkills.includes(e.id)) p.unlockedSkills.push(e.id);
      break;
    case 'item':
      p.items[e.id] = (p.items[e.id] ?? 0) + 1;
      break;
    case 'upgrade':
      p.upgrades[e.id] = (p.upgrades[e.id] ?? 1) + 1;
      break;
  }
  p.updated = Date.now();
  return null;
}

/** 一键解锁全部（修改器功能） */
export function unlockEverything(p: Profile): void {
  p.unlockedCards = CONTENT.allUnits().map((u) => u.id);
  p.unlockedSkills = SKILLS.map((s) => s.id);
  for (const i of ITEMS) p.items[i.id] = i.maxStack;
  p.deckSlots = MAX_DECK_SLOTS;
  for (const l of LEVELS) if (!p.progress[l.id]) p.progress[l.id] = { stars: 1, bestTime: 0, wins: 1, attempts: 1 };
  p.updated = Date.now();
}
