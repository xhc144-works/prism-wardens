import type { LevelDef, UnitDef } from '../core/types';
import { CONTENT } from '../core/content/registry';
import { RuleEngine } from '../core/rules/ruleEngine';
import { TERRAIN } from '../core/content/environment';
import type { StrategyParams } from './strategies';

export interface DeckRequest {
  level: LevelDef;
  available: string[];
  size: number;
  strategy: StrategyParams;
  rules?: RuleEngine | null;
  include?: string[];
  exclude?: string[];
  bias?: Record<string, number>;
}

export interface DeckResult {
  deck: string[];
  reasons: string[];
  features: LevelFeatures;
}

export interface LevelFeatures {
  water: boolean;
  fog: boolean;
  night: boolean;
  flyers: boolean;
  shields: boolean;
  metal: boolean;
  burrowers: boolean;
  vehicles: boolean;
  stealth: boolean;
  jumpers: boolean;
  tanks: boolean;
  boss: boolean;
  swarm: boolean;
  divers: boolean;
}

export function levelFeatures(level: LevelDef): LevelFeatures {
  const map = CONTENT.resolveMap(level.map);
  const pool = (level.enemyPool ?? []).map((id) => CONTENT.enemies.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof CONTENT.enemies.get>>[];
  const water = map.terrain.some((row) => [...row].filter((c) => TERRAIN[c as keyof typeof TERRAIN]?.water).length > map.cols / 2);
  const plan = level.weather;
  const fog = !!plan && (plan.mode === 'fixed' ? plan.id === 'fog' : plan.mode === 'cycle' ? plan.list.some((x) => x.id === 'fog') : plan.pool.includes('fog'));
  return {
    water,
    fog,
    night: level.time === 'night',
    flyers: pool.some((e) => e.flying) || pool.some((e) => e.boss === 'tempest'),
    shields: pool.some((e) => e.armor?.kind === 'shield'),
    metal: pool.some((e) => e.armor?.metal),
    burrowers: pool.some((e) => e.burrow),
    // 蚀之王会滚出蚀能球（载具），需要地刺/爆破应对
    vehicles: pool.some((e) => e.vehicle || e.boss === 'king'),
    stealth: pool.some((e) => e.stealth),
    jumpers: pool.some((e) => e.jumper),
    tanks: pool.some((e) => e.hp + (e.armor?.hp ?? 0) >= 1200),
    boss: pool.some((e) => !!e.boss),
    swarm: (level.gen?.growth ?? 1) >= 1.3,
    divers: pool.some((e) => e.swim),
  };
}

const ATTACK = new Set(['shooter', 'lobber']);

function isAttacker(d: UnitDef): boolean {
  return ATTACK.has(d.category) || d.behavior === 'chain';
}

export function scoreCard(d: UnitDef, f: LevelFeatures, s: StrategyParams, size: number): { score: number; why: string } {
  let sc = 0;
  let why = '';
  switch (d.id) {
    case 'lumen_moss':
      sc = 100;
      why = '经济核心';
      break;
    case 'twin_moss':
      sc = 18 + (size >= 8 ? 18 : 0) + (s.econPerRow > 1.8 ? 25 : 0);
      why = '提升经济上限';
      break;
    case 'prism_shooter':
      sc = 58;
      why = '性价比稳定的主力输出';
      break;
    case 'repeater_prism':
      sc = 70 + (s.id === 'rush' ? 10 : 0);
      why = '高火力密度';
      break;
    case 'frost_shard':
      sc = 52 + (f.jumpers ? 8 : 0) + (f.swarm ? 8 : 0) + (f.tanks ? 6 : 0);
      why = '减速拖延敌人';
      break;
    case 'trident_prism':
      sc = 66;
      why = '覆盖三行';
      break;
    case 'moon_archer':
      sc = f.night ? 64 : 18;
      why = f.night ? '夜晚伤害翻倍且便宜' : '白天较弱';
      break;
    case 'janus_prism':
      sc = 26 + (f.burrowers ? 45 : 0);
      why = f.burrowers ? '克制掘地者' : '双向射击';
      break;
    case 'boomerang_thorn':
      sc = 42 + (f.flyers ? 48 : 0);
      why = f.flyers ? '对空 + 贯穿' : '贯穿整行';
      break;
    case 'storm_spire':
      sc = 50 + (f.flyers ? 42 : 0) + (f.swarm ? 8 : 0);
      why = f.flyers ? '对空连锁闪电' : '连锁范围伤害';
      break;
    case 'pebble_lobber':
      sc = 30 + (f.shields ? 38 : 0);
      why = f.shields ? '越过盾牌' : '抛射';
      break;
    case 'meteor_lobber':
      sc = 44 + (f.shields ? 26 : 0) + (f.tanks ? 10 : 0) + (f.swarm ? 6 : 0);
      why = '范围抛射';
      break;
    case 'stone_warden':
      sc = 50 + s.wallBias * 6;
      why = '低价屏障';
      break;
    case 'monolith':
      sc = 34 + (f.jumpers ? 22 : 0) + s.wallBias * 5;
      why = f.jumpers ? '阻挡跳跃者' : '高耐久屏障';
      break;
    case 'volatile_geode':
      sc = 44 + s.trapBias * 8;
      why = '便宜的开局应急';
      break;
    case 'nova_core':
      sc = 60 + (f.boss ? 6 : 0);
      why = '范围应急爆破';
      break;
    case 'flame_pillar':
      sc = 44 + (f.swarm ? 6 : 0);
      why = '整行清场';
      break;
    case 'frost_bloom':
      sc = 30 + (f.boss ? 8 : 0);
      why = '全场冻结争取时间';
      break;
    case 'maw_crystal':
      sc = 36 + (f.tanks ? 12 : 0) + (f.metal ? 6 : 0);
      why = '秒杀高护甲敌人';
      break;
    case 'spike_crystal':
      sc = 24 + (f.vehicles ? 45 : 0) + (f.burrowers ? 12 : 0) + s.trapBias * 4;
      why = f.vehicles ? '刺破载具' : '持续伤害';
      break;
    case 'ember_totem':
      sc = 22 + s.supportBias * 22;
      why = '火焰弹伤害翻倍';
      break;
    case 'resonance_bell':
      sc = 16 + s.supportBias * 20;
      why = '周围攻速 +30%';
      break;
    case 'mender_crystal':
      sc = 10 + s.supportBias * 14 + (f.tanks ? 4 : 0);
      why = '治疗屏障';
      break;
    case 'drift_plate':
      sc = f.water ? 150 : -100;
      why = f.water ? '水路必备' : '无水面';
      break;
    case 'tide_lurker':
      sc = f.water ? 34 + (f.divers ? 28 : 0) : -100;
      why = '水路秒杀';
      break;
    case 'lantern_crystal':
      sc = f.fog || f.stealth ? 40 + (f.stealth ? 18 : 0) : -50;
      why = '照亮迷雾/隐身';
      break;
    case 'gale_fan':
      sc = f.flyers ? 44 + (f.fog ? 8 : 0) : -30;
      why = '吹走飞行敌人';
      break;
    case 'magnet_crystal':
      sc = f.metal ? 28 : -20;
      why = '移除金属护甲';
      break;
    case 'gravity_well':
      sc = 18;
      why = '控制推回';
      break;
    case 'spore_puff':
      sc = f.night ? 56 : 18;
      why = f.night ? '免费的短程火力，夜晚更强' : '免费但射程短';
      break;
    case 'dawn_cap':
      sc = f.night ? 74 : 28;
      why = '廉价经济';
      break;
    case 'fume_cap':
      sc = (f.night ? 50 : 24) + (f.shields ? 22 : 0) + (f.swarm ? 6 : 0);
      why = f.shields ? '穿透盾牌的范围烟雾' : '穿透烟雾';
      break;
    case 'doom_cap':
      sc = 42 + (f.boss ? 8 : 0) + (f.tanks ? 6 : 0);
      why = '超大范围爆破';
      break;
    case 'squash_gem':
      sc = 46 + (f.tanks ? 8 : 0) + s.trapBias * 4;
      why = '廉价单体秒杀';
      break;
    case 'tide_puff':
      sc = f.water ? (f.night ? 42 : 16) : -100;
      why = '水面上的免费火力';
      break;
    case 'kernel_lobber':
      sc = 28 + (f.shields ? 24 : 0) + (f.tanks ? 8 : 0);
      why = '黄油定身';
      break;
    case 'garlic_bulb':
      sc = 8 + s.wallBias * 3;
      why = '分流敌人';
      break;
    case 'tomb_eater':
      sc = f.night ? 20 : -50;
      why = '清除蚀晶碑';
      break;
    case 'gatling_prism':
    case 'gloom_cap':
    case 'winter_meteor':
    case 'spike_rock':
      sc = 14 + (size >= 8 ? 14 : 0);
      why = '高阶强化（需要底座单位）';
      break;
    default: {
      // 自定义单位：按定位估算
      if (d.behavior === 'producer') sc = 70;
      else if (isAttacker(d)) sc = 30 + Math.min(40, ((d.damage ?? 20) * (d.shots ?? 1)) / (d.interval ?? 1.5) / Math.max(25, d.cost) * 300);
      else if (d.category === 'wall') sc = 35;
      else if (d.category === 'bomb') sc = 35;
      else sc = 15;
      why = '自定义单位';
    }
  }
  if (s.id === 'frugal' && d.cost > 150 && d.category !== 'producer') sc -= (d.cost - 150) / 10;
  if (s.id === 'rush' && d.category === 'wall') sc -= 10;
  if (s.id === 'defense' && (d.category === 'wall' || d.category === 'bomb')) sc += 8;
  return { score: sc, why };
}

export function buildDeck(req: DeckRequest): DeckResult {
  const f = levelFeatures(req.level);
  const reasons: string[] = [];
  const allowed = (id: string) => {
    const d = CONTENT.units.get(id);
    if (!d) return false;
    if (req.exclude?.includes(id)) return false;
    if (req.level.bannedCards?.includes(id)) return false;
    if (req.rules && !req.rules.isCardAllowed(d).ok) return false;
    return true;
  };
  const avail = req.available.filter(allowed).map((id) => CONTENT.unit(id));
  const maxSize = Math.min(req.size, req.rules?.c.maxDeckSize ?? 99);
  const deck: string[] = [];
  const push = (id: string, why: string) => {
    if (deck.length >= maxSize || deck.includes(id)) return;
    // 只能种在底座单位上的强化卡，需要底座已在卡组中
    const up = CONTENT.unit(id).upgradeOf;
    if (up && CONTENT.unit(id).behavior !== 'upgradeProducer' && !deck.includes(up)) return;
    deck.push(id);
    reasons.push(`${CONTENT.unit(id).name}：${why}`);
  };
  for (const id of req.level.forcedCards ?? []) if (avail.some((a) => a.id === id)) push(id, '关卡指定');
  for (const id of req.include ?? []) if (avail.some((a) => a.id === id)) push(id, '经验：上次失败后加入');

  const scored = avail
    .map((d) => {
      const r = scoreCard(d, f, req.strategy, maxSize);
      return { d, score: r.score + (req.bias?.[d.id] ?? 0), why: r.why };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // 必需品
  const need = (pred: (d: UnitDef) => boolean, why: string) => {
    if (deck.some((id) => pred(CONTENT.unit(id)))) return;
    const best = scored.find((x) => pred(x.d));
    if (best) push(best.d.id, why);
  };
  if (f.water) need((d) => d.behavior === 'plate', '水路必备浮台');
  need((d) => d.behavior === 'producer', '经济来源');
  need((d) => (d.behavior === 'shooter' || d.behavior === 'chain') && d.cost <= 125 && (!d.solar || f.night) && !d.back, '廉价主力输出');
  need((d) => d.behavior === 'shooter' || d.behavior === 'chain', '主力输出');
  if (f.flyers) need((d) => !!d.antiAir || d.behavior === 'gale', '对空能力');
  if (f.flyers && maxSize >= 8) need((d) => d.behavior === 'gale', '一次清除所有飞行敌人');
  if (maxSize >= 4) need((d) => isAttacker(d) && !deck.includes(d.id), '第二输出');
  if (maxSize >= 5) need((d) => d.category === 'wall', '屏障拖延敌人');
  if (maxSize >= 6) need((d) => d.behavior === 'instantBomb' || d.behavior === 'laneBomb', '应急爆破');
  if (maxSize >= 7 && f.burrowers) need((d) => !!d.back, '防御背后的掘地者');
  if (maxSize >= 7 && (f.fog || f.stealth)) need((d) => d.behavior === 'lantern', '照亮迷雾/隐身');
  if (maxSize >= 7 && f.vehicles) need((d) => d.behavior === 'spike', '刺破载具');

  const count = (pred: (d: UnitDef) => boolean) => deck.filter((id) => pred(CONTENT.unit(id))).length;
  const nonAttackSlots = Math.min(3, maxSize - 2);
  for (const x of scored) {
    if (deck.length >= maxSize) break;
    if (deck.includes(x.d.id)) continue;
    if (isAttacker(x.d) && count(isAttacker) >= maxSize - nonAttackSlots) continue;
    if (x.d.category === 'lobber' && count((d) => d.category === 'lobber') >= (f.shields && maxSize >= 9 ? 2 : 1)) continue;
    if (x.d.category === 'wall' && count((d) => d.category === 'wall') >= 1 && maxSize < 9) continue;
    if (x.d.category === 'bomb' && count((d) => d.category === 'bomb') >= (maxSize >= 8 ? 2 : 1)) continue;
    if (x.d.category === 'support' && count((d) => d.category === 'support') >= (maxSize >= 9 ? 2 : 1)) continue;
    if (x.d.category === 'trap' && count((d) => d.category === 'trap') >= 2) continue;
    if (x.d.category === 'producer' && count((d) => d.category === 'producer') >= 2) continue;
    push(x.d.id, x.why);
  }
  // 如果因为上限没填满，放宽限制补齐
  for (const x of scored) {
    if (deck.length >= maxSize) break;
    push(x.d.id, x.why);
  }
  return { deck, reasons, features: f };
}
