import type { EnemyDef, UnitDef } from '../core/types';
import { drawUnit } from './art/units';
import { drawEnemy } from './art/enemies';

const cache = new Map<string, string>();

/** 把单位绘制成图标（data URL），用于卡牌、图鉴、编辑器 */
export function unitIcon(def: UnitDef, size = 96): string {
  const key = `u:${def.id}:${size}:${def.colors.a}:${def.art}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const s = size / 110;
  ctx.translate(size / 2, size * (def.tall ? 0.97 : 0.88));
  ctx.scale(s, s);
  drawUnit(ctx, { def, t: 0.6, anim: 0, rank: 1, seed: 1, armed: true, icon: true, hpRatio: 1 });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function enemyIcon(def: EnemyDef, size = 96): string {
  const key = `e:${def.id}:${size}:${def.colors.a}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const big = def.boss === 'king' ? 380 : def.boss ? 200 : 120 * def.scale;
  const s = size / Math.max(110, big);
  ctx.translate(size / 2, size * 0.92);
  ctx.scale(s, s);
  drawEnemy(ctx, {
    def,
    t: 0.4,
    state: def.flying ? 'fly' : 'walk',
    armor: 1,
    hasArmor: !!def.armor,
    metal: !!def.armor?.metal,
    dir: -1,
    slow: false,
    frozen: false,
    stunned: false,
    hidden: false,
    submerged: false,
    burrowed: false,
    berserk: false,
    hpRatio: 1,
    seed: 1,
    icon: true,
  });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function clearIconCache(): void {
  cache.clear();
}
