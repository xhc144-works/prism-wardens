import type { UnitDef } from '../../core/types';
import { type Ctx, crystal, gem, glow, leaf, pedestal, rgba, roundRect, shade, shadow, star } from './common';

export interface UnitArtState {
  def: UnitDef;
  t: number; // 秒
  anim: number; // 0..1 攻击动画
  rank: number;
  armed?: boolean;
  digest?: number;
  hpRatio?: number;
  seed: number;
  icon?: boolean; // 卡牌头像模式（无影子）
}

type ArtFn = (ctx: Ctx, s: UnitArtState) => void;

const bob = (s: UnitArtState, amp = 2, speed = 2) => Math.sin(s.t * speed + s.seed) * amp;

const ART: Record<string, ArtFn> = {
  moss(ctx, s) {
    const c = s.def.colors;
    const p = 1 + Math.sin(s.t * 2.2 + s.seed) * 0.04 + s.anim * 0.15;
    pedestal(ctx, 0, 54, '#6b5a45');
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.42;
      leaf(ctx, 0, -10, 30 * p, a + Math.sin(s.t * 1.5 + i) * 0.05, i % 2 ? c.a : c.b);
    }
    gem(ctx, 0, -28 + bob(s, 1.5), 11 * p, c.glow, 1 + s.anim * 0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 3; i++) {
      const a = s.t * 1.3 + i * 2.1 + s.seed;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 20, -30 + Math.sin(a * 1.3) * 10, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  twinmoss(ctx, s) {
    const c = s.def.colors;
    const p = 1 + Math.sin(s.t * 2.2 + s.seed) * 0.04 + s.anim * 0.15;
    pedestal(ctx, 0, 60, '#6b5a45');
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.36;
      leaf(ctx, 0, -10, 32 * p, a, i % 2 ? c.a : c.b);
    }
    gem(ctx, -11, -32 + bob(s, 1.5), 9 * p, c.glow);
    gem(ctx, 11, -34 - bob(s, 1.5), 9 * p, '#ffffff');
  },
  prism(ctx, s) {
    const c = s.def.colors;
    const recoil = s.anim * 5;
    pedestal(ctx, 0, 50, '#5d6a7a');
    ctx.save();
    ctx.translate(-recoil, bob(s, 1.5));
    crystal(ctx, -6, -6, 30, 54, c.a, c.b, -2);
    // 炮口
    ctx.fillStyle = shade(c.b, -0.2);
    roundRect(ctx, 4, -38, 26, 12, 5);
    ctx.fill();
    ctx.fillStyle = shade(c.a, 0.2);
    roundRect(ctx, 6, -36, 24, 6, 3);
    ctx.fill();
    gem(ctx, 30, -32, 5 + s.anim * 3, c.glow, 1 + s.anim);
    gem(ctx, -6, -34, 5, c.glow);
    ctx.restore();
  },
  repeater(ctx, s) {
    const c = s.def.colors;
    const recoil = s.anim * 5;
    pedestal(ctx, 0, 54, '#5d6a7a');
    ctx.save();
    ctx.translate(-recoil, bob(s, 1.5));
    crystal(ctx, -8, -6, 34, 58, c.a, c.b, -2);
    for (const dy of [-44, -28]) {
      ctx.fillStyle = shade(c.b, -0.2);
      roundRect(ctx, 2, dy, 28, 11, 5);
      ctx.fill();
      gem(ctx, 30, dy + 5, 4 + s.anim * 2, c.glow);
    }
    gem(ctx, -8, -34, 6, c.glow);
    ctx.restore();
  },
  trident(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 56, '#5d6a7a');
    ctx.save();
    ctx.translate(-s.anim * 4, bob(s, 1.5));
    crystal(ctx, -6, -4, 34, 50, c.a, c.b);
    const heads = [-56, -40, -24];
    heads.forEach((y, i) => {
      ctx.save();
      ctx.translate(8, y);
      ctx.rotate((i - 1) * -0.35);
      ctx.fillStyle = shade(c.b, -0.15);
      roundRect(ctx, 0, -5, 24, 10, 4);
      ctx.fill();
      gem(ctx, 24, 0, 4 + s.anim * 2, c.glow);
      ctx.restore();
    });
    ctx.restore();
  },
  janus(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 52, '#5d6a7a');
    ctx.save();
    ctx.translate(0, bob(s, 1.5));
    crystal(ctx, 0, -6, 30, 52, c.a, c.b);
    ctx.fillStyle = shade(c.b, -0.2);
    roundRect(ctx, 6, -38, 24, 11, 5);
    ctx.fill();
    roundRect(ctx, -30, -38, 24, 11, 5);
    ctx.fill();
    gem(ctx, 30, -33, 4 + s.anim * 2, c.glow);
    gem(ctx, -30, -33, 4 + s.anim * 2, c.glow);
    ctx.restore();
  },
  frost(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 50, '#6b7f8f');
    ctx.save();
    ctx.translate(-s.anim * 4, bob(s, 1.5));
    crystal(ctx, -14, -6, 18, 40, c.a, c.b, -3);
    crystal(ctx, 0, -6, 24, 58, shade(c.a, 0.2), c.b, 1);
    crystal(ctx, 12, -6, 16, 36, c.a, c.b, 3);
    gem(ctx, 18, -36, 5 + s.anim * 3, '#ffffff');
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 4; i++) {
      const a = s.t * 0.8 + i * 1.6;
      star(ctx, Math.cos(a) * 24, -34 + Math.sin(a) * 16, 2.5, 6, 0.4);
      ctx.fill();
    }
  },
  moon(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 48, '#4f5675');
    ctx.save();
    ctx.translate(-s.anim * 3, bob(s, 2));
    crystal(ctx, -4, -6, 26, 44, c.a, c.b);
    // 月牙
    glow(ctx, 8, -46, 26, c.glow, 0.35);
    ctx.fillStyle = shade(c.a, 0.4);
    ctx.beginPath();
    ctx.arc(8, -46, 14, Math.PI * 0.35, Math.PI * 1.65, true);
    ctx.arc(14, -46, 11, Math.PI * 1.6, Math.PI * 0.4, false);
    ctx.fill();
    ctx.restore();
  },
  warden(ctx, s) {
    const c = s.def.colors;
    const hr = s.hpRatio ?? 1;
    shadow(ctx, 0, 0, 34, 9);
    const g = ctx.createLinearGradient(-28, -70, 28, 0);
    g.addColorStop(0, shade(c.a, 0.25));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    roundRect(ctx, -28, -66, 56, 66, 14);
    ctx.fill();
    ctx.strokeStyle = rgba('#000000', 0.25);
    ctx.lineWidth = 2;
    roundRect(ctx, -28, -66, 56, 66, 14);
    ctx.stroke();
    // 裂痕
    ctx.strokeStyle = rgba('#2b2119', 0.7);
    ctx.lineWidth = 2;
    if (hr < 0.66) {
      ctx.beginPath();
      ctx.moveTo(-14, -60);
      ctx.lineTo(-6, -44);
      ctx.lineTo(-12, -30);
      ctx.stroke();
    }
    if (hr < 0.33) {
      ctx.beginPath();
      ctx.moveTo(18, -50);
      ctx.lineTo(8, -34);
      ctx.lineTo(16, -14);
      ctx.stroke();
    }
    // 符文眼
    const blink = Math.sin(s.t * 0.7 + s.seed) > 0.97 ? 0.2 : 1;
    ctx.fillStyle = c.glow;
    ctx.globalAlpha = blink;
    glow(ctx, -10, -44, 10, c.glow, 0.5);
    glow(ctx, 10, -44, 10, c.glow, 0.5);
    ctx.fillRect(-14, -46, 8, 4);
    ctx.fillRect(6, -46, 8, 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(c.glow, 0.6);
    ctx.beginPath();
    ctx.moveTo(-10, -24);
    ctx.lineTo(0, -18);
    ctx.lineTo(10, -24);
    ctx.stroke();
  },
  monolith(ctx, s) {
    const c = s.def.colors;
    const hr = s.hpRatio ?? 1;
    shadow(ctx, 0, 0, 30, 9);
    const g = ctx.createLinearGradient(-24, -100, 24, 0);
    g.addColorStop(0, shade(c.a, 0.3));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-20, -86);
    ctx.lineTo(0, -102);
    ctx.lineTo(20, -86);
    ctx.lineTo(24, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(-20, -86);
    ctx.lineTo(0, -102);
    ctx.lineTo(0, 0);
    ctx.lineTo(-24, 0);
    ctx.closePath();
    ctx.fill();
    const pulse = 0.6 + Math.sin(s.t * 2 + s.seed) * 0.3;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = rgba(c.glow, pulse * (hr > i * 0.25 ? 1 : 0.15));
      ctx.fillRect(-4, -84 + i * 18, 8, 8);
    }
    if (hr < 0.5) {
      ctx.strokeStyle = 'rgba(20,20,30,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -70);
      ctx.lineTo(-4, -50);
      ctx.lineTo(-12, -30);
      ctx.stroke();
    }
  },
  geode(ctx, s) {
    const c = s.def.colors;
    shadow(ctx, 0, 0, 22, 6);
    const armed = s.armed;
    const y = armed ? 0 : 8;
    ctx.save();
    ctx.translate(0, y);
    ctx.fillStyle = '#5b4636';
    ctx.beginPath();
    ctx.ellipse(0, -6, 20, 10, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    crystal(ctx, -8, -6, 12, armed ? 22 : 12, c.a, c.b, -2);
    crystal(ctx, 6, -6, 14, armed ? 28 : 14, shade(c.a, 0.15), c.b, 2);
    if (armed) {
      const blink = (Math.sin(s.t * 6) + 1) / 2;
      gem(ctx, 0, -24, 4, blink > 0.5 ? '#ff3b3b' : c.glow);
    }
    ctx.restore();
  },
  nova(ctx, s) {
    const c = s.def.colors;
    const k = 1 + s.anim * 0.6 + Math.sin(s.t * 18) * 0.05;
    glow(ctx, 0, -30, 50 * k, c.glow, 0.7);
    gem(ctx, 0, -30, 16 * k, c.a);
    ctx.strokeStyle = rgba(c.b, 0.8);
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, -30, 26 * k, 9 * k, s.t * 3 + i * 1.05, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  bloom(ctx, s) {
    const c = s.def.colors;
    const k = 1 + s.anim * 0.4;
    glow(ctx, 0, -30, 46 * k, '#bdeaff', 0.6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + s.t * 0.8;
      ctx.save();
      ctx.translate(0, -30);
      ctx.rotate(a);
      crystal(ctx, 0, 0, 10 * k, 26 * k, c.a, c.b);
      ctx.restore();
    }
    gem(ctx, 0, -30, 8, '#ffffff');
  },
  pillar(ctx, s) {
    const c = s.def.colors;
    const k = 1 + s.anim * 0.5;
    glow(ctx, 0, -36, 40 * k, c.glow, 0.7);
    for (let i = 0; i < 5; i++) {
      const fx = Math.sin(s.t * 9 + i * 1.3) * 6;
      ctx.fillStyle = i % 2 ? c.a : shade(c.glow, 0.2);
      ctx.beginPath();
      ctx.moveTo(-14 + i * 6, 0);
      ctx.quadraticCurveTo(-18 + i * 8 + fx, -40 * k, -4 + i * 3 + fx, -70 * k);
      ctx.quadraticCurveTo(4 + i * 2, -36 * k, 12 - i * 2, 0);
      ctx.fill();
    }
  },
  gale(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 40, '#57725f');
    ctx.save();
    ctx.translate(0, -36);
    ctx.rotate(s.t * (6 + s.anim * 20));
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      leaf(ctx, 0, 0, 26, 0, i % 2 ? c.a : c.b);
    }
    ctx.restore();
    gem(ctx, 0, -36, 6, '#ffffff');
  },
  maw(ctx, s) {
    const c = s.def.colors;
    const open = s.anim > 0 ? Math.sin(s.anim * Math.PI) : (s.digest ?? 0) > 0 ? 0.05 : 0.25 + Math.sin(s.t * 2 + s.seed) * 0.08;
    const full = (s.digest ?? 0) > 0;
    pedestal(ctx, 0, 52, '#5a4a6a');
    ctx.save();
    ctx.translate(full ? 0 : bob(s, 1.5), 0);
    // 身体
    const g = ctx.createRadialGradient(-6, -40, 4, 0, -34, 34);
    g.addColorStop(0, shade(c.a, 0.3));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -32, full ? 30 : 26, full ? 28 : 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // 嘴
    ctx.fillStyle = '#1a0526';
    ctx.beginPath();
    ctx.moveTo(4, -32);
    ctx.lineTo(30, -32 - 22 * open);
    ctx.lineTo(30, -32 + 18 * open);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const x = 10 + i * 5;
      ctx.beginPath();
      ctx.moveTo(x, -32 - 18 * open * (x / 30));
      ctx.lineTo(x + 2.5, -32 - 18 * open * (x / 30) + 6);
      ctx.lineTo(x + 5, -32 - 18 * open * (x / 30));
      ctx.fill();
    }
    crystal(ctx, -14, -54, 10, 18, c.glow, c.a, -2);
    crystal(ctx, -2, -58, 10, 22, c.glow, c.a, 1);
    gem(ctx, -10, -40, 4, c.glow);
    if (full) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('z', 18 + Math.sin(s.t * 2) * 3, -66 - ((s.t * 10) % 12));
    }
    ctx.restore();
  },
  spike(ctx, s) {
    const c = s.def.colors;
    shadow(ctx, 0, 0, 38, 7, 0.25);
    const up = s.anim > 0 ? 1.4 : 1;
    for (let i = -3; i <= 3; i++) {
      const h = (10 + ((i * 7 + 13) % 5) * 3) * up;
      crystal(ctx, i * 10, 2, 9, h, c.a, c.b, i);
    }
  },
  totem(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 48, '#5b3a2a');
    const g = ctx.createLinearGradient(-16, -70, 16, 0);
    g.addColorStop(0, '#7b4a2e');
    g.addColorStop(1, '#3d2214');
    ctx.fillStyle = g;
    roundRect(ctx, -16, -62, 32, 58, 8);
    ctx.fill();
    ctx.fillStyle = '#2a140a';
    ctx.fillRect(-10, -44, 7, 5);
    ctx.fillRect(3, -44, 7, 5);
    // 火焰
    const k = 1 + s.anim * 0.4;
    for (let i = 0; i < 4; i++) {
      const fx = Math.sin(s.t * 10 + i * 1.7) * 3;
      ctx.fillStyle = [c.a, c.glow, '#ffef9e', c.a][i];
      ctx.beginPath();
      ctx.moveTo(-12 + i * 2, -60);
      ctx.quadraticCurveTo(-8 + fx, -80 * k + i * 4, fx, (-92 + i * 8) * k);
      ctx.quadraticCurveTo(8 + fx, -80 * k + i * 4, 12 - i * 2, -60);
      ctx.fill();
    }
    glow(ctx, 0, -72, 34, c.glow, 0.5);
  },
  plate(ctx, s) {
    const c = s.def.colors;
    const b = Math.sin(s.t * 1.8 + s.seed) * 2;
    ctx.save();
    ctx.translate(0, b);
    ctx.fillStyle = rgba('#000000', 0.2);
    ctx.beginPath();
    ctx.ellipse(0, 4, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -10, 0, 8);
    g.addColorStop(0, shade(c.a, 0.3));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * 38;
      const py = Math.sin(a) * 11;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(c.glow, 0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  },
  lurker(ctx, s) {
    const c = s.def.colors;
    const k = s.anim > 0 ? 1.6 : 1;
    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * 16;
      const sw = Math.sin(s.t * 2.5 + i * 2) * 6;
      ctx.strokeStyle = i === 1 ? c.a : c.b;
      ctx.lineWidth = 7 - i;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, 4);
      ctx.quadraticCurveTo(sx + sw, -14 * k, sx + sw * 1.5, -22 * k);
      ctx.stroke();
    }
    ctx.fillStyle = rgba('#ffffff', 0.35);
    ctx.beginPath();
    ctx.ellipse(0, 4, 26, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    gem(ctx, 0, -2, 3.5, c.glow);
  },
  lobber(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 52, '#6b5a45');
    const arm = -0.5 - s.anim * 1.8;
    ctx.save();
    ctx.translate(0, bob(s, 1.2));
    const g = ctx.createLinearGradient(-20, -50, 20, 0);
    g.addColorStop(0, shade(c.a, 0.2));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -24, 20, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(-4, -36);
    ctx.rotate(arm);
    ctx.fillStyle = shade(c.b, -0.2);
    roundRect(ctx, -3, -34, 6, 34, 3);
    ctx.fill();
    ctx.fillStyle = '#8a7058';
    ctx.beginPath();
    ctx.arc(0, -36, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    gem(ctx, 8, -26, 3.5, c.glow);
    ctx.restore();
  },
  meteor(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 58, '#6b4a35');
    const arm = -0.4 - s.anim * 1.9;
    ctx.save();
    ctx.translate(0, bob(s, 1.2));
    crystal(ctx, 0, -2, 40, 46, shade(c.a, -0.1), c.b);
    ctx.save();
    ctx.translate(-6, -38);
    ctx.rotate(arm);
    ctx.fillStyle = '#4a2a18';
    roundRect(ctx, -4, -38, 8, 38, 3);
    ctx.fill();
    glow(ctx, 0, -42, 18, c.glow, 0.7);
    gem(ctx, 0, -42, 9, c.a);
    ctx.restore();
    ctx.restore();
  },
  bell(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 46, '#6b5a45');
    const sw = Math.sin(s.t * 3 + s.seed) * 0.15;
    ctx.strokeStyle = '#6b5a45';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.lineTo(-18, -66);
    ctx.lineTo(18, -66);
    ctx.lineTo(18, -2);
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -64);
    ctx.rotate(sw);
    const g = ctx.createLinearGradient(-14, 0, 14, 36);
    g.addColorStop(0, shade(c.a, 0.3));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-14, 10, -15, 32);
    ctx.lineTo(15, 32);
    ctx.quadraticCurveTo(14, 10, 6, 2);
    ctx.closePath();
    ctx.fill();
    gem(ctx, 0, 34, 4, c.glow);
    ctx.restore();
    const ring = (s.t * 0.8 + s.seed) % 1;
    ctx.strokeStyle = rgba(c.glow, 0.5 * (1 - ring));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -36, 30 + ring * 30, 10 + ring * 10, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  thorn(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 50, '#4f5f3a');
    ctx.save();
    ctx.translate(-s.anim * 4, bob(s, 1.2));
    for (let i = 0; i < 5; i++) leaf(ctx, 0, -8, 26, -Math.PI / 2 + (i - 2) * 0.5, i % 2 ? c.a : c.b);
    ctx.save();
    ctx.translate(10, -40);
    ctx.rotate(s.t * 2);
    ctx.fillStyle = c.a;
    star(ctx, 0, 0, 12, 4, 0.35);
    ctx.fill();
    ctx.restore();
    gem(ctx, 10, -40, 4, c.glow);
    ctx.restore();
  },
  lantern(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 40, '#5a4a35');
    ctx.strokeStyle = '#5a4a35';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, -40);
    ctx.stroke();
    const sw = Math.sin(s.t * 1.6 + s.seed) * 3;
    glow(ctx, sw, -54, 60, c.glow, 0.35);
    crystal(ctx, sw, -40, 20, 30, c.a, c.b);
    gem(ctx, sw, -54, 5, '#ffffff');
  },
  magnet(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 48, '#5a4a5a');
    ctx.save();
    ctx.translate(0, bob(s, 1.5) - 30);
    ctx.rotate(Math.sin(s.t * 1.2) * 0.1);
    ctx.lineWidth = 12;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = c.b;
    ctx.beginPath();
    ctx.arc(0, 0, 18, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    ctx.strokeStyle = c.a;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 18, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(10, 6, 10, 10);
    ctx.fillRect(-20, 6, 10, 10);
    if (s.anim > 0) glow(ctx, 0, 10, 30, c.glow, 0.7);
    ctx.restore();
  },
  spire(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 50, '#4a4a6a');
    ctx.fillStyle = '#3c3c5c';
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.lineTo(-6, -70);
    ctx.lineTo(6, -70);
    ctx.lineTo(14, -2);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = rgba(c.a, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -22 - i * 16, 14 - i * 3, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const k = 1 + s.anim * 0.8 + Math.sin(s.t * 12) * 0.08;
    gem(ctx, 0, -78, 9 * k, c.glow);
    ctx.strokeStyle = rgba('#ffffff', 0.8);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a = s.t * 7 + i * 2.1;
      ctx.beginPath();
      ctx.moveTo(0, -78);
      ctx.lineTo(Math.cos(a) * 16, -78 + Math.sin(a) * 16);
      ctx.stroke();
    }
  },
  mender(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 46, '#6a4a5a');
    ctx.save();
    ctx.translate(0, bob(s, 2.5, 1.6));
    crystal(ctx, 0, -10, 26, 46, c.a, c.b);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-3, -40, 6, 16);
    ctx.fillRect(-8, -35, 16, 6);
    glow(ctx, 0, -32, 30, c.glow, 0.4 + Math.sin(s.t * 3) * 0.15);
    ctx.restore();
  },
  gravity(ctx, s) {
    const c = s.def.colors;
    pedestal(ctx, 0, 50, '#3a2a4a');
    ctx.save();
    ctx.translate(0, -36);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = rgba(i % 2 ? c.a : c.glow, 0.7);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26 - i * 5, 10 - i * 2, s.t * (1 + i * 0.4) * (i % 2 ? -1 : 1), 0, Math.PI * 1.6);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.7, c.b);
    g.addColorStop(1, rgba(c.a, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 14 + s.anim * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  relic(ctx, s) {
    const c = s.def.colors;
    const hr = s.hpRatio ?? 1;
    shadow(ctx, 0, 0, 34, 8);
    ctx.fillStyle = '#8a7a5a';
    roundRect(ctx, -26, -14, 52, 14, 4);
    ctx.fill();
    glow(ctx, 0, -48, 46, c.glow, 0.45 * hr + 0.1);
    crystal(ctx, 0, -12, 34, 64, c.a, c.b);
    gem(ctx, 0, -46, 7, '#fff7cc');
  },
};

/** 自定义单位：按行为模板选择基础造型 */
function fallbackArt(def: UnitDef): ArtFn {
  switch (def.behavior) {
    case 'producer':
    case 'upgradeProducer':
      return ART.moss;
    case 'lobber':
      return ART.lobber;
    case 'chain':
      return ART.spire;
    case 'wall':
      return def.tall ? ART.monolith : ART.warden;
    case 'spike':
      return ART.spike;
    case 'mine':
      return ART.geode;
    case 'instantBomb':
      return ART.nova;
    case 'laneBomb':
      return ART.pillar;
    case 'freezeAll':
      return ART.bloom;
    case 'devourer':
      return ART.maw;
    case 'bell':
      return ART.bell;
    case 'mender':
      return ART.mender;
    case 'totem':
      return ART.totem;
    default:
      return def.lanes && def.lanes.length > 1 ? ART.trident : def.back ? ART.janus : ART.prism;
  }
}

export function drawUnit(ctx: Ctx, s: UnitArtState): void {
  const fn = ART[s.def.art] ?? fallbackArt(s.def);
  fn(ctx, s);
  if (s.rank > 1) {
    for (let i = 0; i < s.rank; i++) {
      ctx.fillStyle = '#ffd166';
      star(ctx, (i - (s.rank - 1) / 2) * 11, s.def.tall ? -112 : -86, 4.5, 5, 0.45);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,50,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

export const UNIT_ART_KEYS = Object.keys(ART);
