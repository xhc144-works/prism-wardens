import type { TerrainCode, WeatherId } from '../types';

/* ------------------------------ 地形 ------------------------------ */

export interface TerrainDef {
  code: TerrainCode;
  name: string;
  desc: string;
  placeable: boolean; // 陆地单位可直接放置
  water?: boolean;
  dmgMul?: number; // 放置其上的单位伤害倍率
  prodMul?: number; // 生产倍率
  enemySpeedMul?: number;
  unitDot?: number; // 每秒对单位造成伤害
  color: string;
}

export const TERRAIN: Record<TerrainCode, TerrainDef> = {
  g: { code: 'g', name: '苔原', desc: '普通地面。', placeable: true, color: '#5fae5a' },
  w: { code: 'w', name: '灵泉', desc: '水面：需要浮晶台，或放置水生单位。潜渊者在此穿行。', placeable: false, water: true, color: '#3a8fc2' },
  r: { code: 'r', name: '岩石', desc: '无法部署单位。', placeable: false, color: '#7d7468' },
  h: { code: 'h', name: '高地', desc: '居高临下：单位伤害 +25%。', placeable: true, dmgMul: 1.25, color: '#9c8f5a' },
  v: { code: 'v', name: '晶脉', desc: '地脉富集：生产型单位产量 +50%。', placeable: true, prodMul: 1.5, color: '#6fbf9a' },
  b: { code: 'b', name: '蚀地', desc: '被侵蚀的土地：单位每秒损失 6 生命，敌人移速 +20%。', placeable: true, enemySpeedMul: 1.2, unitDot: 6, color: '#6b4f7a' },
  i: { code: 'i', name: '冰面', desc: '光滑冰面：敌人移速 +25%。', placeable: true, enemySpeedMul: 1.25, color: '#bfe3f2' },
  x: { code: 'x', name: '虚空', desc: '断裂的地面，无法部署。', placeable: false, color: '#1a1a2a' },
};

/* ------------------------------ 天气 ------------------------------ */

export interface WeatherDef {
  id: WeatherId;
  name: string;
  desc: string;
  icon: string;
  skyMul: number;
  fireMul: number;
  slowDurMul: number;
  enemySpeedMul: number;
  unitRateMul: number;
  missChance: number;
  chainBonus: number;
  lightning?: boolean;
  fog?: boolean;
  dark?: boolean; // 视为夜晚
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear: { id: 'clear', name: '晴朗', desc: '风和日丽，一切如常。', icon: '☁', skyMul: 1, fireMul: 1, slowDurMul: 1, enemySpeedMul: 1, unitRateMul: 1, missChance: 0, chainBonus: 0 },
  sunny: { id: 'sunny', name: '烈日', desc: '天降光能 +50%，火焰伤害 +25%，减速持续时间 -30%。', icon: '☀', skyMul: 1.5, fireMul: 1.25, slowDurMul: 0.7, enemySpeedMul: 1, unitRateMul: 1, missChance: 0, chainBonus: 0 },
  rain: { id: 'rain', name: '暴雨', desc: '天降光能 -40%，火焰伤害 -30%，敌人移速 -10%，闪电多跳 1 次。', icon: '☂', skyMul: 0.6, fireMul: 0.7, slowDurMul: 1, enemySpeedMul: 0.9, unitRateMul: 1, missChance: 0, chainBonus: 1 },
  storm: { id: 'storm', name: '雷暴', desc: '雷电随机劈落，多数劈中敌人，偶尔误伤守卫。闪电多跳 1 次。', icon: '⛈', skyMul: 0.7, fireMul: 0.85, slowDurMul: 1, enemySpeedMul: 1, unitRateMul: 1, missChance: 0, chainBonus: 1, lightning: true },
  fog: { id: 'fog', name: '浓雾', desc: '右侧战场被迷雾笼罩，无法看清敌人（灯笼晶可照亮）。', icon: '🌫', skyMul: 0.8, fireMul: 1, slowDurMul: 1, enemySpeedMul: 1, unitRateMul: 1, missChance: 0, chainBonus: 0, fog: true },
  blizzard: { id: 'blizzard', name: '暴雪', desc: '敌人移速 -20%，守卫攻速 -10%，减速效果持续时间 +50%。', icon: '❄', skyMul: 0.8, fireMul: 1.1, slowDurMul: 1.5, enemySpeedMul: 0.8, unitRateMul: 0.9, missChance: 0, chainBonus: 0 },
  eclipse: { id: 'eclipse', name: '月蚀', desc: '天空暗下：没有天降光能，月影单位强化，敌人移速 +10%。', icon: '🌑', skyMul: 0, fireMul: 1, slowDurMul: 1, enemySpeedMul: 1.1, unitRateMul: 1, missChance: 0, chainBonus: 0, dark: true },
  sandstorm: { id: 'sandstorm', name: '沙暴', desc: '直射弹有 15% 几率偏离，敌人移速 -10%。', icon: '🌪', skyMul: 0.9, fireMul: 1, slowDurMul: 1, enemySpeedMul: 0.9, unitRateMul: 1, missChance: 0.15, chainBonus: 0 },
};

/* ------------------------------ 随机事件 ------------------------------ */

export interface EventDef {
  id: string;
  name: string;
  desc: string;
  duration: number;
  weight: number;
  good: boolean;
}

export const EVENTS: EventDef[] = [
  { id: 'meteor_shower', name: '流星雨', desc: '流星划破天际，随机砸向战场（主要伤害敌人）。', duration: 10, weight: 3, good: true },
  { id: 'lumen_surge', name: '光潮', desc: '15 秒内天降光能频率 ×3。', duration: 15, weight: 3, good: true },
  { id: 'blight_surge', name: '蚀潮涌动', desc: '10 秒内所有敌人移速 +35%。', duration: 10, weight: 3, good: false },
  { id: 'supply_drop', name: '补给空投', desc: '空投一个随机道具（立即可用）与 75 光能。', duration: 0, weight: 2, good: true },
  { id: 'merchant', name: '流浪商人', desc: '所有卡牌冷却立即完成。', duration: 0, weight: 2, good: true },
  { id: 'quake', name: '地震', desc: '大地开裂：随机 3 个空格 20 秒内无法部署，并对所有敌人造成 60 伤害。', duration: 20, weight: 2, good: false },
  { id: 'ambush', name: '伏击', desc: '一小队敌人突然从侧翼出现。', duration: 0, weight: 2, good: false },
  { id: 'blessing', name: '晶灵祝福', desc: '12 秒内所有守卫伤害 +40%。', duration: 12, weight: 2, good: true },
];

/* ------------------------------ 组合技 ------------------------------ */

export interface ComboDef {
  id: string;
  name: string;
  desc: string;
  units: string[]; // 参与的单位
}

export const COMBOS: ComboDef[] = [
  { id: 'photon_resonance', name: '光合共振', desc: '3 株生产单位连成一条直线：每株产量速度 +25%。', units: ['lumen_moss', 'twin_moss'] },
  { id: 'prism_array', name: '棱镜阵列', desc: '棱晶系射手上下相邻：伤害 +15%。', units: ['prism_shooter', 'repeater_prism', 'trident_prism', 'janus_prism'] },
  { id: 'steam_burst', name: '熔霜蒸汽', desc: '熔火图腾与霜晶射手相邻：霜晶弹穿过图腾化为蒸汽弹，范围伤害并减速。', units: ['ember_totem', 'frost_shard'] },
  { id: 'superconductor', name: '超导链', desc: '雷鸣塔与霜晶射手相邻：闪电对减速敌人伤害 ×1.5，并多跳 1 次。', units: ['storm_spire', 'frost_shard'] },
  { id: 'living_wall', name: '坚壁回春', desc: '愈晶与屏障相邻：屏障获得双倍治疗与 +20% 最大生命。', units: ['mender_crystal', 'stone_warden', 'monolith'] },
  { id: 'resonant_storm', name: '共鸣雷暴', desc: '共鸣铃与雷鸣塔相邻：闪电额外跳跃 2 次。', units: ['resonance_bell', 'storm_spire'] },
  { id: 'moonlit_prism', name: '月下棱光', desc: '月影射手与灯笼晶相邻：始终享受夜晚加成。', units: ['moon_archer', 'lantern_crystal'] },
  { id: 'gravity_trap', name: '引力陷阱', desc: '引力井同行 3 格内有地刺晶簇：被牵引的敌人额外承受 150 伤害。', units: ['gravity_well', 'spike_crystal'] },
];
