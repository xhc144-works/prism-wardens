import type { RuleSet } from '../types';

/** 内置挑战（也是规则编辑器的示例）。 */
export const BUILTIN_CHALLENGES: RuleSet[] = [
  {
    id: 'pure_shooters',
    name: '纯粹射手',
    desc: '只允许使用生产与射手类单位。没有屏障，没有炸弹，只有纯粹的火力。',
    level: '1-6',
    constraints: { allowedCategories: ['producer', 'shooter'] },
    scoring: 'clear',
    builtin: true,
  },
  {
    id: 'minimalist',
    name: '极简主义',
    desc: '卡组最多 4 张。',
    level: '1-5',
    constraints: { maxDeckSize: 4 },
    scoring: 'min-spend',
    builtin: true,
  },
  {
    id: 'iron_budget',
    name: '铁公鸡',
    desc: '整局总光能消耗不得超过 2500。',
    level: '1-4',
    constraints: { maxTotalSpend: 2500 },
    scoring: 'min-spend',
    builtin: true,
  },
  {
    id: 'ten_guardians',
    name: '十卫守城',
    desc: '场上同时最多 12 个单位。',
    level: '1-5',
    constraints: { maxUnitsAlive: 12 },
    scoring: 'min-units',
    builtin: true,
  },
  {
    id: 'forty_moves',
    name: '六十手',
    desc: '总操作次数（部署/强化/技能/道具）不超过 60 次。',
    level: '1-4',
    constraints: { maxOperations: 60 },
    scoring: 'min-ops',
    builtin: true,
  },
  {
    id: 'back_line',
    name: '后排防线',
    desc: '只能在左侧 5 列部署单位。',
    level: '1-5',
    constraints: { placementCols: [0, 4] },
    scoring: 'clear',
    builtin: true,
  },
  {
    id: 'blitz',
    name: '闪电战',
    desc: '必须在 260 秒内通关。',
    level: '1-4',
    constraints: { timeLimit: 260 },
    scoring: 'fastest',
    builtin: true,
  },
  {
    id: 'relic_guard',
    name: '守护圣物',
    desc: '战场中央有两座圣物，任何一座被摧毁即失败。没有符文哨卫。',
    level: '1-3',
    constraints: {
      protect: [
        { row: 1, col: 3, hp: 1500 },
        { row: 3, col: 3, hp: 1500 },
      ],
      noSentinels: true,
    },
    scoring: 'clear',
    builtin: true,
  },
  {
    id: 'frost_and_fire',
    name: '冰火两重天',
    desc: '只能使用光苔、霜晶射手、熔火图腾、烈焰之柱与寒潮花。',
    level: '2-3',
    constraints: { allowedCards: ['lumen_moss', 'frost_shard', 'ember_totem', 'flame_pillar', 'frost_bloom', 'stone_warden'] },
    scoring: 'clear',
    builtin: true,
  },
  {
    id: 'no_economy',
    name: '无根之木',
    desc: '禁止生产单位，初始 600 光能，只能依靠天降光能。',
    level: '1-3',
    constraints: { bannedCategories: ['producer'], startLumen: 600 },
    scoring: 'clear',
    builtin: true,
  },
  {
    id: 'row_cap_script',
    name: '每行三子（脚本规则）',
    desc: '用脚本实现的规则：每一行最多部署 3 个单位（升级光苔除外）。',
    level: '1-5',
    constraints: {},
    script: `return {
  describe: '每行最多 3 个单位',
  onCommand(cmd, s) {
    if (cmd.type === 'place' && cmd.card !== 'twin_moss' && cmd.card !== 'nova_core' && s.unitsInRow(cmd.row) >= 3) {
      return '第 ' + (cmd.row + 1) + ' 行已有 3 个单位';
    }
    return true;
  }
};`,
    scoring: 'clear',
    builtin: true,
  },
  {
    id: 'timed_deploy',
    name: '限时部署',
    desc: '只能在开局 120 秒内与场上没有敌人时部署单位。',
    level: '1-3',
    constraints: {},
    script: `return {
  describe: '前 120 秒自由部署，之后只能在场上没有敌人时部署',
  onCommand(cmd, s) {
    if (cmd.type !== 'place') return true;
    if (s.time <= 120 || s.enemiesAlive === 0) return true;
    return '120 秒后只能在场上没有敌人时部署';
  }
};`,
    scoring: 'clear',
    builtin: true,
  },
  {
    id: 'hoarder_ban',
    name: '不许囤积（脚本规则）',
    desc: '任何时刻闲置光能超过 600 即判负。',
    level: '1-4',
    constraints: {},
    script: `return {
  describe: '光能超过 600 判负',
  onTick(s) { if (s.lumen > 600) return { fail: '闲置光能超过 600' }; }
};`,
    scoring: 'clear',
    builtin: true,
  },
];
