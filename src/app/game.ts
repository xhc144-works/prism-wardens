import type { CheatConfig, Command, CommandResult, GameConfig } from '../core/types';
import { World } from '../core/sim/world';
import { DT } from '../core/constants';
import { AIAgent, type AIRole } from '../ai/agent';
import { getStrategy, type StrategyParams } from '../ai/strategies';
import { Renderer } from '../render/renderer';
import { audio, sfxForFx } from '../audio/audio';
import { store } from './store';

export type ControlMode = 'human' | 'ai' | 'coop' | 'assist' | 'hint';

export const CONTROL_NAMES: Record<ControlMode, string> = {
  human: '人类操作',
  ai: 'AI 托管',
  coop: '协作（AI 管经济）',
  assist: '辅助（AI 收集+救场）',
  hint: 'AI 提示',
};

const ROLE: Record<ControlMode, AIRole | null> = { human: null, ai: 'full', coop: 'economy', assist: 'assist', hint: 'hint' };

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

/**
 * 对局控制器：固定步长推进模拟，渲染以显示器刷新率进行。
 * 人类与 AI 通过同一个 World.issue() 接口下达指令，可随时切换/接管。
 */
export class GameController {
  world: World;
  renderer: Renderer | null = null;
  agent: AIAgent | null = null;
  control: ControlMode = 'human';
  strategy: StrategyParams = getStrategy('balanced');
  speed = 1;
  paused = false;
  private acc = 0;
  private raf = 0;
  private lastTs = 0;
  private uiListeners = new Set<() => void>();
  private lastUi = 0;
  onEnd?: (w: World) => void;
  private ended = false;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;
  humanOps = 0;
  aiOps = 0;
  lastDenied = '';
  lastDeniedAt = 0;

  constructor(config: GameConfig) {
    this.world = new World(config);
    this.speed = store.settings.defaultSpeed || 1;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.renderer = new Renderer(canvas);
    this.applySettings();
    this.lastTs = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  detach(): void {
    cancelAnimationFrame(this.raf);
    this.renderer = null;
  }

  applySettings(): void {
    const s = store.settings;
    if (this.renderer) {
      this.renderer.settings = { particles: s.particles, damageNumbers: s.damageNumbers, showHp: s.showHp, screenShake: s.screenShake, showGrid: s.showGrid };
      this.renderer.showAiOverlay = s.aiOverlay && this.control !== 'human';
    }
  }

  subscribe(fn: () => void): () => void {
    this.uiListeners.add(fn);
    return () => this.uiListeners.delete(fn);
  }

  private emitUi(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastUi < 90) return;
    this.lastUi = now;
    for (const l of this.uiListeners) l();
  }

  setControl(mode: ControlMode, strategy?: StrategyParams | string): void {
    this.control = mode;
    if (strategy) this.strategy = typeof strategy === 'string' ? getStrategy(strategy) : { ...strategy };
    const role = ROLE[mode];
    if (!role) this.agent = null;
    else if (!this.agent || this.agent.base.id !== this.strategy.id || this.agent.base !== this.strategy) {
      this.agent = new AIAgent({ strategy: this.strategy, role, deckSize: this.world.deck.length });
      this.agent.nextThink = this.world.time;
    } else this.agent.setRole(role);
    if (this.renderer) this.renderer.showAiOverlay = store.settings.aiOverlay && mode !== 'human';
    this.emitUi(true);
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.emitUi(true);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.emitUi(true);
  }

  /** 暂停状态下逐帧推进 */
  stepFrame(n = 1): void {
    for (let i = 0; i < n; i++) this.tick();
    this.emitUi(true);
  }

  issue(cmd: Command): CommandResult {
    const r = this.world.issue(cmd, 'human');
    if (r.ok) {
      if (cmd.type !== 'collect') this.humanOps++;
    } else if (cmd.type !== 'collect') {
      this.lastDenied = r.reason ?? '';
      this.lastDeniedAt = performance.now();
      audio.sfx('deny');
    }
    this.emitUi(true);
    return r;
  }

  setCheats(cfg: CheatConfig | null): CommandResult {
    return this.world.issue({ type: 'cheats', config: cfg }, 'cheat');
  }

  private tick(): void {
    const w = this.world;
    if (w.finished) return;
    if (this.agent) {
      const before = w.stats.ops;
      this.agent.update(w);
      this.aiOps += w.stats.ops - before;
      if (this.renderer) {
        this.renderer.aiTrace = this.agent.lastTrace;
        this.renderer.aiSuggestion = this.agent.suggestion;
      }
    }
    w.step();
  }

  private loop = (ts: number): void => {
    const dt = Math.min(0.1, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsN / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    const w = this.world;
    if (!this.paused && !w.finished) {
      this.acc += dt * this.speed;
      let steps = 0;
      const maxSteps = Math.max(8, Math.ceil(this.speed * 3));
      while (this.acc >= DT && steps < maxSteps) {
        this.tick();
        this.acc -= DT;
        steps++;
      }
      if (steps >= maxSteps) this.acc = 0;
    }
    const fx = w.drainFx();
    if (this.renderer) {
      this.renderer.consume(w, fx);
      this.renderer.render(w, this.paused ? 0 : Math.min(1, this.acc / DT), dt);
    }
    // 音效（高倍速下降低频率）
    if (this.speed <= 4) for (const f of fx) {
      const name = sfxForFx(f.e as never);
      if (name) audio.sfx(name);
    }
    this.emitUi();
    if (w.finished && !this.ended) {
      this.ended = true;
      audio.sfx(w.status === 'won' ? 'win' : 'lose');
      this.emitUi(true);
      this.onEnd?.(w);
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}
