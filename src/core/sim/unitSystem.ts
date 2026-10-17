import { DT } from '../constants';
import { TERRAIN } from '../content/environment';
import type { World } from './world';
import type { Enemy, Unit } from './entities';

const PROJ_HIT_X = 0.4;

/** 射手是否有可攻击目标 */
function hasTargetAhead(w: World, u: Unit, row: number, antiAir: boolean, range = 99): boolean {
  if (row < 0 || row >= w.rows) return false;
  for (const e of w.enemiesInRow(row)) {
    if (!w.targetable(e, { antiAir })) continue;
    if (e.x > u.col + PROJ_HIT_X && e.x < w.cols + 0.45 && e.x - u.col <= range) return true;
  }
  return false;
}

function hasTargetBehind(w: World, u: Unit, row: number): boolean {
  for (const e of w.enemiesInRow(row)) {
    if (!w.targetable(e, {})) continue;
    if (e.x < u.col + 0.5 && e.x > -0.6) return true;
  }
  return false;
}

function fire(w: World, u: Unit, row: number, dir: 1 | -1): void {
  const d = u.def;
  w.projectiles.push({
    id: w.nextId++,
    kind: d.projKind ?? 'bolt',
    row,
    fromRow: u.row,
    x: u.col + (dir > 0 ? 0.75 : 0.25),
    vx: (d.projSpeed ?? 7) * dir,
    dmg: w.unitDamage(u),
    slow: d.slow ? { mul: d.slow.mul, dur: d.slow.dur * w.weather.slowDurMul } : undefined,
    pierce: !!d.pierce,
    antiAir: !!d.antiAir,
    splash: d.splash ?? 0,
    splashMul: d.splashMul ?? 0,
    src: d.id,
    srcId: u.id,
    hits: [],
    totems: [],
    miss: w.weather.missChance > 0 && w.rng.chance(w.weather.missChance),
    age: 0,
    dead: false,
  });
  u.anim = 6;
  w.emit({ t: 'shoot', x: u.col + 0.7, row: u.row, kind: d.projKind ?? 'bolt', unit: u.id });
}

function shooterFire(w: World, u: Unit): boolean {
  const d = u.def;
  const lanes = d.lanes ?? [0];
  let fired = false;
  const anyAhead = lanes.some((l) => hasTargetAhead(w, u, u.row + l, !!d.antiAir, d.range));
  const anyBehind = !!d.back && hasTargetBehind(w, u, u.row);
  if (!anyAhead && !anyBehind) return false;
  for (const l of lanes) {
    const r = u.row + l;
    if (r < 0 || r >= w.rows) continue;
    if (anyAhead || anyBehind) {
      fire(w, u, r, 1);
      fired = true;
    }
  }
  if (d.back) for (let i = 0; i < d.back; i++) fire(w, u, u.row, -1);
  return fired;
}

function firstEnemyAhead(w: World, u: Unit, opts: { lob?: boolean; antiAir?: boolean }): Enemy | undefined {
  let best: Enemy | undefined;
  for (const e of w.enemiesInRow(u.row)) {
    if (!w.targetable(e, { antiAir: opts.antiAir, lob: opts.lob })) continue;
    if (e.x <= u.col + PROJ_HIT_X || e.x > w.cols + 0.45) continue;
    if (!best || e.x < best.x) best = e;
  }
  return best;
}

function lobFire(w: World, u: Unit): boolean {
  const t = firstEnemyAhead(w, u, { lob: true });
  if (!t) return false;
  const d = u.def;
  w.projectiles.push({
    id: w.nextId++,
    kind: d.projKind ?? 'rock',
    row: u.row,
    fromRow: u.row,
    x: u.col + 0.5,
    vx: 0,
    dmg: w.unitDamage(u),
    pierce: false,
    antiAir: false,
    splash: d.splash ?? 0,
    splashMul: d.splashMul ?? 0,
    src: d.id,
    srcId: u.id,
    hits: [],
    totems: [],
    miss: false,
    age: 0,
    lob: { target: t.id, sx: u.col + 0.5, tx: t.x, t: 0, dur: 0.85, h: 1.4, trow: t.row },
    dead: false,
  });
  u.anim = 8;
  w.emit({ t: 'shoot', x: u.col + 0.5, row: u.row, kind: d.projKind ?? 'rock', unit: u.id });
  return true;
}

function chainFire(w: World, u: Unit): boolean {
  const d = u.def;
  const range = d.range ?? 4;
  let first: Enemy | undefined;
  let bestScore = Infinity;
  for (let r = u.row - 1; r <= u.row + 1; r++) {
    if (r < 0 || r >= w.rows) continue;
    for (const e of w.enemiesInRow(r)) {
      if (!w.targetable(e, { antiAir: true })) continue;
      if (e.x <= u.col + 0.2 || e.x > u.col + 0.5 + range || e.x > w.cols + 0.45) continue;
      const score = e.x + (r === u.row ? 0 : 0.8);
      if (score < bestScore) {
        bestScore = score;
        first = e;
      }
    }
  }
  if (!first) return false;
  const chains = (d.chains ?? 3) + u.buff.chain + w.weather.chainBonus;
  const hit: Enemy[] = [first];
  let cur = first;
  for (let i = 0; i < chains; i++) {
    let next: Enemy | undefined;
    let nd = Infinity;
    for (const e of w.enemies) {
      if (e.dead || hit.includes(e) || !w.targetable(e, { antiAir: true })) continue;
      const dist = Math.hypot(e.x - cur.x, (e.row - cur.row) * 0.9);
      if (dist <= (d.chainRange ?? 1.6) && dist < nd) {
        nd = dist;
        next = e;
      }
    }
    if (!next) break;
    hit.push(next);
    cur = next;
  }
  const base = w.unitDamage(u);
  for (const e of hit) {
    let dmg = base;
    if (u.buff.superconduct && (e.slow > 0 || e.freeze > 0)) dmg *= 1.5;
    u.dmgDealt += w.damageEnemy(e, dmg, d.id);
    if (e.dead) u.kills++;
  }
  u.anim = 8;
  w.emit({ t: 'chain', pts: [{ x: u.col + 0.5, row: u.row }, ...hit.map((e) => ({ x: e.x, row: e.row }))] });
  return true;
}

function explodeArea(w: World, u: Unit, cx: number, row: number, rowRange: number, xRange: number, dmg: number, opts: { flying?: boolean } = {}): void {
  for (const e of w.enemies) {
    if (e.dead || e.burrowed) continue;
    if (e.def.flying && !opts.flying) continue;
    const rowOk = e.rowSpan ? e.rowSpan[0] <= row + rowRange && e.rowSpan[1] >= row - rowRange : Math.abs(e.row - row) <= rowRange;
    if (!rowOk) continue;
    if (Math.abs(e.x - cx) > xRange) continue;
    u.dmgDealt += w.damageEnemy(e, dmg, u.def.id);
    if (e.dead) u.kills++;
  }
}

function destroyTombs(w: World, row0: number, row1: number, col0: number, col1: number): void {
  for (let r = Math.max(0, row0); r <= Math.min(w.rows - 1, row1); r++)
    for (let c = Math.max(0, col0); c <= Math.min(w.cols - 1, col1); c++) w.grid[r][c].tomb = false;
}

export function updateUnits(w: World): void {
  const healTick = w.tick % 30 === 0;
  for (const u of w.units) {
    if (u.dead) continue;
    const d = u.def;
    if (u.flash > 0) u.flash--;
    if (u.anim > 0) u.anim--;
    if (u.overcharge > 0) u.overcharge -= DT;
    const rate = w.unitRateMul(u);

    // 蚀地伤害
    if (healTick && !u.relic && u.layer !== 'instant') {
      const t = TERRAIN[w.grid[u.row][u.col].terrain];
      if (t.unitDot) w.damageUnit(u, t.unitDot, '__terrain');
      if (u.dead) continue;
    }

    switch (d.behavior) {
      case 'producer':
      case 'upgradeProducer': {
        u.timer -= DT * rate * u.buff.prod;
        if (u.timer <= 0) {
          u.timer = d.interval ?? 24;
          const t = TERRAIN[w.grid[u.row][u.col].terrain];
          const value = (d.produce ?? 25) * (t.prodMul ?? 1);
          const n = d.shots ?? 1;
          for (let i = 0; i < n; i++) w.spawnOrb(value, u.col + 0.5 + (n > 1 ? (i - 0.5) * 0.35 : 0), u.row + 0.25, 'unit', u.row - 0.15);
          u.anim = 10;
        }
        break;
      }
      case 'shooter': {
        if (u.burst > 0) {
          u.burstTimer -= DT;
          if (u.burstTimer <= 0) {
            u.burst--;
            u.burstTimer = 0.18;
            for (const l of d.lanes ?? [0]) {
              const r = u.row + l;
              if (r >= 0 && r < w.rows) fire(w, u, r, 1);
            }
          }
        }
        u.timer = Math.max(0, u.timer - DT * rate);
        if (u.timer <= 0 && shooterFire(w, u)) {
          u.timer = d.interval ?? 1.4;
          if ((d.shots ?? 1) > 1) {
            u.burst = (d.shots ?? 1) - 1;
            u.burstTimer = 0.18;
          }
        }
        break;
      }
      case 'lobber':
        u.timer = Math.max(0, u.timer - DT * rate);
        if (u.timer <= 0 && lobFire(w, u)) u.timer = d.interval ?? 2.4;
        break;
      case 'chain':
        u.timer = Math.max(0, u.timer - DT * rate);
        if (u.timer <= 0 && chainFire(w, u)) u.timer = d.interval ?? 2;
        break;
      case 'spike':
        u.timer -= DT * rate;
        for (const e of w.enemiesInRow(u.row)) {
          if (e.dead || e.def.flying) continue;
          if (Math.abs(e.x - (u.col + 0.5)) > 0.55) continue;
          if (e.def.vehicle && !e.burrowed) {
            // 刺破载具
            if (e.def.boss || e.def.id === 'blight_orb') u.dmgDealt += w.damageEnemy(e, 300, d.id);
            else {
              u.dmgDealt += w.damageEnemy(e, e.hp + e.armor + 1, d.id);
              u.kills++;
            }
            w.killUnit(u, e.def.id);
            break;
          }
        }
        if (u.dead) break;
        if (u.timer <= 0) {
          u.timer = d.interval ?? 1;
          let any = false;
          for (const e of w.enemiesInRow(u.row)) {
            if (e.dead || e.def.flying || e.submerged) continue;
            if (Math.abs(e.x - (u.col + 0.5)) > 0.55) continue;
            u.dmgDealt += w.damageEnemy(e, w.unitDamage(u), d.id);
            if (e.dead) u.kills++;
            any = true;
          }
          if (any) u.anim = 6;
        }
        break;
      case 'mine': {
        if (!u.armed) {
          u.armTimer -= DT * rate;
          if (u.armTimer <= 0) u.armed = true;
          break;
        }
        const trig = w.enemiesInRow(u.row).find((e) => !e.dead && !e.def.flying && !e.burrowed && !e.submerged && Math.abs(e.x - (u.col + 0.6)) < 0.45);
        if (trig) {
          explodeArea(w, u, u.col + 0.5, u.row, 0, 0.95, w.unitDamage(u));
          w.emit({ t: 'explode', x: u.col + 0.5, row: u.row, radius: 0.9, kind: 'mine' });
          w.removeUnit(u);
        }
        break;
      }
      case 'instantBomb':
        u.fuse -= DT;
        if (u.fuse <= 0) {
          explodeArea(w, u, u.col + 0.5, u.row, 1, 1.5, w.unitDamage(u), { flying: true });
          destroyTombs(w, u.row - 1, u.row + 1, u.col - 1, u.col + 1);
          w.emit({ t: 'explode', x: u.col + 0.5, row: u.row, radius: 1.5, kind: 'nova' });
          w.removeUnit(u);
        }
        break;
      case 'laneBomb':
        u.fuse -= DT;
        if (u.fuse <= 0) {
          for (const e of w.enemies) {
            if (e.dead || e.burrowed || !w.inRow(e, u.row)) continue;
            if (e.x < -1 || e.x > w.cols + 1.2) continue;
            e.slow = 0;
            e.freeze = 0;
            u.dmgDealt += w.damageEnemy(e, w.unitDamage(u) * w.weather.fireMul, d.id);
            if (e.dead) u.kills++;
          }
          destroyTombs(w, u.row, u.row, 0, w.cols - 1);
          w.emit({ t: 'lane', row: u.row, kind: 'fire' });
          w.removeUnit(u);
        }
        break;
      case 'freezeAll':
        u.fuse -= DT;
        if (u.fuse <= 0) {
          for (const e of w.enemies) {
            if (e.dead) continue;
            e.freeze = Math.max(e.freeze, e.def.boss ? 2 : 4);
            e.slow = Math.max(e.slow, (d.slow?.dur ?? 10) * w.weather.slowDurMul);
            e.slowMul = d.slow?.mul ?? 0.5;
            if (!e.burrowed) u.dmgDealt += w.damageEnemy(e, w.unitDamage(u), d.id);
          }
          w.emit({ t: 'freeze' });
          w.removeUnit(u);
        }
        break;
      case 'gale':
        u.fuse -= DT;
        if (u.fuse <= 0) {
          for (const e of w.enemies) {
            if (e.dead) continue;
            if (e.def.boss === 'tempest') {
              u.dmgDealt += w.damageEnemy(e, 600, d.id);
              e.x = Math.min(w.cols - 0.5, e.x + 1.5);
            } else if (e.def.flying) {
              e.escaped = true;
              w.killEnemy(e, d.id);
              u.kills++;
            }
          }
          w.fogClear = Math.max(w.fogClear, 15);
          w.emit({ t: 'gale' });
          w.removeUnit(u);
        }
        break;
      case 'devourer': {
        if (u.digest > 0) {
          u.digest -= DT * rate;
          break;
        }
        if (u.chomp > 0) {
          u.chomp -= DT;
          if (u.chomp <= 0) {
            const t = w.enemyById(u.chompTarget);
            if (t && t.x >= u.col + 0.2 && t.x <= u.col + 0.5 + (d.range ?? 1.35) + 0.3 && !t.burrowed) {
              if (t.def.boss) {
                u.dmgDealt += w.damageEnemy(t, w.unitDamage(u), d.id);
                u.digest = 10;
              } else {
                u.dmgDealt += t.hp + t.armor;
                w.killEnemy(t, d.id);
                u.kills++;
                u.digest = d.digest ?? 40;
              }
              w.emit({ t: 'devour', row: u.row, col: u.col });
            }
          }
          break;
        }
        const t = w.enemiesInRow(u.row).find(
          (e) => !e.dead && !e.def.flying && !e.burrowed && !e.submerged && e.x >= u.col + 0.25 && e.x <= u.col + 0.5 + (d.range ?? 1.35),
        );
        if (t) {
          u.chomp = 0.45;
          u.chompTarget = t.id;
          u.anim = 14;
        }
        break;
      }
      case 'mender':
        if (healTick) {
          for (const o of w.units) {
            if (o.dead || o.relic || o.layer === 'instant') continue;
            if (Math.abs(o.row - u.row) <= 1 && Math.abs(o.col - u.col) <= 1 && o.hp < o.maxHp) {
              o.hp = Math.min(o.maxHp, o.hp + (d.heal ?? 25) * o.buff.heal * RANK(u));
              if (w.tick % 60 === 0) w.emit({ t: 'heal', row: o.row, col: o.col });
            }
          }
        }
        break;
      case 'lurker': {
        const t = w.enemiesInRow(u.row).find(
          (e) => !e.dead && !e.def.flying && !e.def.boss && !e.burrowed && e.x >= u.col + 0.05 && e.x <= u.col + 1.0,
        );
        if (t) {
          u.dmgDealt += t.hp + t.armor;
          w.killEnemy(t, d.id);
          u.kills++;
          w.emit({ t: 'devour', row: u.row, col: u.col });
          w.removeUnit(u);
        }
        break;
      }
      case 'magnet': {
        u.timer = Math.max(0, u.timer - DT * rate);
        if (u.timer > 0) break;
        let best: Enemy | undefined;
        let bd = Infinity;
        for (const e of w.enemies) {
          if (e.dead || !e.metal || e.armor <= 0) continue;
          const dist = Math.hypot(e.x - (u.col + 0.5), e.row - u.row);
          if (dist <= (d.range ?? 2.5) + 0.3 && dist < bd) {
            bd = dist;
            best = e;
          }
        }
        if (best) {
          w.emit({ t: 'magnet', x: best.x, row: best.row, ux: u.col + 0.5, urow: u.row });
          best.armor = 0;
          best.metal = false;
          if (best.def.berserk) best.berserk = true;
          u.timer = d.interval ?? 15;
          u.anim = 12;
        }
        break;
      }
      case 'gravity': {
        u.timer = Math.max(0, u.timer - DT * rate);
        if (u.timer > 0) break;
        const range = d.range ?? 3;
        const targets = w.enemiesInRow(u.row).filter((e) => !e.dead && !e.burrowed && !e.def.boss && e.x > u.col + 0.3 && e.x <= u.col + 0.5 + range);
        if (targets.length) {
          for (const e of targets) {
            e.x = Math.min(w.cols + 0.3, e.x + 1);
            e.stun = Math.max(e.stun, 1);
            if (e.state === 'eat') e.state = 'walk';
            if (u.buff.gravityTrap) {
              u.dmgDealt += w.damageEnemy(e, 150 * RANK(u), d.id);
              if (e.dead) u.kills++;
            }
          }
          w.emit({ t: 'pull', row: u.row });
          u.timer = d.interval ?? 10;
          u.anim = 12;
        }
        break;
      }
      default:
        break;
    }
  }
}

function RANK(u: Unit): number {
  return u.rank === 1 ? 1 : u.rank === 2 ? 1.35 : 1.75;
}
