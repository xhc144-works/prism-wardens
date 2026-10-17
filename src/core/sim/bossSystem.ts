import { DT } from '../constants';
import { WEATHER } from '../content/environment';
import type { World } from './world';
import type { Enemy, Unit } from './entities';

export function initBoss(w: World, e: Enemy): void {
  e.boss = { phase: 1, t1: 8, t2: 12, t3: 10, t4: 24, mode: 'walk', modeT: 14, span: 0, targetRow: e.row, hits: 0 };
  if (e.def.boss === 'tempest') {
    e.boss.mode = 'hover';
    e.boss.t1 = 6;
    e.boss.t2 = 10;
    e.boss.t3 = 10;
  }
  if (e.def.boss === 'king') {
    e.boss.mode = 'idle';
    e.boss.span = 1;
    e.boss.t1 = 6;
    e.boss.t2 = 12;
    e.boss.t3 = 20;
    e.boss.t4 = 26;
    const center = Math.max(1, Math.min(w.rows - 2, e.row));
    e.row = center;
    e.y = center;
    e.rowSpan = [center - 1, center + 1];
  }
}

function landRows(w: World): number[] {
  const out: number[] = [];
  for (let r = 0; r < w.rows; r++) if (!w.isWaterRow(r)) out.push(r);
  return out.length ? out : [0];
}

function unitsNear(w: World, row: number, x: number, dx: number): Unit[] {
  return w.units.filter((u) => !u.dead && u.layer !== 'instant' && u.row === row && Math.abs(u.col + 0.5 - x) <= dx);
}

function updateWyrm(w: World, e: Enemy): void {
  const b = e.boss!;
  if (b.phase === 1 && e.hp < e.maxHp * 0.5) {
    b.phase = 2;
    w.emit({ t: 'boss', text: '深渊巨蠕陷入狂暴！' });
  }
  const p2 = b.phase === 2;
  b.modeT -= DT;
  if (b.mode === 'walk') {
    e.burrowed = false;
    // 啃咬/前进
    let blocker: Unit | undefined;
    for (let c = w.cols - 1; c >= 0; c--) {
      if (e.x < c + 0.45 || e.x > c + 1.3) continue;
      const u = w.unitAt(e.row, c) ?? w.plateAt(e.row, c);
      if (u && !u.def.noBite) {
        blocker = u;
        break;
      }
    }
    if (blocker) {
      e.state = 'eat';
      w.damageUnit(blocker, e.def.dps * e.dmgMul * DT, e.def.id);
    } else {
      e.state = 'walk';
      let s = e.def.speed * (p2 ? 1.5 : 1) * e.speedMul;
      if (e.slow > 0) s *= e.slowMul;
      if (w.timeWarp > 0) s *= 0.4;
      e.x -= s * DT;
    }
    b.t1 -= DT;
    if (b.t1 <= 0) {
      b.t1 = p2 ? 6 : 9;
      const front = w.units
        .filter((u) => !u.dead && u.layer !== 'instant' && !u.relic && u.row === e.row && u.col + 0.5 < e.x + 0.3 && e.x - (u.col + 0.5) < 1.9)
        .sort((a, c) => c.col - a.col)[0];
      if (front) {
        w.emit({ t: 'devour', row: front.row, col: front.col });
        w.damageUnit(front, 99999, e.def.id);
      }
    }
    b.t2 -= DT;
    if (b.t2 <= 0) {
      b.t2 = p2 ? 9 : 14;
      for (const r of [e.row - 1, e.row, e.row + 1]) {
        if (r < 0 || r >= w.rows || w.isWaterRow(r)) continue;
        w.spawnEnemy('shardling', r, Math.max(0.8, e.x - 0.7), w.waveIndex);
      }
      w.emit({ t: 'text', text: '巨蠕喷吐出碎晶体！', color: '#ff2e63' });
    }
    if (b.modeT <= 0) {
      b.mode = 'dive';
      b.modeT = 1.5;
    }
  } else if (b.mode === 'dive') {
    e.burrowed = true;
    if (b.modeT <= 0) {
      const rows = landRows(w).filter((r) => r !== e.row);
      const nr = rows.length ? w.rng.pick(rows) : e.row;
      e.row = nr;
      e.y = nr;
      e.x = Math.max(2.5, Math.min(w.cols - 0.6, e.x + w.rng.range(-0.3, 1.6)));
      b.mode = 'surface';
      b.modeT = 1.2;
    }
  } else if (b.mode === 'surface') {
    e.burrowed = true;
    if (b.modeT <= 0) {
      e.burrowed = false;
      for (const u of unitsNear(w, e.row, e.x, 1.2)) w.damageUnit(u, 300, e.def.id);
      w.emit({ t: 'explode', x: e.x, row: e.row, radius: 1.2, kind: 'bomber' });
      b.mode = 'walk';
      b.modeT = p2 ? 10 : 14;
    }
  }
}

function updateTempest(w: World, e: Enemy): void {
  const b = e.boss!;
  if (b.phase === 1 && e.hp < e.maxHp * 0.5) {
    b.phase = 2;
    w.weather = WEATHER.storm;
    w.weatherLeft = Infinity;
    w.emit({ t: 'weather', id: 'storm' });
    w.emit({ t: 'boss', text: '风暴巨兽召来了永恒雷暴！' });
  }
  const p2 = b.phase === 2;
  const targetX = w.cols - (p2 ? 4.3 : 3.2);
  if (e.x > targetX) {
    let s = 0.35 * e.speedMul;
    if (e.slow > 0) s *= e.slowMul;
    e.x = Math.max(targetX, e.x - s * DT);
  }
  b.t3 -= DT;
  if (b.t3 <= 0) {
    b.t3 = p2 ? 7 : 10;
    const nr = w.rng.int(w.rows);
    e.row = nr;
  }
  b.t1 -= DT;
  if (b.t1 <= 0) {
    b.t1 = p2 ? 4 : 6;
    const us = w.units.filter((u) => !u.dead && u.layer === 'main' && !u.relic);
    const n = p2 ? 3 : 2;
    for (let i = 0; i < n && us.length; i++) {
      const u = us.splice(w.rng.int(us.length), 1)[0];
      w.damageUnit(u, 150, e.def.id);
      w.emit({ t: 'lightning', x: u.col + 0.5, row: u.row, x2: e.x, row2: e.row });
    }
  }
  b.t2 -= DT;
  if (b.t2 <= 0) {
    b.t2 = p2 ? 12 : 16;
    const n = p2 ? 3 : 2;
    for (let i = 0; i < n; i++) w.spawnEnemy('floater', w.rng.int(w.rows), w.cols + 0.3, w.waveIndex);
    w.emit({ t: 'text', text: '风暴巨兽唤来了浮游蚀灵', color: '#5bc0eb' });
  }
}

function updateKing(w: World, e: Enemy): void {
  const b = e.boss!;
  const hpFrac = e.hp / e.maxHp;
  const newPhase = hpFrac < 0.33 ? 3 : hpFrac < 0.66 ? 2 : 1;
  if (newPhase > b.phase) {
    b.phase = newPhase;
    w.emit({ t: 'boss', text: newPhase === 2 ? '蚀之王怒不可遏！' : '蚀之王释放了全部力量！' });
    if (newPhase === 3) w.spawnEnemy('colossus', w.rng.pick(landRows(w)), w.cols - 0.9, w.waveIndex);
  }
  const k = b.phase === 1 ? 1 : b.phase === 2 ? 0.8 : 0.65;
  e.x = w.cols - 0.55;
  b.t1 -= DT;
  if (b.t1 <= 0) {
    b.t1 = 11 * k;
    const pool = b.phase >= 2 ? ['husk', 'shard_husk', 'iron_husk', 'leaper', 'berserker', 'shieldbearer'] : ['husk', 'shard_husk', 'leaper', 'berserker'];
    const n = 2 + b.phase;
    const rows = landRows(w);
    for (let i = 0; i < n; i++) w.spawnEnemy(w.rng.pick(pool), w.rng.pick(rows), w.cols - 1.1 + w.rng.next() * 0.4, w.waveIndex);
    w.emit({ t: 'text', text: '蚀之王召唤了大军', color: '#ff006e' });
  }
  b.t2 -= DT;
  if (b.t2 <= 0) {
    b.t2 = 14 * k;
    const span = e.rowSpan!;
    const r = span[0] + w.rng.int(span[1] - span[0] + 1);
    w.spawnEnemy('blight_orb', r, w.cols - 1.1, w.waveIndex);
    w.emit({ t: 'text', text: '蚀能球滚滚而来！', color: '#ff006e' });
  }
  if (b.mode === 'stomp') {
    b.modeT -= DT;
    if (b.modeT <= 0) {
      const span = e.rowSpan!;
      for (const u of w.units) {
        if (u.dead || u.layer === 'instant' || u.relic) continue;
        if (u.row >= span[0] && u.row <= span[1] && u.col >= w.cols - 3) w.damageUnit(u, 99999, e.def.id);
      }
      w.emit({ t: 'explode', x: w.cols - 1.5, row: e.row, radius: 1.8, kind: 'bomber' });
      b.mode = 'idle';
    }
  } else {
    b.t3 -= DT;
    if (b.t3 <= 0) {
      b.t3 = 20 * k;
      b.mode = 'stomp';
      b.modeT = 1.6;
      w.emit({ t: 'boss', text: '蚀之王即将践踏！' });
    }
  }
  b.t4 -= DT;
  if (b.t4 <= 0 && b.mode !== 'stomp') {
    b.t4 = 24 * k;
    const center = 1 + w.rng.int(Math.max(1, w.rows - 2));
    e.row = center;
    e.rowSpan = [Math.max(0, center - 1), Math.min(w.rows - 1, center + 1)];
  }
}

export function updateBosses(w: World): void {
  for (const id of w.bossIds) {
    const e = w.enemyById(id);
    if (!e || !e.boss) continue;
    if (e.freeze > 0 || e.stun > 0) continue;
    if (e.def.boss === 'wyrm') updateWyrm(w, e);
    else if (e.def.boss === 'tempest') updateTempest(w, e);
    else if (e.def.boss === 'king') updateKing(w, e);
  }
}
