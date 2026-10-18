/**
 * 经典音频：使用玩家导入的原版音效（OGG）与分层音乐（主旋律/鼓/镲）。
 * 音效带随机变体与轻微升调；音乐按原版的“僵尸数量多时加入鼓点与镲”规则动态混音。
 */
import { PVZ } from '../pvz/assets';
import type { MusicTune } from '../pvz/format';
import { Mo3Music } from './mo3Music';

interface SfxSpec {
  ids: string[];
  vol?: number;
  /** 随机升调范围（半音的十分之一） */
  pitch?: number;
  /** 同名音效最短间隔（毫秒） */
  gap?: number;
}

/** 本游戏音效名 -> 原版音效 */
export const CLASSIC_SFX: Record<string, SfxSpec> = {
  shoot: { ids: ['throw', 'throw2'], vol: 0.55, pitch: 10, gap: 40 },
  hit: { ids: ['splat', 'splat2', 'splat3'], vol: 0.6, pitch: 10, gap: 40 },
  'hit:metal': { ids: ['shieldhit', 'shieldhit2'], vol: 0.6, gap: 60 },
  'hit:plastic': { ids: ['plastichit', 'plastichit2'], vol: 0.6, gap: 60 },
  fire: { ids: ['firepea', 'ignite', 'ignite2'], vol: 0.6, gap: 60 },
  'explode:nova': { ids: ['cherrybomb'], vol: 0.9 },
  'explode:mine': { ids: ['potato_mine'], vol: 0.9 },
  'explode:bomber': { ids: ['explosion'], vol: 0.9 },
  'explode:meteor': { ids: ['melonimpact', 'melonimpact2'], vol: 0.8 },
  'explode:steam': { ids: ['frozen'], vol: 0.6 },
  explode: { ids: ['explosion'], vol: 0.9 },
  lane: { ids: ['jalapeno'], vol: 0.9 },
  freeze: { ids: ['frozen'], vol: 0.8 },
  place: { ids: ['plant', 'plant2'], vol: 0.7, gap: 50 },
  'place:water': { ids: ['plant_water'], vol: 0.7 },
  collect: { ids: ['points'], vol: 0.6, gap: 30 },
  die: { ids: ['zombie_falling_1', 'zombie_falling_2'], vol: 0.5, gap: 120 },
  unitDie: { ids: ['gulp'], vol: 0.7 },
  armor: { ids: ['shieldhit2', 'plastichit2'], vol: 0.6 },
  wave: { ids: ['awooga'], vol: 0.8 },
  flag: { ids: ['hugewave'], vol: 0.8 },
  finalwave: { ids: ['finalwave'], vol: 0.9 },
  siren: { ids: ['siren'], vol: 0.7 },
  lightning: { ids: ['thunder'], vol: 0.7 },
  chain: { ids: ['thunder'], vol: 0.4, gap: 200 },
  sentinel: { ids: ['lawnmower'], vol: 0.8 },
  bite: { ids: ['chomp', 'chomp2', 'chompsoft'], vol: 0.45, pitch: 10, gap: 120 },
  devour: { ids: ['bigchomp'], vol: 0.8 },
  upgrade: { ids: ['plantgrow'], vol: 0.8 },
  combo: { ids: ['achievement'], vol: 0.5, gap: 600 },
  skill: { ids: ['blover'], vol: 0.6 },
  gale: { ids: ['blover'], vol: 0.8 },
  boss: { ids: ['hydraulic'], vol: 0.8 },
  coin: { ids: ['coin'], vol: 0.6, gap: 60 },
  click: { ids: ['tap', 'tap2'], vol: 0.6, gap: 30 },
  button: { ids: ['buttonclick'], vol: 0.6 },
  pick: { ids: ['seedlift'], vol: 0.7 },
  shovel: { ids: ['shovel'], vol: 0.7 },
  deny: { ids: ['buzzer'], vol: 0.5, gap: 300 },
  pause: { ids: ['pause'], vol: 0.6 },
  win: { ids: ['winmusic'], vol: 0.8 },
  lose: { ids: ['losemusic'], vol: 0.8 },
  scream: { ids: ['scream'], vol: 0.8 },
  groan: { ids: ['groan', 'groan2', 'groan3', 'groan4', 'groan5', 'groan6', 'lowgroan', 'lowgroan2'], vol: 0.35, gap: 800 },
  magnet: { ids: ['magnetshroom'], vol: 0.7 },
  splash: { ids: ['zombie_entering_water', 'zombiesplash'], vol: 0.6 },
  heal: { ids: ['plant_water'], vol: 0.3, gap: 300 },
  ready: { ids: ['readysetplant'], vol: 0.8 },
  event: { ids: ['bleep'], vol: 0.6 },
  dig: { ids: ['dirt_rise'], vol: 0.6 },
  jump: { ids: ['polevault'], vol: 0.7 },
  balloon: { ids: ['balloon_pop'], vol: 0.7 },
  jack: { ids: ['jack_surprise', 'jack_surprise2'], vol: 0.7 },
  paper: { ids: ['newspaper_rip'], vol: 0.7 },
  angry: { ids: ['newspaper_rarrgh', 'newspaper_rarrgh2'], vol: 0.7 },
  vault: { ids: ['polevault'], vol: 0.7 },
  gargantuar: { ids: ['gargantuar_thump'], vol: 0.8, gap: 300 },
  zamboni: { ids: ['zamboni'], vol: 0.5, gap: 3000 },
  rollin: { ids: ['roll_in'], vol: 0.7 },
  gravebutton: { ids: ['gravebutton'], vol: 0.8 },
  bleep: { ids: ['bleep'], vol: 0.4, gap: 60 },
  loadingbar: { ids: ['loadingbar_flower', 'loadingbar_zombie'], vol: 0.6 },
};

export class ClassicAudio {
  private buffers = new Map<string, AudioBuffer | null>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private last = new Map<string, number>();
  private active = new Map<string, number>();
  private mo3: Mo3Music;
  constructor(
    private ctx: AudioContext,
    private sfxBus: AudioNode,
    private musicBus: AudioNode,
  ) {
    this.mo3 = new Mo3Music(ctx, musicBus);
  }

  private load(id: string): Promise<AudioBuffer | null> {
    const got = this.buffers.get(id);
    if (got !== undefined) return Promise.resolve(got);
    let p = this.pending.get(id);
    if (p) return p;
    const url = PVZ.soundUrl(id) ?? (id.startsWith('music/') ? PVZ.url(id) : null);
    if (!url) {
      this.buffers.set(id, null);
      return Promise.resolve(null);
    }
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx.decodeAudioData(b))
      .catch(() => null)
      .then((buf) => {
        this.buffers.set(id, buf);
        this.pending.delete(id);
        return buf;
      });
    this.pending.set(id, p);
    return p;
  }

  preload(names: string[]): void {
    for (const n of names) for (const id of CLASSIC_SFX[n]?.ids ?? []) void this.load(id);
  }

  has(name: string): boolean {
    return !!CLASSIC_SFX[name] && CLASSIC_SFX[name].ids.some((id) => PVZ.soundUrl(id));
  }

  play(name: string): boolean {
    const spec = CLASSIC_SFX[name];
    if (!spec) return false;
    const now = performance.now();
    if (spec.gap && now - (this.last.get(name) ?? 0) < spec.gap) return true;
    if ((this.active.get(name) ?? 0) >= 8) return true;
    this.last.set(name, now);
    const id = spec.ids[Math.floor(Math.random() * spec.ids.length)];
    void this.load(id).then((buf) => {
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      if (spec.pitch) src.playbackRate.value = Math.pow(2, (Math.random() * spec.pitch) / 120);
      const g = this.ctx.createGain();
      g.gain.value = spec.vol ?? 0.7;
      src.connect(g);
      g.connect(this.sfxBus);
      this.active.set(name, (this.active.get(name) ?? 0) + 1);
      src.onended = () => this.active.set(name, Math.max(0, (this.active.get(name) ?? 1) - 1));
      src.start();
    });
    return true;
  }

  /* ------------------------------ 音乐 ------------------------------ */

  private tuneId = '';
  private sources: AudioBufferSourceNode[] = [];
  private gains: Record<string, GainNode> = {};
  private intensity = 0;
  private layerOn = false;
  private loadToken = 0;

  hasMusic(id: string): boolean {
    return !!PVZ.musicTune(id) || this.mo3.available();
  }

  playMusic(id: string | null): void {
    if (id === this.tuneId) return;
    this.stopMusic();
    this.tuneId = id ?? '';
    if (!id) return;
    const tune = PVZ.musicTune(id);
    if (!tune) {
      // 没有预渲染的分层 OGG：用 libopenmpt 实时播放原版模块
      this.mo3.play(id);
      return;
    }
    const token = ++this.loadToken;
    const burst = id === 'night' ? PVZ.musicTune('night_burst') : null;
    void this.startTune(tune, burst, token);
  }

  private async startTune(t: MusicTune, burst: MusicTune | null, token: number): Promise<void> {
    const layers: [string, string | undefined, MusicTune][] = [
      ['main', t.main, t],
      ['drums', t.drums, t],
      ['hihats', t.hihats, t],
    ];
    if (burst) layers.push(['burst', burst.main, burst]);
    const bufs = await Promise.all(layers.map(([, p]) => (p ? this.load(p) : Promise.resolve(null))));
    if (token !== this.loadToken) return;
    const at = this.ctx.currentTime + 0.05;
    layers.forEach(([name, , tune], i) => {
      const buf = bufs[i];
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = tune.loopStart;
      src.loopEnd = Math.min(buf.duration, tune.loopEnd);
      const g = this.ctx.createGain();
      g.gain.value = name === 'main' ? 1 : 0;
      src.connect(g);
      g.connect(this.musicBus);
      src.start(at);
      this.sources.push(src);
      this.gains[name] = g;
    });
    this.layerOn = false;
  }

  stopMusic(): void {
    this.loadToken++;
    this.mo3.play(null);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* 已停止 */
      }
      s.disconnect();
    }
    this.sources = [];
    this.gains = {};
    this.tuneId = '';
  }

  /**
   * 动态分层：zombies = 场上僵尸数，hugeWave = 是否处于大波来袭倒计时。
   * 规则（原版）：≥10 只或大波来临时加入鼓点与镲，少于 4 只后淡出。
   */
  setIntensity(zombies: number, hugeWave: boolean): void {
    const g = this.gains;
    if (!this.sources.length) {
      const want = zombies >= 10 || hugeWave ? true : zombies < 4 ? false : this.layerOn;
      this.layerOn = want;
      this.mo3.setLayer(want);
      return;
    }
    const t = this.ctx.currentTime;
    const want = zombies >= 10 || hugeWave ? true : zombies < 4 ? false : this.layerOn;
    if (want === this.layerOn) return;
    this.layerOn = want;
    const ramp = (node: GainNode | undefined, v: number, dur: number) => {
      if (!node) return;
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(v, t + dur);
    };
    if (g.burst) {
      // 夜晚曲目：鼓点版与主旋律交叉淡化
      ramp(g.burst, want ? 1 : 0, want ? 0.2 : 8);
      ramp(g.main, want ? 0 : 1, 4);
    } else {
      ramp(g.hihats, want ? 1 : 0, want ? 4 : 8);
      ramp(g.drums, want ? 1 : 0, want ? 0.1 : 0.5);
    }
    this.intensity = want ? 1 : 0;
  }
}
