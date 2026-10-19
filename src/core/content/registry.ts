import type { EnemyDef, LevelDef, MapDef, RuleSet, UnitDef } from '../types';
import { UNITS } from './units';
import { ENEMIES } from './enemies';
import { MAPS } from './maps';
import { LEVELS } from './levels';

/** 自定义内容包：玩家在编辑器中创建的单位、敌人、地图、关卡与挑战。可导入导出为 JSON。 */
export interface ContentPack {
  format: 'prism-wardens-pack';
  version: 1;
  name?: string;
  units?: UnitDef[];
  enemies?: EnemyDef[];
  maps?: MapDef[];
  levels?: LevelDef[];
  rules?: RuleSet[];
}

/**
 * 内容注册表：所有模块通过它按 id 查询数据。内置内容与自定义内容合并在一起，
 * 自定义内容可以覆盖内置 id（用于“平衡性修改”）。
 */
export class ContentRegistry {
  units = new Map<string, UnitDef>();
  enemies = new Map<string, EnemyDef>();
  maps = new Map<string, MapDef>();
  levels = new Map<string, LevelDef>();
  customPack: ContentPack = { format: 'prism-wardens-pack', version: 1, units: [], enemies: [], maps: [], levels: [], rules: [] };

  constructor() {
    this.reset();
  }

  reset(): void {
    this.units.clear();
    this.enemies.clear();
    this.maps.clear();
    this.levels.clear();
    for (const u of UNITS) this.units.set(u.id, u);
    for (const e of ENEMIES) this.enemies.set(e.id, e);
    for (const m of MAPS) this.maps.set(m.id, m);
    for (const l of LEVELS) this.levels.set(l.id, l);
  }

  /** 用新的自定义内容包替换当前的自定义内容 */
  setCustomPack(pack: ContentPack | null | undefined): void {
    this.reset();
    this.customPack = {
      format: 'prism-wardens-pack',
      version: 1,
      units: [...(pack?.units ?? [])],
      enemies: [...(pack?.enemies ?? [])],
      maps: [...(pack?.maps ?? [])],
      levels: [...(pack?.levels ?? [])],
      rules: [...(pack?.rules ?? [])],
    };
    for (const u of this.customPack.units!) this.units.set(u.id, { ...u, custom: true });
    for (const e of this.customPack.enemies!) this.enemies.set(e.id, { ...e, custom: true });
    for (const m of this.customPack.maps!) this.maps.set(m.id, { ...m, custom: true });
    for (const l of this.customPack.levels!) this.levels.set(l.id, { ...l, custom: true });
  }

  unit(id: string): UnitDef {
    const u = this.units.get(id);
    if (!u) throw new Error(`未知单位: ${id}`);
    return u;
  }
  enemy(id: string): EnemyDef {
    const e = this.enemies.get(id);
    if (!e) throw new Error(`未知敌人: ${id}`);
    return e;
  }
  map(id: string): MapDef {
    const m = this.maps.get(id);
    if (!m) throw new Error(`未知地图: ${id}`);
    return m;
  }
  level(id: string): LevelDef | undefined {
    return this.levels.get(id);
  }
  resolveMap(m: string | MapDef): MapDef {
    return typeof m === 'string' ? this.map(m) : m;
  }
  allUnits(): UnitDef[] {
    return [...this.units.values()];
  }
  allEnemies(): EnemyDef[] {
    return [...this.enemies.values()];
  }
}

export const CONTENT = new ContentRegistry();
