/**
 * 经典皮肤的场景坐标：与原版 800×600 画面一致（草坪左上角 (40,80)，格子 80 宽，
 * 5 行草坪行高 100，6 行泳池/屋顶行高 85；屋顶前 5 列有坡度）。
 */
import type { World } from '../../core/sim/world';
import type { Theme } from '../../core/types';

export const LAWN_X = 40;
export const LAWN_Y = 80;
export const CELL_W = 80;
/** 背景图（1400 宽）相对场景的水平偏移 */
export const BG_OFFSET = 220;

export interface ClassicLayout {
  theme: Theme;
  rows: number;
  cols: number;
  rowH: number;
  roof: boolean;
  viewW: number;
  viewH: number;
  bg: string;
}

export function themeOf(w: World): Theme {
  const t = w.map.theme;
  if (w.level.time === 'night' && t === 'day') return 'night';
  return t;
}

export function makeLayout(w: World): ClassicLayout {
  const theme = themeOf(w);
  const roof = theme === 'sky';
  const rowH = w.rows >= 6 || roof ? 85 : 100;
  const bg = theme === 'night' ? 'IMAGE_BACKGROUND2' : theme === 'lake' ? 'IMAGE_BACKGROUND3' : theme === 'fog' ? 'IMAGE_BACKGROUND4' : roof ? (w.level.time === 'night' ? 'IMAGE_BACKGROUND6BOSS' : 'IMAGE_BACKGROUND5') : 'IMAGE_BACKGROUND1';
  const viewW = Math.max(800, LAWN_X + w.cols * CELL_W + 80);
  const viewH = Math.max(600, LAWN_Y + w.rows * rowH + 20);
  return { theme, rows: w.rows, cols: w.cols, rowH, roof, viewW, viewH, bg };
}

/** 格子左边界 */
export function cellX(L: ClassicLayout, col: number): number {
  return LAWN_X + col * CELL_W;
}

/** 屋顶坡度偏移（前 5 列逐列抬高） */
export function slope(L: ClassicLayout, colF: number): number {
  if (!L.roof) return 0;
  return colF < 5 ? (5 - Math.max(0, colF)) * 20 - 10 : -10;
}

/** 格子上边界 */
export function cellY(L: ClassicLayout, row: number, col = 5): number {
  return LAWN_Y + row * L.rowH + slope(L, col);
}

/** 行内地面线（单位与敌人脚下），按行插值 */
export function groundY(L: ClassicLayout, rowF: number, colF = 5): number {
  return LAWN_Y + rowF * L.rowH + L.rowH * 0.88 + slope(L, colF);
}
