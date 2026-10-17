import { DT } from '../constants';
import { CONTENT } from '../content/registry';
import type { World } from './world';

/** 修改器中需要每帧执行的部分：自动部署 */
export function updateCheats(w: World): void {
  const ad = w.cheats?.autoDeploy;
  if (!ad || !w.cheatsAllowed) return;
  w.autoDeployTimer -= DT;
  if (w.autoDeployTimer > 0) return;
  w.autoDeployTimer = Math.max(0.5, ad.interval);
  const def = CONTENT.units.get(ad.unit);
  if (!def) return;
  const cells: [number, number][] = [];
  const ok = (r: number, c: number) => w.canPlaceDef(def, r, c).ok;
  const front = def.category === 'wall' || def.category === 'trap' || def.category === 'melee';
  if (ad.mode === 'fill') {
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) if (ok(r, c)) cells.push([r, c]);
  } else if (ad.mode === 'back') {
    for (let c = 0; c < w.cols; c++) for (let r = 0; r < w.rows; r++) if (ok(r, c)) cells.push([r, c]);
  } else {
    const rows = [...Array(w.rows).keys()].sort((a, b) => w.rowThreat(b) - w.rowThreat(a));
    for (const r of rows) {
      const nearest = Math.min(w.cols, ...w.enemiesInRow(r).filter((e) => !e.dead).map((e) => e.x));
      if (ad.mode === 'front' || front) {
        for (let c = Math.min(w.cols - 1, Math.floor(nearest) - 1); c >= 0; c--) if (ok(r, c)) cells.push([r, c]);
      } else for (let c = 0; c < Math.min(w.cols, Math.floor(nearest)); c++) if (ok(r, c)) cells.push([r, c]);
      if (cells.length) break;
    }
  }
  const pick = cells[0];
  if (!pick) return;
  w.placeUnit(def, pick[0], pick[1], 'cheat', 0);
}
