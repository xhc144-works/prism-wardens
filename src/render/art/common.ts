/** 程序化美术的基础绘图工具。所有图形都在运行时由代码绘制，不依赖任何外部图片。 */
export type Ctx = CanvasRenderingContext2D;

const hexCache = new Map<string, [number, number, number]>();
export function hexToRgb(hex: string): [number, number, number] {
  let v = hexCache.get(hex);
  if (v) return v;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(hex, v);
  return v;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** amt > 0 变亮，< 0 变暗 */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

export function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.35): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function glow(ctx: Ctx, x: number, y: number, r: number, col: string, a = 0.6): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(0.45, rgba(col, a * 0.35));
  g.addColorStop(1, rgba(col, 0));
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = prev;
}

/** 多面晶体：底部中心 (cx, by)，宽 w，高 h */
export function crystal(ctx: Ctx, cx: number, by: number, w: number, h: number, a: string, b: string, tilt = 0): void {
  const top = by - h;
  const pts: [number, number][] = [
    [cx - w * 0.5, by - h * 0.12],
    [cx - w * 0.42 + tilt * 0.3, by - h * 0.72],
    [cx + tilt, top],
    [cx + w * 0.42 + tilt * 0.3, by - h * 0.72],
    [cx + w * 0.5, by - h * 0.12],
    [cx, by],
  ];
  const g = ctx.createLinearGradient(cx - w / 2, top, cx + w / 2, by);
  g.addColorStop(0, shade(a, 0.35));
  g.addColorStop(0.5, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
  // 晶面
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.lineTo(cx + tilt * 0.5, by - h * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.moveTo(pts[3][0], pts[3][1]);
  ctx.lineTo(pts[4][0], pts[4][1]);
  ctx.lineTo(pts[5][0], pts[5][1]);
  ctx.lineTo(cx + tilt * 0.5, by - h * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pts[2][0], pts[2][1]);
  ctx.lineTo(cx + tilt * 0.5, by - h * 0.55);
  ctx.lineTo(pts[5][0], pts[5][1]);
  ctx.stroke();
}

export function gem(ctx: Ctx, x: number, y: number, r: number, col: string, pulse = 1): void {
  glow(ctx, x, y, r * 2.6 * pulse, col, 0.55);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, shade(col, 0.4));
  g.addColorStop(1, shade(col, -0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function pedestal(ctx: Ctx, y: number, w: number, col: string): void {
  const g = ctx.createLinearGradient(0, y - 10, 0, y + 4);
  g.addColorStop(0, shade(col, 0.15));
  g.addColorStop(1, shade(col, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, y - 3, w / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(col, 0.3);
  ctx.beginPath();
  ctx.ellipse(0, y - 6, w / 2 - 3, 5, 0, Math.PI, Math.PI * 2);
  ctx.fill();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function eye(ctx: Ctx, x: number, y: number, r: number, col: string): void {
  glow(ctx, x, y, r * 3, col, 0.5);
  ctx.fillStyle = shade(col, 0.5);
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.2, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

export function leaf(ctx: Ctx, x: number, y: number, len: number, ang: number, col: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, shade(col, -0.3));
  g.addColorStop(1, shade(col, 0.25));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(len * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}

export function star(ctx: Ctx, x: number, y: number, r: number, n = 5, inner = 0.45): void {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** 闪电折线 */
export function bolt(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, seed: number, jag = 14): void {
  const n = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 22));
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  let s = seed;
  for (let i = 1; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const k = i / n;
    const off = (s / 233280 - 0.5) * jag * 2;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    ctx.lineTo(x1 + (x2 - x1) * k + (nx / len) * off, y1 + (y2 - y1) * k + (ny / len) * off);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
