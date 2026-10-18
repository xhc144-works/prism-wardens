import type { World } from '../core/sim/world';
import type { FxRecord, UnitDef } from '../core/types';
import type { DecisionTrace, Candidate } from '../ai/agent';

export interface HoverState {
  row: number;
  col: number;
  def?: UnitDef;
  valid: boolean;
  mode?: 'place' | 'remove' | 'upgrade' | 'skill' | 'item';
  area?: 'cell' | 'row' | '3x3';
}

export interface RenderSettings {
  particles: 'high' | 'low';
  damageNumbers: boolean;
  showHp: boolean;
  screenShake: boolean;
  showGrid: boolean;
}

/** 战场渲染器的公共接口：原创美术与原版资源两套实现可互换 */
export interface BattleRenderer {
  readonly kind: 'procedural' | 'classic';
  canvas: HTMLCanvasElement;
  settings: RenderSettings;
  showAiOverlay: boolean;
  aiTrace?: DecisionTrace;
  aiSuggestion?: Candidate;
  hover: HoverState | null;
  collectTarget: { x: number; y: number };
  onCollectArrive?: (value: number) => void;
  consume(w: World, fx: FxRecord[]): void;
  render(w: World, alpha: number, dtReal: number): void;
  cellAt(px: number, py: number, w: World): { row: number; col: number } | null;
  orbAt(px: number, py: number, w: World): number | null;
  orbsNear(px: number, py: number, w: World, r?: number): number[];
  /** 场景在画布中的 CSS 像素矩形（HUD 对齐用） */
  sceneRect(): { x: number; y: number; w: number; h: number; scale: number };
  dispose?(): void;
}
