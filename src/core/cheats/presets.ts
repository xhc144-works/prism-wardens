import type { CheatConfig } from '../types';

export interface CheatPreset {
  id: string;
  name: string;
  config: CheatConfig;
  builtin?: boolean;
}

export const DEFAULT_CHEATS: CheatConfig = {
  infiniteLumen: false,
  noCooldown: false,
  freeCards: false,
  unit: { damage: 1, rate: 1, hp: 1, cost: 1, cooldown: 1 },
  perUnit: {},
  enemy: { hp: 1, speed: 1, count: 1, spawnRate: 1, damage: 1 },
  perEnemy: {},
  autoCollect: false,
  autoDeploy: null,
  invincibleUnits: false,
  infiniteSentinels: false,
  oneHitKill: false,
  noLose: false,
};

export const BUILTIN_PRESETS: CheatPreset[] = [
  { id: 'default', name: '恢复默认（全部关闭）', config: DEFAULT_CHEATS, builtin: true },
  { id: 'sandbox', name: '沙盒创造', config: { ...DEFAULT_CHEATS, infiniteLumen: true, noCooldown: true, autoCollect: true }, builtin: true },
  { id: 'god', name: '无敌守卫', config: { ...DEFAULT_CHEATS, invincibleUnits: true, infiniteSentinels: true, noLose: true }, builtin: true },
  { id: 'glass', name: '玻璃大炮', config: { ...DEFAULT_CHEATS, unit: { damage: 3, rate: 1.5, hp: 0.3, cost: 1, cooldown: 1 } }, builtin: true },
  { id: 'horde', name: '蚀潮狂欢（敌人 ×3）', config: { ...DEFAULT_CHEATS, enemy: { hp: 1, speed: 1.2, count: 3, spawnRate: 2, damage: 1 } }, builtin: true },
  { id: 'relax', name: '休闲模式', config: { ...DEFAULT_CHEATS, autoCollect: true, enemy: { hp: 0.6, speed: 0.8, count: 1, spawnRate: 1, damage: 0.7 } }, builtin: true },
  { id: 'auto_fortress', name: '自动要塞', config: { ...DEFAULT_CHEATS, infiniteLumen: true, autoCollect: true, autoDeploy: { unit: 'repeater_prism', interval: 3, mode: 'threat' } }, builtin: true },
];

export function cloneCheats(c: CheatConfig | null | undefined): CheatConfig {
  return JSON.parse(JSON.stringify({ ...DEFAULT_CHEATS, ...(c ?? {}) }));
}
