import { DT, SKY_DROP_VALUE } from '../constants';
import { EVENTS, TERRAIN, WEATHER } from '../content/environment';
import { ITEMS } from '../content/abilities';
import { CONTENT } from '../content/registry';
import type { WeatherId } from '../types';
import type { World } from './world';

function setWeather(w: World, id: WeatherId, duration: number): void {
  const changed = w.weather.id !== id;
  w.weather = WEATHER[id] ?? WEATHER.clear;
  w.weatherLeft = duration;
  if (!w.stats.weatherSeen.includes(id)) w.stats.weatherSeen.push(id);
  if (changed && w.tick > 0) w.emit({ t: 'weather', id });
  w.fogStart = w.weather.fog ? Math.max(3, w.cols - 4.5) : 99;
}

export function initEnvironment(w: World): void {
  const plan = w.rules?.c.weather ?? w.level.weather;
  if (!plan) setWeather(w, 'clear', Infinity);
  else if (plan.mode === 'fixed') setWeather(w, plan.id, Infinity);
  else if (plan.mode === 'cycle') {
    w.weatherIdx = 0;
    const first = plan.list[0];
    setWeather(w, first?.id ?? 'clear', first?.duration ?? Infinity);
  } else setWeather(w, w.rng.pick(plan.pool), w.rng.range(plan.min, plan.max));
  w.skyTimer = 5;
  const ev = w.level.events;
  w.eventTimer = ev?.enabled ? w.rng.range(ev.interval[0], ev.interval[1]) + 20 : Infinity;
  w.lightningTimer = 5;
}

function skyEnabled(w: World): boolean {
  if (w.rules?.c.noSkyDrops) return false;
  if (w.level.skyDrops === false) return false;
  return w.weather.skyMul > 0;
}

/** 夜晚没有阳光，只有稀疏的“月华”光球 */
export function isMoonlight(w: World): boolean {
  return w.level.time === 'night' && w.level.skyDrops === undefined;
}

function triggerEvent(w: World, id: string): void {
  const def = EVENTS.find((e) => e.id === id);
  if (!def) return;
  if (!w.stats.eventsSeen.includes(id)) w.stats.eventsSeen.push(id);
  w.emit({ t: 'event', id, text: `${def.name}：${def.desc}` });
  switch (id) {
    case 'supply_drop': {
      const item = w.rng.pick(ITEMS.filter((i) => i.id !== 'rune_restore'));
      w.items[item.id] = (w.items[item.id] ?? 0) + 1;
      w.spawnOrb(75, 1 + w.rng.next() * (w.cols - 2), w.rng.int(w.rows), 'event', -1);
      break;
    }
    case 'merchant':
      for (const d of w.deck) d.cooldown = 0;
      break;
    case 'quake': {
      const empties: [number, number][] = [];
      for (let r = 0; r < w.rows; r++)
        for (let c = 0; c < w.cols; c++) {
          const cell = w.grid[r][c];
          if (!cell.main && !cell.plate && !cell.tomb && !cell.node && TERRAIN[cell.terrain].placeable) empties.push([r, c]);
        }
      w.rng.shuffle(empties);
      for (const [r, c] of empties.slice(0, 3)) w.grid[r][c].crack = def.duration;
      for (const e of w.enemies) if (!e.dead && !e.burrowed && !e.def.flying) w.damageEnemy(e, 60, '__event');
      break;
    }
    case 'ambush': {
      const pool = (w.level.enemyPool ?? ['husk']).filter((x) => {
        const d = CONTENT.enemies.get(x);
        return d && !d.boss && !d.noSpawn && !d.swim && (d.minWave ?? 0) <= Math.max(1, w.waveIndex);
      });
      const n = 3 + w.rng.int(3);
      for (let i = 0; i < n; i++) {
        const id = pool.length ? w.rng.pick(pool) : 'husk';
        let r = w.rng.int(w.rows);
        for (let k = 0; k < 6 && w.isWaterRow(r); k++) r = w.rng.int(w.rows);
        if (w.isWaterRow(r)) continue;
        w.spawnEnemy(id, r, w.cols + 0.5 + w.rng.next() * 0.5, w.waveIndex);
      }
      break;
    }
    default:
      if (def.duration > 0) w.activeEvents.push({ id, left: def.duration });
      break;
  }
}

export function updateEnvironment(w: World): void {
  // 天气
  w.weatherLeft -= DT;
  if (w.weatherLeft <= 0) {
    const plan = w.rules?.c.weather ?? w.level.weather;
    if (plan?.mode === 'cycle' && plan.list.length) {
      w.weatherIdx = (w.weatherIdx + 1) % plan.list.length;
      const n = plan.list[w.weatherIdx];
      setWeather(w, n.id, n.duration);
    } else if (plan?.mode === 'random') {
      setWeather(w, w.rng.pick(plan.pool), w.rng.range(plan.min, plan.max));
    } else w.weatherLeft = Infinity;
  }

  // 计时器
  if (w.fogClear > 0) w.fogClear -= DT;
  if (w.aegis > 0) w.aegis -= DT;
  if (w.timeWarp > 0) w.timeWarp -= DT;
  if (w.tick % 30 === 0) {
    for (let r = 0; r < w.rows; r++)
      for (let c = 0; c < w.cols; c++) {
        const cell = w.grid[r][c];
        if (cell.crack > 0) cell.crack = Math.max(0, cell.crack - 1);
        if (cell.iceTrail > 0) cell.iceTrail = Math.max(0, cell.iceTrail - 1);
      }
  }
  for (const ev of w.activeEvents) ev.left -= DT;
  w.activeEvents = w.activeEvents.filter((e) => e.left > 0);

  // 天降光能
  if (skyEnabled(w)) {
    let mul = w.weather.skyMul;
    if (w.activeEvents.some((e) => e.id === 'lumen_surge')) mul *= 3;
    w.skyTimer -= DT * mul;
    if (w.skyTimer <= 0) {
      const moon = isMoonlight(w);
      const [a, b] = w.level.skyInterval ?? (moon ? [13, 17] : [8.5, 11.5]);
      w.skyTimer = w.rng.range(a, b);
      const x = 0.4 + w.rng.next() * (w.cols - 1.3);
      const y = w.rng.next() * (w.rows - 1) + 0.2;
      w.spawnOrb(moon ? 15 : SKY_DROP_VALUE, x, y, 'sky', -0.8);
    }
  }

  // 光晶矿
  for (let r = 0; r < w.rows; r++)
    for (let c = 0; c < w.cols; c++) {
      const cell = w.grid[r][c];
      if (!cell.node) continue;
      cell.nodeTimer -= DT;
      if (cell.nodeTimer <= 0) {
        cell.nodeTimer = 15;
        w.spawnOrb(15, c + 0.5, r + 0.2, 'node', r - 0.2);
      }
    }

  // 雷暴
  if (w.weather.lightning) {
    w.lightningTimer -= DT;
    if (w.lightningTimer <= 0) {
      w.lightningTimer = w.rng.range(4, 8);
      const targets = w.enemies.filter((e) => !e.dead && !e.burrowed && e.x < w.cols + 0.3);
      if (targets.length && w.rng.chance(0.85)) {
        const e = w.rng.pick(targets);
        w.damageEnemy(e, 200, '__weather');
        w.emit({ t: 'lightning', x: e.x, row: e.row });
      } else {
        const us = w.units.filter((u) => !u.dead && u.layer === 'main' && !u.relic);
        if (us.length) {
          const u = w.rng.pick(us);
          w.damageUnit(u, 80, '__weather');
          w.emit({ t: 'lightning', x: u.col + 0.5, row: u.row });
        }
      }
    }
  }

  // 流星雨
  if (w.activeEvents.some((e) => e.id === 'meteor_shower')) {
    w.meteorTimer -= DT;
    if (w.meteorTimer <= 0) {
      w.meteorTimer = 0.8;
      const targets = w.enemies.filter((e) => !e.dead && !e.burrowed && e.x < w.cols + 0.2);
      let x: number;
      let row: number;
      if (targets.length && w.rng.chance(0.8)) {
        const e = w.rng.pick(targets);
        x = e.x;
        row = e.row;
      } else {
        x = w.rng.next() * w.cols;
        row = w.rng.int(w.rows);
      }
      for (const e of w.enemies) if (!e.dead && !e.burrowed && Math.abs(e.row - row) <= 0 && Math.abs(e.x - x) < 0.8) w.damageEnemy(e, 200, '__event');
      const c = Math.floor(x);
      const u = w.unitAt(row, c);
      if (u && w.rng.chance(0.25)) w.damageUnit(u, 100, '__event');
      w.emit({ t: 'explode', x, row, radius: 0.8, kind: 'meteor' });
    }
  }

  // 随机事件
  const ev = w.level.events;
  if (ev?.enabled && w.waveIndex > 0) {
    w.eventTimer -= DT;
    if (w.eventTimer <= 0) {
      w.eventTimer = w.rng.range(ev.interval[0], ev.interval[1]);
      const pool = EVENTS.filter((e) => !ev.pool || ev.pool.includes(e.id));
      if (pool.length) triggerEvent(w, w.rng.weighted(pool, (e) => e.weight).id);
    }
  }
}
