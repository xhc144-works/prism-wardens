import { DT, sec } from '../constants';
import { CONTENT } from '../content/registry';
import type { Rng } from '../rng';
import type { EnemyDef, WaveDef, WaveGen } from '../types';
import type { World } from './world';

/** 根据生成器参数生成第 i 波（0 起） */
export function generateWave(i: number, gen: WaveGen, rng: Rng, hasWater: boolean, endless: boolean): WaveDef {
  const num = i + 1;
  const isLast = !endless && num === gen.count;
  const flag = (gen.flagEvery > 0 && num % gen.flagEvery === 0) || isLast;
  let budget = (gen.base + gen.growth * i) * (flag ? gen.flagMul ?? 2.4 : 1);
  if (endless && i > 30) budget *= 1 + (i - 30) * 0.035;
  const progress = endless ? Math.min(1, i / 40) : gen.count > 1 ? i / (gen.count - 1) : 1;
  const pool: EnemyDef[] = [];
  for (const id of gen.pool) {
    const d = CONTENT.enemies.get(id);
    if (!d || d.noSpawn || d.boss) continue;
    if ((d.minWave ?? 0) > num && !(endless && num > 3)) continue;
    if (d.swim && !hasWater) continue;
    pool.push(d);
  }
  const counts = new Map<string, number>();
  if (flag) counts.set('banner_husk', 1);
  let guard = 0;
  while (budget >= 1 && guard++ < 200) {
    const cands = pool.filter((d) => d.cost <= budget + 0.001);
    if (!cands.length) break;
    const d = rng.weighted(cands, (x) => x.weight * (1 + (x.cost - 1) * progress * 0.4) * (x.cost > budget * 0.8 && budget > 4 ? 0.6 : 1));
    counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
    budget -= d.cost;
  }
  if (counts.size === 0 || (counts.size === 1 && counts.has('banner_husk'))) counts.set(pool.find((d) => d.id === 'husk') ? 'husk' : pool[0]?.id ?? 'husk', 1);
  if (gen.bossAtEnd && isLast) counts.set(gen.bossAtEnd, 1);
  if (endless && num % 20 === 0) counts.set(num % 40 === 0 ? 'boss_tempest' : 'boss_wyrm', 1);
  return { spawns: [...counts.entries()].map(([enemy, count]) => ({ enemy, count })), flag };
}

function mapHasWater(w: World): boolean {
  for (let r = 0; r < w.rows; r++) if (w.isWaterRow(r)) return true;
  return false;
}

export function initWaves(w: World): void {
  const L = w.level;
  const endless = L.objective?.type === 'endless';
  if (L.waves && L.waves.length) {
    w.waves = L.waves;
    w.totalWaves = L.waves.length;
  } else if (L.gen) {
    w.totalWaves = endless ? Infinity : L.gen.count;
    if (!endless) {
      const water = mapHasWater(w);
      for (let i = 0; i < L.gen.count; i++) w.waves.push(generateWave(i, L.gen, w.waveRng, water, false));
    }
  } else {
    w.totalWaves = 0;
  }
  w.waveTimer = L.firstWaveDelay ?? 20;
  if (w.config.mode === 'survival') w.roundSize = 10;
}

export function getWave(w: World, i: number): WaveDef | undefined {
  if (i < w.waves.length) return w.waves[i];
  const L = w.level;
  if (L.objective?.type === 'endless' && L.gen) {
    while (w.waves.length <= i) w.waves.push(generateWave(w.waves.length, L.gen, w.waveRng, mapHasWater(w), true));
    return w.waves[i];
  }
  return undefined;
}

function pickRow(w: World, def: EnemyDef): number {
  const rows: number[] = [];
  const allowed = w.map.spawnRows && w.map.spawnRows.length ? w.map.spawnRows : null;
  for (let r = 0; r < w.rows; r++) {
    if (allowed && !allowed.includes(r)) continue;
    const water = w.isWaterRow(r);
    if (def.swim && !water) continue;
    if (!def.swim && !def.flying && water) continue;
    rows.push(r);
  }
  if (!rows.length) {
    for (let r = 0; r < w.rows; r++) if (!w.isWaterRow(r)) rows.push(r);
    if (!rows.length) rows.push(0);
  }
  const min = Math.min(...rows.map((r) => w.spawnCounts[r]));
  const r = w.waveRng.weighted(rows, (x) => 1 / (1 + (w.spawnCounts[x] - min) * 1.5));
  w.spawnCounts[r]++;
  return r;
}

function currentWaveRemaining(w: World): number {
  let hp = 0;
  for (const e of w.enemies) if (!e.dead && e.wave === w.waveIndex) hp += e.hp + e.armor;
  for (const p of w.pending) if (p.wave === w.waveIndex) hp += 200;
  return hp;
}

function startWave(w: World): void {
  const wave = getWave(w, w.waveIndex);
  if (!wave) return;
  w.waveIndex++;
  w.waveElapsed = 0;
  const countMul = w.cheats?.enemy?.count ?? 1;
  let total = 0;
  let order = 0;
  const pendingStart = w.pending.length;
  for (const s of wave.spawns) {
    const def = CONTENT.enemies.get(s.enemy);
    if (!def) continue;
    const pc = w.cheats?.perEnemy?.[s.enemy]?.count ?? countMul;
    const n = def.boss ? s.count : Math.max(0, Math.round(s.count * pc));
    for (let k = 0; k < n; k++) {
      let row = s.row != null && s.row >= 0 && s.row < w.rows ? s.row : pickRow(w, def);
      if (def.boss === 'tempest' || def.boss === 'king') row = Math.floor(w.rows / 2);
      const delay = (s.delay ?? 0) + (def.boss ? 3 : def.id === 'banner_husk' ? 0 : w.waveRng.range(0.2, 2.8) + order * 0.12);
      w.pending.push({ tick: w.tick + sec(delay), enemy: s.enemy, row, wave: w.waveIndex });
      total += def.hp + (def.armor?.hp ?? 0);
      order++;
    }
  }
  // 蚀晶碑中爬出的敌人（夜晚地图）
  if (w.waveIndex >= 2) {
    for (let r = 0; r < w.rows; r++)
      for (let c = 0; c < w.cols; c++) {
        if (!w.grid[r][c].tomb) continue;
        if (w.waveRng.chance(0.35)) {
          const enemy = w.waveIndex > 6 && w.waveRng.chance(0.4) ? 'shard_husk' : 'husk';
          w.pending.push({ tick: w.tick + sec(w.waveRng.range(1, 4)), enemy, row: r, x: c + 0.5, wave: w.waveIndex });
          total += 300;
        }
      }
  }
  w.pending.sort((a, b) => a.tick - b.tick);
  w.waveHp = Math.max(1, total * w.hpMul);
  w.emit({ t: 'wave', index: w.waveIndex, flag: !!wave.flag });
  if (w.pending.length === pendingStart) w.waveHp = 1;
}

export function updateWaves(w: World): void {
  // 生成待出场的敌人
  while (w.pending.length && w.pending[0].tick <= w.tick) {
    const p = w.pending.shift()!;
    const def = CONTENT.enemies.get(p.enemy);
    if (!def) continue;
    let x = p.x ?? w.cols + 0.55 + w.waveRng.next() * 0.6;
    if (def.boss === 'king') x = w.cols - 0.55;
    const e = w.spawnEnemy(p.enemy, p.row, x, p.wave);
    if (def.boss) {
      w.bossIds.push(e.id);
      w.emit({ t: 'boss', text: `首领 ${def.name} 出现了！` });
    }
  }

  if (w.waveIndex >= w.totalWaves) return;
  // 生存模式：每轮结束后进入休整
  if (w.roundSize > 0 && w.waveIndex > 0 && w.waveIndex % w.roundSize === 0 && w.waveElapsed >= 0) {
    if (w.pending.length === 0 && w.enemiesAlive === 0 && w.status === 'running' && !w.roundRested.includes(w.waveIndex)) {
      w.roundRested.push(w.waveIndex);
      w.status = 'intermission';
      w.emit({ t: 'text', text: `第 ${w.waveIndex / w.roundSize} 轮完成！可以重新选择卡组`, color: '#ffd166' });
      return;
    }
    if (!w.roundRested.includes(w.waveIndex)) return;
  }

  const rate = w.cheats?.enemy?.spawnRate ?? 1;
  w.waveElapsed += DT * rate;
  w.waveTimer -= DT * rate;
  const next = getWave(w, w.waveIndex);
  const gap = w.level.waveGap ?? [6, 30];
  let trigger = false;
  if (w.waveIndex === 0) trigger = w.waveTimer <= 0;
  else {
    const remaining = currentWaveRemaining(w);
    trigger = w.waveElapsed >= gap[1] + (next?.flag ? 6 : 0) || (w.waveElapsed >= gap[0] && remaining <= w.waveHp * 0.38) || (w.waveElapsed >= 2 && remaining <= 0);
  }
  if (!trigger) {
    w.flagWarnAt = -1;
    return;
  }
  if (next?.flag && w.flagWarnAt < 0) {
    w.flagWarnAt = w.tick + sec(4);
    w.emit({ t: 'flagWarn' });
    return;
  }
  if (next?.flag && w.tick < w.flagWarnAt) return;
  w.flagWarnAt = -1;
  startWave(w);
}
