import { DT } from '../constants';
import { TERRAIN } from '../content/environment';
import { CONTENT } from '../content/registry';
import type { World } from './world';
import type { Enemy, Unit } from './entities';

export function enemySpeed(w: World, e: Enemy): number {
  if (e.freeze > 0 || e.stun > 0) return 0;
  let s = e.def.speed * e.speedMul;
  if (e.def.jumper && e.jumped) s = 0.24 * e.speedMul;
  if (e.berserk) s *= 2.2;
  if (!e.def.flying && !e.burrowed) {
    const c = Math.max(0, Math.min(w.cols - 1, Math.floor(e.x)));
    const cell = w.grid[e.row]?.[c];
    if (cell) {
      s *= TERRAIN[cell.terrain].enemySpeedMul ?? 1;
      if (cell.iceTrail > 0 && !e.def.vehicle) s *= 1.25;
    }
  }
  s *= w.weather.enemySpeedMul;
  if (w.activeEvents.some((x) => x.id === 'blight_surge')) s *= 1.35;
  if (w.timeWarp > 0) s *= 0.4;
  if (e.slow > 0) s *= e.slowMul;
  return s;
}

/** 找到阻挡该敌人的守卫 */
export function findBlocker(w: World, e: Enemy): Unit | undefined {
  if (e.def.flying || e.burrowed || e.submerged || e.rowSpan) return undefined;
  const row = w.grid[e.row];
  if (!row) return undefined;
  if (e.dir < 0) {
    for (let c = w.cols - 1; c >= 0; c--) {
      if (e.x < c + 0.45 || e.x > c + 1.15) continue;
      const u = pickBlockUnit(w, e.row, c);
      if (u) return u;
    }
  } else {
    for (let c = 0; c < w.cols; c++) {
      if (e.x < c - 0.15 || e.x > c + 0.55) continue;
      const u = pickBlockUnit(w, e.row, c);
      if (u) return u;
    }
  }
  return undefined;
}

function pickBlockUnit(w: World, row: number, col: number): Unit | undefined {
  const cell = w.grid[row][col];
  const main = w.unitById(cell.main);
  // 起跳中的窝瓜在空中，不会被啃咬或碾压
  if (main && main.def.behavior === 'squash' && main.chomp > 0) return undefined;
  if (main && !main.def.noBite) return main;
  const plate = w.unitById(cell.plate);
  if (plate && !plate.def.noBite) return plate;
  return undefined;
}

function isRevealed(w: World, e: Enemy): boolean {
  if (w.fogClear > 0) return true;
  for (const u of w.units) {
    if (u.dead || u.layer === 'instant') continue;
    if (u.def.behavior === 'lantern' && Math.hypot(u.col + 0.5 - e.x, u.row - e.row) <= (u.def.radius ?? 2) + 0.5) return true;
    if (u.row === e.row && Math.abs(u.col + 0.5 - e.x) < 1.5) return true;
  }
  return false;
}

function validLandRow(w: World, r: number): boolean {
  return r >= 0 && r < w.rows && !w.isWaterRow(r);
}

function summon(w: World, e: Enemy): void {
  const spots: [number, number][] = [
    [e.row - 1, e.x],
    [e.row + 1, e.x],
    [e.row, e.x - 0.75],
    [e.row, e.x + 0.75],
  ];
  for (const [r, x] of spots) {
    if (!validLandRow(w, r)) continue;
    w.spawnEnemy('husk', r, Math.min(w.cols + 0.4, Math.max(0.5, x)), e.wave);
  }
  w.emit({ t: 'text', text: '唤潮术士召唤了援军', color: '#e0aaff' });
}

/** 蹦极僵尸：降落到一个守卫上方，抓取后带着它离开；被保护伞挡住会弹回 */
function updateBungee(w: World, e: Enemy): void {
  if (e.state === 'drop') {
    if (e.stateT === 0) {
      const candidates = w.units.filter((u) => !u.dead && !u.relic && u.layer !== 'instant');
      if (candidates.length) {
        const u = candidates[Math.floor(w.rng.next() * candidates.length)];
        e.target = u.id;
        e.row = u.row;
        e.y = u.row;
        e.x = u.col + 0.5;
      } else {
        e.target = 0;
        e.x = 2 + Math.floor(w.rng.next() * Math.max(1, w.cols - 4)) + 0.5;
      }
      w.emit({ t: 'bungee', x: e.x, row: e.row, id: e.id });
    }
    e.stateT += DT;
    if (e.stateT >= 1.6) {
      e.state = 'grab';
      e.stateT = 0;
    }
    return;
  }
  if (e.state === 'grab') {
    e.stateT += DT;
    const target = w.unitById(e.target);
    const guarded = w.units.some((u) => !u.dead && u.def.behavior === 'bell' && Math.abs(u.row - e.row) <= 1 && Math.abs(u.col + 0.5 - e.x) <= 1.5);
    if (guarded) {
      e.state = 'leave';
      e.stateT = 0;
      w.emit({ t: 'text', text: '保护伞弹开了蹦极', color: '#bdf' });
      return;
    }
    if (e.stateT >= 2.4) {
      if (target && !target.dead) {
        w.emit({ t: 'steal', row: target.row, col: target.col, unit: target.def.id, by: e.id });
        w.killUnit(target, e.def.id);
      }
      e.state = 'leave';
      e.stateT = 0;
    }
    return;
  }
  e.stateT += DT;
  if (e.stateT >= 1) {
    e.escaped = true;
    e.dead = true;
  }
}

export function updateEnemies(w: World): void {
  const healTick = w.tick % 30 === 0;
  for (const e of w.enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash--;
    e.anim += DT;
    if (e.slow > 0) e.slow = Math.max(0, e.slow - DT);
    if (e.slow <= 0) e.slowMul = 1;
    if (e.freeze > 0) e.freeze = Math.max(0, e.freeze - DT);
    if (e.stun > 0) e.stun = Math.max(0, e.stun - DT);
    if (Math.abs(e.y - e.row) > 0.001) {
      const dy = e.row - e.y;
      e.y += Math.sign(dy) * Math.min(Math.abs(dy), 1.6 * DT);
    }
    if (e.def.boss) continue;

    if (e.def.stealth) e.hidden = !isRevealed(w, e);

    // 祭司治疗光环
    if (e.def.healer && healTick && e.freeze <= 0) {
      for (const o of w.enemies) {
        if (o === e || o.dead || o.def.boss) continue;
        if (Math.hypot(o.x - e.x, o.row - e.row) <= 1.5 && o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + 40);
      }
    }

    const frozen = e.freeze > 0 || e.stun > 0;

    // 召唤师
    if (e.def.summoner && !frozen && e.state !== 'cast') {
      e.timer -= DT;
      if (e.timer <= 0 && e.x < w.cols - 0.2) {
        e.state = 'cast';
        e.stateT = 1.5;
        e.timer = 14;
      }
    }
    // 巨像投掷小魔
    if (e.def.thrower && !e.thrown && e.hp < e.maxHp / 2 && e.x > 3 && !frozen && e.state !== 'smash') {
      e.state = 'throw';
      e.stateT = 1.0;
      e.thrown = true;
    }
    // 投石车
    if (e.def.catapult && e.ammo > 0 && e.x <= w.cols - 1.6 && e.state === 'walk') {
      const hasUnit = w.units.some((u) => !u.dead && u.row === e.row && u.layer !== 'instant' && u.col + 0.5 < e.x);
      if (hasUnit) {
        e.state = 'cast';
        e.stateT = 0;
        e.timer = 1;
      }
    }

    if (frozen) continue;
    const speed = enemySpeed(w, e);

    switch (e.state) {
      case 'fly':
        e.x += e.dir * speed * DT;
        break;
      case 'burrow':
        e.burrowed = true;
        e.x -= speed * DT;
        if (e.x <= 0.45) {
          e.state = 'emerge';
          e.stateT = 2.5; // 钻出地面后晕眩片刻
          e.burrowed = false;
        }
        break;
      case 'emerge':
        e.stateT -= DT;
        if (e.stateT <= 0) {
          e.burrowed = false;
          e.dir = 1;
          e.state = 'walk';
        }
        break;
      case 'dive': {
        e.submerged = true;
        let near = false;
        for (let c = 0; c < w.cols; c++) {
          const u = pickBlockUnit(w, e.row, c);
          if (u && e.x - (c + 1) < 2.2 && e.x > c + 0.4) near = true;
        }
        if (near || e.x < 1.2) {
          e.submerged = false;
          e.state = 'walk';
        } else e.x -= speed * DT;
        break;
      }
      case 'jump': {
        e.stateT += DT;
        const k = Math.min(1, e.stateT / 0.8);
        e.x = e.jumpFrom + (e.jumpTo - e.jumpFrom) * k;
        if (k >= 1) {
          e.state = 'walk';
          // 跳跳僵尸落地后继续跳；撑杆/海豚只跳一次
          e.jumped = !e.def.pogo;
        }
        break;
      }
      case 'drop':
      case 'grab':
      case 'leave':
        updateBungee(w, e);
        break;
      case 'smash':
        e.stateT -= DT;
        if (e.stateT <= 0) {
          const t = w.unitById(e.target);
          if (t) {
            w.emit({ t: 'bite', row: t.row, col: t.col });
            w.damageUnit(t, 99999, e.def.id);
          }
          e.state = 'walk';
        }
        break;
      case 'throw':
        e.stateT -= DT;
        if (e.stateT <= 0) {
          w.spawnEnemy('imp', e.row, Math.max(0.6, e.x - 3.2), e.wave);
          e.state = 'walk';
        }
        break;
      case 'cast':
        if (e.def.catapult) {
          e.timer -= DT;
          if (e.timer <= 0) {
            let target: Unit | undefined;
            for (const u of w.units) {
              if (u.dead || u.row !== e.row || u.layer === 'instant' || u.col + 0.5 >= e.x) continue;
              if (!target || u.col < target.col) target = u;
            }
            if (target && e.ammo > 0) {
              e.ammo--;
              e.timer = 3;
              w.projectiles.push({
                id: w.nextId++,
                kind: 'rock',
                row: e.row,
                fromRow: e.row,
                x: e.x,
                vx: target.col + 0.5 - e.x,
                dmg: 75,
                pierce: false,
                antiAir: false,
                splash: 0,
                splashMul: 0,
                src: e.def.id,
                srcId: 0,
                hits: [],
                totems: [],
                miss: false,
                age: 0,
                enemyShot: { targetUnit: target.id, dmg: 75 * e.dmgMul },
                dead: false,
              });
            } else e.state = 'walk';
            if (e.ammo <= 0) e.state = 'walk';
          }
        } else {
          e.stateT -= DT;
          if (e.stateT <= 0) {
            if (e.def.summoner) summon(w, e);
            e.state = 'walk';
          }
        }
        break;
      case 'walk':
      case 'eat': {
        const blocker = findBlocker(w, e);
        if (blocker) {
          if (e.def.bomber) {
            w.damageUnit(blocker, 2000, e.def.id);
            w.emit({ t: 'explode', x: e.x, row: e.row, radius: 0.7, kind: 'bomber' });
            w.killEnemy(e, '__self');
            break;
          }
          if (e.def.crusher && e.def.vehicle) {
            w.emit({ t: 'bite', row: blocker.row, col: blocker.col });
            const wasAlive = !blocker.dead;
            w.damageUnit(blocker, 99999, e.def.id);
            // 蚀能球每碾碎一个守卫都会消耗自身能量
            if (e.def.id === 'blight_orb' && wasAlive && blocker.dead) w.damageEnemy(e, 120, '__crush');
            if (!e.dead) e.x += e.dir * speed * DT;
            break;
          }
          if (e.def.crusher) {
            e.state = 'smash';
            e.stateT = 1.6;
            e.target = blocker.id;
            break;
          }
          if (e.def.jumper && !e.jumped) {
            if (blocker.def.tall) {
              e.jumped = true;
              if (e.def.pogo) w.emit({ t: 'bite', row: blocker.row, col: blocker.col });
            } else {
              e.state = 'jump';
              e.stateT = 0;
              e.jumpFrom = e.x;
              e.jumpTo = blocker.col - 0.2;
              break;
            }
          }
          e.state = 'eat';
          e.target = blocker.id;
          let dps = e.def.dps * e.dmgMul * (e.berserk ? 1.5 : 1);
          if (e.def.ram && blocker.def.category === 'wall') dps *= 4;
          w.damageUnit(blocker, dps * DT, e.def.id);
          if (w.tick % 20 === 0) w.emit({ t: 'bite', row: blocker.row, col: blocker.col });
          // 大蒜：咬一口后换到相邻的陆地行
          if (blocker.def.divert && !e.def.vehicle && !e.def.boss && !e.rowSpan) {
            e.divertT = (e.divertT ?? 0) + DT;
            if (e.divertT >= 0.6) {
              e.divertT = 0;
              const up = validLandRow(w, e.row - 1);
              const down = validLandRow(w, e.row + 1);
              if (up || down) {
                const from = e.row;
                e.row += up && down ? (w.rng.chance(0.5) ? -1 : 1) : up ? -1 : 1;
                e.state = 'walk';
                e.target = 0;
                e.x += 0.15;
                w.emit({ t: 'divert', x: e.x, row: e.row, from });
              }
            }
          }
        } else {
          e.state = 'walk';
          const prevX = e.x;
          e.x += e.dir * speed * DT;
          // 路线箭头：经过格子中心时转向相邻行
          if (e.dir < 0) {
            const c = Math.floor(prevX - 0.5);
            if (c >= 0 && c < w.cols && prevX >= c + 0.5 && e.x < c + 0.5) {
              const a = w.grid[e.row][c].arrow;
              if (a && validLandRow(w, e.row + a)) e.row += a;
            }
          }
          // 霜轮车留下冰痕
          if (e.def.id === 'frost_hauler') {
            const c = Math.floor(e.x);
            if (c >= 0 && c < w.cols) w.grid[e.row][c].iceTrail = 20;
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

/** 检查敌人是否突破左侧防线 */
export function breachCheck(w: World): void {
  for (const e of w.enemies) {
    if (e.dead || e.escaped) continue;
    if (e.dir > 0 && e.x > w.cols + 1) {
      e.dead = true;
      e.escaped = true;
      continue;
    }
    if (e.dir < 0 && e.x < -0.25 && !e.burrowed) {
      if (e.def.boss === 'king') continue;
      if (w.sentinels.some((s) => s.row === e.row && s.x < 0.6)) continue;
      if (w.triggerSentinel(e.row)) continue;
      if (!w.stats.breach) w.stats.breach = { row: e.row, enemy: e.def.id, t: Math.round(w.time * 10) / 10, wave: w.waveIndex, x: e.x };
      w.lose(`${CONTENT.enemies.get(e.def.id)?.name ?? e.def.id} 突破了第 ${e.row + 1} 行防线`);
      if (!w.finished) {
        e.dead = true;
        e.escaped = true;
      }
    }
  }
}
