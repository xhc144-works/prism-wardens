import type { LevelDef, WaveGen, WeatherId, WeatherPlan } from '../types';

export interface ChapterDef {
  id: number;
  name: string;
  desc: string;
  map: string;
  color: string;
}

export const CHAPTERS: ChapterDef[] = [
  { id: 1, name: '翠光平原', desc: '蚀潮第一次越过边境，守卫们在晨光中苏醒。', map: 'verdant_plains', color: '#7ee8a2' },
  { id: 2, name: '月影森林', desc: '夜幕下没有天降光能，蚀晶碑中不断爬出敌人。', map: 'moonwood', color: '#b8c0ff' },
  { id: 3, name: '灵泉湖畔', desc: '湖面中央两行是水路，需要浮晶台与水生单位。', map: 'spring_lake', color: '#8be9fd' },
  { id: 4, name: '迷雾沼泽', desc: '浓雾遮蔽视野，隐身刺客与飞行敌人在雾中潜伏。', map: 'fog_marsh', color: '#caffbf' },
  { id: 5, name: '浮空遗迹', desc: '高地、冰面、蚀地交错的天空遗迹，蚀之王在此等候。', map: 'sky_ruins', color: '#ffd166' },
];

const gen = (count: number, base: number, growth: number, pool: string[], extra: Partial<WaveGen> = {}): WaveGen => ({
  count,
  flagEvery: 10,
  base,
  growth,
  pool,
  flagMul: 1.8,
  ...extra,
});

const cycle = (...list: [WeatherId, number][]): WeatherPlan => ({
  mode: 'cycle',
  list: list.map(([id, duration]) => ({ id, duration })),
});

const ev = (min = 40, max = 70) => ({ enabled: true, interval: [min, max] as [number, number] });

export const LEVELS: LevelDef[] = [
  /* ------------------------------ 第一章 ------------------------------ */
  {
    id: '1-1', name: '晨光初现', chapter: 1, index: 1, map: 'verdant_plains', time: 'day', startLumen: 75,
    desc: '收集天上落下的光能，种下光苔并用棱晶射手击退蚀灵。',
    gen: gen(5, 1, 0.5, ['husk'], { flagEvery: 5 }), enemyPool: ['husk'],
    firstWaveDelay: 24, rewards: { card: 'volatile_geode', coins: 50 },
    tutorial: ['点击掉落的光球收集光能。', '先在左侧种下光苔，持续获得光能。', '在每一行部署棱晶射手抵御蚀灵。'],
  },
  {
    id: '1-2', name: '晶石埋伏', chapter: 1, index: 2, map: 'verdant_plains', time: 'day', startLumen: 50,
    desc: '爆裂晶石便宜又致命，只需要一点时间充能。',
    gen: gen(6, 1.5, 0.6, ['husk', 'shard_husk'], { flagEvery: 6 }), enemyPool: ['husk', 'shard_husk'],
    rewards: { card: 'stone_warden', coins: 60 },
  },
  {
    id: '1-3', name: '石像之壁', chapter: 1, index: 3, map: 'verdant_plains', time: 'day', startLumen: 50,
    desc: '用岩壁石像挡住敌人，让射手安心输出。',
    gen: gen(8, 1.5, 0.8, ['husk', 'shard_husk'], { flagEvery: 8 }), enemyPool: ['husk', 'shard_husk'],
    rewards: { card: 'nova_core', coins: 70 },
  },
  {
    id: '1-4', name: '跃影来袭', chapter: 1, index: 4, map: 'verdant_ridge', time: 'day', startLumen: 50,
    desc: '跃影会跳过第一个守卫。高地上的单位伤害更高。',
    gen: gen(10, 2, 0.8, ['husk', 'shard_husk', 'leaper'], { flagEvery: 5 }), enemyPool: ['husk', 'shard_husk', 'leaper'],
    rewards: { card: 'frost_shard', coins: 80 },
  },
  {
    id: '1-5', name: '烈日铁盔', chapter: 1, index: 5, map: 'verdant_ridge', time: 'day', startLumen: 50,
    desc: '烈日让天降光能增加，但铁盔蚀灵非常耐打。',
    gen: gen(10, 2, 1, ['husk', 'shard_husk', 'leaper', 'iron_husk'], { flagEvery: 5 }), enemyPool: ['husk', 'shard_husk', 'leaper', 'iron_husk'],
    weather: { mode: 'fixed', id: 'sunny' }, rewards: { card: 'maw_crystal', coins: 90 },
  },
  {
    id: '1-6', name: '狂战之潮', chapter: 1, index: 6, map: 'verdant_plains', time: 'day', startLumen: 50,
    desc: '第一章的终章：狂战蚀灵与随机事件。',
    gen: gen(14, 2, 1.1, ['husk', 'shard_husk', 'leaper', 'iron_husk', 'berserker'], { flagEvery: 7 }),
    enemyPool: ['husk', 'shard_husk', 'leaper', 'iron_husk', 'berserker'], events: ev(),
    weather: cycle(['clear', 70], ['sunny', 50], ['rain', 50]), rewards: { card: 'repeater_prism', coins: 150, skill: 'lumen_rain' },
  },
  /* ------------------------------ 第二章 ------------------------------ */
  {
    id: '2-1', name: '夜幕降临', chapter: 2, index: 1, map: 'moonwood', time: 'night', startLumen: 175,
    desc: '夜晚没有天降光能。蚀晶碑会在波次中冒出敌人。',
    gen: gen(10, 2, 0.8, ['husk', 'shard_husk', 'leaper'], { flagEvery: 5 }), enemyPool: ['husk', 'shard_husk', 'leaper'],
    rewards: { card: 'moon_archer', coins: 80 },
  },
  {
    id: '2-2', name: '盾墙推进', chapter: 2, index: 2, map: 'moonwood', time: 'night', startLumen: 175,
    desc: '盾卫的塔盾能挡住正面光弹。',
    gen: gen(12, 2, 1, ['husk', 'shard_husk', 'shieldbearer', 'leaper'], { flagEvery: 6 }), enemyPool: ['husk', 'shard_husk', 'shieldbearer', 'leaper'],
    rewards: { card: 'spike_crystal', coins: 90 },
  },
  {
    id: '2-3', name: '雨夜裂变', chapter: 2, index: 3, map: 'moonwood', time: 'night', startLumen: 175,
    desc: '暴雨之夜，裂变体死后会分裂。',
    gen: gen(12, 2.5, 1, ['husk', 'shard_husk', 'splitter', 'berserker', 'iron_husk'], { flagEvery: 6 }), enemyPool: ['husk', 'shard_husk', 'splitter', 'berserker', 'iron_husk'],
    weather: { mode: 'fixed', id: 'rain' }, rewards: { card: 'ember_totem', coins: 100, skill: 'time_warp' },
  },
  {
    id: '2-4', name: '地底来客', chapter: 2, index: 4, map: 'moonwood_deep', time: 'night', startLumen: 175,
    desc: '掘地蚀灵会从最左侧钻出，注意后方。',
    gen: gen(14, 2.5, 1.1, ['husk', 'shard_husk', 'burrower', 'shieldbearer', 'leaper'], { flagEvery: 7 }), enemyPool: ['husk', 'shard_husk', 'burrower', 'shieldbearer', 'leaper'],
    rewards: { card: 'janus_prism', coins: 110 },
  },
  {
    id: '2-5', name: '月蚀祭仪', chapter: 2, index: 5, map: 'moonwood_deep', time: 'night', startLumen: 175,
    desc: '月蚀让敌人更敏捷，祭司会治疗同伴。',
    gen: gen(16, 3, 1.1, ['husk', 'shard_husk', 'priest', 'splitter', 'iron_husk', 'berserker'], { flagEvery: 8 }), enemyPool: ['husk', 'shard_husk', 'priest', 'splitter', 'iron_husk', 'berserker'],
    weather: cycle(['clear', 60], ['eclipse', 40]), events: ev(), rewards: { card: 'frost_bloom', coins: 120 },
  },
  {
    id: '2-6', name: '深渊巨蠕', chapter: 2, index: 6, map: 'moonwood', time: 'night', startLumen: 150, bossLevel: true,
    desc: '首领战！深渊巨蠕会在不同行之间钻行，吞噬前排守卫。',
    gen: gen(8, 3, 1, ['husk', 'shard_husk', 'iron_husk', 'splitter'], { flagEvery: 8, bossAtEnd: 'boss_wyrm' }), enemyPool: ['husk', 'shard_husk', 'iron_husk', 'splitter', 'boss_wyrm'],
    rewards: { card: 'drift_plate', coins: 300 },
  },
  /* ------------------------------ 第三章 ------------------------------ */
  {
    id: '3-1', name: '湖光初探', chapter: 3, index: 1, map: 'spring_lake', time: 'day', startLumen: 75,
    desc: '中间两行是水路：先放浮晶台才能部署陆地单位。潜渊者从水中来袭。',
    gen: gen(12, 2.12, 0.8, ['husk', 'shard_husk', 'diver', 'leaper'], { flagEvery: 6 }), enemyPool: ['husk', 'shard_husk', 'diver', 'leaper'],
    forcedCards: ['drift_plate'], rewards: { card: 'tide_lurker', coins: 100 },
  },
  {
    id: '3-2', name: '盾阵渡湖', chapter: 3, index: 2, map: 'spring_lake', time: 'day', startLumen: 75,
    desc: '更多盾卫——抛射单位可以越过盾牌。',
    gen: gen(14, 2.55, 0.88, ['husk', 'shard_husk', 'diver', 'shieldbearer', 'iron_husk'], { flagEvery: 7 }), enemyPool: ['husk', 'shard_husk', 'diver', 'shieldbearer', 'iron_husk'],
    rewards: { card: 'pebble_lobber', coins: 110 },
  },
  {
    id: '3-3', name: '术士之潮', chapter: 3, index: 3, map: 'spring_lake', time: 'day', startLumen: 75,
    desc: '唤潮术士会召唤蚀灵，优先击杀它们。',
    gen: gen(16, 2.55, 0.96, ['husk', 'shard_husk', 'diver', 'summoner', 'berserker'], { flagEvery: 8 }), enemyPool: ['husk', 'shard_husk', 'diver', 'summoner', 'berserker'],
    weather: cycle(['clear', 60], ['rain', 40], ['sunny', 40]), rewards: { card: 'flame_pillar', coins: 120, skill: 'meteor_strike' },
  },
  {
    id: '3-4', name: '双生之光', chapter: 3, index: 4, map: 'spring_lake', time: 'day', startLumen: 75,
    desc: '敌人数量更多，经济要跟上。',
    gen: gen(18, 2.98, 0.96, ['husk', 'shard_husk', 'diver', 'splitter', 'iron_husk', 'leaper', 'priest'], { flagEvery: 9 }), enemyPool: ['husk', 'shard_husk', 'diver', 'splitter', 'iron_husk', 'leaper', 'priest'],
    events: ev(), rewards: { card: 'twin_moss', coins: 130 },
  },
  {
    id: '3-5', name: '暴雪湖面', chapter: 3, index: 5, map: 'spring_lake', time: 'day', startLumen: 75,
    desc: '暴雪减缓了一切，也让霜晶更加强大。',
    gen: gen(18, 2.98, 1.04, ['husk', 'shard_husk', 'diver', 'shieldbearer', 'berserker', 'splitter', 'bomber'], { flagEvery: 9 }), enemyPool: ['husk', 'shard_husk', 'diver', 'shieldbearer', 'berserker', 'splitter', 'bomber'],
    weather: { mode: 'fixed', id: 'blizzard' }, rewards: { card: 'boomerang_thorn', coins: 140 },
  },
  {
    id: '3-6', name: '空袭预警', chapter: 3, index: 6, map: 'spring_lake', time: 'day', startLumen: 100,
    desc: '浮游蚀灵从空中越过防线！只有对空单位能击落它们。',
    gen: gen(20, 2.98, 1.04, ['husk', 'shard_husk', 'diver', 'floater', 'iron_husk', 'summoner'], { flagEvery: 10 }), enemyPool: ['husk', 'shard_husk', 'diver', 'floater', 'iron_husk', 'summoner'],
    events: ev(), rewards: { card: 'trident_prism', coins: 200 },
  },
  /* ------------------------------ 第四章 ------------------------------ */
  {
    id: '4-1', name: '雾中低语', chapter: 4, index: 1, map: 'fog_marsh', time: 'night', startLumen: 175,
    desc: '浓雾遮蔽了右侧战场，暗影刺客在雾中潜行。',
    gen: gen(14, 2.17, 0.75, ['husk', 'shard_husk', 'diver', 'shade', 'leaper'], { flagEvery: 7 }), enemyPool: ['husk', 'shard_husk', 'diver', 'shade', 'leaper'],
    weather: { mode: 'fixed', id: 'fog' }, rewards: { card: 'lantern_crystal', coins: 120 },
  },
  {
    id: '4-2', name: '雾海浮游', chapter: 4, index: 2, map: 'fog_marsh', time: 'night', startLumen: 175,
    desc: '浮游蚀灵借着雾气逼近。',
    gen: gen(16, 2.17, 0.82, ['husk', 'shard_husk', 'diver', 'floater', 'shade', 'iron_husk'], { flagEvery: 8 }), enemyPool: ['husk', 'shard_husk', 'diver', 'floater', 'shade', 'iron_husk'],
    weather: { mode: 'fixed', id: 'fog' }, rewards: { card: 'gale_fan', coins: 130 },
  },
  {
    id: '4-3', name: '铁甲洪流', chapter: 4, index: 3, map: 'fog_marsh', time: 'night', startLumen: 175,
    desc: '大量金属护甲敌人与攻城槌。',
    gen: gen(18, 2.53, 0.88, ['iron_husk', 'shieldbearer', 'ram', 'diver', 'shard_husk', 'husk'], { flagEvery: 9 }), enemyPool: ['iron_husk', 'shieldbearer', 'ram', 'diver', 'shard_husk', 'husk'],
    weather: cycle(['fog', 50], ['rain', 40]), rewards: { card: 'magnet_crystal', coins: 140, skill: 'aegis' },
  },
  {
    id: '4-4', name: '雷暴之夜', chapter: 4, index: 4, map: 'fog_marsh', time: 'night', startLumen: 175,
    desc: '雷暴随机劈落，天地间满是蚀潮。',
    gen: gen(18, 2.89, 0.88, ['husk', 'shard_husk', 'diver', 'floater', 'splitter', 'priest', 'bomber'], { flagEvery: 9 }), enemyPool: ['husk', 'shard_husk', 'diver', 'floater', 'splitter', 'priest', 'bomber'],
    weather: cycle(['storm', 60], ['fog', 40]), events: ev(), rewards: { card: 'storm_spire', coins: 150 },
  },
  {
    id: '4-5', name: '刺客之夜', chapter: 4, index: 5, map: 'fog_marsh', time: 'night', startLumen: 175,
    desc: '暗影刺客成群结队，保护好后排。',
    gen: gen(20, 2.89, 0.95, ['husk', 'shade', 'diver', 'berserker', 'summoner', 'iron_husk', 'floater'], { flagEvery: 10 }), enemyPool: ['husk', 'shade', 'diver', 'berserker', 'summoner', 'iron_husk', 'floater'],
    weather: { mode: 'fixed', id: 'fog' }, events: ev(), rewards: { card: 'mender_crystal', coins: 160 },
  },
  {
    id: '4-6', name: '风暴巨兽', chapter: 4, index: 6, map: 'fog_marsh', time: 'night', startLumen: 175, bossLevel: true,
    desc: '首领战！风暴巨兽在低空盘旋，召唤雷电与浮游蚀灵。',
    gen: gen(8, 2.89, 0.82, ['husk', 'shard_husk', 'diver', 'floater', 'iron_husk'], { flagEvery: 8, bossAtEnd: 'boss_tempest' }), enemyPool: ['husk', 'shard_husk', 'diver', 'floater', 'iron_husk', 'boss_tempest'],
    weather: { mode: 'fixed', id: 'storm' }, rewards: { card: 'meteor_lobber', coins: 400 },
  },
  /* ------------------------------ 第五章 ------------------------------ */
  {
    id: '5-1', name: '遗迹之门', chapter: 5, index: 1, map: 'sky_ruins', time: 'day', startLumen: 75,
    desc: '冰面会加速敌人，高地强化守卫。霜轮车会碾碎一切。',
    gen: gen(16, 2.98, 1.04, ['husk', 'shard_husk', 'iron_husk', 'frost_hauler', 'leaper', 'berserker'], { flagEvery: 8 }), enemyPool: ['husk', 'shard_husk', 'iron_husk', 'frost_hauler', 'leaper', 'berserker'],
    rewards: { card: 'monolith', coins: 150 },
  },
  {
    id: '5-2', name: '投石阵地', chapter: 5, index: 2, map: 'sky_ruins', time: 'day', startLumen: 75,
    desc: '投石蚀车会从远处轰击你的后排。',
    gen: gen(18, 3.4, 1.04, ['husk', 'shard_husk', 'catapult', 'shieldbearer', 'leaper', 'floater'], { flagEvery: 9 }), enemyPool: ['husk', 'shard_husk', 'catapult', 'shieldbearer', 'leaper', 'floater'],
    weather: cycle(['clear', 50], ['sandstorm', 40]), rewards: { card: 'gravity_well', coins: 160, skill: 'thunderclap' },
  },
  {
    id: '5-3', name: '巨像苏醒', chapter: 5, index: 3, map: 'sky_spire', time: 'day', startLumen: 75,
    desc: '蚀岩巨像能一击砸碎守卫，并在半血时投出小魔。路线会在尽头转向。',
    gen: gen(18, 3.82, 1.12, ['husk', 'iron_husk', 'colossus', 'splitter', 'priest', 'bomber'], { flagEvery: 9 }), enemyPool: ['husk', 'iron_husk', 'colossus', 'imp', 'splitter', 'priest', 'bomber'],
    events: ev(), rewards: { card: 'resonance_bell', coins: 170, skill: 'restoration' },
  },
  {
    id: '5-4', name: '万象天气', chapter: 5, index: 4, map: 'sky_spire', time: 'day', startLumen: 75,
    desc: '天气瞬息万变，所有敌人一齐出动。',
    gen: gen(20, 3.82, 1.2, ['husk', 'shard_husk', 'iron_husk', 'leaper', 'shieldbearer', 'berserker', 'floater', 'splitter', 'ram', 'frost_hauler'], { flagEvery: 10 }),
    enemyPool: ['husk', 'shard_husk', 'iron_husk', 'leaper', 'shieldbearer', 'berserker', 'floater', 'splitter', 'ram', 'frost_hauler'],
    weather: { mode: 'random', pool: ['clear', 'sunny', 'rain', 'storm', 'blizzard', 'sandstorm'], min: 25, max: 45 }, events: ev(30, 55), rewards: { coins: 250 },
  },
  {
    id: '5-5', name: '最后防线', chapter: 5, index: 5, map: 'sky_ruins', time: 'day', startLumen: 100,
    desc: '决战前夜，蚀潮倾巢而出。',
    gen: gen(24, 4.25, 1.2, ['husk', 'shard_husk', 'iron_husk', 'colossus', 'catapult', 'summoner', 'shade', 'priest', 'bomber', 'floater'], { flagEvery: 8 }),
    enemyPool: ['husk', 'shard_husk', 'iron_husk', 'colossus', 'imp', 'catapult', 'summoner', 'shade', 'priest', 'bomber', 'floater'],
    events: ev(), weather: cycle(['clear', 60], ['storm', 40], ['sunny', 40]), rewards: { coins: 300 },
  },
  {
    id: '5-6', name: '蚀之王', chapter: 5, index: 6, map: 'sky_ruins', time: 'day', startLumen: 200, bossLevel: true,
    desc: '最终首领战！击败盘踞在遗迹尽头的蚀之王。',
    gen: gen(6, 3.4, 0.96, ['husk', 'shard_husk', 'iron_husk', 'leaper', 'berserker'], { flagEvery: 6, bossAtEnd: 'boss_king' }),
    enemyPool: ['husk', 'shard_husk', 'iron_husk', 'leaper', 'berserker', 'colossus', 'boss_king'], rewards: { coins: 1000 },
  },
];

/** 无尽 / 生存使用的场地 */
export const ARENAS = [
  { id: 'day', name: '白昼平原', map: 'verdant_plains', time: 'day' as const },
  { id: 'night', name: '月夜森林', map: 'moonwood', time: 'night' as const },
  { id: 'lake', name: '灵泉湖畔', map: 'spring_lake', time: 'day' as const },
  { id: 'fog', name: '迷雾沼泽', map: 'fog_marsh', time: 'night' as const },
  { id: 'sky', name: '浮空遗迹', map: 'sky_ruins', time: 'day' as const },
];

const ALL_SPAWNABLE = [
  'husk', 'shard_husk', 'iron_husk', 'leaper', 'shieldbearer', 'berserker', 'burrower', 'floater', 'summoner',
  'colossus', 'imp', 'frost_hauler', 'catapult', 'diver', 'splitter', 'shade', 'priest', 'bomber', 'ram',
  'pogo_husk', 'wave_rider', 'bungee_husk',
];

export function makeEndlessLevel(arenaId: string): LevelDef {
  const a = ARENAS.find((x) => x.id === arenaId) ?? ARENAS[0];
  return {
    id: `endless-${a.id}`,
    name: `无尽模式 · ${a.name}`,
    desc: '波次无穷无尽，难度不断提升。每 20 波出现首领。坚持得越久越好！',
    map: a.map,
    time: a.time,
    startLumen: 150,
    gen: { count: 9999, flagEvery: 10, base: 3, growth: 1.25, pool: ALL_SPAWNABLE, flagMul: 2.2 },
    enemyPool: ALL_SPAWNABLE,
    objective: { type: 'endless' },
    events: { enabled: true, interval: [45, 75] },
    weather: { mode: 'random', pool: ['clear', 'clear', 'sunny', 'rain', 'storm', 'blizzard', 'sandstorm'], min: 40, max: 70 },
  };
}

export function makeSurvivalLevel(arenaId: string, hard = false): LevelDef {
  const a = ARENAS.find((x) => x.id === arenaId) ?? ARENAS[0];
  const rounds = hard ? 10 : 5;
  return {
    id: `survival-${a.id}${hard ? '-hard' : ''}`,
    name: `生存挑战 · ${a.name}${hard ? '（困难）' : ''}`,
    desc: `连续撑过 ${rounds} 轮大波攻势（每轮 2 面旗帜）。每轮之间可以重新挑选卡牌，阵地保留。`,
    map: a.map,
    time: a.time,
    startLumen: 300,
    gen: { count: rounds * 10, flagEvery: 5, base: hard ? 5 : 3.5, growth: hard ? 1.4 : 1.0, pool: ALL_SPAWNABLE, flagMul: 2.4 },
    enemyPool: ALL_SPAWNABLE,
    objective: { type: 'waves' },
    waveGap: [4, 18],
    firstWaveDelay: 15,
    events: { enabled: true, interval: [50, 80] },
  };
}

export function findLevel(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevelId(id: string): string | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1].id : undefined;
}
