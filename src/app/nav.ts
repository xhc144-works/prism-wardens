import type { GameMode, LevelDef, RuleSet } from '../core/types';
import type { ControlMode } from './game';
import type { BattleReport } from '../core/report/report';

export interface CoachRun {
  levels: string[];
  index: number;
  attempt: number;
  maxAttempts: number;
  strategy: string;
  log: string[];
}

export interface BattleSetup {
  mode: GameMode;
  level: LevelDef;
  rules?: RuleSet | null;
  deck?: string[];
  skills?: string[];
  items?: Record<string, number>;
  control?: ControlMode;
  strategy?: string;
  seed?: number;
  difficulty?: number;
  endlessArena?: string;
  survivalId?: string;
  challengeId?: string;
  customLevelId?: string;
  coach?: CoachRun;
  testMode?: boolean;
}

export type Route =
  | { name: 'menu' }
  | { name: 'levels' }
  | { name: 'modes'; mode: 'endless' | 'survival' }
  | { name: 'deck'; setup: BattleSetup }
  | { name: 'battle'; setup: BattleSetup }
  | { name: 'almanac' }
  | { name: 'shop' }
  | { name: 'achievements' }
  | { name: 'settings' }
  | { name: 'saves' }
  | { name: 'cheats' }
  | { name: 'ai'; tab?: string; target?: string }
  | { name: 'challenges' }
  | { name: 'ruleEditor'; rule?: RuleSet }
  | { name: 'editor'; levelId?: string }
  | { name: 'unitEditor' }
  | { name: 'custom' }
  | { name: 'replays' }
  | { name: 'replay'; id: string }
  | { name: 'report'; report: BattleReport }
  | { name: 'versus'; level: LevelDef; strategies: [string, string]; seed: number; rules?: RuleSet | null };

let current: Route = { name: 'menu' };
const history: Route[] = [];
const listeners = new Set<() => void>();

export function route(): Route {
  return current;
}

export function navigate(r: Route, replace = false): void {
  if (!replace) history.push(current);
  current = r;
  listeners.forEach((l) => l());
}

export function back(fallback: Route = { name: 'menu' }): void {
  current = history.pop() ?? fallback;
  // 跳过战斗页（返回时不重新进入战斗）
  while (current.name === 'battle' && history.length) current = history.pop()!;
  if (current.name === 'battle') current = fallback;
  listeners.forEach((l) => l());
}

export function home(): void {
  history.length = 0;
  current = { name: 'menu' };
  listeners.forEach((l) => l());
}

export function onRoute(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
