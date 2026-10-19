import { version as packageVersion } from '../../package.json';

/** 固定逻辑帧率。所有模拟以固定步长推进，保证确定性与可回放。 */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

/** 秒 -> tick */
export const sec = (s: number): number => Math.round(s * TICK_RATE);

export const GAME_VERSION = packageVersion;

/** 星级强化倍率（战斗内强化） */
export const RANK_MUL = [1, 1, 1.35, 1.75];
/** 强化消耗 = 卡牌费用 * 系数 */
export const RANK_COST_MUL = [0, 0, 0.75, 1.25];

/** 局外升级：每级加成 */
export const META_LEVEL_BONUS = 0.08;
export const META_MAX_LEVEL = 5;

export const ORB_LIFETIME = 14; // 秒
export const SKY_DROP_VALUE = 25;

export const DEFAULT_DECK_SLOTS = 6;
export const MAX_DECK_SLOTS = 10;
