import type { EnemyDef } from '../../core/types';
import { type Ctx, eye, glow, rgba, roundRect, shade, shadow, star, bolt } from './common';

export interface EnemyArtState {
  def: EnemyDef;
  t: number;
  state: string;
  armor: number; // 0..1
  hasArmor: boolean;
  metal: boolean;
  dir: number;
  slow: boolean;
  frozen: boolean;
  stunned: boolean;
  hidden: boolean;
  submerged: boolean;
  burrowed: boolean;
  berserk: boolean;
  hpRatio: number;
  seed: number;
  thrown?: boolean;
  bossPhase?: number;
  bossMode?: string;
  icon?: boolean;
}

type Fn = (ctx: Ctx, s: EnemyArtState) => void;

const walkPhase = (s: EnemyArtState) => (s.state === 'walk' || s.state === 'fly' ? s.t * (s.berserk ? 9 : 5) + s.seed : s.seed);

function legs(ctx: Ctx, s: EnemyArtState, col: string, len = 22, spread = 8): void {
  const ph = walkPhase(s);
  ctx.strokeStyle = col;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const sw = Math.sin(ph + (side > 0 ? 0 : Math.PI)) * 7;
    ctx.beginPath();
    ctx.moveTo(side * spread * 0.5, -len);
    ctx.lineTo(side * spread * 0.5 + sw, -2);
    ctx.stroke();
  }
}

/** 基础虚蚀者人形（面朝左） */
function humanoid(ctx: Ctx, s: EnemyArtState, opts: { bulk?: number; height?: number; arms?: boolean } = {}): void {
  const c = s.def.colors;
  const bulk = opts.bulk ?? 1;
  const h = opts.height ?? 1;
  const ph = walkPhase(s);
  const eat = s.state === 'eat' ? Math.sin(s.t * 14) : 0;
  legs(ctx, s, shade(c.b, -0.2), 24 * h, 10 * bulk);
  ctx.save();
  ctx.translate(eat * -3, Math.abs(Math.sin(ph)) * -2);
  // 躯干
  const g = ctx.createLinearGradient(-14 * bulk, -70 * h, 14 * bulk, -20 * h);
  g.addColorStop(0, shade(c.a, 0.2));
  g.addColorStop(1, c.b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(2, -42 * h, 15 * bulk, 22 * h, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // 背上的蚀晶
  ctx.fillStyle = rgba(c.eye, 0.55);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(10 * bulk + i * 2, -56 * h + i * 10);
    ctx.lineTo(22 * bulk + i * 2, -60 * h + i * 10);
    ctx.lineTo(12 * bulk + i * 2, -48 * h + i * 10);
    ctx.fill();
  }
  // 手臂
  if (opts.arms !== false) {
    ctx.strokeStyle = shade(c.a, -0.1);
    ctx.lineWidth = 5.5 * bulk;
    ctx.lineCap = 'round';
    const reach = s.state === 'eat' ? -24 + eat * 4 : -16;
    for (const k of [0, 1]) {
      const sw = s.state === 'eat' ? 0 : Math.sin(ph + k * Math.PI) * 5;
      ctx.beginPath();
      ctx.moveTo(-2, -52 * h + k * 4);
      ctx.quadraticCurveTo(reach * 0.6, -48 * h + sw, reach * bulk, -44 * h + k * 6 + sw);
      ctx.stroke();
    }
  }
  // 头
  const hg = ctx.createRadialGradient(-8, -76 * h, 2, -6, -72 * h, 14);
  hg.addColorStop(0, shade(c.a, 0.35));
  hg.addColorStop(1, c.b);
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(-6, -70 * h, 12 * Math.min(1.2, bulk), 0, Math.PI * 2);
  ctx.fill();
  eye(ctx, -12, -72 * h, 2.8, s.berserk ? '#ff2222' : c.eye);
  eye(ctx, -4, -73 * h, 2.4, s.berserk ? '#ff2222' : c.eye);
  if (s.state === 'eat') {
    ctx.fillStyle = '#12051c';
    ctx.beginPath();
    ctx.ellipse(-12, -63 * h, 4, 2 + Math.abs(eat) * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function helm(ctx: Ctx, s: EnemyArtState, y: number): void {
  if (!s.hasArmor) return;
  const crack = s.armor < 0.5;
  if (s.metal) {
    const g = ctx.createLinearGradient(-20, y - 18, 8, y);
    g.addColorStop(0, '#d9dde3');
    g.addColorStop(1, '#6b7280');
    ctx.fillStyle = g;
    roundRect(ctx, -19, y - 20, 26, 20, 4);
    ctx.fill();
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(-21, y - 2, 30, 4);
  } else {
    const g = ctx.createLinearGradient(-18, y - 28, 6, y);
    g.addColorStop(0, '#e0aaff');
    g.addColorStop(1, '#7b2cbf');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-19, y);
    ctx.lineTo(-8, y - 30);
    ctx.lineTo(6, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(-15, y);
    ctx.lineTo(-8, y - 26);
    ctx.lineTo(-8, y);
    ctx.fill();
  }
  if (crack) {
    ctx.strokeStyle = 'rgba(20,10,30,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, y - 16);
    ctx.lineTo(-6, y - 9);
    ctx.lineTo(-11, y - 3);
    ctx.stroke();
  }
}

function shieldArt(ctx: Ctx, s: EnemyArtState): void {
  if (!s.hasArmor) return;
  const g = ctx.createLinearGradient(-34, -80, -14, 0);
  g.addColorStop(0, '#cfd4db');
  g.addColorStop(1, '#5c6370');
  ctx.fillStyle = g;
  roundRect(ctx, -34, -82, 18, 78, 4);
  ctx.fill();
  ctx.strokeStyle = '#3f444d';
  ctx.lineWidth = 2;
  roundRect(ctx, -34, -82, 18, 78, 4);
  ctx.stroke();
  ctx.fillStyle = '#9aa1ab';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-25, -70 + i * 20, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (s.armor < 0.5) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(-30, -60);
    ctx.lineTo(-22, -44);
    ctx.lineTo(-28, -28);
    ctx.stroke();
  }
}

const ENEMY_ART: Record<string, Fn> = {
  husk(ctx, s) {
    humanoid(ctx, s);
    helm(ctx, s, -78);
  },
  banner(ctx, s) {
    humanoid(ctx, s);
    const wave = Math.sin(s.t * 4) * 4;
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, -10);
    ctx.lineTo(10, -112);
    ctx.stroke();
    ctx.fillStyle = '#7b2cbf';
    ctx.beginPath();
    ctx.moveTo(10, -110);
    ctx.quadraticCurveTo(26, -106 + wave, 40, -110 + wave);
    ctx.lineTo(40, -86 + wave);
    ctx.quadraticCurveTo(26, -82 + wave, 10, -86);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff5ec4';
    star(ctx, 25, -97 + wave / 2, 6);
    ctx.fill();
  },
  leaper(ctx, s) {
    if (s.state === 'jump') {
      ctx.save();
      ctx.translate(0, -30);
      ctx.rotate(-0.4);
      humanoid(ctx, s, { bulk: 0.85, height: 1.05 });
      ctx.restore();
      return;
    }
    humanoid(ctx, s, { bulk: 0.85, height: 1.08 });
    if (s.state !== 'eat') {
      ctx.strokeStyle = '#9bf6ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-30, -44);
      ctx.lineTo(26, -60);
      ctx.stroke();
    }
  },
  shield(ctx, s) {
    humanoid(ctx, s);
    shieldArt(ctx, s);
  },
  berserker(ctx, s) {
    if (s.berserk) glow(ctx, 0, -44, 46, '#ff2a2a', 0.35 + Math.sin(s.t * 10) * 0.1);
    humanoid(ctx, s, { bulk: 1.2 });
    if (s.hasArmor) {
      ctx.fillStyle = '#f1e9da';
      ctx.beginPath();
      ctx.ellipse(-10, -72, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b00020';
      ctx.fillRect(-15, -75, 4, 2);
      ctx.fillRect(-9, -75, 4, 2);
    }
    ctx.fillStyle = '#e9d8c4';
    ctx.beginPath();
    ctx.moveTo(-2, -80);
    ctx.lineTo(4, -94);
    ctx.lineTo(4, -80);
    ctx.fill();
  },
  burrower(ctx, s) {
    if (s.burrowed) {
      const ph = s.t * 8;
      ctx.fillStyle = '#6b4f3a';
      ctx.beginPath();
      ctx.ellipse(0, -4, 22, 9 + Math.sin(ph) * 2, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a3527';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-16 + i * 10 + Math.sin(ph + i) * 2, -6 - ((ph * 3 + i * 7) % 8), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#c0c0c0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, -12);
      ctx.lineTo(-14, -22);
      ctx.stroke();
      return;
    }
    humanoid(ctx, s);
    ctx.strokeStyle = '#a8a8a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -44);
    ctx.lineTo(-26, -58);
    ctx.lineTo(-34, -54);
    ctx.stroke();
    if (s.state === 'emerge') {
      ctx.fillStyle = '#ffe066';
      for (let i = 0; i < 3; i++) {
        star(ctx, -6 + Math.cos(s.t * 6 + i * 2) * 12, -92 + Math.sin(s.t * 6 + i * 2) * 4, 3.5);
        ctx.fill();
      }
    }
  },
  floater(ctx, s) {
    const c = s.def.colors;
    const by = -70 + Math.sin(s.t * 2 + s.seed) * 6;
    shadow(ctx, 0, 0, 18, 5, 0.25);
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = rgba(c.eye, 0.6);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-12 + i * 6, by + 8);
      ctx.quadraticCurveTo(-14 + i * 6 + Math.sin(s.t * 3 + i) * 6, by + 24, -12 + i * 6 + Math.sin(s.t * 3 + i + 1) * 4, by + 40);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(-4, by - 6, 2, 0, by, 22);
    g.addColorStop(0, shade(c.a, 0.4));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, by, 22, 16, 0, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(0, by + 14, -22, by);
    ctx.fill();
    eye(ctx, -8, by - 4, 3, c.eye);
    eye(ctx, 2, by - 5, 2.5, c.eye);
  },
  summoner(ctx, s) {
    const c = s.def.colors;
    const casting = s.state === 'cast';
    if (casting) glow(ctx, -20, -90, 40, c.eye, 0.6);
    legs(ctx, s, shade(c.b, -0.1), 14);
    const g = ctx.createLinearGradient(0, -90, 0, 0);
    g.addColorStop(0, shade(c.a, 0.2));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-20, -6);
    ctx.lineTo(-6, -78);
    ctx.lineTo(10, -78);
    ctx.lineTo(22, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.b;
    ctx.beginPath();
    ctx.moveTo(-10, -72);
    ctx.lineTo(2, -100);
    ctx.lineTo(14, -72);
    ctx.fill();
    eye(ctx, -2, -76, 2.5, c.eye);
    eye(ctx, 6, -76, 2.5, c.eye);
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, -10);
    ctx.lineTo(-20, casting ? -100 : -86);
    ctx.stroke();
    glow(ctx, -20, casting ? -104 : -90, 14, c.eye, 0.8);
  },
  colossus(ctx, s) {
    const c = s.def.colors;
    const smash = s.state === 'smash';
    humanoid(ctx, s, { bulk: 1.5, height: 1.15 });
    ctx.save();
    ctx.translate(-14, -60);
    ctx.rotate(smash ? -1.8 + Math.min(1, s.t % 1.6) * 2.2 : -0.6);
    ctx.fillStyle = '#4a3f35';
    roundRect(ctx, -6, -50, 12, 52, 4);
    ctx.fill();
    ctx.fillStyle = '#6b5d4f';
    roundRect(ctx, -12, -64, 24, 22, 6);
    ctx.fill();
    ctx.restore();
    if (!s.thrown) {
      ctx.fillStyle = '#7b2cbf';
      ctx.beginPath();
      ctx.arc(18, -86, 8, 0, Math.PI * 2);
      ctx.fill();
      eye(ctx, 15, -87, 1.8, '#ffea00');
    }
    eye(ctx, -12, -86, 3.5, c.eye);
  },
  imp(ctx, s) {
    humanoid(ctx, s, { bulk: 0.8, height: 0.9 });
    ctx.fillStyle = '#ffea00';
    ctx.beginPath();
    ctx.moveTo(-14, -74);
    ctx.lineTo(-18, -84);
    ctx.lineTo(-10, -76);
    ctx.fill();
  },
  hauler(ctx, s) {
    const c = s.def.colors;
    shadow(ctx, 0, 0, 44, 9);
    ctx.fillStyle = c.b;
    roundRect(ctx, -10, -50, 50, 36, 8);
    ctx.fill();
    ctx.fillStyle = shade(c.a, 0.1);
    roundRect(ctx, -6, -46, 42, 14, 5);
    ctx.fill();
    // 冰滚筒
    const g = ctx.createLinearGradient(-44, -36, -10, 0);
    g.addColorStop(0, '#e3f6ff');
    g.addColorStop(1, '#7fb8d6');
    ctx.fillStyle = g;
    roundRect(ctx, -44, -34, 34, 32, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const x = -40 + ((s.t * 40 + i * 10) % 28);
      ctx.beginPath();
      ctx.moveTo(x, -32);
      ctx.lineTo(x, -4);
      ctx.stroke();
    }
    ctx.fillStyle = '#1d1d2b';
    ctx.beginPath();
    ctx.arc(30, -8, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(14, -46);
    ctx.scale(0.7, 0.7);
    humanoid(ctx, { ...s, state: 'idle' }, { arms: false });
    ctx.restore();
  },
  catapult(ctx, s) {
    const c = s.def.colors;
    shadow(ctx, 0, 0, 44, 9);
    ctx.fillStyle = shade(c.a, -0.1);
    roundRect(ctx, -34, -30, 68, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#2b1d14';
    for (const x of [-22, 22]) {
      ctx.beginPath();
      ctx.arc(x, -8, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b5a4a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, -8, 6, s.t * 5, s.t * 5 + 4);
      ctx.stroke();
    }
    const arm = s.state === 'cast' ? -0.4 - Math.max(0, Math.sin(s.t * 2.1)) * 1.2 : -0.3;
    ctx.save();
    ctx.translate(14, -30);
    ctx.rotate(arm);
    ctx.fillStyle = '#5a4030';
    roundRect(ctx, -4, -46, 8, 46, 3);
    ctx.fill();
    ctx.fillStyle = '#3d2c2e';
    ctx.beginPath();
    ctx.arc(0, -48, 9, 0, Math.PI);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(-16, -30);
    ctx.scale(0.65, 0.65);
    humanoid(ctx, { ...s, state: 'idle' }, { arms: false });
    ctx.restore();
  },
  diver(ctx, s) {
    const c = s.def.colors;
    if (s.submerged) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      const r = (s.t * 20) % 16;
      ctx.beginPath();
      ctx.ellipse(0, -4, 10 + r, 3 + r * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c.a;
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(6, -22);
      ctx.lineTo(10, -4);
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(0, 14);
    humanoid(ctx, s);
    ctx.restore();
    ctx.fillStyle = rgba('#4ea8de', 0.45);
    ctx.fillRect(-30, -10, 60, 12);
  },
  splitter(ctx, s) {
    const c = s.def.colors;
    const ph = walkPhase(s);
    legs(ctx, s, c.b, 16, 14);
    const sq = 1 + Math.sin(ph * 2) * 0.05;
    const g = ctx.createRadialGradient(-6, -44, 4, 0, -36, 30);
    g.addColorStop(0, shade(c.a, 0.35));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -36, 26 / sq, 26 * sq, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(c.eye, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.lineTo(4, -44);
    ctx.lineTo(-3, -30);
    ctx.lineTo(3, -12);
    ctx.stroke();
    glow(ctx, 0, -36, 18, c.eye, 0.35);
    eye(ctx, -12, -44, 3, c.eye);
    eye(ctx, -2, -46, 2.6, c.eye);
  },
  shade(ctx, s) {
    ctx.save();
    ctx.globalAlpha *= s.hidden ? 0.18 : 0.85;
    humanoid(ctx, s, { bulk: 0.9 });
    ctx.restore();
    if (s.hidden) {
      ctx.strokeStyle = 'rgba(140,200,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -44, 18 + Math.sin(s.t * 4) * 2, 36, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  priest(ctx, s) {
    const c = s.def.colors;
    glow(ctx, 0, -40, 60, c.eye, 0.18 + Math.sin(s.t * 3) * 0.06);
    legs(ctx, s, c.b, 14);
    const g = ctx.createLinearGradient(0, -86, 0, 0);
    g.addColorStop(0, shade(c.a, 0.25));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.lineTo(-8, -74);
    ctx.lineTo(10, -74);
    ctx.lineTo(20, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(c.a, 0.1);
    ctx.beginPath();
    ctx.arc(0, -80, 11, 0, Math.PI * 2);
    ctx.fill();
    eye(ctx, -5, -81, 2.4, c.eye);
    eye(ctx, 3, -81, 2.4, c.eye);
    const sw = Math.sin(s.t * 2.4) * 8;
    ctx.strokeStyle = '#8a8a5a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-14, -56);
    ctx.lineTo(-20 + sw, -30);
    ctx.stroke();
    glow(ctx, -20 + sw, -28, 12, c.eye, 0.8);
  },
  beetle(ctx, s) {
    const c = s.def.colors;
    const ph = walkPhase(s) * 2;
    ctx.strokeStyle = '#1a0a0a';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      const sw = Math.sin(ph + i * 2) * 4;
      ctx.beginPath();
      ctx.moveTo(-10 + i * 10, -14);
      ctx.lineTo(-14 + i * 10 + sw, -2);
      ctx.stroke();
    }
    const g = ctx.createLinearGradient(-20, -36, 20, -10);
    g.addColorStop(0, shade(c.a, 0.3));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(2, -20, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(2, -34);
    ctx.lineTo(2, -6);
    ctx.stroke();
    ctx.fillStyle = '#2a0a0a';
    ctx.beginPath();
    ctx.arc(-20, -20, 8, 0, Math.PI * 2);
    ctx.fill();
    eye(ctx, -24, -22, 2, c.eye);
    const fl = Math.sin(s.t * 20) > 0;
    glow(ctx, 22, -34, 10, fl ? '#ffba08' : '#ff5400', 0.9);
  },
  ram(ctx, s) {
    humanoid(ctx, s, { bulk: 1.15 });
    const push = s.state === 'eat' ? Math.sin(s.t * 6) * 4 : 0;
    const g = ctx.createLinearGradient(-50, -50, 10, -30);
    g.addColorStop(0, '#8b5e3c');
    g.addColorStop(1, '#4a2f1d');
    ctx.fillStyle = g;
    roundRect(ctx, -52 + push, -50, 62, 16, 7);
    ctx.fill();
    ctx.fillStyle = '#9aa1ab';
    roundRect(ctx, -56 + push, -52, 10, 20, 3);
    ctx.fill();
  },
  orb(ctx, s) {
    const c = s.def.colors;
    shadow(ctx, 0, 0, 24, 6);
    glow(ctx, 0, -24, 46, c.a, 0.6);
    const g = ctx.createRadialGradient(-6, -30, 3, 0, -24, 24);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, c.a);
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -24, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -24, 16, -s.t * 8, -s.t * 8 + 2.2);
    ctx.stroke();
  },
  wyrm(ctx, s) {
    const c = s.def.colors;
    if (s.burrowed) {
      ctx.fillStyle = '#3a2a2a';
      ctx.beginPath();
      ctx.ellipse(0, -6, 50, 16, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a3a3a';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(-40 + i * 16, -10 - Math.abs(Math.sin(s.t * 6 + i)) * 14, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    shadow(ctx, 0, 0, 70, 14);
    const segs = 6;
    for (let i = segs - 1; i >= 0; i--) {
      const x = 20 + i * 22;
      const y = -40 - Math.sin(s.t * 3 + i * 0.8) * 10 + i * 4;
      const r = 30 - i * 3;
      const g = ctx.createRadialGradient(x - 8, y - 10, 4, x, y, r);
      g.addColorStop(0, shade(c.a, 0.35));
      g.addColorStop(1, c.b);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(c.eye, 0.6);
      ctx.beginPath();
      ctx.moveTo(x - 6, y - r + 2);
      ctx.lineTo(x, y - r - 12);
      ctx.lineTo(x + 6, y - r + 2);
      ctx.fill();
    }
    // 头
    const open = s.state === 'eat' ? 0.5 + Math.sin(s.t * 10) * 0.3 : 0.25;
    const g = ctx.createRadialGradient(-20, -66, 6, -10, -56, 44);
    g.addColorStop(0, shade(c.a, 0.4));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-10, -56, 42, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12020f';
    ctx.beginPath();
    ctx.moveTo(-14, -52);
    ctx.lineTo(-54, -52 - 30 * open);
    ctx.lineTo(-54, -52 + 26 * open);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f5f5f5';
    for (let i = 0; i < 5; i++) {
      const x = -50 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x, -52 - 24 * open * ((54 + x) / 40));
      ctx.lineTo(x + 3, -46 - 24 * open * ((54 + x) / 40));
      ctx.lineTo(x + 6, -52 - 24 * open * ((54 + x) / 40));
      ctx.fill();
    }
    eye(ctx, -24, -74, 6, c.eye);
    eye(ctx, -6, -78, 5, c.eye);
  },
  tempest(ctx, s) {
    const c = s.def.colors;
    const by = -96 + Math.sin(s.t * 1.4) * 8;
    shadow(ctx, 0, 0, 60, 12, 0.3);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + s.t * 0.4;
      const g = ctx.createRadialGradient(Math.cos(a) * 34, by + Math.sin(a) * 16, 4, Math.cos(a) * 34, by + Math.sin(a) * 16, 34);
      g.addColorStop(0, shade(c.a, 0.3));
      g.addColorStop(1, rgba(c.b, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 34, by + Math.sin(a) * 16, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(-10, by - 10, 6, 0, by, 46);
    g.addColorStop(0, shade(c.a, 0.25));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, by, 50, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    eye(ctx, -22, by - 6, 7, c.eye);
    eye(ctx, 2, by - 8, 6, c.eye);
    if (Math.sin(s.t * 7 + s.seed) > 0.85) {
      ctx.strokeStyle = 'rgba(220,240,255,0.9)';
      ctx.lineWidth = 2.5;
      bolt(ctx, 10, by + 20, 20 + Math.sin(s.t) * 20, 0, Math.floor(s.t * 10));
    }
  },
  king(ctx, s) {
    const c = s.def.colors;
    const phase = s.bossPhase ?? 1;
    const stomp = s.bossMode === 'stomp';
    glow(ctx, 0, -150, 160, c.eye, 0.18 + phase * 0.06);
    // 身体占据三行（约 330 像素高）
    const g = ctx.createLinearGradient(-60, -320, 60, 0);
    g.addColorStop(0, shade(c.a, 0.25));
    g.addColorStop(1, c.b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-70, 10);
    ctx.quadraticCurveTo(-90, -180, -40, -250);
    ctx.lineTo(40, -250);
    ctx.quadraticCurveTo(90, -180, 70, 10);
    ctx.closePath();
    ctx.fill();
    // 手臂
    const armY = stomp ? -60 : -140 + Math.sin(s.t * 1.5) * 10;
    ctx.fillStyle = shade(c.a, 0.05);
    ctx.beginPath();
    ctx.ellipse(-80, armY, 26, 60, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // 头与王冠
    ctx.fillStyle = shade(c.a, 0.15);
    ctx.beginPath();
    ctx.arc(0, -280, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(-36, -306);
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(-36 + i * 18 + 9, -344);
      ctx.lineTo(-36 + (i + 1) * 18, -310);
    }
    ctx.closePath();
    ctx.fill();
    eye(ctx, -16, -284, 8, c.eye);
    eye(ctx, 12, -286, 7, c.eye);
    gem(ctx2(ctx), 0, -150, 18 + Math.sin(s.t * 4) * 3, c.eye);
  },
};

function ctx2(ctx: Ctx): Ctx {
  return ctx;
}
function gem(ctx: Ctx, x: number, y: number, r: number, col: string): void {
  glow(ctx, x, y, r * 3, col, 0.6);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawEnemy(ctx: Ctx, s: EnemyArtState): void {
  const fn = ENEMY_ART[s.def.art] ?? ENEMY_ART.husk;
  ctx.save();
  if (s.dir > 0) ctx.scale(-1, 1);
  const sc = s.def.scale;
  ctx.scale(sc, sc);
  if (!s.icon && !s.def.flying && !s.burrowed && !s.submerged && s.def.boss !== 'king') shadow(ctx, 0, 0, 22, 6, 0.3);
  fn(ctx, s);
  ctx.restore();
  // 状态覆盖
  if (s.frozen) {
    ctx.fillStyle = 'rgba(190,235,255,0.45)';
    roundRect(ctx, -26 * sc, -90 * sc, 52 * sc, 90 * sc, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, -26 * sc, -90 * sc, 52 * sc, 90 * sc, 8);
    ctx.stroke();
  } else if (s.slow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, -40 * sc, 34 * sc, '#5ab8ff', 0.25);
    ctx.restore();
  }
  if (s.stunned) {
    ctx.fillStyle = '#ffe066';
    for (let i = 0; i < 3; i++) {
      star(ctx, Math.cos(s.t * 6 + i * 2.1) * 14, -96 * sc + Math.sin(s.t * 6 + i * 2.1) * 4, 3.5);
      ctx.fill();
    }
  }
}

export const ENEMY_ART_KEYS = Object.keys(ENEMY_ART);
