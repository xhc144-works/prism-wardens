import type { World } from './world';
import { emptyBuff, inc, type Unit } from './entities';

const PRISM_FAMILY = new Set(['prism_shooter', 'repeater_prism', 'trident_prism', 'janus_prism']);
const PRODUCERS = new Set(['producer', 'upgradeProducer']);

/**
 * 重新计算所有单位的增益（共鸣铃光环、组合技等）。棋盘变化时立即刷新，否则每 15 tick 刷新一次。
 */
export function updateCombos(w: World): void {
  if (!w.comboDirty && w.tick % 15 !== 0) return;
  w.comboDirty = false;
  const grid: (Unit | undefined)[][] = [];
  for (let r = 0; r < w.rows; r++) {
    const row: (Unit | undefined)[] = [];
    for (let c = 0; c < w.cols; c++) row.push(w.unitAt(r, c));
    grid.push(row);
  }
  const at = (r: number, c: number) => (r >= 0 && r < w.rows && c >= 0 && c < w.cols ? grid[r][c] : undefined);
  const neighbors8 = (u: Unit) => {
    const out: Unit[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const o = at(u.row + dr, u.col + dc);
        if (o) out.push(o);
      }
    return out;
  };

  const oldMaxMul = new Map<number, number>();
  for (const u of w.units) {
    if (u.dead) continue;
    oldMaxMul.set(u.id, u.buff.maxHpMul);
    u.buff = emptyBuff();
  }
  const combos: { id: string; a: number; b: number }[] = [];
  const add = (id: string, a: Unit, b: Unit) => {
    const key = a.id < b.id ? `${id}:${a.id}:${b.id}` : `${id}:${b.id}:${a.id}`;
    if (combos.some((c) => c.id === id && ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)))) return;
    combos.push({ id, a: a.id, b: b.id });
    if (!w.comboKeys.has(key)) {
      w.comboKeys.add(key);
      inc(w.stats.combos, id);
      w.emit({ t: 'combo', id, row: a.row, col: a.col });
    }
  };

  for (let r = 0; r < w.rows; r++)
    for (let c = 0; c < w.cols; c++) {
      const u = grid[r][c];
      if (!u) continue;
      const b = u.def.behavior;
      if (b === 'bell') {
        for (const o of neighbors8(u)) o.buff.rate += (u.def.buffRate ?? 0.3) * (u.rank === 1 ? 1 : u.rank === 2 ? 1.3 : 1.6);
        for (const o of neighbors8(u)) if (o.def.behavior === 'chain') {
          o.buff.chain += 2;
          add('resonant_storm', u, o);
        }
      }
      if (PRODUCERS.has(b)) {
        const lines: [number, number][][] = [
          [[0, -1], [0, 1]],
          [[0, 1], [0, 2]],
          [[0, -1], [0, -2]],
          [[-1, 0], [1, 0]],
          [[1, 0], [2, 0]],
          [[-1, 0], [-2, 0]],
        ];
        for (const line of lines) {
          const others = line.map(([dr, dc]) => at(r + dr, c + dc));
          if (others.every((o) => o && PRODUCERS.has(o.def.behavior))) {
            u.buff.prod = 1.25;
            add('photon_resonance', u, others[0]!);
            break;
          }
        }
      }
      if (PRISM_FAMILY.has(u.def.id)) {
        for (const o of [at(r - 1, c), at(r + 1, c)]) {
          if (o && PRISM_FAMILY.has(o.def.id)) {
            u.buff.dmg *= 1.15;
            add('prism_array', u, o);
            break;
          }
        }
      }
      if (b === 'totem') {
        const f = neighbors8(u).find((o) => o.def.id === 'frost_shard');
        if (f) {
          u.buff.steam = true;
          add('steam_burst', u, f);
        }
      }
      if (b === 'chain') {
        const f = neighbors8(u).find((o) => o.def.id === 'frost_shard');
        if (f) {
          u.buff.chain += 1;
          u.buff.superconduct = true;
          add('superconductor', u, f);
        }
      }
      if (b === 'mender') {
        for (const o of neighbors8(u)) if (o.def.category === 'wall') {
          o.buff.heal = 2;
          o.buff.maxHpMul = 1.2;
          add('living_wall', u, o);
        }
      }
      if (u.def.id === 'moon_archer') {
        const l = neighbors8(u).find((o) => o.def.behavior === 'lantern');
        if (l) {
          u.buff.lunarAlways = true;
          add('moonlit_prism', u, l);
        }
      }
      if (b === 'gravity') {
        for (let k = 1; k <= 3; k++) {
          const o = at(r, c + k);
          if (o && o.def.behavior === 'spike') {
            u.buff.gravityTrap = true;
            add('gravity_trap', u, o);
            break;
          }
        }
      }
    }

  // 最大生命倍率变化
  for (const u of w.units) {
    if (u.dead) continue;
    const old = oldMaxMul.get(u.id) ?? 1;
    if (old !== u.buff.maxHpMul) {
      const ratio = u.hp / u.maxHp;
      u.maxHp = Math.round(u.baseMaxHp * u.buff.maxHpMul);
      u.hp = Math.max(1, Math.min(u.maxHp, Math.round(u.maxHp * ratio)));
    }
  }
  w.activeCombos = combos;
}
