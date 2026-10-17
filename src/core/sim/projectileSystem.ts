import { DT } from '../constants';
import type { World } from './world';
import type { Enemy, Projectile } from './entities';

const HIT_R = 0.3;

function applyHit(w: World, p: Projectile, e: Enemy, dir: number): void {
  let dmg = p.dmg;
  if (p.kind === 'fire') dmg *= w.weather.fireMul;
  const src = w.unitById(p.srcId);
  const dealt = w.damageEnemy(e, dmg, p.src, { front: !p.lob, dir });
  if (src) {
    src.dmgDealt += dealt;
    if (e.dead) src.kills++;
  }
  if (!e.dead) {
    if (p.kind === 'fire') {
      e.slow = 0;
      e.freeze = 0;
    } else if (p.slow && !(e.armorKind === 'shield' && e.armor > 0 && !p.lob && dir !== e.dir)) {
      e.slow = Math.max(e.slow, p.slow.dur);
      e.slowMul = Math.min(e.slowMul < 1 && e.slow > 0 ? e.slowMul : 1, p.slow.mul);
    }
  }
  // 溅射
  const splash = p.kind === 'fire' ? 0.65 : p.kind === 'steam' ? 0.9 : p.splash;
  const splashMul = p.kind === 'fire' ? 0.34 : p.kind === 'steam' ? 0.5 : p.splashMul;
  if (splash > 0 && splashMul > 0) {
    for (const o of w.enemies) {
      if (o === e || o.dead || o.burrowed || o.submerged) continue;
      if (o.def.flying && !p.antiAir) continue;
      const dist = Math.hypot(o.x - e.x, (o.row - e.row) * (p.kind === 'fire' ? 3 : 1));
      if (dist > splash) continue;
      const d2 = w.damageEnemy(o, dmg * splashMul, p.src);
      if (src) src.dmgDealt += d2;
      if (p.kind === 'steam' && !o.dead && p.slow) {
        o.slow = Math.max(o.slow, p.slow.dur * 0.6);
        o.slowMul = Math.min(o.slowMul, p.slow.mul);
      }
    }
    if (p.kind === 'steam' || p.kind === 'meteor') w.emit({ t: 'explode', x: e.x, row: e.row, radius: splash, kind: p.kind === 'steam' ? 'steam' : 'meteor' });
  }
  w.emit({ t: 'hit', x: e.x, row: e.row, kind: p.kind, dmg: Math.round(dealt) });
}

/** 光弹穿过熔火图腾时转化 */
function totemCheck(w: World, p: Projectile, prevX: number): void {
  if (p.vx <= 0 || p.lob) return;
  if (p.kind !== 'bolt' && p.kind !== 'moon' && p.kind !== 'frost') return;
  const c0 = Math.floor(prevX - 0.5);
  const c1 = Math.floor(p.x - 0.5);
  for (let c = Math.max(0, c0); c <= Math.min(w.cols - 1, c1); c++) {
    if (!(prevX < c + 0.5 && p.x >= c + 0.5)) continue;
    const u = w.unitAt(p.row, c);
    if (!u || u.def.behavior !== 'totem' || p.totems.includes(u.id)) continue;
    p.totems.push(u.id);
    if (p.kind === 'frost') {
      if (u.buff.steam) {
        p.kind = 'steam';
        p.dmg *= 1.5;
        w.stats.combos.steam_burst = (w.stats.combos.steam_burst ?? 0) + 1;
      } else {
        p.kind = 'bolt';
        p.slow = undefined;
      }
    } else {
      p.kind = 'fire';
      p.dmg *= 2;
      p.slow = undefined;
    }
    u.anim = 5;
  }
}

export function updateProjectiles(w: World): void {
  for (const p of w.projectiles) {
    if (p.dead) continue;
    p.age += DT;
    if (p.lob) {
      const L = p.lob;
      L.t += DT;
      const target = w.enemyById(L.target);
      if (target && !target.burrowed && !target.submerged) {
        L.tx = target.x;
        L.trow = target.row;
      }
      const k = Math.min(1, L.t / L.dur);
      p.x = L.sx + (L.tx - L.sx) * k;
      if (k >= 1) {
        p.dead = true;
        if (target && w.targetable(target, { lob: true })) applyHit(w, p, target, 0);
        else {
          // 目标消失：在落点溅射
          const near = w.enemiesInRow(L.trow).find((e) => w.targetable(e, { lob: true }) && Math.abs(e.x - L.tx) < 0.5);
          if (near) applyHit(w, p, near, 0);
          else w.emit({ t: 'splash', x: L.tx, row: L.trow });
        }
      }
      continue;
    }
    if (p.enemyShot) {
      // 敌方投石：抛物线后对单位造成伤害
      p.age += 0;
      if (p.age >= 1.0) {
        p.dead = true;
        const u = w.unitById(p.enemyShot.targetUnit);
        if (u) w.damageUnit(u, p.enemyShot.dmg, 'catapult');
        w.emit({ t: 'splash', x: p.x + p.vx * 1.0, row: p.row });
      }
      continue;
    }
    const prevX = p.x;
    p.x += p.vx * DT;
    totemCheck(w, p, prevX);
    if (p.x > w.cols + 0.8 || p.x < -0.8) {
      p.dead = true;
      continue;
    }
    if (p.miss) continue;
    const dir = p.vx > 0 ? 1 : -1;
    let best: Enemy | undefined;
    for (const e of w.enemiesInRow(p.row)) {
      if (!w.targetable(e, { antiAir: p.antiAir })) continue;
      if (p.pierce && p.hits.includes(e.id)) continue;
      if (Math.abs(e.x - p.x) > HIT_R) continue;
      if (e.x > w.cols + 0.5) continue;
      if (!best || (dir > 0 ? e.x < best.x : e.x > best.x)) best = e;
    }
    if (!best) continue;
    applyHit(w, p, best, dir);
    if (p.pierce) p.hits.push(best.id);
    else p.dead = true;
  }
}
