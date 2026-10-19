import type { Ctx } from './art/common';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'dot' | 'spark' | 'ring' | 'shard' | 'smoke' | 'star' | 'text' | 'flame' | 'snow' | 'leaf';
  gravity: number;
  drag: number;
  additive: boolean;
  rot: number;
  vr: number;
  text?: string;
  grow?: number;
}

/** 轻量粒子系统（数组池），上限可调节以适配画质设置 */
export class Particles {
  list: Particle[] = [];
  max = 900;

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      vx: 0,
      vy: 0,
      life: 0.6,
      max: p.life ?? 0.6,
      size: 3,
      color: '#ffffff',
      kind: 'dot',
      gravity: 0,
      drag: 0.98,
      additive: false,
      rot: 0,
      vr: 0,
      ...p,
    } as Particle);
  }

  burst(x: number, y: number, n: number, opts: Partial<Particle> & { speed?: number; spread?: number; angle?: number }): void {
    const speed = opts.speed ?? 120;
    const spread = opts.spread ?? Math.PI * 2;
    const angle = opts.angle ?? 0;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * (0.35 + Math.random() * 0.65);
      const life = (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6);
      this.spawn({ ...opts, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10 });
    }
  }

  update(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.grow) p.size += p.grow * dt;
      out.push(p);
    }
    this.list = out;
  }

  draw(ctx: Ctx, additivePass: boolean): void {
    for (const p of this.list) {
      if (p.additive !== additivePass) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      switch (p.kind) {
        case 'dot':
        case 'flame':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, p.size * (p.kind === 'flame' ? k : 1)), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'spark':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, 4 * k);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'shard':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.5, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.5, 0);
          ctx.fill();
          ctx.restore();
          break;
        case 'smoke': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'star':
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 8, p.size, p.size / 4);
          ctx.fillRect(-p.size / 8, -p.size / 2, p.size / 4, p.size);
          ctx.restore();
          break;
        case 'snow':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'leaf':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        case 'text':
          ctx.fillStyle = p.color;
          ctx.font = `bold ${Math.round(p.size)}px "Segoe UI", "Microsoft YaHei", sans-serif`;
          ctx.textAlign = 'center';
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 3;
          ctx.strokeText(p.text ?? '', p.x, p.y);
          ctx.fillText(p.text ?? '', p.x, p.y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
