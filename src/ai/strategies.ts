/** AI 策略参数。所有策略共用同一个决策器，只是权重不同；研究系统会自动搜索这些参数。 */
export interface StrategyParams {
  id: string;
  name: string;
  desc: string;
  econPerRow: number; // 每条陆地行的目标生产单位数
  econStop: number; // 波次进度超过该值后不再扩张经济 (0..1)
  safety: number; // 火力需求倍率
  lookahead: number; // 为后续波次预留火力 (0..2)
  wallBias: number; // 屏障倾向
  bombThreshold: number; // 触发炸弹所需的敌方有效生命
  reserve: number; // 保留的应急光能
  frontBias: number; // 进攻单位前置倾向 (0..1)
  upgradeBias: number; // 强化倾向
  supportBias: number; // 辅助单位倾向
  earlyDefense: number; // 开局优先部署的射手数
  thinkInterval: number; // 决策间隔（秒）
  maxActions: number; // 每次决策最多行动数
  skillAggression: number; // 技能/道具使用积极性 (0..1)
  trapBias: number; // 陷阱/地雷倾向
  adaptive?: boolean;
}

export const STRATEGIES: StrategyParams[] = [
  {
    id: 'balanced',
    name: '均衡',
    desc: '经济与防御兼顾，适合大多数关卡。',
    econPerRow: 1.6,
    econStop: 0.55,
    safety: 1.3,
    lookahead: 0.6,
    wallBias: 1,
    bombThreshold: 1500,
    reserve: 50,
    frontBias: 0.2,
    upgradeBias: 0.6,
    supportBias: 0.7,
    earlyDefense: 1,
    thinkInterval: 0.3,
    maxActions: 3,
    skillAggression: 0.6,
    trapBias: 0.8,
  },
  {
    id: 'economy',
    name: '经济优先',
    desc: '开局大量种植生产单位，中后期火力碾压。',
    econPerRow: 2.2,
    econStop: 0.7,
    safety: 1.05,
    lookahead: 0.4,
    wallBias: 1.2,
    bombThreshold: 1300,
    reserve: 25,
    frontBias: 0.15,
    upgradeBias: 1,
    supportBias: 0.8,
    earlyDefense: 0,
    thinkInterval: 0.3,
    maxActions: 3,
    skillAggression: 0.7,
    trapBias: 1.2,
  },
  {
    id: 'defense',
    name: '防御优先',
    desc: '优先保证每一行的火力与屏障，经济适度。',
    econPerRow: 1.2,
    econStop: 0.4,
    safety: 1.7,
    lookahead: 0.9,
    wallBias: 1.6,
    bombThreshold: 1800,
    reserve: 75,
    frontBias: 0.1,
    upgradeBias: 0.5,
    supportBias: 0.6,
    earlyDefense: 2,
    thinkInterval: 0.3,
    maxActions: 3,
    skillAggression: 0.6,
    trapBias: 0.6,
  },
  {
    id: 'rush',
    name: '速攻',
    desc: '少量经济，高火力前压，快速清场以缩短通关时间。',
    econPerRow: 1.0,
    econStop: 0.3,
    safety: 1.6,
    lookahead: 1.4,
    wallBias: 0.5,
    bombThreshold: 1000,
    reserve: 0,
    frontBias: 0.7,
    upgradeBias: 1.4,
    supportBias: 0.5,
    earlyDefense: 1,
    thinkInterval: 0.25,
    maxActions: 4,
    skillAggression: 0.9,
    trapBias: 0.5,
  },
  {
    id: 'conservative',
    name: '保守',
    desc: '大量屏障与冗余火力，始终保留应急光能。',
    econPerRow: 1.5,
    econStop: 0.5,
    safety: 2.0,
    lookahead: 1.0,
    wallBias: 2.0,
    bombThreshold: 2200,
    reserve: 150,
    frontBias: 0,
    upgradeBias: 0.4,
    supportBias: 0.8,
    earlyDefense: 2,
    thinkInterval: 0.35,
    maxActions: 2,
    skillAggression: 0.8,
    trapBias: 0.7,
  },
  {
    id: 'aggressive',
    name: '激进',
    desc: '不留余量，有光能就花，单位尽量前置。',
    econPerRow: 1.4,
    econStop: 0.45,
    safety: 1.15,
    lookahead: 0.7,
    wallBias: 0.6,
    bombThreshold: 900,
    reserve: 0,
    frontBias: 0.6,
    upgradeBias: 1.2,
    supportBias: 0.4,
    earlyDefense: 1,
    thinkInterval: 0.2,
    maxActions: 4,
    skillAggression: 1,
    trapBias: 1,
  },
  {
    id: 'frugal',
    name: '节俭',
    desc: '以最少光能消耗通关为目标（用于极限挑战）。',
    econPerRow: 1.0,
    econStop: 0.35,
    safety: 1.0,
    lookahead: 0.2,
    wallBias: 0.7,
    bombThreshold: 2600,
    reserve: 0,
    frontBias: 0.1,
    upgradeBias: 0,
    supportBias: 0,
    earlyDefense: 1,
    thinkInterval: 0.4,
    maxActions: 2,
    skillAggression: 0.8,
    trapBias: 1.4,
  },
  {
    id: 'adaptive',
    name: '自适应',
    desc: '根据战况在经济、防御、速攻之间实时切换。',
    econPerRow: 1.6,
    econStop: 0.55,
    safety: 1.3,
    lookahead: 0.6,
    wallBias: 1,
    bombThreshold: 1500,
    reserve: 50,
    frontBias: 0.2,
    upgradeBias: 0.7,
    supportBias: 0.7,
    earlyDefense: 1,
    thinkInterval: 0.3,
    maxActions: 3,
    skillAggression: 0.7,
    trapBias: 0.9,
    adaptive: true,
  },
];

export function getStrategy(id: string): StrategyParams {
  return { ...(STRATEGIES.find((s) => s.id === id) ?? STRATEGIES[0]) };
}

/** 可被研究系统调整的数值参数及其范围 */
export const TUNABLE: { key: keyof StrategyParams; min: number; max: number; step: number }[] = [
  { key: 'econPerRow', min: 0.4, max: 2.8, step: 0.1 },
  { key: 'econStop', min: 0.15, max: 0.9, step: 0.05 },
  { key: 'safety', min: 0.8, max: 2.4, step: 0.05 },
  { key: 'lookahead', min: 0, max: 2, step: 0.1 },
  { key: 'wallBias', min: 0, max: 2.5, step: 0.1 },
  { key: 'bombThreshold', min: 600, max: 3000, step: 100 },
  { key: 'reserve', min: 0, max: 200, step: 25 },
  { key: 'frontBias', min: 0, max: 1, step: 0.05 },
  { key: 'upgradeBias', min: 0, max: 2, step: 0.1 },
  { key: 'supportBias', min: 0, max: 1.5, step: 0.1 },
  { key: 'earlyDefense', min: 0, max: 3, step: 1 },
  { key: 'trapBias', min: 0, max: 2, step: 0.1 },
];
