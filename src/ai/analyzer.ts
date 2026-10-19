import type { World } from '../core/sim/world';
import { CONTENT } from '../core/content/registry';
import type { StrategyParams } from './strategies';
import { TUNABLE } from './strategies';

export interface Adjustment {
  text: string;
  param?: keyof StrategyParams;
  delta?: number;
  set?: number;
  include?: string[]; // 候选加入（取第一个可用的）
  exclude?: string;
}

export interface FailureReport {
  won: boolean;
  category: string;
  cause: string;
  details: string[];
  adjustments: Adjustment[];
  metrics: {
    time: number;
    wave: number;
    totalWaves: number;
    avgLumen: number;
    expired: number;
    producers: number;
    spent: number;
    generated: number;
    utilization: number;
    breachEnemy?: string;
    breachRow?: number;
    breachTime?: number;
  };
}

/** 对一局结果进行复盘：判断失败原因并给出可执行的策略调整 */
export function analyzeGame(w: World): FailureReport {
  const s = w.stats;
  const producers = w.units.filter((u) => !u.dead && (u.def.behavior === 'producer' || u.def.behavior === 'upgradeProducer')).length;
  const avgLumen = w.time > 0 ? s.lumenHeld / w.time : 0;
  const total = Number.isFinite(w.totalWaves) ? w.totalWaves : Math.max(1, w.waveIndex);
  const metrics = {
    time: Math.round(w.time),
    wave: w.waveIndex,
    totalWaves: total,
    avgLumen: Math.round(avgLumen),
    expired: s.lumenExpired,
    producers,
    spent: s.lumenSpent,
    generated: s.lumenGenerated,
    utilization: s.lumenGenerated > 0 ? Math.round((s.lumenSpent / s.lumenGenerated) * 100) / 100 : 0,
    breachEnemy: s.breach?.enemy,
    breachRow: s.breach ? s.breach.row + 1 : undefined,
    breachTime: s.breach?.t,
  };
  const details: string[] = [];
  const adj: Adjustment[] = [];

  if (w.status === 'won') {
    details.push(`用时 ${metrics.time} 秒，消耗 ${s.lumenSpent} 光能，操作 ${s.ops} 次`);
    if (s.sentinelsUsed) details.push(`使用了 ${s.sentinelsUsed} 个符文哨卫，防线仍有漏洞`);
    if (avgLumen > 300) details.push(`平均闲置光能 ${Math.round(avgLumen)}，可以更积极地花费`);
    return { won: true, category: 'win', cause: '胜利', details, adjustments: [], metrics };
  }

  const reason = w.endReason;
  const bdef = s.breach ? CONTENT.enemies.get(s.breach.enemy) : undefined;
  const progress = total > 0 ? w.waveIndex / total : 0;
  let category = 'generic';
  let cause = reason || '失败';

  if (reason.startsWith('违反挑战规则')) {
    category = 'rule';
    cause = reason;
    const c = w.rules?.c;
    if (reason.includes('秒内')) {
      adj.push({ text: '时间不足：提高火力冗余与前置，加快清场', param: 'safety', delta: 0.25 });
      adj.push({ text: '前置进攻单位', param: 'frontBias', delta: 0.2 });
      adj.push({ text: '提前储备火力', param: 'lookahead', delta: 0.4 });
    }
    if (c?.maxUnitLosses != null) adj.push({ text: '减少损失：增加屏障', param: 'wallBias', delta: 0.5 });
  } else if (reason.includes('圣物')) {
    category = 'relic';
    cause = '圣物被摧毁';
    adj.push({ text: '加强圣物所在行的火力与屏障', param: 'safety', delta: 0.25 });
    adj.push({ text: '增加屏障', param: 'wallBias', delta: 0.5 });
  } else if (reason === '超时') {
    category = 'timeout';
    cause = '对局超时';
    adj.push({ text: '提高火力以加快清场', param: 'safety', delta: 0.2 });
  } else if (bdef) {
    const name = bdef.name;
    cause = `${name} 在第 ${s.breach!.wave} 波（${s.breach!.t} 秒）突破第 ${s.breach!.row + 1} 行`;
    if (bdef.flying) {
      category = 'flyer';
      details.push('飞行敌人无视地面单位，必须有对空手段');
      adj.push({ text: '加入对空单位', include: ['storm_spire', 'boomerang_thorn', 'gale_fan'] });
    } else if (bdef.vehicle) {
      category = 'vehicle';
      adj.push({ text: '加入地刺晶簇刺破载具', include: ['spike_crystal'] });
      adj.push({ text: '降低爆破阈值', param: 'bombThreshold', delta: -300 });
    } else if (bdef.stealth) {
      category = 'stealth';
      adj.push({ text: '加入灯笼晶显形刺客', include: ['lantern_crystal'] });
    } else if (bdef.swim) {
      category = 'water';
      adj.push({ text: '加入潮汐触手守水路', include: ['tide_lurker', 'drift_plate'] });
      adj.push({ text: '提高火力需求', param: 'safety', delta: 0.15 });
    } else if (bdef.boss) {
      category = 'boss';
      adj.push({ text: '首领战需要更高火力', param: 'safety', delta: 0.3 });
      adj.push({ text: '加入寒潮花控制首领', include: ['frost_bloom', 'nova_core'] });
      adj.push({ text: '更多强化', param: 'upgradeBias', delta: 0.4 });
    } else if (bdef.hp + (bdef.armor?.hp ?? 0) >= 1000 || bdef.crusher) {
      category = 'tank';
      details.push(`${name} 生命/护甲很高`);
      adj.push({ text: '降低爆破阈值，更早使用炸弹', param: 'bombThreshold', delta: -350 });
      adj.push({ text: '加入高爆发单位', include: bdef.armor?.metal ? ['magnet_crystal', 'maw_crystal', 'nova_core'] : ['maw_crystal', 'nova_core', 'meteor_lobber'] });
      adj.push({ text: '提高火力需求', param: 'safety', delta: 0.2 });
    } else if (bdef.armor?.kind === 'shield') {
      category = 'shield';
      adj.push({ text: '加入抛射单位越过盾牌', include: ['pebble_lobber', 'meteor_lobber', 'magnet_crystal'] });
    } else if (bdef.jumper) {
      category = 'jumper';
      adj.push({ text: '加入高大屏障阻挡跳跃', include: ['monolith', 'stone_warden'] });
      adj.push({ text: '增加屏障', param: 'wallBias', delta: 0.4 });
    } else if (bdef.burrow) {
      category = 'burrow';
      adj.push({ text: '加入双面棱镜防御背后', include: ['janus_prism', 'spike_crystal'] });
    }
    if (progress < 0.35) {
      if (category === 'generic') category = 'early';
      details.push(`过早失守（进度 ${(progress * 100).toFixed(0)}%）：开局防御不足`);
      adj.push({ text: '开局更早部署射手', param: 'earlyDefense', delta: 1 });
      adj.push({ text: '减少开局经济扩张', param: 'econPerRow', delta: -0.3 });
      adj.push({ text: '提高火力需求', param: 'safety', delta: 0.15 });
    } else if (avgLumen < 70 && producers < w.rows * 1.2 && progress > 0.5) {
      if (category === 'generic') category = 'economy';
      details.push(`经济不足：结束时只有 ${producers} 个生产单位，平均光能 ${Math.round(avgLumen)}`);
      adj.push({ text: '扩大经济规模', param: 'econPerRow', delta: 0.3 });
      adj.push({ text: '延长经济扩张期', param: 'econStop', delta: 0.1 });
    }
    if (avgLumen > 300) {
      if (category === 'generic') category = 'floating';
      details.push(`闲置光能过多（平均 ${Math.round(avgLumen)}）`);
      adj.push({ text: '不再保留储备', param: 'reserve', set: 0 });
      adj.push({ text: '多做强化', param: 'upgradeBias', delta: 0.4 });
      adj.push({ text: '提高火力需求', param: 'safety', delta: 0.2 });
    }
    if (s.lumenExpired > s.lumenGenerated * 0.15) details.push(`有 ${s.lumenExpired} 光能过期未收集`);
    if (w.enemies.filter((e) => !e.dead).length >= 15) {
      details.push('敌人数量过多（被淹没）');
      adj.push({ text: '加入范围伤害', include: ['flame_pillar', 'storm_spire', 'meteor_lobber'] });
    }
    if (category === 'generic' || adj.length === 0) {
      adj.push({ text: '整体提高火力需求', param: 'safety', delta: 0.2 });
      adj.push({ text: '增加屏障', param: 'wallBias', delta: 0.3 });
    }
  }
  return { won: false, category, cause, details, adjustments: adj, metrics };
}

/** 把调整应用到参数上（并限制在合法范围） */
export function applyAdjustments(params: StrategyParams, adjustments: Adjustment[], include: string[], exclude: string[], available: string[]): string[] {
  const applied: string[] = [];
  for (const a of adjustments) {
    if (a.param) {
      const range = TUNABLE.find((t) => t.key === a.param);
      const cur = params[a.param] as number;
      let next = a.set != null ? a.set : cur + (a.delta ?? 0);
      if (range) next = Math.max(range.min, Math.min(range.max, next));
      (params as unknown as Record<string, number>)[a.param] = Math.round(next * 100) / 100;
      applied.push(a.text);
    }
    if (a.include) {
      const pick = a.include.find((id) => available.includes(id) && !include.includes(id) && CONTENT.units.get(id));
      if (pick) {
        include.push(pick);
        const i = exclude.indexOf(pick);
        if (i >= 0) exclude.splice(i, 1);
        applied.push(`${a.text}（${CONTENT.unit(pick).name}）`);
      }
    }
    if (a.exclude && !exclude.includes(a.exclude)) {
      exclude.push(a.exclude);
      applied.push(a.text);
    }
  }
  return applied;
}
