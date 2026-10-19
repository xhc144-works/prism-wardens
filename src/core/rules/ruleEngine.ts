import type { Command, RuleConstraints, RuleSet, UnitDef } from '../types';
import type { World } from '../sim/world';
import { CONTENT } from '../content/registry';
import { SKILLS, ITEMS } from '../content/abilities';
import { DEFAULT_DECK_SLOTS, MAX_DECK_SLOTS } from '../constants';

export interface RuleCheck {
  ok: boolean;
  reason?: string;
}

/** 提供给规则脚本的只读视图 */
export interface RuleView {
  time: number;
  tick: number;
  wave: number;
  totalWaves: number;
  lumen: number;
  spent: number;
  ops: number;
  placements: number;
  enemiesAlive: number;
  weather: string;
  units(): { id: number; unit: string; category: string; row: number; col: number; hp: number; maxHp: number; rank: number }[];
  enemies(): { id: number; enemy: string; row: number; x: number; hp: number }[];
  unitsInRow(row: number): number;
  unitsInCol(col: number): number;
  countUnit(id: string): number;
}

export interface ScriptHooks {
  onCommand?: (cmd: Command, view: RuleView) => boolean | string | undefined | void;
  onTick?: (view: RuleView) => { fail?: string; win?: boolean } | undefined | void;
  onDeck?: (deck: string[]) => boolean | string | undefined | void;
  describe?: string;
}

const SANDBOX_PRELUDE =
  '"use strict";\n' +
  'const window = undefined, document = undefined, globalThis = undefined, self = undefined, fetch = undefined,' +
  ' XMLHttpRequest = undefined, WebSocket = undefined, require = undefined, process = undefined, importScripts = undefined,' +
  ' localStorage = undefined, indexedDB = undefined, Function = undefined;\n';

/** 编译规则脚本。脚本应 `return { onCommand, onTick, onDeck, describe }`。 */
export function compileRuleScript(src: string): { hooks: ScriptHooks | null; error?: string } {
  if (!src || !src.trim()) return { hooks: null };
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function('api', SANDBOX_PRELUDE + src) as (api: unknown) => ScriptHooks;
    const hooks = factory({ version: 1 });
    if (!hooks || typeof hooks !== 'object') return { hooks: null, error: '脚本必须 return 一个对象，例如 return { onCommand(cmd, s) { ... } }' };
    return { hooks };
  } catch (e) {
    return { hooks: null, error: `脚本编译失败: ${(e as Error).message}` };
  }
}

export function makeRuleView(w: World): RuleView {
  return {
    time: w.time,
    tick: w.tick,
    wave: w.waveIndex,
    totalWaves: w.totalWaves,
    lumen: w.lumen,
    spent: w.stats.lumenSpent,
    ops: w.stats.ops,
    placements: w.stats.placementsTotal,
    enemiesAlive: w.enemies.length,
    weather: w.weather.id,
    units: () =>
      w.units
        .filter((u) => !u.dead && !u.relic)
        .map((u) => ({ id: u.id, unit: u.def.id, category: u.def.category, row: u.row, col: u.col, hp: u.hp, maxHp: u.maxHp, rank: u.rank })),
    enemies: () => w.enemies.filter((e) => !e.dead).map((e) => ({ id: e.id, enemy: e.def.id, row: e.row, x: e.x, hp: e.hp + e.armor })),
    unitsInRow: (row) => w.units.filter((u) => !u.dead && !u.relic && !u.def.instant && u.row === row).length,
    unitsInCol: (col) => w.units.filter((u) => !u.dead && !u.relic && !u.def.instant && u.col === col).length,
    countUnit: (id) => w.units.filter((u) => !u.dead && u.def.id === id).length,
  };
}

/**
 * 挑战规则引擎。所有来源（人类 / AI / 自动部署）的指令都要经过 validateCommand，
 * AI 无法通过修改器或其它途径绕过（挑战模式下修改器在世界层面被强制关闭）。
 */
export class RuleEngine {
  readonly set: RuleSet;
  readonly c: RuleConstraints;
  hooks: ScriptHooks | null = null;
  scriptError?: string;
  runtimeErrors: string[] = [];

  constructor(set: RuleSet) {
    this.set = set;
    this.c = set.constraints ?? {};
    if (set.script) {
      const r = compileRuleScript(set.script);
      this.hooks = r.hooks;
      this.scriptError = r.error;
    }
  }

  /** 卡牌本身是否被规则允许（不考虑数量等动态限制） */
  isCardAllowed(def: UnitDef): RuleCheck {
    const c = this.c;
    if (c.allowedCards && c.allowedCards.length && !c.allowedCards.includes(def.id)) return { ok: false, reason: `只允许使用指定卡牌（${def.name} 不在名单内）` };
    if (c.allowedCategories && c.allowedCategories.length && !c.allowedCategories.includes(def.category)) return { ok: false, reason: `只允许使用指定类型的单位（${def.name} 类型不符）` };
    if (c.allowedAttackKinds && c.allowedAttackKinds.length && !c.allowedAttackKinds.includes(def.attack)) return { ok: false, reason: `只允许指定攻击方式（${def.name} 不符）` };
    if (c.bannedCards?.includes(def.id)) return { ok: false, reason: `${def.name} 已被禁用` };
    if (c.bannedCategories?.includes(def.category)) return { ok: false, reason: `${def.name} 所属类型已被禁用` };
    return { ok: true };
  }

  isSkillAllowed(id: string): boolean {
    return !this.c.noSkills && !this.c.bannedSkills?.includes(id);
  }
  isItemAllowed(id: string): boolean {
    return !this.c.noItems && !this.c.bannedItems?.includes(id);
  }

  validateDeck(deck: string[], skills: string[] = [], items: Record<string, number> = {}): string[] {
    const errs: string[] = [];
    if (this.c.maxDeckSize != null && deck.length > this.c.maxDeckSize) errs.push(`卡组最多 ${this.c.maxDeckSize} 张（当前 ${deck.length}）`);
    for (const id of deck) {
      const def = CONTENT.units.get(id);
      if (!def) {
        errs.push(`未知卡牌 ${id}`);
        continue;
      }
      const r = this.isCardAllowed(def);
      if (!r.ok) errs.push(r.reason!);
    }
    for (const s of skills) if (!this.isSkillAllowed(s)) errs.push(`技能 ${SKILLS.find((x) => x.id === s)?.name ?? s} 被禁用`);
    for (const [id, n] of Object.entries(items)) if (n > 0 && !this.isItemAllowed(id)) errs.push(`道具 ${ITEMS.find((x) => x.id === id)?.name ?? id} 被禁用`);
    if (this.hooks?.onDeck) {
      try {
        const r = this.hooks.onDeck([...deck]);
        if (r === false) errs.push('卡组不符合脚本规则');
        else if (typeof r === 'string') errs.push(r);
      } catch (e) {
        errs.push(`脚本错误(onDeck): ${(e as Error).message}`);
      }
    }
    return errs;
  }

  private opCheck(w: World): RuleCheck {
    if (this.c.maxOperations != null && w.stats.ops + 1 > this.c.maxOperations) return { ok: false, reason: `操作次数已达上限 ${this.c.maxOperations}` };
    return { ok: true };
  }

  validateCommand(cmd: Command, w: World): RuleCheck {
    const c = this.c;
    let r: RuleCheck = { ok: true };
    switch (cmd.type) {
      case 'place': {
        const def = CONTENT.units.get(cmd.card);
        if (!def) return { ok: false, reason: '未知卡牌' };
        r = this.isCardAllowed(def);
        if (!r.ok) return r;
        const cost = w.cardCost(def);
        if (c.maxTotalSpend != null && w.stats.lumenSpent + cost > c.maxTotalSpend) return { ok: false, reason: `总消耗将超过上限 ${c.maxTotalSpend}` };
        if (c.maxUnitsAlive != null && !def.instant && w.aliveUnitCount() >= c.maxUnitsAlive && !def.upgradeOf) return { ok: false, reason: `场上单位已达上限 ${c.maxUnitsAlive}` };
        if (c.maxPlacements != null && w.stats.placementsTotal >= c.maxPlacements) return { ok: false, reason: `部署次数已达上限 ${c.maxPlacements}` };
        const per = c.maxPerCard?.[def.id];
        if (per != null && (w.stats.placements[def.id] ?? 0) >= per) return { ok: false, reason: `${def.name} 最多部署 ${per} 次` };
        if (c.placementCols && (cmd.col < c.placementCols[0] || cmd.col > c.placementCols[1])) return { ok: false, reason: `只能部署在第 ${c.placementCols[0] + 1}-${c.placementCols[1] + 1} 列` };
        if (c.placementRows && c.placementRows.length && !c.placementRows.includes(cmd.row)) return { ok: false, reason: `不能在第 ${cmd.row + 1} 行部署` };
        if (c.placementWindows && c.placementWindows.length && !c.placementWindows.some((win) => w.time >= win.from && w.time <= win.to))
          return { ok: false, reason: '当前不在允许部署的时间段' };
        if (c.placeOnlyBetweenWaves && w.waveIndex > 0 && w.enemies.some((e) => !e.dead)) return { ok: false, reason: '只能在波次间隙（场上无敌人时）部署' };
        r = this.opCheck(w);
        break;
      }
      case 'upgrade': {
        if (c.noUpgrades) return { ok: false, reason: '本挑战禁止强化' };
        const u = w.unitAt(cmd.row, cmd.col);
        if (u && c.maxRank != null && u.rank + 1 > c.maxRank) return { ok: false, reason: `最高只能强化到 ${c.maxRank} 星` };
        if (u && c.maxTotalSpend != null && w.stats.lumenSpent + w.upgradeCost(u) > c.maxTotalSpend) return { ok: false, reason: `总消耗将超过上限 ${c.maxTotalSpend}` };
        r = this.opCheck(w);
        break;
      }
      case 'remove':
        if (c.noRemove) return { ok: false, reason: '本挑战禁止移除单位' };
        r = this.opCheck(w);
        break;
      case 'skill':
        if (!this.isSkillAllowed(cmd.skill)) return { ok: false, reason: '该技能被禁用' };
        r = this.opCheck(w);
        break;
      case 'item':
        if (!this.isItemAllowed(cmd.item)) return { ok: false, reason: '该道具被禁用' };
        r = this.opCheck(w);
        break;
      case 'collect':
        if (c.countCollectAsOp) r = this.opCheck(w);
        break;
      case 'reselect': {
        const errs = this.validateDeck(cmd.deck);
        if (errs.length) return { ok: false, reason: errs[0] };
        break;
      }
      default:
        break;
    }
    if (!r.ok) return r;
    if (this.hooks?.onCommand) {
      try {
        const res = this.hooks.onCommand(JSON.parse(JSON.stringify(cmd)), makeRuleView(w));
        if (res === false) return { ok: false, reason: '违反脚本规则' };
        if (typeof res === 'string') return { ok: false, reason: res };
      } catch (e) {
        return { ok: false, reason: `脚本错误: ${(e as Error).message}` };
      }
    }
    return { ok: true };
  }

  /** 每 tick 检查失败/胜利条件 */
  onTick(w: World): { fail?: string; win?: boolean } | null {
    const c = this.c;
    if (c.timeLimit != null && w.time > c.timeLimit) return { fail: `未能在 ${c.timeLimit} 秒内通关` };
    if (c.maxUnitLosses != null && w.stats.unitsLostTotal > c.maxUnitLosses) return { fail: `损失单位超过 ${c.maxUnitLosses} 个` };
    if (this.hooks?.onTick && w.tick % 15 === 0) {
      try {
        const r = this.hooks.onTick(makeRuleView(w));
        if (r && (r.fail || r.win)) return r;
      } catch (e) {
        const msg = (e as Error).message;
        if (this.runtimeErrors.length < 5 && !this.runtimeErrors.includes(msg)) this.runtimeErrors.push(msg);
      }
    }
    return null;
  }

  /** 人类可读的规则说明 */
  describe(): string[] {
    const c = this.c;
    const name = (id: string) => CONTENT.units.get(id)?.name ?? id;
    const out: string[] = [];
    if (c.allowedCards?.length) out.push(`只能使用：${c.allowedCards.map(name).join('、')}`);
    if (c.allowedCategories?.length) out.push(`只能使用类型：${c.allowedCategories.map(categoryName).join('、')}`);
    if (c.allowedAttackKinds?.length) out.push(`只能使用攻击方式：${c.allowedAttackKinds.map(attackName).join('、')}`);
    if (c.bannedCards?.length) out.push(`禁用卡牌：${c.bannedCards.map(name).join('、')}`);
    if (c.bannedCategories?.length) out.push(`禁用类型：${c.bannedCategories.map(categoryName).join('、')}`);
    if (c.bannedSkills?.length) out.push(`禁用技能：${c.bannedSkills.map((s) => SKILLS.find((x) => x.id === s)?.name ?? s).join('、')}`);
    if (c.bannedItems?.length) out.push(`禁用道具：${c.bannedItems.map((s) => ITEMS.find((x) => x.id === s)?.name ?? s).join('、')}`);
    if (c.noSkills) out.push('禁止使用技能');
    if (c.noItems) out.push('禁止使用道具');
    if (c.maxDeckSize != null) out.push(`卡组最多 ${c.maxDeckSize} 张`);
    if (c.maxTotalSpend != null) out.push(`总光能消耗 ≤ ${c.maxTotalSpend}`);
    if (c.maxUnitsAlive != null) out.push(`场上单位 ≤ ${c.maxUnitsAlive}`);
    if (c.maxPlacements != null) out.push(`总部署次数 ≤ ${c.maxPlacements}`);
    if (c.maxOperations != null) out.push(`操作次数 ≤ ${c.maxOperations}${c.countCollectAsOp ? '（收集光能也计入）' : ''}`);
    if (c.maxPerCard) for (const [k, v] of Object.entries(c.maxPerCard)) out.push(`${name(k)} 最多部署 ${v} 次`);
    if (c.placementCols) out.push(`只能部署在第 ${c.placementCols[0] + 1}–${c.placementCols[1] + 1} 列`);
    if (c.placementRows?.length) out.push(`只能部署在第 ${c.placementRows.map((r) => r + 1).join('、')} 行`);
    if (c.placementWindows?.length) out.push(`只能在以下时间部署：${c.placementWindows.map((w) => `${w.from}–${w.to}秒`).join('、')}`);
    if (c.placeOnlyBetweenWaves) out.push('只能在场上没有敌人时部署');
    if (c.noUpgrades) out.push('禁止强化单位');
    if (c.maxRank != null) out.push(`单位最高 ${c.maxRank} 星`);
    if (c.noRemove) out.push('禁止移除单位');
    if (c.cooldownMul != null && c.cooldownMul !== 1) out.push(`卡牌冷却 ×${c.cooldownMul}`);
    if (c.costMul != null && c.costMul !== 1) out.push(`卡牌费用 ×${c.costMul}`);
    if (c.protect?.length) out.push(`保护 ${c.protect.length} 座圣物，任何一座被摧毁即失败`);
    if (c.timeLimit != null) out.push(`必须在 ${c.timeLimit} 秒内通关`);
    if (c.noSentinels) out.push('没有符文哨卫（任何突破即失败）');
    if (c.startLumen != null) out.push(`初始光能 ${c.startLumen}`);
    if (c.noSkyDrops) out.push('没有天降光能');
    if (c.maxUnitLosses != null) out.push(`损失单位不超过 ${c.maxUnitLosses}`);
    if (this.set.script) out.push(`脚本规则${this.hooks?.describe ? `：${this.hooks.describe}` : ''}`);
    if (!out.length) out.push('无额外限制');
    return out;
  }

  /** 静态校验规则本身是否自洽 */
  static validateRuleSet(set: RuleSet, unlocked?: string[]): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const c = set.constraints ?? {};
    if (!set.name?.trim()) errors.push('挑战名称不能为空');
    if (set.level && !CONTENT.level(set.level)) errors.push(`关卡 ${set.level} 不存在`);
    const pool = CONTENT.allUnits().filter((u) => {
      const tmp = new RuleEngine({ ...set, script: undefined });
      return tmp.isCardAllowed(u).ok;
    });
    if (pool.length === 0) errors.push('规则组合后没有任何可用卡牌');
    else if (!pool.some((u) => ['shooter', 'lobber', 'bomb', 'melee', 'trap', 'aquatic'].includes(u.category))) warnings.push('可用卡牌中没有任何攻击型单位，挑战可能无法完成');
    if (unlocked && pool.every((u) => !unlocked.includes(u.id))) warnings.push('可用卡牌均未解锁');
    if (c.maxDeckSize != null && (c.maxDeckSize < 1 || c.maxDeckSize > MAX_DECK_SLOTS)) errors.push(`卡组上限需在 1–${MAX_DECK_SLOTS} 之间`);
    if (c.maxDeckSize != null && c.maxDeckSize > DEFAULT_DECK_SLOTS) warnings.push(`卡组上限 ${c.maxDeckSize} 超过初始卡槽数 ${DEFAULT_DECK_SLOTS}，需要先在商店扩充卡槽`);
    if (c.placementCols && (c.placementCols[0] > c.placementCols[1] || c.placementCols[0] < 0)) errors.push('部署列范围无效');
    if (c.maxTotalSpend != null && c.maxTotalSpend < 50) warnings.push('总消耗上限过低');
    if (c.maxOperations != null && c.maxOperations < 3) warnings.push('操作次数上限过低');
    if (c.timeLimit != null && c.timeLimit < 60) warnings.push('时间限制过短');
    if (c.placementWindows) for (const w of c.placementWindows) if (w.from > w.to) errors.push(`部署时间段 ${w.from}-${w.to} 无效`);
    if (c.cooldownMul != null && c.cooldownMul <= 0) errors.push('冷却倍率必须大于 0');
    if (c.costMul != null && c.costMul < 0) errors.push('费用倍率不能为负');
    if (set.script) {
      const r = compileRuleScript(set.script);
      if (r.error) errors.push(r.error);
    }
    return { errors, warnings };
  }
}

export function categoryName(c: string): string {
  return (
    {
      producer: '生产',
      shooter: '射手',
      lobber: '投手',
      wall: '屏障',
      trap: '陷阱',
      bomb: '爆破',
      melee: '近战',
      support: '辅助',
      aquatic: '水生',
      utility: '功能',
    } as Record<string, string>
  )[c] ?? c;
}

export function attackName(a: string): string {
  return (
    {
      projectile: '直射',
      lob: '抛射',
      chain: '连锁',
      melee: '近战',
      instant: '瞬发',
      aura: '光环',
      none: '无攻击',
    } as Record<string, string>
  )[a] ?? a;
}
