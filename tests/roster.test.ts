import { describe, expect, it } from 'vitest';
import { World } from '../src/core/sim/world';
import { CONTENT } from '../src/core/content/registry';
import { TICK_RATE } from '../src/core/constants';
import { shopEntries, buy, newProfile } from '../src/core/meta/profile';
import type { GameConfig, LevelDef } from '../src/core/types';

// 扩展单位（原版其余植物/僵尸的机制）的行为测试
const NEW_CARDS = ['spore_puff', 'squash_gem', 'doom_cap', 'tomb_eater', 'garlic_bulb', 'kernel_lobber', 'repeater_prism', 'gatling_prism', 'spike_crystal', 'spike_rock', 'magnet_crystal', 'monolith', 'prism_shooter', 'resonance_bell', 'dawn_cap', 'fume_cap', 'gloom_cap'];

/** 安静的测试关卡：唯一的一波远在 999 秒之后 */
function quietWorld(seed = 7): World {
  const base = CONTENT.level('1-1')!;
  const level: LevelDef = { ...base, id: 'quiet', waves: [{ spawns: [{ enemy: 'husk', count: 1, row: 4 }] }], gen: undefined, firstWaveDelay: 999 };
  const cfg: GameConfig = { mode: 'adventure', level, deck: NEW_CARDS, skills: [], items: {}, seed, cheats: { infiniteLumen: true, noCooldown: true } };
  const w = new World(cfg);
  w.fxEnabled = false;
  // 高费卡开局处于冷却：测试中直接就绪
  for (const d of w.deck) d.cooldown = 0;
  return w;
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE && !w.finished; i++) w.step();
};

describe('扩展植物', () => {
  it('孢光菇只攻击 3 格内的敌人', () => {
    const w = quietWorld();
    expect(w.issue({ type: 'place', card: 'spore_puff', row: 2, col: 1 }).ok).toBe(true);
    const e = w.spawnEnemy('husk', 2, 6.2, 1);
    run(w, 3);
    expect(e.hp).toBe(e.maxHp);
    run(w, 12);
    expect(e.hp).toBeLessThan(e.maxHp);
  });

  it('压顶晶瓜压扁靠近的铁盔敌人后消失', () => {
    const w = quietWorld();
    w.issue({ type: 'place', card: 'squash_gem', row: 2, col: 3 });
    w.spawnEnemy('iron_husk', 2, 5, 1);
    run(w, 10);
    expect(w.stats.enemiesKilled.iron_husk).toBe(1);
    expect(w.unitAt(2, 3)).toBeUndefined();
  });

  it('寂灭菇大范围爆炸并留下无法部署的弹坑', () => {
    const w = quietWorld();
    const a = w.spawnEnemy('husk', 0, 7, 1);
    const b = w.spawnEnemy('husk', 4, 2, 1);
    const far = w.spawnEnemy('husk', 2, 8.4, 1);
    w.issue({ type: 'place', card: 'doom_cap', row: 2, col: 4 });
    run(w, 1.5);
    expect(a.dead && b.dead).toBe(true);
    expect(far.dead).toBe(false);
    expect(w.grid[2][4].crack).toBeGreaterThan(0);
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 4 }).ok).toBe(false);
  });

  it('碑噬者只能放在蚀晶碑上，并会把碑吃掉', () => {
    const w = quietWorld();
    w.grid[1][6].tomb = true;
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 1, col: 6 }).ok).toBe(false);
    expect(w.issue({ type: 'place', card: 'tomb_eater', row: 1, col: 5 }).ok).toBe(false);
    expect(w.issue({ type: 'place', card: 'tomb_eater', row: 1, col: 6 }).ok).toBe(true);
    run(w, 5);
    expect(w.grid[1][6].tomb).toBe(false);
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 1, col: 6 }).ok).toBe(true);
  });

  it('加特林棱晶只能种在连发棱晶上，每轮发射 4 发', () => {
    const w = quietWorld();
    expect(w.issue({ type: 'place', card: 'gatling_prism', row: 3, col: 1 }).ok).toBe(false);
    w.issue({ type: 'place', card: 'repeater_prism', row: 3, col: 1 });
    expect(w.issue({ type: 'place', card: 'gatling_prism', row: 3, col: 1 }).ok).toBe(true);
    w.spawnEnemy('iron_husk', 3, 8, 1);
    run(w, 1.0);
    expect(w.projectiles.filter((p) => p.src === 'gatling_prism' && !p.dead).length).toBe(4);
  });

  it('幽影菇伤害周围 3×3 范围（含相邻行与身后）', () => {
    const w = quietWorld();
    w.issue({ type: 'place', card: 'fume_cap', row: 2, col: 4 });
    w.issue({ type: 'place', card: 'gloom_cap', row: 2, col: 4 });
    const up = w.spawnEnemy('husk', 1, 5.2, 1);
    const behind = w.spawnEnemy('husk', 3, 3.9, 1);
    behind.dir = 1;
    const far = w.spawnEnemy('husk', 0, 5, 1);
    run(w, 2.5);
    expect(up.hp).toBeLessThan(up.maxHp);
    expect(behind.hp).toBeLessThan(behind.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('尖岩阵可以连续刺破多辆载具', () => {
    const w = quietWorld();
    w.issue({ type: 'place', card: 'spike_crystal', row: 2, col: 3 });
    w.issue({ type: 'place', card: 'spike_rock', row: 2, col: 3 });
    w.spawnEnemy('frost_hauler', 2, 4.5, 1);
    w.spawnEnemy('frost_hauler', 2, 6.5, 1);
    run(w, 20);
    expect(w.stats.enemiesKilled.frost_hauler).toBe(2);
    const u = w.unitAt(2, 3)!;
    expect(u.def.id).toBe('spike_rock');
    expect(u.hp).toBe(u.maxHp - 100);
  });

  it('黄晶投手有时投出黄油让敌人定身', () => {
    const w = quietWorld(3);
    w.issue({ type: 'place', card: 'kernel_lobber', row: 1, col: 0 });
    const e = w.spawnEnemy('iron_husk', 1, 8.5, 1);
    let stunned = false;
    for (let i = 0; i < 40 * TICK_RATE && !stunned; i++) {
      w.step();
      if (e.stun > 0) stunned = true;
    }
    expect(stunned).toBe(true);
  });

  it('晨光菇种下 2 分钟后产出提升', () => {
    const w = quietWorld();
    expect(w.issue({ type: 'place', card: 'dawn_cap', row: 0, col: 0 }).ok).toBe(true);
    const values: number[] = [];
    for (let i = 0; i < 160 * TICK_RATE; i++) {
      const before = new Set(w.orbs.map((o) => o.id));
      w.step();
      for (const o of w.orbs) if (!before.has(o.id) && o.src === 'unit') values.push(o.value);
    }
    // 地形可能带产量加成：比较成长前后的比例
    expect(values.length).toBeGreaterThan(3);
    expect(values[values.length - 1] / values[0]).toBeCloseTo(25 / 15, 1);
  });

  it('蒜晶让啃咬它的敌人换到相邻行', () => {
    const w = quietWorld();
    w.issue({ type: 'place', card: 'garlic_bulb', row: 2, col: 3 });
    const e = w.spawnEnemy('husk', 2, 4.2, 1);
    run(w, 4);
    expect(e.row).not.toBe(2);
    expect(Math.abs(e.row - 2)).toBe(1);
  });
});

describe('扩展敌人', () => {
  it('弹簧蚀灵连续跳过普通守卫', () => {
    const w = quietWorld();
    w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 2 });
    w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 4 });
    const e = w.spawnEnemy('pogo_husk', 2, 6, 1);
    w.cheats = { ...(w.cheats ?? {}), enemy: undefined };
    e.hp = e.maxHp = 99999;
    run(w, 12);
    expect(e.x).toBeLessThan(2);
    expect(w.unitAt(2, 2)).toBeTruthy();
    expect(w.unitAt(2, 4)).toBeTruthy();
  });

  it('高大屏障拦下弹簧蚀灵，磁晶能吸走弹簧杆', () => {
    const w = quietWorld();
    w.issue({ type: 'place', card: 'monolith', row: 3, col: 3 });
    const a = w.spawnEnemy('pogo_husk', 3, 5, 1);
    run(w, 10);
    expect(a.x).toBeGreaterThan(3);
    expect(a.jumped).toBe(true);
    w.issue({ type: 'place', card: 'magnet_crystal', row: 0, col: 2 });
    const b = w.spawnEnemy('pogo_husk', 0, 4, 1);
    run(w, 2);
    expect(b.jumped).toBe(true);
  });

  it('浪骑蚀灵在水面上行进且不潜水', () => {
    const level = CONTENT.level('3-1')!;
    const w = new World({ mode: 'adventure', level: { ...level, gen: undefined, waves: [{ spawns: [{ enemy: 'husk', count: 1, row: 0 }] }], firstWaveDelay: 999 }, deck: ['prism_shooter'], skills: [], items: {}, seed: 1 });
    const waterRow = [...Array(w.rows).keys()].find((r) => w.isWaterRow(r))!;
    const e = w.spawnEnemy('wave_rider', waterRow, 8, 1);
    expect(e.submerged).toBe(false);
    expect(e.state).toBe('walk');
  });

  it('索降蚀灵抓走守卫；共鸣钟保护周围的守卫', () => {
    const w = quietWorld();
    w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 3 });
    w.spawnEnemy('bungee_husk', 0, 9, 1);
    run(w, 6);
    expect(w.stats.unitsLost.prism_shooter).toBe(1);

    const w2 = quietWorld();
    w2.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 3 });
    w2.issue({ type: 'place', card: 'resonance_bell', row: 2, col: 4 });
    w2.spawnEnemy('bungee_husk', 0, 9, 1);
    run(w2, 6);
    expect(w2.stats.unitsLostTotal).toBe(0);
  });
});

describe('商店上架', () => {
  it('扩展卡牌在通关指定关卡后可以购买', () => {
    const p = newProfile('t');
    p.coins = 99999;
    const puff = shopEntries(p).find((e) => e.kind === 'card' && e.id === 'spore_puff')!;
    expect(puff.available).toBe(false);
    p.progress['1-6'] = { stars: 3, bestTime: 1, wins: 1, attempts: 1 };
    const open = shopEntries(p).find((e) => e.kind === 'card' && e.id === 'spore_puff')!;
    expect(buy(p, open)).toBeNull();
    expect(p.unlockedCards).toContain('spore_puff');
  });
});
