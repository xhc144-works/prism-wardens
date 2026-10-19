/** 主动技能（战前选择最多 2 个，有冷却）与消耗道具（局外商店购买）。 */

export type TargetMode = 'none' | 'cell' | 'unit' | 'row';

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  cooldown: number; // 秒
  initialCooldown: number;
  target: TargetMode;
  icon: string;
  color: string;
  price: number; // 商店解锁价格
}

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  target: TargetMode;
  icon: string;
  color: string;
  price: number;
  maxStack: number;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'lumen_rain',
    name: '光雨',
    desc: '立即获得 150 点光能。',
    cooldown: 90,
    initialCooldown: 30,
    target: 'none',
    icon: '☀',
    color: '#ffd166',
    price: 300,
  },
  {
    id: 'time_warp',
    name: '时之沙',
    desc: '全场敌人减速 60%，持续 8 秒。',
    cooldown: 70,
    initialCooldown: 20,
    target: 'none',
    icon: '⌛',
    color: '#9bf6ff',
    price: 500,
  },
  {
    id: 'meteor_strike',
    name: '陨星术',
    desc: '对指定 3×3 区域造成 700 点伤害。',
    cooldown: 60,
    initialCooldown: 20,
    target: 'cell',
    icon: '☄',
    color: '#ff7b39',
    price: 600,
  },
  {
    id: 'aegis',
    name: '守护结界',
    desc: '所有守卫 6 秒内免疫伤害。',
    cooldown: 80,
    initialCooldown: 25,
    target: 'none',
    icon: '⛨',
    color: '#bde0fe',
    price: 600,
  },
  {
    id: 'thunderclap',
    name: '雷霆万钧',
    desc: '闪电随机劈击 10 个敌人，各造成 300 点伤害。',
    cooldown: 75,
    initialCooldown: 25,
    target: 'none',
    icon: '⚡',
    color: '#c8b6ff',
    price: 700,
  },
  {
    id: 'restoration',
    name: '复苏之波',
    desc: '所有守卫恢复 60% 最大生命。',
    cooldown: 60,
    initialCooldown: 15,
    target: 'none',
    icon: '✚',
    color: '#95d5b2',
    price: 400,
  },
];

export const ITEMS: ItemDef[] = [
  {
    id: 'overcharge',
    name: '超载药剂',
    desc: '指定守卫在 10 秒内攻击/生产速度 ×3。',
    target: 'unit',
    icon: '⚗',
    color: '#80ffdb',
    price: 60,
    maxStack: 9,
  },
  {
    id: 'repair_kit',
    name: '修复晶片',
    desc: '指定守卫恢复全部生命，并获得 50% 额外护盾。',
    target: 'unit',
    icon: '🔧',
    color: '#ffd6a5',
    price: 40,
    maxStack: 9,
  },
  {
    id: 'fire_flask',
    name: '烈焰瓶',
    desc: '对指定一行所有敌人造成 600 点伤害。',
    target: 'row',
    icon: '🔥',
    color: '#ff6b35',
    price: 80,
    maxStack: 9,
  },
  {
    id: 'frost_grenade',
    name: '冰霜手雷',
    desc: '冻结指定 3×3 区域的敌人 6 秒。',
    target: 'cell',
    icon: '❄',
    color: '#caf0f8',
    price: 60,
    maxStack: 9,
  },
  {
    id: 'rune_restore',
    name: '符文重铸',
    desc: '恢复一行已经触发过的符文哨卫。',
    target: 'row',
    icon: '◈',
    color: '#e0aaff',
    price: 120,
    maxStack: 5,
  },
  {
    id: 'lumen_crystal',
    name: '光能晶簇',
    desc: '立即获得 100 点光能。',
    target: 'none',
    icon: '◆',
    color: '#fff3b0',
    price: 50,
    maxStack: 9,
  },
];
