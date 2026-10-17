import type { MapDef, Theme } from '../core/types';
import { type Ctx, crystal, glow, rgba, roundRect, shade } from './art/common';

export const CELL_W = 100;
export const CELL_H = 110;
export const BOARD_LEFT = 96;
export const BOARD_TOP = 26;
export const BOARD_RIGHT_PAD = 140;

export interface ThemePalette {
  sky: [string, string];
  grassA: string;
  grassB: string;
  border: string;
  side: string;
  water: [string, string];
  accent: string;
  dark: number; // 夜色叠加强度
}

export const THEMES: Record<Theme, ThemePalette> = {
  day: { sky: ['#7cc6ff', '#d6f1ff'], grassA: '#6cbf5a', grassB: '#5aae4c', border: '#3f7a35', side: '#8b6d4a', water: ['#4fb3e8', '#2b7fbf'], accent: '#fff6c2', dark: 0 },
  night: { sky: ['#0b1430', '#26375f'], grassA: '#3b6e5a', grassB: '#335f4f', border: '#1f3d33', side: '#3d3550', water: ['#2a5f8f', '#173d63'], accent: '#b8c0ff', dark: 0.35 },
  lake: { sky: ['#86d0ff', '#e2f6ff'], grassA: '#74c460', grassB: '#62b352', border: '#447f38', side: '#9a7b52', water: ['#5ec4f2', '#2e86c9'], accent: '#e0fbff', dark: 0 },
  fog: { sky: ['#3a4a4a', '#6d7f7a'], grassA: '#4c7a5c', grassB: '#436d52', border: '#2c4a38', side: '#4a4a45', water: ['#3e7f8f', '#235563'], accent: '#caffbf', dark: 0.25 },
  sky: { sky: ['#5aa9ff', '#cfe7ff'], grassA: '#8fbf6a', grassB: '#7fb05c', border: '#6b6455', side: '#a8a08c', water: ['#6fc8ff', '#3a8fd6'], accent: '#ffe8a3', dark: 0 },
};

function hash(r: number, c: number, k = 0): number {
  let h = (r * 73856093) ^ (c * 19349663) ^ (k * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function boardSize(rows: number, cols: number): { w: number; h: number } {
  return { w: BOARD_LEFT + cols * CELL_W + BOARD_RIGHT_PAD, h: BOARD_TOP + rows * CELL_H + 24 };
}

/** 绘制静态地形层（缓存到离屏画布） */
export function drawTerrain(ctx: Ctx, map: MapDef, theme: Theme): void {
  const T = THEMES[theme];
  const { w, h } = boardSize(map.rows, map.cols);
  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, T.sky[0]);
  bg.addColorStop(1, T.sky[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (theme === 'night' || theme === 'fog') {
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + hash(i, 1) * 0.6})`;
      ctx.fillRect(hash(i, 2) * w, hash(i, 3) * h, 1.5, 1.5);
    }
  }
  if (theme === 'sky') {
    for (let i = 0; i < 14; i++) {
      const cx = hash(i, 4) * w;
      const cy = h - 20 + hash(i, 5) * 30;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(cx + k * 22, cy - (k % 2) * 10, 26, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // 左侧基地（符文哨卫所在）
  const sideG = ctx.createLinearGradient(0, 0, BOARD_LEFT, 0);
  sideG.addColorStop(0, shade(T.side, -0.35));
  sideG.addColorStop(1, T.side);
  ctx.fillStyle = sideG;
  ctx.fillRect(0, BOARD_TOP - 10, BOARD_LEFT, map.rows * CELL_H + 20);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rgba('#000000', 0.08 + hash(i, 9) * 0.1);
    ctx.beginPath();
    ctx.arc(hash(i, 7) * BOARD_LEFT, BOARD_TOP + hash(i, 8) * map.rows * CELL_H, 3 + hash(i, 6) * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // 右侧入口（蚀潮雾气）
  const rx = BOARD_LEFT + map.cols * CELL_W;
  const rg = ctx.createLinearGradient(rx, 0, w, 0);
  rg.addColorStop(0, shade(T.grassB, -0.25));
  rg.addColorStop(1, '#2a1838');
  ctx.fillStyle = rg;
  ctx.fillRect(rx, BOARD_TOP - 10, w - rx, map.rows * CELL_H + 20);
  for (let i = 0; i < 6; i++) {
    const tx = rx + 30 + hash(i, 11) * (w - rx - 50);
    const ty = BOARD_TOP + hash(i, 12) * map.rows * CELL_H;
    ctx.strokeStyle = 'rgba(30,15,40,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(tx, ty + 40);
    ctx.lineTo(tx + 4, ty);
    ctx.lineTo(tx - 10, ty - 18);
    ctx.moveTo(tx + 4, ty);
    ctx.lineTo(tx + 16, ty - 14);
    ctx.stroke();
  }
  // 棋盘
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const code = map.terrain[r]?.[c] ?? 'g';
      const x = BOARD_LEFT + c * CELL_W;
      const y = BOARD_TOP + r * CELL_H;
      drawTile(ctx, code, x, y, r, c, T);
    }
  }
  // 边框阴影
  ctx.strokeStyle = rgba('#000000', 0.25);
  ctx.lineWidth = 3;
  ctx.strokeRect(BOARD_LEFT, BOARD_TOP, map.cols * CELL_W, map.rows * CELL_H);
}

function drawTile(ctx: Ctx, code: string, x: number, y: number, r: number, c: number, T: ThemePalette): void {
  const alt = (r + c) % 2 === 0;
  switch (code) {
    case 'w': {
      const g = ctx.createLinearGradient(x, y, x, y + CELL_H);
      g.addColorStop(0, T.water[0]);
      g.addColorStop(1, T.water[1]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, CELL_W, CELL_H);
      ctx.fillStyle = rgba('#ffffff', alt ? 0.06 : 0.02);
      ctx.fillRect(x, y, CELL_W, CELL_H);
      return;
    }
    case 'r': {
      ctx.fillStyle = shade(T.grassB, -0.2);
      ctx.fillRect(x, y, CELL_W, CELL_H);
      const g = ctx.createLinearGradient(x, y, x + CELL_W, y + CELL_H);
      g.addColorStop(0, '#a19a8f');
      g.addColorStop(1, '#5f584f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + 12, y + CELL_H - 12);
      ctx.lineTo(x + 18, y + 30);
      ctx.lineTo(x + 46, y + 14);
      ctx.lineTo(x + 82, y + 26);
      ctx.lineTo(x + 90, y + CELL_H - 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.moveTo(x + 18, y + 30);
      ctx.lineTo(x + 46, y + 14);
      ctx.lineTo(x + 50, y + 50);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'x': {
      ctx.fillStyle = '#0d0b18';
      ctx.fillRect(x, y, CELL_W, CELL_H);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = 'rgba(200,180,255,0.6)';
        ctx.fillRect(x + hash(r, c, i) * CELL_W, y + hash(c, r, i) * CELL_H, 1.5, 1.5);
      }
      return;
    }
    default:
      break;
  }
  let base = alt ? T.grassA : T.grassB;
  if (code === 'h') base = shade(alt ? T.grassA : T.grassB, 0.12);
  if (code === 'b') base = alt ? '#6b4f7a' : '#5e4470';
  if (code === 'i') base = alt ? '#cfeaf7' : '#bde0f0';
  if (code === 'v') base = alt ? shade(T.grassA, 0.05) : shade(T.grassB, 0.05);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, CELL_W, CELL_H);
  // 纹理斑点
  for (let i = 0; i < 10; i++) {
    const px = x + hash(r, c, i) * CELL_W;
    const py = y + hash(c, r, i + 20) * CELL_H;
    ctx.fillStyle = code === 'i' ? 'rgba(255,255,255,0.35)' : rgba('#000000', 0.06 + hash(r, i, c) * 0.06);
    ctx.fillRect(px, py, 2, 2);
  }
  if (code === 'g' || code === 'v' || code === 'h') {
    ctx.strokeStyle = rgba(shade(base, 0.25).replace('rgb', 'rgb'), 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const px = x + 8 + hash(r, c, i + 40) * (CELL_W - 16);
      const py = y + 20 + hash(c, r, i + 50) * (CELL_H - 30);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - 2, py - 7);
      ctx.moveTo(px, py);
      ctx.lineTo(px + 3, py - 6);
      ctx.stroke();
    }
  }
  if (code === 'h') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + CELL_H - 10, CELL_W, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, CELL_W, 6);
  }
  if (code === 'v') {
    ctx.strokeStyle = 'rgba(160,255,220,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + CELL_H * 0.7);
    ctx.quadraticCurveTo(x + 40, y + CELL_H * 0.4, x + 60, y + CELL_H * 0.75);
    ctx.quadraticCurveTo(x + 78, y + CELL_H * 0.9, x + 94, y + CELL_H * 0.55);
    ctx.stroke();
  }
  if (code === 'b') {
    ctx.strokeStyle = 'rgba(30,10,40,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 20);
    ctx.lineTo(x + 40, y + 50);
    ctx.lineTo(x + 34, y + 80);
    ctx.moveTo(x + 40, y + 50);
    ctx.lineTo(x + 70, y + 60);
    ctx.stroke();
  }
  if (code === 'i') {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 30);
    ctx.lineTo(x + 50, y + 20);
    ctx.moveTo(x + 40, y + 80);
    ctx.lineTo(x + 86, y + 66);
    ctx.stroke();
  }
  ctx.strokeStyle = rgba('#000000', 0.05);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1);
}

/** 每帧绘制的动态地形效果 */
export function drawTerrainFx(ctx: Ctx, map: MapDef, t: number): void {
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const code = map.terrain[r]?.[c] ?? 'g';
      const x = BOARD_LEFT + c * CELL_W;
      const y = BOARD_TOP + r * CELL_H;
      if (code === 'w') {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const yy = y + 22 + i * 30 + Math.sin(t * 1.5 + c + i) * 4;
          const off = ((t * 18 + i * 30 + c * 13) % (CELL_W + 40)) - 20;
          ctx.beginPath();
          ctx.moveTo(x + Math.max(0, off - 14), yy);
          ctx.quadraticCurveTo(x + Math.max(0, Math.min(CELL_W, off)), yy - 4, x + Math.min(CELL_W, off + 14), yy);
          ctx.stroke();
        }
      } else if (code === 'v') {
        glow(ctx, x + 50, y + CELL_H * 0.65, 30, '#9effd9', 0.08 + Math.sin(t * 2 + r + c) * 0.05);
      } else if (code === 'b') {
        const k = (t * 0.6 + hash(r, c)) % 1;
        ctx.fillStyle = `rgba(190,110,255,${0.5 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(x + 20 + hash(c, r) * 60, y + CELL_H - 20 - k * 50, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function drawNode(ctx: Ctx, x: number, y: number, t: number): void {
  glow(ctx, x, y - 26, 40, '#fff3b0', 0.25 + Math.sin(t * 2) * 0.1);
  crystal(ctx, x - 12, y, 14, 30, '#fff3b0', '#d4a017', -3);
  crystal(ctx, x + 4, y, 18, 42, '#ffe680', '#c08a00', 2);
  crystal(ctx, x + 16, y, 12, 24, '#fff3b0', '#d4a017', 4);
}

export function drawTomb(ctx: Ctx, x: number, y: number, t: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(x - 20, y - 70, x + 20, y);
  g.addColorStop(0, '#5a4a6a');
  g.addColorStop(1, '#241c30');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 20, y);
  ctx.lineTo(x - 16, y - 56);
  ctx.lineTo(x, y - 70);
  ctx.lineTo(x + 16, y - 56);
  ctx.lineTo(x + 20, y);
  ctx.closePath();
  ctx.fill();
  glow(ctx, x, y - 40, 22, '#c77dff', 0.35 + Math.sin(t * 3) * 0.15);
  ctx.fillStyle = '#e0aaff';
  ctx.fillRect(x - 2, y - 52, 4, 20);
  ctx.fillRect(x - 8, y - 46, 16, 4);
}

export function drawSentinel(ctx: Ctx, x: number, y: number, t: number, ready: boolean, moving = false): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = ready || moving ? 1 : 0.35;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(-20, -50, 20, 0);
  g.addColorStop(0, '#b6a6d8');
  g.addColorStop(1, '#4b3f6b');
  ctx.fillStyle = g;
  roundRect(ctx, -18, -48, 36, 46, 8);
  ctx.fill();
  if (ready || moving) {
    glow(ctx, 0, -26, 26, '#a78bfa', 0.5 + Math.sin(t * 3) * 0.2);
    ctx.strokeStyle = '#efe7ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, -36);
    ctx.lineTo(0, -16);
    ctx.lineTo(8, -36);
    ctx.moveTo(-10, -26);
    ctx.lineTo(10, -26);
    ctx.stroke();
  }
  ctx.restore();
}
