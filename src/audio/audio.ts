/**
 * 合成音频引擎：全部音效与音乐由 WebAudio 实时合成，不需要任何音频文件。
 */
export type MusicMood = 'menu' | 'day' | 'night' | 'lake' | 'fog' | 'sky' | 'boss' | 'none';

const SCALES: Record<Exclude<MusicMood, 'none'>, { root: number; scale: number[]; tempo: number; prog: number[] }> = {
  menu: { root: 57, scale: [0, 2, 4, 7, 9], tempo: 84, prog: [0, 5, 3, 4] },
  day: { root: 60, scale: [0, 2, 4, 7, 9], tempo: 104, prog: [0, 5, 3, 4] },
  night: { root: 57, scale: [0, 3, 5, 7, 10], tempo: 88, prog: [0, 5, 3, 6] },
  lake: { root: 62, scale: [0, 2, 4, 7, 9], tempo: 96, prog: [0, 3, 4, 0] },
  fog: { root: 55, scale: [0, 2, 3, 7, 8], tempo: 80, prog: [0, 6, 5, 4] },
  sky: { root: 64, scale: [0, 2, 4, 6, 9], tempo: 112, prog: [0, 4, 5, 3] },
  boss: { root: 52, scale: [0, 1, 3, 6, 7, 10], tempo: 132, prog: [0, 1, 0, 6] },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  noise!: AudioBuffer;
  volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  private last = new Map<string, number>();
  private mood: MusicMood = 'none';
  private nextNote = 0;
  private step = 0;
  private timer: number | null = null;
  private reverb!: ConvolverNode;

  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    } catch {
      return false;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 简单混响
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 1.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    this.reverb.buffer = ir;
    const rg = ctx.createGain();
    rg.gain.value = 0.25;
    this.reverb.connect(rg);
    rg.connect(this.musicBus);
    this.applyVolumes();
    return true;
  }

  setVolumes(v: Partial<{ master: number; music: number; sfx: number }>): void {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.musicBus.gain.value = this.volumes.music * 0.35;
    this.sfxBus.gain.value = this.volumes.sfx * 0.6;
  }

  private throttle(name: string, ms: number): boolean {
    const now = performance.now();
    const l = this.last.get(name) ?? 0;
    if (now - l < ms) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; attack?: number; delay?: number; bus?: AudioNode } = {}): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t0 + dur);
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(opts.bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noiseBurst(dur: number, opts: { freq?: number; q?: number; vol?: number; type?: BiquadFilterType; delay?: number; slide?: number } = {}): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t0);
    if (opts.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, (opts.freq ?? 1200) * opts.slide), t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** 播放音效 */
  sfx(name: string): void {
    if (!this.ctx || this.volumes.sfx <= 0 || this.volumes.master <= 0) return;
    switch (name) {
      case 'shoot':
        if (!this.throttle(name, 45)) return;
        this.tone(880 + Math.random() * 120, 0.09, { type: 'triangle', vol: 0.06, slide: 0.55 });
        break;
      case 'hit':
        if (!this.throttle(name, 35)) return;
        this.noiseBurst(0.06, { freq: 2200, q: 2, vol: 0.06 });
        break;
      case 'fire':
        if (!this.throttle(name, 60)) return;
        this.noiseBurst(0.18, { freq: 900, q: 0.8, vol: 0.1, slide: 0.4 });
        break;
      case 'place':
        this.tone(180, 0.12, { type: 'sine', vol: 0.25, slide: 0.6 });
        this.tone(660, 0.18, { type: 'triangle', vol: 0.08, delay: 0.04 });
        this.noiseBurst(0.08, { freq: 500, vol: 0.08, type: 'lowpass' });
        break;
      case 'collect':
        if (!this.throttle(name, 40)) return;
        [0, 4, 7].forEach((n, i) => this.tone(midi(84 + n), 0.16, { type: 'sine', vol: 0.08, delay: i * 0.045 }));
        break;
      case 'explode':
        this.noiseBurst(0.7, { freq: 600, q: 0.6, vol: 0.4, type: 'lowpass', slide: 0.15 });
        this.tone(90, 0.5, { type: 'sine', vol: 0.4, slide: 0.35 });
        break;
      case 'freeze':
        [0, 5, 12, 17].forEach((n, i) => this.tone(midi(88 + n), 0.5, { type: 'sine', vol: 0.05, delay: i * 0.05 }));
        this.noiseBurst(0.5, { freq: 6000, q: 3, vol: 0.06 });
        break;
      case 'bite':
        if (!this.throttle(name, 120)) return;
        this.noiseBurst(0.07, { freq: 400, q: 3, vol: 0.12 });
        break;
      case 'die':
        if (!this.throttle(name, 50)) return;
        this.tone(220, 0.25, { type: 'sawtooth', vol: 0.05, slide: 0.4 });
        this.noiseBurst(0.2, { freq: 300, vol: 0.06, type: 'lowpass' });
        break;
      case 'unitDie':
        this.tone(520, 0.25, { type: 'square', vol: 0.05, slide: 0.3 });
        break;
      case 'armor':
        this.tone(1200, 0.12, { type: 'square', vol: 0.05, slide: 0.5 });
        this.noiseBurst(0.1, { freq: 3500, q: 4, vol: 0.08 });
        break;
      case 'wave':
        this.tone(midi(48), 1.2, { type: 'sawtooth', vol: 0.12, attack: 0.15 });
        this.tone(midi(55), 1.2, { type: 'sawtooth', vol: 0.1, attack: 0.15 });
        break;
      case 'flag':
        [0, 0.25, 0.5].forEach((d) => this.tone(midi(50), 0.22, { type: 'square', vol: 0.12, delay: d }));
        this.tone(midi(57), 0.8, { type: 'sawtooth', vol: 0.12, delay: 0.75, attack: 0.05 });
        break;
      case 'lightning':
        this.noiseBurst(0.6, { freq: 4000, q: 0.5, vol: 0.25, slide: 0.1 });
        break;
      case 'chain':
        if (!this.throttle(name, 80)) return;
        this.noiseBurst(0.15, { freq: 5000, q: 6, vol: 0.08 });
        this.tone(1500, 0.1, { type: 'square', vol: 0.03, slide: 2 });
        break;
      case 'sentinel':
        this.tone(midi(60), 0.6, { type: 'triangle', vol: 0.15, slide: 2 });
        this.noiseBurst(0.6, { freq: 800, vol: 0.12, slide: 3 });
        break;
      case 'click':
        this.tone(1000, 0.05, { type: 'triangle', vol: 0.06 });
        break;
      case 'deny':
        this.tone(200, 0.12, { type: 'square', vol: 0.06 });
        this.tone(150, 0.14, { type: 'square', vol: 0.06, delay: 0.08 });
        break;
      case 'upgrade':
        [0, 4, 7, 12].forEach((n, i) => this.tone(midi(72 + n), 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.06 }));
        break;
      case 'combo':
        [0, 7, 12, 16].forEach((n, i) => this.tone(midi(76 + n), 0.3, { type: 'sine', vol: 0.07, delay: i * 0.07 }));
        break;
      case 'skill':
        this.tone(midi(67), 0.5, { type: 'sawtooth', vol: 0.08, slide: 1.5 });
        this.noiseBurst(0.4, { freq: 2000, vol: 0.08, slide: 2 });
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone(midi(67 + n), 0.4, { type: 'triangle', vol: 0.12, delay: i * 0.1 }));
        break;
      case 'lose':
        [12, 8, 5, 0].forEach((n, i) => this.tone(midi(55 + n), 0.6, { type: 'sawtooth', vol: 0.1, delay: i * 0.25 }));
        break;
      case 'boss':
        this.tone(midi(36), 1.5, { type: 'sawtooth', vol: 0.2, attack: 0.2 });
        this.tone(midi(37), 1.5, { type: 'sawtooth', vol: 0.15, attack: 0.2 });
        break;
      case 'coin':
        this.tone(midi(88), 0.08, { type: 'square', vol: 0.05 });
        this.tone(midi(93), 0.2, { type: 'square', vol: 0.05, delay: 0.07 });
        break;
      case 'event':
        [0, 5, 9].forEach((n, i) => this.tone(midi(69 + n), 0.3, { type: 'sine', vol: 0.08, delay: i * 0.08 }));
        break;
    }
  }

  /* ---------------------------- 生成式音乐 ---------------------------- */

  music(mood: MusicMood): void {
    if (!this.ctx) return;
    if (mood === this.mood) return;
    this.mood = mood;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (mood === 'none') return;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || this.mood === 'none') return;
    const S = SCALES[this.mood];
    const spb = 60 / S.tempo / 2; // 八分音符
    while (this.nextNote < ctx.currentTime + 0.3) {
      const t = this.nextNote;
      const bar = Math.floor(this.step / 16) % S.prog.length;
      const chordRoot = S.root + S.scale[S.prog[bar] % S.scale.length] + (S.prog[bar] >= S.scale.length ? 12 : 0);
      const inBar = this.step % 16;
      if (inBar === 0) {
        // 和弦铺底
        for (const iv of [0, 7, 12, 16]) this.pad(midi(chordRoot - 12 + iv), spb * 16, t);
        this.pad(midi(chordRoot - 24), spb * 16, t, 0.05);
      }
      // 琶音
      if (inBar % 2 === 0 || this.mood === 'boss') {
        const deg = [0, 2, 4, 2, 1, 3, 4, 3][(this.step >> (this.mood === 'boss' ? 0 : 1)) % 8];
        const n = S.root + 12 + S.scale[deg % S.scale.length];
        this.pluck(midi(n), spb * 1.8, t);
      }
      // 打击
      if (inBar % 8 === 0) this.kick(t);
      if (this.mood === 'boss' && inBar % 4 === 2) this.hat(t);
      if ((this.mood === 'day' || this.mood === 'sky') && inBar % 4 === 2) this.hat(t);
      this.nextNote += spb;
      this.step++;
    }
  }

  private pad(freq: number, dur: number, t: number, vol = 0.03): void {
    const ctx = this.ctx!;
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f);
      f.connect(g);
      g.connect(this.musicBus);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private pluck(freq: number, dur: number, t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.25);
  }

  private hat(t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.06);
  }
}

export const audio = new AudioEngine();

/** 把游戏表现事件映射为音效 */
export function sfxForFx(e: { t: string; [k: string]: unknown }): string | null {
  switch (e.t) {
    case 'shoot':
      return 'shoot';
    case 'hit':
      return e.kind === 'fire' ? 'fire' : 'hit';
    case 'explode':
    case 'lane':
      return 'explode';
    case 'freeze':
      return 'freeze';
    case 'place':
      return 'place';
    case 'collect':
      return 'collect';
    case 'enemyDie':
      return 'die';
    case 'unitDie':
      return 'unitDie';
    case 'armorBreak':
      return 'armor';
    case 'wave':
      return e.flag ? 'flag' : e.index === 1 ? 'wave' : null;
    case 'flagWarn':
      return 'flag';
    case 'lightning':
      return 'lightning';
    case 'chain':
      return 'chain';
    case 'sentinel':
      return 'sentinel';
    case 'bite':
      return 'bite';
    case 'upgrade':
      return 'upgrade';
    case 'combo':
      return 'combo';
    case 'skill':
    case 'gale':
      return 'skill';
    case 'boss':
      return 'boss';
    case 'coin':
      return 'coin';
    case 'event':
      return 'event';
    default:
      return null;
  }
}
