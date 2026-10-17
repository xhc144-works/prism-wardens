import { SKILLS } from '../content/abilities';
import type { World } from './world';

export function useSkill(w: World, id: string, row?: number, col?: number): void {
  const s = w.skills.find((x) => x.id === id);
  const def = SKILLS.find((x) => x.id === id);
  if (!s || !def) return;
  s.cooldown = def.cooldown;
  w.emit({ t: 'skill', id, row, col });
  switch (id) {
    case 'lumen_rain':
      w.lumen += 150;
      w.stats.lumenGenerated += 150;
      w.stats.lumenCollected += 150;
      break;
    case 'time_warp':
      w.timeWarp = 8;
      break;
    case 'meteor_strike': {
      const r = row ?? 0;
      const cx = (col ?? 0) + 0.5;
      for (const e of w.enemies) {
        if (e.dead || e.burrowed) continue;
        const rowOk = e.rowSpan ? e.rowSpan[0] <= r + 1 && e.rowSpan[1] >= r - 1 : Math.abs(e.row - r) <= 1;
        if (rowOk && Math.abs(e.x - cx) <= 1.5) w.damageEnemy(e, 700, '__skill');
      }
      for (let rr = r - 1; rr <= r + 1; rr++)
        for (let cc = (col ?? 0) - 1; cc <= (col ?? 0) + 1; cc++) if (w.inBounds(rr, cc)) w.grid[rr][cc].tomb = false;
      w.emit({ t: 'explode', x: cx, row: r, radius: 1.5, kind: 'meteor' });
      break;
    }
    case 'aegis':
      w.aegis = 6;
      break;
    case 'thunderclap': {
      const targets = w.enemies.filter((e) => !e.dead && !e.burrowed && !e.submerged && e.x < w.cols + 0.4);
      w.rng.shuffle(targets);
      for (const e of targets.slice(0, 10)) {
        w.damageEnemy(e, 300, '__skill');
        w.emit({ t: 'lightning', x: e.x, row: e.row });
      }
      break;
    }
    case 'restoration':
      for (const u of w.units) if (!u.dead && !u.relic && u.layer !== 'instant') u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.6);
      break;
  }
}

export function useItem(w: World, id: string, row?: number, col?: number): void {
  w.emit({ t: 'skill', id, row, col });
  switch (id) {
    case 'overcharge': {
      const u = w.unitAt(row!, col!);
      if (u) u.overcharge = 10;
      break;
    }
    case 'repair_kit': {
      const u = w.unitAt(row!, col!);
      if (u) {
        u.hp = u.maxHp;
        u.shield = Math.round(u.maxHp * 0.5);
      }
      break;
    }
    case 'fire_flask':
      for (const e of w.enemies) {
        if (e.dead || e.burrowed || !w.inRow(e, row!)) continue;
        e.slow = 0;
        e.freeze = 0;
        w.damageEnemy(e, 600, '__item');
      }
      w.emit({ t: 'lane', row: row!, kind: 'fire' });
      break;
    case 'frost_grenade':
      for (const e of w.enemies) {
        if (e.dead) continue;
        if (Math.abs(e.row - row!) <= 1 && Math.abs(e.x - ((col ?? 4) + 0.5)) <= 1.5) e.freeze = Math.max(e.freeze, e.def.boss ? 2 : 6);
      }
      w.emit({ t: 'freeze' });
      break;
    case 'rune_restore':
      w.sentinelReady[row!] = true;
      break;
    case 'lumen_crystal':
      w.lumen += 100;
      w.stats.lumenGenerated += 100;
      w.stats.lumenCollected += 100;
      break;
  }
}
