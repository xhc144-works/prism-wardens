import { describe, expect, it } from 'vitest';
import { World } from '../src/core/sim/world';
import { CONTENT } from '../src/core/content/registry';
import { LEVELS } from '../src/core/content/levels';
import { generateWave } from '../src/core/sim/waveSystem';
import { Rng } from '../src/core/rng';
import { TICK_RATE } from '../src/core/constants';
import type { GameConfig, LevelDef } from '../src/core/types';

const lvl = (id: string) => CONTENT.level(id)!;

function cfg(level: LevelDef, extra: Partial<GameConfig> = {}): GameConfig {
  return { mode: 'adventure', level, deck: ['lumen_moss', 'prism_shooter', 'stone_warden', 'drift_plate', 'nova_core'], skills: [], items: {}, seed: 7, ...extra };
}

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE && !w.finished; i++) w.step();
};

describe('内容数据', () => {
  it('30 个冒险关卡且 id 唯一', () => {
    expect(LEVELS.length).toBe(30);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(30);
  });
  it('所有关卡引用的地图与敌人都存在', () => {
    for (const l of LEVELS) {
      expect(() => CONTENT.resolveMap(l.map)).not.toThrow();
      for (const e of l.enemyPool) expect(CONTENT.enemies.get(e), `${l.id}:${e}`).toBeTruthy();
      if (l.rewards?.card) expect(CONTENT.units.get(l.rewards.card)).toBeTruthy();
    }
  });
  it('地图每行长度与列数一致', () => {
    for (const m of CONTENT.maps.values()) for (const row of m.terrain) expect(row.length).toBe(m.cols);
  });
});

describe('确定性模拟', () => {
  it('相同种子与相同指令得到完全相同的结果', () => {
    const play = () => {
      const w = new World(cfg(lvl('1-3')));
      w.fxEnabled = false;
      while (!w.finished && w.tick < 300 * TICK_RATE) {
        for (const o of [...w.orbs]) w.issue({ type: 'collect', orb: o.id }, 'ai');
        for (let r = 0; r < w.rows; r++) {
          w.issue({ type: 'place', card: 'lumen_moss', row: r, col: 0 }, 'ai');
          w.issue({ type: 'place', card: 'prism_shooter', row: r, col: 1 }, 'ai');
          w.issue({ type: 'place', card: 'prism_shooter', row: r, col: 2 }, 'ai');
        }
        w.step();
      }
      return { status: w.status, tick: w.tick, spent: w.stats.lumenSpent, kills: w.stats.killsTotal, rng: w.rng.state };
    };
    expect(play()).toEqual(play());
  });
  it('波次生成是确定性的，最后一波为旗帜波', () => {
    const gen = lvl('1-6').gen!;
    const a = Array.from({ length: gen.count }, (_, i) => generateWave(i, gen, new Rng(5), false, false));
    const b = Array.from({ length: gen.count }, (_, i) => generateWave(i, gen, new Rng(5), false, false));
    expect(a).toEqual(b);
    expect(a[a.length - 1].flag).toBe(true);
    expect(a[a.length - 1].spawns.some((s) => s.enemy === 'banner_husk')).toBe(true);
  });
});

describe('放置规则', () => {
  it('水面需要浮晶台，岩石不能放置，光能不足会被拒绝', () => {
    const w = new World(cfg(lvl('3-1'), { deck: ['lumen_moss', 'prism_shooter', 'drift_plate'] }));
    w.lumen = 1000;
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 1 }).ok).toBe(false);
    expect(w.issue({ type: 'place', card: 'drift_plate', row: 2, col: 1 }).ok).toBe(true);
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 1 }).ok).toBe(true);
    const r = new World(cfg(lvl('5-1'), { deck: ['lumen_moss'] }));
    r.lumen = 1000;
    expect(r.issue({ type: 'place', card: 'lumen_moss', row: 0, col: 7 }).reason).toContain('岩石');
    r.lumen = 10;
    expect(r.issue({ type: 'place', card: 'lumen_moss', row: 1, col: 1 }).reason).toContain('光能不足');
  });
  it('卡牌放置后进入冷却', () => {
    const w = new World(cfg(lvl('1-1')));
    w.lumen = 1000;
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 0, col: 1 }).ok).toBe(true);
    expect(w.issue({ type: 'place', card: 'prism_shooter', row: 1, col: 1 }).reason).toBe('卡牌冷却中');
  });
  it('双生光苔只能放在光苔上', () => {
    const w = new World(cfg(lvl('1-1'), { deck: ['lumen_moss', 'twin_moss'] }));
    w.lumen = 1000;
    w.deck.find((d) => d.id === 'twin_moss')!.cooldown = 0;
    expect(w.issue({ type: 'place', card: 'twin_moss', row: 0, col: 0 }).ok).toBe(false);
    w.issue({ type: 'place', card: 'lumen_moss', row: 0, col: 0 });
    expect(w.issue({ type: 'place', card: 'twin_moss', row: 0, col: 0 }).ok).toBe(true);
    expect(w.unitAt(0, 0)!.def.id).toBe('twin_moss');
  });
});

describe('战斗', () => {
  it('射手能消灭来袭的蚀灵', () => {
    const w = new World(cfg(lvl('1-1')));
    w.lumen = 1000;
    w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 1 });
    w.spawnEnemy('husk', 2, 8.5, 1);
    run(w, 25);
    expect(w.stats.enemiesKilled.husk).toBe(1);
    expect(w.stats.damageBy.prism_shooter).toBeGreaterThanOrEqual(200);
  });
  it('塔盾阻挡正面光弹，抛射越过盾牌', () => {
    const w = new World(cfg(lvl('1-1')));
    const e = w.spawnEnemy('shieldbearer', 0, 5, 1);
    w.damageEnemy(e, 100, 'test', { front: true, dir: 1 });
    expect(e.hp).toBe(e.maxHp);
    expect(e.armor).toBeLessThan(e.armorMax);
    w.damageEnemy(e, 50, 'test', {});
    expect(e.hp).toBe(e.maxHp - 50);
  });
  it('敌人突破时触发符文哨卫，再次突破则失败', () => {
    const w = new World(cfg(lvl('1-1')));
    w.spawnEnemy('husk', 0, 0.2, 1);
    run(w, 4);
    expect(w.stats.sentinelsUsed).toBe(1);
    expect(w.status).toBe('running');
    run(w, 3);
    w.spawnEnemy('husk', 0, 0.1, 1);
    run(w, 4);
    expect(w.status).toBe('lost');
    expect(w.endReason).toContain('突破');
  });
  it('击退所有波次后胜利', () => {
    const level: LevelDef = { ...lvl('1-1'), id: 't', waves: [{ spawns: [{ enemy: 'husk', count: 1, row: 0 }] }], gen: undefined, firstWaveDelay: 1 };
    const w = new World(cfg(level, { cheats: { oneHitKill: true } }));
    w.lumen = 1000;
    w.issue({ type: 'place', card: 'prism_shooter', row: 0, col: 1 });
    run(w, 60);
    expect(w.status).toBe('won');
  });
  it('组合技：棱镜阵列提升伤害', () => {
    const w = new World(cfg(lvl('1-1'), { cheats: { noCooldown: true, infiniteLumen: true } }));
    w.issue({ type: 'place', card: 'prism_shooter', row: 1, col: 1 });
    w.issue({ type: 'place', card: 'prism_shooter', row: 2, col: 1 });
    w.step();
    expect(w.activeCombos.some((c) => c.id === 'prism_array')).toBe(true);
    expect(w.unitAt(1, 1)!.buff.dmg).toBeCloseTo(1.15);
  });
});

describe('修改器', () => {
  it('无限光能、免冷却、伤害倍率与一击必杀生效', () => {
    const w = new World(cfg(lvl('1-1'), { cheats: { infiniteLumen: true, noCooldown: true, unit: { damage: 3 } } }));
    expect(w.lumen).toBeGreaterThan(9000);
    for (let r = 0; r < 5; r++) expect(w.issue({ type: 'place', card: 'prism_shooter', row: r, col: 1 }).ok).toBe(true);
    expect(w.unitDamage(w.unitAt(0, 1)!)).toBeCloseTo(60);
    expect(w.stats.cheatsUsed).toBe(true);
    w.issue({ type: 'cheats', config: { oneHitKill: true } }, 'cheat');
    const e = w.spawnEnemy('iron_husk', 0, 5, 1);
    w.damageEnemy(e, 1, 'prism_shooter');
    expect(e.dead).toBe(true);
  });
  it('敌人数量与生命倍率生效', () => {
    const w = new World(cfg(lvl('1-1'), { cheats: { enemy: { hp: 2 } } }));
    const e = w.spawnEnemy('husk', 0, 5, 1);
    expect(e.maxHp).toBe(400);
  });
  it('自动部署按间隔放置指定单位', () => {
    const w = new World(cfg(lvl('1-1'), { cheats: { autoDeploy: { unit: 'stone_warden', interval: 1, mode: 'fill' } } }));
    run(w, 3.5);
    expect(w.stats.placements.stone_warden).toBeGreaterThanOrEqual(3);
  });
  it('挑战模式下修改器被强制禁用', () => {
    const w = new World(cfg(lvl('1-1'), { rules: { id: 'x', name: 'x', desc: '', constraints: {} }, cheats: { infiniteLumen: true } }));
    expect(w.cheatsAllowed).toBe(false);
    expect(w.lumen).toBeLessThan(1000);
    const r = w.issue({ type: 'cheats', config: { infiniteLumen: true } }, 'cheat');
    expect(r.ok).toBe(false);
    expect(r.rule).toBe(true);
  });
});
