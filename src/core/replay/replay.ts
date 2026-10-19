import type { GameConfig, LevelDef, RecordedCommand } from '../types';
import { World } from '../sim/world';
import { CONTENT, type ContentPack } from '../content/registry';
import { GAME_VERSION } from '../constants';

export interface ReplayData {
  format: 'prism-wardens-replay';
  version: 1;
  id: string;
  name: string;
  created: number;
  gameVersion: string;
  player: string;
  config: GameConfig;
  log: RecordedCommand[];
  finalTick: number;
  result: { won: boolean; reason: string; time: number; waves: number; spent: number; ops: number };
  pack?: ContentPack;
}

/** 生成可序列化的配置副本（关卡与地图内联，保证脱离当前内容也能回放） */
export function serializableConfig(cfg: GameConfig): GameConfig {
  const level: LevelDef = { ...cfg.level, map: CONTENT.resolveMap(cfg.level.map) };
  return JSON.parse(JSON.stringify({ ...cfg, level }));
}

export function makeReplay(w: World, player: string, name?: string): ReplayData {
  const usesCustom = w.config.deck.some((id) => CONTENT.units.get(id)?.custom) || w.enemies.some((e) => e.def.custom) || Object.keys(w.stats.enemiesSpawned).some((id) => CONTENT.enemies.get(id)?.custom);
  return {
    format: 'prism-wardens-replay',
    version: 1,
    id: `rp_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: name ?? `${w.level.name} · ${w.status === 'won' ? '胜利' : '失败'}`,
    created: Date.now(),
    gameVersion: GAME_VERSION,
    player,
    config: serializableConfig(w.config),
    log: w.log.map((r) => ({ ...r, cmd: JSON.parse(JSON.stringify(r.cmd)) })),
    finalTick: w.tick,
    result: { won: w.status === 'won', reason: w.endReason, time: Math.round(w.time * 10) / 10, waves: w.waveIndex, spent: w.stats.lumenSpent, ops: w.stats.ops },
    pack: usesCustom ? JSON.parse(JSON.stringify(CONTENT.customPack)) : undefined,
  };
}

/**
 * 回放播放器：同样的种子 + 同样的指令序列 => 完全一致的对局。
 * 支持逐帧、跳转（从头快速重算到目标帧）。
 */
export class ReplayPlayer {
  data: ReplayData;
  world: World;
  private idx = 0;

  constructor(data: ReplayData) {
    this.data = data;
    this.world = this.fresh();
  }

  private fresh(): World {
    const w = new World(JSON.parse(JSON.stringify(this.data.config)));
    this.idx = 0;
    return w;
  }

  get tick(): number {
    return this.world.tick;
  }

  get done(): boolean {
    return this.world.finished || this.world.tick >= this.data.finalTick;
  }

  /** 推进一帧（先应用本帧记录的指令） */
  step(): void {
    const w = this.world;
    const log = this.data.log;
    while (this.idx < log.length && log[this.idx].tick <= w.tick) {
      const r = log[this.idx++];
      w.issue(r.cmd, 'replay');
    }
    if (!this.done) w.step();
  }

  /** 跳转到指定帧（向后跳需要重建世界） */
  seek(tick: number, fx = false): void {
    if (tick < this.world.tick) this.world = this.fresh();
    this.world.fxEnabled = fx;
    while (this.world.tick < tick && !this.done) this.step();
    this.world.fxEnabled = true;
    this.world.drainFx();
  }

  /** 校验确定性：重放结果是否与录制一致 */
  static verify(data: ReplayData): { ok: boolean; detail: string } {
    const p = new ReplayPlayer(data);
    p.world.fxEnabled = false;
    let guard = 0;
    while (!p.done && guard++ < 200000) p.step();
    const w = p.world;
    const ok = (w.status === 'won') === data.result.won && w.stats.lumenSpent === data.result.spent && w.waveIndex === data.result.waves;
    return { ok, detail: `重放：${w.status} 用时 ${w.time.toFixed(1)}s 消耗 ${w.stats.lumenSpent} 波次 ${w.waveIndex}；录制：${data.result.won ? 'won' : 'lost'} ${data.result.time}s ${data.result.spent} ${data.result.waves}` };
  }
}
